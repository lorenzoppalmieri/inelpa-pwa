-- ============================================================
-- v1.52 - FASE 1 SGO: NO CONFORMIDAD, ORIGEN Y COSTOS
-- Ejecutar despues de v1.49 y v1.51.
-- ============================================================

alter table sgo_eventos add column if not exists area_origen_id text;
alter table sgo_eventos add column if not exists modelo text;
alter table sgo_eventos add column if not exists defecto_codigo text;
alter table sgo_eventos add column if not exists costo_detalle jsonb;
alter table sgo_eventos add column if not exists parada_id text;

create index if not exists idx_sgo_eventos_area_origen
  on sgo_eventos (area_origen_id, pilar, estado, detectado_en desc);
create index if not exists idx_sgo_eventos_defecto
  on sgo_eventos (defecto_codigo, detectado_en desc)
  where defecto_codigo is not null;
create unique index if not exists idx_sgo_nc_laboratorio_unica
  on sgo_eventos (laboratorio_id)
  where laboratorio_id is not null and tipo = 'no_conformidad';
create unique index if not exists idx_sgo_nc_parada_unica
  on sgo_eventos (parada_id)
  where parada_id is not null and tipo = 'no_conformidad';

alter table sgo_eventos drop constraint if exists sgo_eventos_area_origen_check;
alter table sgo_eventos add constraint sgo_eventos_area_origen_check check (
  area_origen_id is null or area_origen_id in (
    'bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural',
    'herreria_pintura','laminado','administracion','logistica_operativa',
    'logistica_administrativa','mantenimiento','automatismo','it',
    'planificacion_produccion','laboratorio','gerencia_directorio','diseno'
  )
) not valid;
alter table sgo_eventos validate constraint sgo_eventos_area_origen_check;

alter table sgo_eventos drop constraint if exists sgo_eventos_costo_detalle_check;
alter table sgo_eventos add constraint sgo_eventos_costo_detalle_check check (
  costo_detalle is null or jsonb_typeof(costo_detalle) = 'object'
) not valid;
alter table sgo_eventos validate constraint sgo_eventos_costo_detalle_check;
