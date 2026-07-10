-- ============================================================
-- v1.21 — Tareas logísticas: pausa del colaborador + tareas sin asignar
--
--   * Nuevo estado 'pausada' (el colaborador detiene la tarea por una urgencia
--     y luego la reanuda). El CHECK sobre 'estado' ya fue removido en v1.19,
--     así que no hace falta tocarlo.
--   * pausada_en: inicio de la pausa vigente. minutos_pausada: pausas acumuladas.
--     El tiempo de resolución se calcula descontando las pausas.
--   * Sin cambios de esquema para "sin asignar": responsables puede ir vacío
--     y responsable = '' (ya soportado por v1.20).
--
-- Idempotente.
-- ============================================================
alter table tareas_logistica add column if not exists pausada_en     timestamptz;
alter table tareas_logistica add column if not exists minutos_pausada integer;
