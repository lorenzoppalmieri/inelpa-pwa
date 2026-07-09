-- ============================================================
-- v1.20 — Tareas logísticas asignables a varios colaboradores
--
-- Se agrega la columna 'responsables' (array de texto). El campo legacy
-- 'responsable' se mantiene y guarda el join ("Orlando, Juan") para
-- compatibilidad con vistas/reportes viejos.
--
-- Idempotente.
-- ============================================================
alter table tareas_logistica add column if not exists responsables text[];
