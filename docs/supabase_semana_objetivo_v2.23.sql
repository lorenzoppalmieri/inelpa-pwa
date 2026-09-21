-- ============================================================
-- SEMANA OBJETIVO — LA FOTO QUE NO SE TOCA   (v2.23)
--
-- EL PROBLEMA QUE RESUELVE
-- `tareas.semana` se recalcula desde `inicio_planificado` cada vez que la tarea
-- se crea, se edita o se arrastra en el Gantt. O sea que una tarea atrasada que
-- se mueve a la semana siguiente DESAPARECE del objetivo de la semana vieja.
-- Resultado: el colaborador cerraba 7/7 (100%) cuando en realidad se le habian
-- pedido 10 y entrego 7. El objetivo se autocumplia por el solo hecho de
-- atrasarse.
--
-- `semana_objetivo` se escribe UNA vez, al crear la tarea, y no se actualiza
-- nunca mas. Es "para que semana se le pidio", contra "cuando se va a hacer".
--
-- SOBRE EL HISTORIAL
-- De las tareas que ya existen no se puede recuperar la semana original: se fue
-- pisando con cada movimiento. Se rellena con `semana`, que es exacto para las
-- que nunca se movieron y aproximado para el resto. La app avisa en pantalla
-- que las semanas anteriores al 21/9/2026 son aproximadas (FECHA_CORTE_OBJETIVOS
-- en src/lib/andon.ts).
--
-- IDEMPOTENTE: se puede correr dos veces sin efecto.
-- ORDEN: correr ANTES del deploy. La columna nueva es opcional en el codigo, asi
-- que si el deploy entra primero tampoco rompe: las tareas caen a `semana`.
-- ============================================================

BEGIN;

-- 1) La columna. IF NOT EXISTS -> correrlo de nuevo no falla.
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS semana_objetivo text;

COMMENT ON COLUMN tareas.semana_objetivo IS
  'Semana ISO para la que se pidio la tarea. Se escribe al crearla y NUNCA se actualiza. '
  'No confundir con `semana`, que dice cuando se va a hacer y se reescribe al reprogramar.';

-- 2) Backfill del historial. Solo donde esta vacia: si se corre dos veces, la
--    segunda no pisa nada.
UPDATE tareas
SET semana_objetivo = semana
WHERE semana_objetivo IS NULL;

-- 3) Las que se creen de ahora en mas siempre la traen desde la app, pero un
--    default evita que una insercion manual la deje nula.
ALTER TABLE tareas ALTER COLUMN semana_objetivo SET DEFAULT NULL;

COMMIT;

-- ------------------------------------------------------------
-- Verificacion
-- ------------------------------------------------------------
SELECT count(*) FILTER (WHERE semana_objetivo IS NULL) AS sin_objetivo,
       count(*)                                        AS total
FROM tareas;

-- Cuantas tareas tienen hoy la semana distinta del objetivo. Antes de correr
-- esto siempre da 0 (porque se acaban de igualar); de aca en adelante, este
-- numero son las tareas que se reprogramaron despues de asignarse — es decir,
-- exactamente el arrastre que el Andon tiene que mostrar.
SELECT semana_objetivo, semana, count(*)
FROM tareas
WHERE semana_objetivo IS DISTINCT FROM semana
GROUP BY 1, 2
ORDER BY 1 DESC, 2 DESC;
