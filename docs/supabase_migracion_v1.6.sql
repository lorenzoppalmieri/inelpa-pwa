-- ============================================================
-- MIGRACION v1.6  (correr UNA vez en Supabase -> SQL Editor)
-- Para una base YA desplegada. Idempotente: se puede correr varias veces.
--
-- Cambios en 'tareas':
--   1) activa_hora_recuperacion -> bool. Si true, la tarea computa la franja de
--      recuperacion (16-17 Lun-Jue / 15-16 Vie) como tiempo productivo.
--   2) duracion_efectiva_min    -> int. Tiempo PRODUCTIVO NETO calculado al
--      finalizar (descuenta noches, fines de semana y almuerzo). Base de KPIs/OEE.
-- ============================================================

alter table tareas
  add column if not exists activa_hora_recuperacion boolean not null default false;

alter table tareas
  add column if not exists duracion_efectiva_min int;
