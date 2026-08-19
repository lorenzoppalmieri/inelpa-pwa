-- SGO v1.90 - Investigacion obligatoria de retrabajos
-- Inicio operativo: 19/08/2026. No migra registros historicos.

begin;

alter table public.sgo_eventos
  add column if not exists retrabajo jsonb;

comment on column public.sgo_eventos.retrabajo is
  'Circuito de investigacion de retrabajos: origen, SLA, causa, costos y verificacion.';

alter table public.sgo_eventos
  drop constraint if exists sgo_eventos_retrabajo_valido;

alter table public.sgo_eventos
  add constraint sgo_eventos_retrabajo_valido check (
    retrabajo is null
    or (
      jsonb_typeof(retrabajo) = 'object'
      and retrabajo ->> 'origen' in ('parada_calidad', 'defecto_final', 'laboratorio')
      and lower(trim(retrabajo ->> 'asignadoA')) = 'lara'
      and nullif(retrabajo ->> 'fechaLimiteToma', '') is not null
      and nullif(retrabajo ->> 'fechaLimiteInvestigacion', '') is not null
      and coalesce(retrabajo ->> 'resultadoVerificacion', 'pendiente') in ('pendiente', 'eficaz', 'reincidencia')
    )
  );

create index if not exists idx_sgo_eventos_retrabajo_estado
  on public.sgo_eventos ((retrabajo ->> 'asignadoA'), estado, detectado_en desc)
  where retrabajo is not null;

create unique index if not exists idx_sgo_nc_defecto_final_unica
  on public.sgo_eventos (tarea_id)
  where tipo = 'no_conformidad'
    and tarea_id is not null
    and retrabajo ->> 'origen' = 'defecto_final';

-- Conserva el acceso integral de SGO/Planificacion. Operarios, encargados y
-- Laboratorio solo pueden insertar el expediente automatico correspondiente
-- a la operacion que acaban de registrar; no obtienen lectura ni edicion SGO.
drop policy if exists sgo_eventos_insert on public.sgo_eventos;
create policy sgo_eventos_insert on public.sgo_eventos
for insert to authenticated
with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_id = (select auth.uid())
      and u.activo
      and (
        u.rol::text in ('sgo', 'planificador')
        or (
          u.rol::text in ('operario', 'encargado', 'laboratorio')
          and tipo = 'no_conformidad'
          and pilar = 'calidad'
          and estado = 'abierto'
          and lower(trim(responsable)) = 'lara'
          and lower(trim(detectado_por)) = lower(trim(u.usuario))
          and retrabajo is not null
          and lower(trim(retrabajo ->> 'asignadoA')) = 'lara'
          and mejora ->> 'fuente' = 'retrabajo_produccion'
          and (
            (retrabajo ->> 'origen' = 'parada_calidad' and parada_id is not null)
            or (retrabajo ->> 'origen' = 'defecto_final' and tarea_id is not null)
            or (retrabajo ->> 'origen' = 'laboratorio' and laboratorio_id is not null)
          )
        )
      )
  )
);

create or replace function public.sgo_proteger_investigacion_retrabajo()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  actor text;
begin
  if (tg_op = 'INSERT' and new.retrabajo is null)
    or (tg_op = 'UPDATE' and old.retrabajo is null and new.retrabajo is null) then
    return new;
  end if;

  select lower(trim(u.usuario))
    into actor
  from public.usuarios u
  where u.auth_id = (select auth.uid())
    and u.activo
  limit 1;

  if actor is null and session_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if actor is null then
    raise exception 'No se pudo identificar al usuario activo.';
  end if;

  -- La creacion automatica queda validada por RLS. Las restricciones de abajo
  -- aplican a ediciones posteriores del expediente.
  if tg_op = 'INSERT' then
    return new;
  end if;

  if old.retrabajo is null and new.retrabajo is not null and actor not in ('lara', 'lorenzo') then
    raise exception 'Solo Lara o Lorenzo pueden incorporar una investigacion de retrabajo.';
  end if;
  if old.retrabajo is not null and new.retrabajo is null then
    raise exception 'La investigacion de retrabajo no puede eliminarse del expediente.';
  end if;
  if old.retrabajo is not null and actor not in ('lara', 'lorenzo') then
    raise exception 'Solo Lara o Lorenzo pueden modificar una investigacion de retrabajo.';
  end if;

  if actor = 'lara' and (
    new.retrabajo ->> 'origen' is distinct from old.retrabajo ->> 'origen'
    or new.parada_id is distinct from old.parada_id
    or new.laboratorio_id is distinct from old.laboratorio_id
    or new.tarea_id is distinct from old.tarea_id
    or new.detectado_en is distinct from old.detectado_en
    or new.detectado_por is distinct from old.detectado_por
  ) then
    raise exception 'El origen del retrabajo es trazable y solo Lorenzo puede corregirlo.';
  end if;

  if actor <> 'lorenzo' and (
    new.estado is distinct from old.estado and (new.estado = 'cerrado' or old.estado = 'cerrado')
    or new.retrabajo ->> 'resultadoVerificacion' is distinct from old.retrabajo ->> 'resultadoVerificacion'
    or new.retrabajo ->> 'observacionVerificacion' is distinct from old.retrabajo ->> 'observacionVerificacion'
    or new.retrabajo ->> 'verificadoEn' is distinct from old.retrabajo ->> 'verificadoEn'
    or new.retrabajo ->> 'verificadoPor' is distinct from old.retrabajo ->> 'verificadoPor'
  ) then
    raise exception 'Solo Lorenzo puede verificar, cerrar o reabrir un retrabajo.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_sgo_proteger_investigacion_retrabajo on public.sgo_eventos;
create trigger trg_sgo_proteger_investigacion_retrabajo
before insert or update on public.sgo_eventos
for each row execute function public.sgo_proteger_investigacion_retrabajo();

commit;
