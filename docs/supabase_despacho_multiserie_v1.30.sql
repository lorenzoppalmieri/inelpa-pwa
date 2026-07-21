-- ============================================================
-- v1.30 — Despacho de múltiples transformadores por viaje
--
-- Un despacho puede agrupar varias unidades (mismo cliente/viaje):
--   * numeros_serie: array (jsonb) con el N° de serie de cada trafo.
--   * cargados:      array (jsonb) con las series ya subidas al camión (tildadas).
-- Se mantiene 'nro_serie' (texto) como join para compatibilidad/visualización y
-- búsqueda; el front lo setea con las series unidas por coma.
--
-- Idempotente.
-- ============================================================
alter table despachos add column if not exists numeros_serie jsonb;
alter table despachos add column if not exists cargados      jsonb;
