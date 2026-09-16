-- SGO 5S: ocurrencias semanales independientes. No altera otros módulos.
create extension if not exists pg_cron;
create schema if not exists sgo_internal;
revoke all on schema sgo_internal from public, anon, authenticated;

alter table public.sgo_controles_programados add column if not exists semana_5s date;
alter table public.sgo_controles_programados add constraint sgo_semana_5s_valida check (
  semana_5s is null or (extract(isodow from semana_5s)=1 and tipo='auditoria_campo'
  and frecuencia='unico' and proxima_fecha=semana_5s+4 and tolerancia_dias=0)
);
create unique index if not exists sgo_5s_area_semana_unica
  on public.sgo_controles_programados(area_id,semana_5s) where semana_5s is not null;

-- Preservar la identidad de la semana incluso ante una tablet con versión anterior.
create or replace function sgo_internal.preservar_semana_5s()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.semana_5s is not null then
    new.semana_5s := old.semana_5s;
    new.area_id := old.area_id;
    new.tipo := old.tipo;
    new.frecuencia := 'unico';
    new.proxima_fecha := old.semana_5s+4;
    new.tolerancia_dias := 0;
    new.plantilla_campo_id := old.plantilla_campo_id;
  end if;
  return new;
end $$;
revoke all on function sgo_internal.preservar_semana_5s() from public,anon,authenticated;
create trigger trg_sgo_preservar_semana_5s before update on public.sgo_controles_programados
for each row execute function sgo_internal.preservar_semana_5s();

-- Sólo el scheduler/administrador de la base puede generar ocurrencias.
-- SECURITY INVOKER: no se otorgan permisos de programación a los auditores.
create or replace function sgo_internal.generar_semana_5s(
  fecha date default (now() at time zone 'America/Argentina/Buenos_Aires')::date
) returns integer language plpgsql security invoker set search_path='' as $$
declare lunes date := date_trunc('week',fecha::timestamp)::date; cantidad integer;
begin
  insert into public.sgo_controles_programados (
    id,titulo,tipo,area_id,pilar,norma,requisito,instrucciones,responsable,frecuencia,
    proxima_fecha,tolerancia_dias,activo,creado_por,actualizado_por,plantilla_campo_id,semana_5s
  )
  select 'sgo-5s-semana-'||a.area||'-'||lunes::text,
    '5S · '||a.nombre||' · Semana '||to_char(lunes,'DD/MM/YYYY'),
    'auditoria_campo',a.area,'mejora','sgo_integral','R.I.T. 9.2/12',
    'Auditar entre lunes y viernes inclusive. Preferentemente jueves o viernes. Documentar hallazgos y acciones; su cierre se gestiona por separado.',
    a.auditor,'unico',lunes+4,0,true,'sistema_5s_semanal','sistema_5s_semanal','rit-9-2-12-5s',lunes
  from (values
    ('bobinado_rural','BOBINADO RURAL','Lara'),
    ('bobinado_distribucion','BOBINADO DISTRIBUCIÓN','Lara'),
    ('montaje_distribucion','MONTAJE DISTRIBUCIÓN','Lara'),
    ('montaje_rural','MONTAJE RURAL','Lara'),
    ('herreria_pintura','HERRERÍA Y PINTURA','Lara'),
    ('laminado','LAMINADO','Lara'),
    ('carpinteria','CARPINTERÍA','Lara'),
    ('corte_aislacion','CORTE AISLACIÓN','Lara'),
    ('laboratorio','LABORATORIO','Lara'),
    ('logistica_operativa','ABASTECIMIENTO','Nicolás'),
    ('logistica_despacho','DESPACHO','Nicolás')
  ) as a(area,nombre,auditor)
  on conflict do nothing;
  get diagnostics cantidad = row_count;
  return cantidad;
end $$;
revoke all on function sgo_internal.generar_semana_5s(date) from public,anon,authenticated;

-- Transición acotada: insertar un informe válido completa su ocurrencia, no
-- permite editar la programación ni cerrar las acciones/hallazgos generados.
create or replace function sgo_internal.completar_semana_5s()
returns trigger language plpgsql security definer set search_path='' as $$
declare c public.sgo_controles_programados%rowtype; actor text;
begin
  select * into c from public.sgo_controles_programados where id=new.control_id for update;
  if c.semana_5s is null then return new; end if;
  select u.usuario into actor from public.usuarios u where u.auth_id=auth.uid() and u.activo
    and u.rol::text in ('sgo','planificador') limit 1;
  if actor is null then raise exception 'Se requiere una sesión SGO activa para completar la auditoría semanal.'; end if;
  -- Permitir el reintento del mismo informe (upsert ignoreDuplicates), no otra auditoría.
  if exists(select 1 from public.sgo_control_ejecuciones e where e.id=new.id and e.control_id=c.id) then return new; end if;
  if not c.activo then raise exception 'El control semanal ya fue realizado o retirado de agenda. Actualizá la agenda.'; end if;
  if new.auditoria_campo is null or new.auditoria_campo->>'tipo' is distinct from '5s'
    or new.auditoria_campo->>'areaId' is distinct from c.area_id
    or nullif(new.auditoria_campo->>'finalizadaEn','') is null then
    raise exception 'El informe 5S debe corresponder al área programada y estar finalizado.';
  end if;
  if (new.ejecutado_en at time zone 'America/Argentina/Buenos_Aires')::date < c.semana_5s then
    raise exception 'La auditoría semanal todavía no está disponible.';
  end if;
  new.fecha_programada := c.proxima_fecha;
  update public.sgo_controles_programados set activo=false,actualizado_en=now(),actualizado_por=actor where id=c.id;
  return new;
end $$;
revoke all on function sgo_internal.completar_semana_5s() from public,anon,authenticated;
create trigger trg_sgo_completar_semana_5s before insert on public.sgo_control_ejecuciones
for each row execute function sgo_internal.completar_semana_5s();

-- Lunes 03:00 UTC = lunes 00:00 Argentina. No requiere una PWA abierta.
select cron.schedule('sgo-5s-lunes', '0 3 * * 1', 'select sgo_internal.generar_semana_5s();');
-- Habilitación inicial: sólo la semana actual, sin inventar pendientes históricos.
select sgo_internal.generar_semana_5s();
