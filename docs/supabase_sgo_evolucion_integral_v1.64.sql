-- ============================================================
-- v1.64 - EVOLUCION INTEGRAL SGO
-- Historial KPI, auditoria, cierre controlado y vinculo Garantia -> NC.
-- Ejecutar despues de v1.60 y v1.61.
-- ============================================================

-- 1) DEFINICION DE KPI + MEDICIONES HISTORICAS
create table if not exists public.sgo_indicador_mediciones (
  id                text primary key,
  indicador_id      text not null references public.sgo_indicadores(id) on delete cascade,
  periodo           text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  valor             numeric not null,
  explicacion       text,
  evidencia         text,
  cerrado           boolean not null default false,
  registrado_en     timestamptz not null default now(),
  registrado_por    text not null,
  actualizado_en    timestamptz not null default now(),
  actualizado_por   text not null,
  unique (indicador_id, periodo)
);

create index if not exists idx_sgo_mediciones_indicador_periodo
  on public.sgo_indicador_mediciones (indicador_id, periodo desc);

-- Conserva como primera medicion cualquier valor manual anterior.
insert into public.sgo_indicador_mediciones
  (id, indicador_id, periodo, valor, cerrado, registrado_en, registrado_por, actualizado_en, actualizado_por)
select
  i.id || '__' || i.periodo, i.id, i.periodo, i.valor_actual, false,
  i.actualizado_en, i.actualizado_por, i.actualizado_en, i.actualizado_por
from public.sgo_indicadores i
where coalesce(i.origen, 'manual') = 'manual' and i.valor_actual is not null
on conflict (indicador_id, periodo) do nothing;

alter table public.sgo_indicador_mediciones enable row level security;
drop policy if exists sgo_mediciones_select on public.sgo_indicador_mediciones;
drop policy if exists sgo_mediciones_insert on public.sgo_indicador_mediciones;
drop policy if exists sgo_mediciones_update on public.sgo_indicador_mediciones;
drop policy if exists sgo_mediciones_delete_lorenzo on public.sgo_indicador_mediciones;

create policy sgo_mediciones_select on public.sgo_indicador_mediciones for select to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_mediciones_insert on public.sgo_indicador_mediciones for insert to authenticated
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_mediciones_update on public.sgo_indicador_mediciones for update to authenticated
  using (
    exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador'))
    and (
      not sgo_indicador_mediciones.cerrado
      or exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and lower(trim(u.usuario)) = 'lorenzo')
    )
  )
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_mediciones_delete_lorenzo on public.sgo_indicador_mediciones for delete to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and lower(trim(u.usuario)) = 'lorenzo'));

-- 2) VINCULO ENTRE GARANTIAS Y EXPEDIENTES SGO
alter table public.sgo_garantias_iso add column if not exists area_responsable_id text;
alter table public.sgo_garantias_iso add column if not exists defecto_codigo text;
alter table public.sgo_garantias_iso add column if not exists evento_id text references public.sgo_eventos(id);
create unique index if not exists idx_sgo_garantia_evento_unico
  on public.sgo_garantias_iso (evento_id) where evento_id is not null;

alter table public.sgo_garantias_iso drop constraint if exists sgo_garantias_area_responsable_check;
alter table public.sgo_garantias_iso add constraint sgo_garantias_area_responsable_check check (
  area_responsable_id is null or area_responsable_id in (
    'bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural',
    'herreria_pintura','laminado','administracion','logistica_operativa',
    'logistica_administrativa','mantenimiento','automatismo','it',
    'planificacion_produccion','laboratorio','gerencia_directorio','diseno'
  )
);
alter table public.sgo_garantias_iso drop constraint if exists sgo_garantias_fechas_coherentes;
alter table public.sgo_garantias_iso add constraint sgo_garantias_fechas_coherentes check (
  (fecha_salida is null or fecha_deteccion >= fecha_salida)
  and (fecha_resolucion is null or fecha_resolucion >= fecha_deteccion)
) not valid;
alter table public.sgo_garantias_iso drop constraint if exists sgo_garantias_cierre_coherente;
alter table public.sgo_garantias_iso add constraint sgo_garantias_cierre_coherente check (
  (estado <> 'resuelto' or fecha_resolucion is not null)
  and (estado <> 'verificado' or (verificado and fecha_resolucion is not null and nullif(trim(verificacion_detalle), '') is not null))
) not valid;

-- 3) CIERRE CONTROLADO DE EXPEDIENTES
create or replace function public.sgo_validar_cierre_evento()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  requiere_investigacion boolean;
  acciones_activas integer;
  acciones_pendientes integer;
  acciones_ineficaces integer;
begin
  if new.estado <> 'cerrado' or (tg_op = 'UPDATE' and old.estado = 'cerrado') then
    return new;
  end if;

  requiere_investigacion :=
    new.tipo in ('no_conformidad','incidente_seguridad','cuasi_accidente','incidente_ambiental','desvio_entrega','perdida_costo','hallazgo_auditoria')
    or (new.tipo = 'observacion_preventiva' and coalesce(new.seguridad->>'tipoObservacion','') = 'insegura');

  if requiere_investigacion and nullif(trim(new.contencion), '') is null then
    raise exception 'No se puede cerrar: falta contencion inmediata';
  end if;
  if requiere_investigacion and nullif(trim(new.causa_raiz), '') is null then
    raise exception 'No se puede cerrar: falta causa raiz';
  end if;
  if requiere_investigacion and new.metodo_analisis is null then
    raise exception 'No se puede cerrar: falta metodo de analisis';
  end if;
  if new.tipo = 'no_conformidad' and coalesce(new.disposicion, 'pendiente') = 'pendiente' then
    raise exception 'No se puede cerrar: falta disposicion';
  end if;

  select
    count(*) filter (where estado <> 'cancelada'),
    count(*) filter (where estado not in ('verificada','cancelada')),
    count(*) filter (where estado <> 'cancelada' and eficaz is distinct from true)
  into acciones_activas, acciones_pendientes, acciones_ineficaces
  from public.sgo_acciones where evento_id = new.id;

  if requiere_investigacion and acciones_activas = 0 then
    raise exception 'No se puede cerrar: falta al menos una accion';
  end if;
  if acciones_pendientes > 0 then
    raise exception 'No se puede cerrar: existen acciones sin verificar';
  end if;
  if acciones_ineficaces > 0 then
    raise exception 'No se puede cerrar: existen acciones sin eficacia confirmada';
  end if;
  return new;
end $$;

drop trigger if exists trg_sgo_validar_cierre on public.sgo_eventos;
create trigger trg_sgo_validar_cierre
before insert or update of estado on public.sgo_eventos
for each row execute function public.sgo_validar_cierre_evento();

-- Se elimina el permiso ALL anterior: eventos y acciones no admiten borrado fisico desde clientes.
drop policy if exists sgo_eventos_acceso on public.sgo_eventos;
drop policy if exists sgo_eventos_select on public.sgo_eventos;
drop policy if exists sgo_eventos_insert on public.sgo_eventos;
drop policy if exists sgo_eventos_update on public.sgo_eventos;
create policy sgo_eventos_select on public.sgo_eventos for select to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_eventos_insert on public.sgo_eventos for insert to authenticated
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_eventos_update on public.sgo_eventos for update to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')))
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));

drop policy if exists sgo_acciones_acceso on public.sgo_acciones;
drop policy if exists sgo_acciones_select on public.sgo_acciones;
drop policy if exists sgo_acciones_insert on public.sgo_acciones;
drop policy if exists sgo_acciones_update on public.sgo_acciones;
create policy sgo_acciones_select on public.sgo_acciones for select to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_acciones_insert on public.sgo_acciones for insert to authenticated
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_acciones_update on public.sgo_acciones for update to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')))
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));

-- 4) BITACORA INMUTABLE DE AUDITORIA
create table if not exists public.sgo_auditoria (
  id                uuid primary key default gen_random_uuid(),
  entidad           text not null check (entidad in ('evento','accion','indicador','medicion','garantia')),
  entidad_id        text not null,
  operacion         text not null check (operacion in ('INSERT','UPDATE','DELETE')),
  datos_anteriores  jsonb,
  datos_nuevos      jsonb,
  usuario           text not null,
  creado_en         timestamptz not null default now()
);
create index if not exists idx_sgo_auditoria_entidad
  on public.sgo_auditoria (entidad, entidad_id, creado_en desc);

alter table public.sgo_auditoria enable row level security;
drop policy if exists sgo_auditoria_select on public.sgo_auditoria;
create policy sgo_auditoria_select on public.sgo_auditoria for select to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));

create or replace function public.sgo_registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  entidad_nombre text;
  id_registro text;
begin
  select u.usuario into actor from public.usuarios u where u.auth_id = auth.uid() and u.activo limit 1;
  actor := coalesce(actor, current_user);
  entidad_nombre := case tg_table_name
    when 'sgo_eventos' then 'evento'
    when 'sgo_acciones' then 'accion'
    when 'sgo_indicadores' then 'indicador'
    when 'sgo_indicador_mediciones' then 'medicion'
    when 'sgo_garantias_iso' then 'garantia'
  end;
  id_registro := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id');
  insert into public.sgo_auditoria (entidad, entidad_id, operacion, datos_anteriores, datos_nuevos, usuario)
  values (
    entidad_nombre, id_registro, tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
    actor
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare tabla text;
begin
  foreach tabla in array array['sgo_eventos','sgo_acciones','sgo_indicadores','sgo_indicador_mediciones','sgo_garantias_iso']
  loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || tabla || '_auditoria', tabla);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.sgo_registrar_auditoria()', 'trg_' || tabla || '_auditoria', tabla);
  end loop;
end $$;

-- Realtime idempotente.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sgo_indicador_mediciones') then
    alter publication supabase_realtime add table public.sgo_indicador_mediciones;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sgo_auditoria') then
    alter publication supabase_realtime add table public.sgo_auditoria;
  end if;
end $$;

select 'SGO v1.64 instalado' as resultado;
