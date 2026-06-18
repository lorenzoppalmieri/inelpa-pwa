-- ============================================================
-- MIGRACION v1.8  (correr UNA vez en Supabase -> SQL Editor)
-- Para una base YA desplegada. Idempotente: se puede correr varias veces.
--
-- Cambio en 'tareas':
--   tipo -> 'fabricacion' (default) | 'reparacion'.
--   La REPARACION corrige errores no detectados a tiempo. NO cuenta como tiempo
--   productivo y queda EXCLUIDA del OEE (no penaliza, igual que el almuerzo).
--   Una reparacion puede no tener orden (orden_id ya es nullable).
-- ============================================================

alter table tareas
  add column if not exists tipo text not null default 'fabricacion';

-- Restringir los valores validos (idempotente: crea el check solo si falta).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tareas_tipo_check'
  ) then
    alter table tareas
      add constraint tareas_tipo_check check (tipo in ('fabricacion','reparacion'));
  end if;
end $$;
