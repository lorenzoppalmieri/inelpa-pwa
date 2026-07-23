-- ============================================================
-- v1.38 — Tareas: cliente (o Stock) para Montaje PO
--
-- El planificador carga el cliente al planificar una tarea de Montaje PO (vacío =
-- Stock). Viaja a la tarea de laboratorio (auto-creada al finalizar Montaje PO) y
-- de ahí al despacho, para que Laboratorio y Melany vean N° de serie + cliente.
--
-- Idempotente.
-- ============================================================
alter table tareas add column if not exists cliente text;
