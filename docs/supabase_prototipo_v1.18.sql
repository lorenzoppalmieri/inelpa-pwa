-- ============================================================
-- INELPA PWA — v1.18: tareas PROTOTIPO (semielaborado de prueba, sin definir)
--
-- Agrega la columna es_prototipo a tareas. Una tarea prototipo NO lleva
-- semielaborado (componente_codigo null); el detalle del prototipo va en `notas`.
--
-- Correr en Supabase: SQL Editor -> pegar -> Run. Re-ejecutable.
-- ============================================================
alter table tareas add column if not exists es_prototipo boolean not null default false;
