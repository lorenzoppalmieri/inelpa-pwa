-- ============================================================
-- v1.36 — Tareas logísticas: separar Logística (Giuliano) de Despacho (Melany)
--
-- Melany crea tareas del MISMO tipo que Giuliano pero para su equipo (Eugenia /
-- Maribel). Se distingue con la columna 'origen'. Las existentes quedan como
-- 'logistica' (default), así siguen apareciendo en el tablero de Giuliano.
--
-- Idempotente.
-- ============================================================
alter table tareas_logistica add column if not exists origen text not null default 'logistica';
create index if not exists idx_tlog_origen on tareas_logistica (origen);
