-- ============================================================
-- MIGRACION v1.5  (correr UNA vez en Supabase -> SQL Editor)
-- Para una base YA desplegada. Idempotente: se puede correr varias veces.
--
-- Cambio:
--   tareas.componente_codigo -> semielaborado (componente del catalogo maestro)
--   que produce la tarea, designado segun el sector en "Asignar tareas".
--   Ej: en Bobinado Dist A.T. se designa la bobina AT del modelo de la orden.
--
-- Requiere que exista la tabla 'componentes' (ver supabase_catalogo_modelos_v1.5.sql).
-- ============================================================

alter table tareas
  add column if not exists componente_codigo text references componentes(codigo);

create index if not exists idx_tareas_componente on tareas(componente_codigo);
