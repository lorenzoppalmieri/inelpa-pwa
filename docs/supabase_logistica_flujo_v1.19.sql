-- ============================================================
-- v1.19 — Flujo de tareas logísticas: iniciar / finalizar + estado "en_curso"
--
-- Cambios:
--   * La tarea ya NO se "inicia sola" al crearse. El colaborador la INICIA
--     (estado 'en_curso') y luego la FINALIZA. Se guarda quién/cuándo la inició.
--   * El tiempo de resolución se mide desde el inicio real (iniciada_en), no
--     desde la creación.
--   * Reabrir queda restringido a Giuliano (control en el front por rol).
--
-- Idempotente: se puede correr varias veces sin error.
-- ============================================================

-- 1) Columnas nuevas
alter table tareas_logistica add column if not exists iniciada_en  timestamptz;
alter table tareas_logistica add column if not exists iniciada_por text;

-- 2) Permitir el nuevo valor de estado ('en_curso').
--    Si la columna 'estado' tuviera un CHECK que sólo acepta
--    'pendiente'/'finalizada', lo removemos (el resto del sistema guarda
--    estado como texto libre, igual que las demás tablas).
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'tareas_logistica'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%estado%'
  loop
    execute format('alter table tareas_logistica drop constraint %I', c.conname);
  end loop;
end $$;
