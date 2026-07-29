-- ============================================================
-- v1.51 - AREA ORGANIZACIONAL EN EVENTOS SGO
-- Ejecutar despues de supabase_sgo_nucleo_v1.49.sql.
-- El area SGO es mas amplia que el sector productivo: incluye IT,
-- Administracion, Gerencia, Diseno, Mantenimiento, etc.
-- ============================================================

alter table sgo_eventos add column if not exists area_id text;

create index if not exists idx_sgo_eventos_area
  on sgo_eventos (area_id, estado, detectado_en desc);

-- Validacion flexible: se agrega NOT VALID para no bloquear posibles datos
-- previos y luego se valida. El catalogo vive tambien en src/sgo/types.ts.
alter table sgo_eventos drop constraint if exists sgo_eventos_area_id_check;
alter table sgo_eventos add constraint sgo_eventos_area_id_check check (area_id is null or area_id in (
  'bobinado_rural',
  'bobinado_distribucion',
  'montaje_distribucion',
  'montaje_rural',
  'herreria_pintura',
  'laminado',
  'administracion',
  'logistica_operativa',
  'logistica_administrativa',
  'mantenimiento',
  'automatismo',
  'it',
  'planificacion_produccion',
  'laboratorio',
  'gerencia_directorio',
  'diseno'
)) not valid;

alter table sgo_eventos validate constraint sgo_eventos_area_id_check;

select area_id, count(*)
from sgo_eventos
group by area_id
order by area_id;
