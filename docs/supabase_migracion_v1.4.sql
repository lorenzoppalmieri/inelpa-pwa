-- ============================================================
-- MIGRACION v1.4  (correr UNA vez en Supabase -> SQL Editor)
-- Para una base YA desplegada. Idempotente: se puede correr varias veces.
--
-- Cambios:
--   1) tareas.inicio_planificado  -> dia+hora de arranque planificado (Gantt).
--   2) causa 'almuerzo'           -> pausa programada que NO penaliza el OEE.
-- ============================================================

-- 1) Columna de arranque planificado
alter table tareas
  add column if not exists inicio_planificado timestamptz;

-- 2) Causa de parada "Almuerzo" (categoria no productiva)
insert into causas_parada (id, label, categoria, codigo, activo) values
  ('almuerzo', 'Almuerzo', 'no_productiva', 50, true)
on conflict (id) do nothing;
