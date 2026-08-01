-- ============================================================
-- v1.65 - SGO CONTROLES PROGRAMADOS
-- Agenda recurrente, ejecuciones trazables y vínculo con eventos SGO.
-- Ejecutar una sola vez, después de supabase_sgo_evolucion_integral_v1.64.sql.
-- ============================================================

create table if not exists public.sgo_controles_programados (
  id                text primary key,
  titulo            text not null,
  tipo              text not null check (tipo in ('proceso_productivo','semielaborado','administrativo','auditoria_iso','seguridad','ambiente')),
  area_id           text not null check (area_id in (
    'bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural',
    'herreria_pintura','laminado','administracion','logistica_operativa',
    'logistica_administrativa','mantenimiento','automatismo','it',
    'planificacion_produccion','laboratorio','gerencia_directorio','diseno'
  )),
  pilar             text not null check (pilar in ('seguridad','calidad','ambiente','entrega','costos','mejora')),
  norma             text check (norma is null or norma in ('iso_9001','iso_45001','iso_14001','sgo_integral')),
  requisito         text,
  instrucciones     text not null,
  responsable       text not null,
  frecuencia        text not null check (frecuencia in ('unico','diario','semanal','quincenal','mensual','bimestral','trimestral','semestral','anual')),
  proxima_fecha     date not null,
  tolerancia_dias   integer not null default 0 check (tolerancia_dias >= 0),
  activo            boolean not null default true,
  creado_en         timestamptz not null default now(),
  creado_por        text not null,
  actualizado_en    timestamptz not null default now(),
  actualizado_por   text not null
);

create index if not exists idx_sgo_controles_agenda
  on public.sgo_controles_programados (activo, proxima_fecha, responsable);
create index if not exists idx_sgo_controles_area_pilar
  on public.sgo_controles_programados (area_id, pilar, activo);

create table if not exists public.sgo_control_ejecuciones (
  id                      text primary key,
  control_id              text not null references public.sgo_controles_programados(id) on delete restrict,
  fecha_programada        date not null,
  ejecutado_en            timestamptz not null default now(),
  ejecutado_por           text not null,
  resultado               text not null check (resultado in ('conforme','observacion','no_conforme','no_aplica')),
  detalle                 text not null,
  evidencia               text,
  orden_id                text,
  nro_serie               text,
  semielaborado_codigo    text,
  valor_esperado          text,
  valor_encontrado        text,
  unidad                  text,
  evento_id               text references public.sgo_eventos(id) on delete set null,
  unique (control_id, fecha_programada)
);

create index if not exists idx_sgo_ejecuciones_control
  on public.sgo_control_ejecuciones (control_id, ejecutado_en desc);
create index if not exists idx_sgo_ejecuciones_resultado
  on public.sgo_control_ejecuciones (resultado, ejecutado_en desc);

alter table public.sgo_eventos
  add column if not exists control_id text references public.sgo_controles_programados(id) on delete set null;
create index if not exists idx_sgo_eventos_control on public.sgo_eventos (control_id) where control_id is not null;

-- Acceso: SGO y Gerencia pueden programar y ejecutar. Las ejecuciones son inmutables.
alter table public.sgo_controles_programados enable row level security;
alter table public.sgo_control_ejecuciones enable row level security;

drop policy if exists sgo_controles_select on public.sgo_controles_programados;
drop policy if exists sgo_controles_insert on public.sgo_controles_programados;
drop policy if exists sgo_controles_update on public.sgo_controles_programados;
create policy sgo_controles_select on public.sgo_controles_programados for select to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_controles_insert on public.sgo_controles_programados for insert to authenticated
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_controles_update on public.sgo_controles_programados for update to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')))
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));

drop policy if exists sgo_control_ejecuciones_select on public.sgo_control_ejecuciones;
drop policy if exists sgo_control_ejecuciones_insert on public.sgo_control_ejecuciones;
create policy sgo_control_ejecuciones_select on public.sgo_control_ejecuciones for select to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_control_ejecuciones_insert on public.sgo_control_ejecuciones for insert to authenticated
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));

-- La bitácora v1.64 incorpora ambos registros nuevos.
alter table public.sgo_auditoria drop constraint if exists sgo_auditoria_entidad_check;
alter table public.sgo_auditoria add constraint sgo_auditoria_entidad_check check (
  entidad in ('evento','accion','indicador','medicion','garantia','control','ejecucion_control')
);

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
    when 'sgo_controles_programados' then 'control'
    when 'sgo_control_ejecuciones' then 'ejecucion_control'
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

drop trigger if exists trg_sgo_controles_programados_auditoria on public.sgo_controles_programados;
create trigger trg_sgo_controles_programados_auditoria
after insert or update or delete on public.sgo_controles_programados
for each row execute function public.sgo_registrar_auditoria();

drop trigger if exists trg_sgo_control_ejecuciones_auditoria on public.sgo_control_ejecuciones;
create trigger trg_sgo_control_ejecuciones_auditoria
after insert on public.sgo_control_ejecuciones
for each row execute function public.sgo_registrar_auditoria();

-- Realtime idempotente.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sgo_controles_programados') then
    alter publication supabase_realtime add table public.sgo_controles_programados;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sgo_control_ejecuciones') then
    alter publication supabase_realtime add table public.sgo_control_ejecuciones;
  end if;
end $$;

select 'SGO controles programados v1.65 instalado' as resultado;
