-- ============================================================
-- RLS v1.9 — Encargados: solo pueden escribir tareas de tipo 'reparacion'
-- (correr en Supabase -> SQL Editor). Idempotente.
--
-- Regla:
--   planificador -> alta/edicion/borrado de CUALQUIER tarea (fabricacion y reparacion)
--   encargado    -> SOLO filas con tipo = 'reparacion' (no toca produccion)
--   operario     -> sin cambios (solo UPDATE de ejecucion en sus sectores)
--
-- Reemplaza la politica 'wr_tareas_gestion' de supabase_realtime_rls.sql.
-- Usa el helper app_rol() ya definido en ese archivo.
-- ============================================================

drop policy if exists wr_tareas_gestion on tareas;

create policy wr_tareas_gestion on tareas for all to authenticated
  using (
    app_rol() = 'planificador'
    or (app_rol() = 'encargado' and tipo = 'reparacion')
  )
  with check (
    app_rol() = 'planificador'
    or (app_rol() = 'encargado' and tipo = 'reparacion')
  );

-- Verificacion: ver las politicas activas de 'tareas'.
-- select policyname, cmd from pg_policies where tablename = 'tareas';
