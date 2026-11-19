-- ============================================================
-- v2.55 — CANTIDAD POR TAREA (repartir una OF de SAP entre estaciones)
--
-- Hasta ahora 1 tarea = 1 unidad. Con las OF de SAP llegan, por ejemplo,
-- 100 bobinas F2 BT en una sola orden, y la planificadora las reparte entre
-- varias estaciones (30 + 40 + 30). Cada tarea guarda cuántas unidades cubre.
--
-- La PWA controla que la suma de las tareas no supere la cantidad de la OF
-- (lo que planificó SAP). Si se borra una tarea, sus unidades vuelven al saldo.
--
-- Por qué numeric y no int: hoy todo semielaborado es en unidades (UN) y la
-- PWA solo acepta enteros, pero si mañana llega una OF en kg o litros la
-- columna ya la soporta sin otra migración.
--
-- Las tareas existentes quedan con cantidad = 1, que es lo que eran.
-- Idempotente: se puede correr dos veces.
--
-- ORDEN: correr ESTE SQL ANTES de publicar el código v2.55.
--   1) INELPA-TEST  -> push a staging
--   2) PRODUCCIÓN   -> recién ahí merge a main
-- ============================================================

alter table tareas add column if not exists cantidad numeric(12,3) not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tareas_cantidad_positiva' and conrelid = 'public.tareas'::regclass
  ) then
    alter table tareas add constraint tareas_cantidad_positiva check (cantidad > 0);
  end if;
end $$;

comment on column tareas.cantidad is
  'v2.55: unidades del semielaborado que cubre la tarea. La suma por OF + semielaborado no puede superar ordenes.cantidad (control en la PWA).';

-- ------------------------------------------------------------
-- VERIFICACIÓN (tiene que dar: numeric, 1, y todas las tareas con cantidad 1)
-- ------------------------------------------------------------
-- select data_type, column_default from information_schema.columns
-- where table_name = 'tareas' and column_name = 'cantidad';
--
-- select cantidad, count(*) from tareas group by cantidad;
