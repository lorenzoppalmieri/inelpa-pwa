-- ============================================================
-- v1.25 — Logística Fase 2: bloqueo, reasignación y cierre con confirmación
--
--   * estado 'bloqueada': el operario marca la tarea trabada por una causa
--     externa (falta material, máquina averiada, etc.). El CHECK sobre 'estado'
--     ya fue removido en v1.19, así que no hace falta tocarlo.
--   * bloqueo_motivo: causa del bloqueo.
--   * estimado_min: tiempo estimado por el encargado (para real vs estimado).
--   * nota_cierre: nota del operario al confirmar el cierre.
--
-- Idempotente.
-- ============================================================
alter table tareas_logistica add column if not exists estimado_min   integer;
alter table tareas_logistica add column if not exists bloqueo_motivo text;
alter table tareas_logistica add column if not exists nota_cierre    text;
