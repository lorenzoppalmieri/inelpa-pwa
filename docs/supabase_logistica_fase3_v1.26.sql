-- ============================================================
-- v1.26 — Logística Fase 3: historial de bloqueos (Pareto de cuellos de botella)
--
-- Cada vez que el operario bloquea una tarea se registra { motivo, inicio, fin }.
-- Permite el gráfico de "tiempo perdido por causa de bloqueo" en Reportes.
-- El motivo vigente sigue en bloqueo_motivo (v1.25); este historial es acumulado.
--
-- Idempotente.
-- ============================================================
alter table tareas_logistica add column if not exists bloqueos jsonb;
