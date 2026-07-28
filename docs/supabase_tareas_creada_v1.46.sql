-- ============================================================
-- v1.46 — Tareas: fecha de ASIGNACIÓN (orden FIFO en la tablet)
--
-- Problema: la tabla `tareas` no guardaba ningún timestamp de creación, así que
-- la cola del colaborador se ordenaba solo por prioridad y las tareas "se
-- mezclaban". Ahora cada tarea guarda el instante exacto en que el planificador
-- la asignó, y la tablet las muestra en ese orden (la más antigua arriba).
--
-- El campo NO se modifica al editar la tarea, por eso el orden es estable:
-- corregir una observación no reordena la lista del operario.
--
-- Idempotente.
-- ============================================================

-- 1) Columna nueva. Las tareas NUEVAS la traen desde la app; el default cubre
--    cualquier alta hecha directamente por SQL.
alter table tareas add column if not exists creada_en timestamptz default now();

-- 2) BACKFILL de las tareas que ya existen (corrió una sola vez; el WHERE lo
--    hace repetible sin daño). Se usa el arranque planificado como mejor
--    aproximación al orden en que fueron cargadas.
update tareas
set creada_en = inicio_planificado
where creada_en is null and inicio_planificado is not null;

-- 3) Si quedara alguna sin ninguna referencia, se le pone "ahora" para que no
--    caiga al final de la cola para siempre.
update tareas
set creada_en = now()
where creada_en is null;

-- 4) Índice: la tablet ordena por esta columna en cada carga.
create index if not exists idx_tareas_creada on tareas (creada_en);

-- Verificación rápida (debe devolver 0 filas):
--   select count(*) from tareas where creada_en is null;
