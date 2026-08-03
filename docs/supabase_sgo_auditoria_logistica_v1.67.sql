-- ============================================================
-- v1.67 - SGO AUDITORIA LOGISTICA
-- Checklists estructurados para Recepcion, Stock, Despacho y
-- Embalaje/Carga. Ejecutar una vez despues de v1.65.
-- ============================================================

begin;

alter table public.sgo_controles_programados
  drop constraint if exists sgo_controles_programados_tipo_check;
alter table public.sgo_controles_programados
  add constraint sgo_controles_programados_tipo_check check (
    tipo in ('proceso_productivo','semielaborado','administrativo','auditoria_iso','auditoria_logistica','seguridad','ambiente')
  );

alter table public.sgo_control_ejecuciones
  add column if not exists auditoria_logistica jsonb;

-- Los controles programados conservan una sola ejecucion por fecha. Las
-- auditorias logisticas pueden repetirse (por ejemplo, varios despachos en
-- un mismo dia), por eso la unicidad se aplica solo a las ejecuciones comunes.
alter table public.sgo_control_ejecuciones
  drop constraint if exists sgo_control_ejecuciones_control_id_fecha_programada_key;

create unique index if not exists uq_sgo_control_ejecuciones_programadas
  on public.sgo_control_ejecuciones (control_id, fecha_programada)
  where auditoria_logistica is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sgo_control_ejecuciones_auditoria_logistica_check'
      and conrelid = 'public.sgo_control_ejecuciones'::regclass
  ) then
    alter table public.sgo_control_ejecuciones
      add constraint sgo_control_ejecuciones_auditoria_logistica_check check (
        auditoria_logistica is null or jsonb_typeof(auditoria_logistica) = 'object'
      );
  end if;
end $$;

create index if not exists idx_sgo_ejecuciones_auditoria_logistica
  on public.sgo_control_ejecuciones ((auditoria_logistica ->> 'tipo'), ejecutado_en desc)
  where auditoria_logistica is not null;

insert into public.sgo_controles_programados (
  id, titulo, tipo, area_id, pilar, norma, requisito, instrucciones,
  responsable, frecuencia, proxima_fecha, tolerancia_dias, activo,
  creado_por, actualizado_por
) values
  ('sgo-logistica-recepcion', 'Auditoria logistica - Recepcion de materiales', 'auditoria_logistica', 'logistica_operativa', 'calidad', 'sgo_integral', 'Control operativo de Logistica', 'Control documental, fisico y de seguridad antes de liberar el material al deposito.', 'Nicolas', 'semanal', current_date, 1, true, 'migracion_v1.67', 'migracion_v1.67'),
  ('sgo-logistica-stock', 'Auditoria logistica - Stock y deposito', 'auditoria_logistica', 'logistica_operativa', 'costos', 'sgo_integral', 'Control operativo de Logistica', 'Exactitud de inventario, ubicacion, preservacion, trazabilidad y condiciones del deposito.', 'Nicolas', 'semanal', current_date, 1, true, 'migracion_v1.67', 'migracion_v1.67'),
  ('sgo-logistica-despacho', 'Auditoria logistica - Despacho de transformadores', 'auditoria_logistica', 'logistica_operativa', 'entrega', 'sgo_integral', 'Control operativo de Logistica', 'Liberacion, documentacion, identidad del equipo y entrega al transporte.', 'Nicolas', 'semanal', current_date, 1, true, 'migracion_v1.67', 'migracion_v1.67'),
  ('sgo-logistica-embalaje_carga', 'Auditoria logistica - Embalaje y carga sobre camion', 'auditoria_logistica', 'logistica_operativa', 'entrega', 'sgo_integral', 'Control operativo de Logistica', 'Control final del embalaje, trincado y estado del transformador ya ubicado sobre el camion.', 'Nicolas', 'semanal', current_date, 1, true, 'migracion_v1.67', 'migracion_v1.67')
on conflict (id) do nothing;

comment on column public.sgo_control_ejecuciones.auditoria_logistica is
  'Ficha estructurada de auditoria logistica: contexto, checklist, cumplimiento y responsables.';

notify pgrst, 'reload schema';
commit;

-- Verificacion rapida:
-- select id, titulo, responsable, proxima_fecha
-- from public.sgo_controles_programados
-- where tipo = 'auditoria_logistica'
-- order by id;
