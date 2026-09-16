-- ============================================================
-- MIGRACION DE tiempos_estandar A CLAVE POR MODELO BASE   (v2.20)
--
-- QUE CAMBIA
-- Hasta ahora, en bobinado, la clave del estandar incluia el CODIGO del
-- semielaborado:
--     bobinado||BOBALT0000151||m_bob_19
-- Como las tres fases de un trifasico son tres codigos distintos
-- (BOBALT0000151 / 152 / 153), habia TRES estandares para lo que en la planta es
-- un unico trabajo — bobinar la fase 1, la 2 o la 3 lleva lo mismo.
--
-- Desde v2.20 la clave usa la DESCRIPCION del semielaborado sin el sufijo de
-- fase:
--     bobinado||Bobina AT Distribucion Trifasica 63/13 Al||m_bob_19
--
-- POR QUE HAY QUE MIGRAR
-- Ese id no es decorativo: es la PK de esta tabla Y la clave con la que
-- PlanificacionView busca el estandar aprendido al crear una tarea. Si se sube
-- el codigo nuevo sin migrar, las filas viejas quedan huerfanas: los estandares
-- que produccion ya aprobo dejan de aplicarse y el asistente vuelve a
-- sugerirlos desde cero.
--
-- QUE HACE ESTE SCRIPT
-- Junta las filas de las tres fases de un mismo modelo+maquina en una sola, con
-- el PROMEDIO de sus minutos (son el mismo trabajo, asi que sus tiempos ya
-- deberian ser parecidos; si difieren mucho, el promedio es el mejor punto de
-- partida y el asistente lo va a corregir con la proxima muestra).
--
-- ES IDEMPOTENTE: se puede correr dos veces sin duplicar ni romper nada. Las
-- filas que ya esten en formato nuevo no se tocan.
--
-- ORDEN: correr ESTE SQL **antes** de que entre el deploy, o inmediatamente
-- despues. En el medio, el planificador no va a encontrar estandares aprendidos
-- (no rompe nada: cae al tiempo por defecto y el planificador lo escribe a mano).
-- ============================================================

-- ------------------------------------------------------------
-- PASO 0 — CORRER ESTO SOLO, ANTES QUE NADA.
--
-- Confirma como se llaman de verdad las columnas. El codigo TypeScript usa
-- camelCase (`actualizado`, `maquinaId`) y la base usa snake_case, pero no
-- siempre la traduccion es obvia: `actualizado` es `actualizado_en`. Mejor
-- mirarlo que suponerlo.
-- ------------------------------------------------------------
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tiempos_estandar'
ORDER BY ordinal_position;

-- ============================================================
-- A PARTIR DE ACA VA LA MIGRACION. Correr despues de confirmar el paso 0.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Respaldo. Si algo sale mal, la tabla original queda intacta aca.
--    Se conserva: no ocupa nada y es la unica vuelta atras.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tiempos_estandar_backup_v219 AS
SELECT * FROM tiempos_estandar;

-- ------------------------------------------------------------
-- 2) Ver que se va a tocar ANTES de tocarlo.
--    Corre esto solo primero si querés revisar el impacto.
-- ------------------------------------------------------------
-- SELECT id, modelo, maquina_id, minutos FROM tiempos_estandar
-- WHERE id LIKE 'bobinado||BOB%' ORDER BY id;

-- ------------------------------------------------------------
-- 2) Clave nueva por fila.
--
--    La descripcion base sale de `modelo` (que es lo que guardo el asistente al
--    aprobar: la descripcion del semielaborado). Se le saca el marcador de fase
--    con la MISMA regla que usa modeloBase() en el codigo.
--
--    OJO: la fase va en el MEDIO de la descripcion, no al final:
--        Bobina AT Distribucion Trifasica Cuadrado 63/33 F1 Al
--                                                       ^^^^
--    Por eso la expresion NO lleva ancla de fin (la primera version la tenia y
--    no habria migrado ni una fila). Se reemplaza por un espacio y despues se
--    colapsan los espacios dobles, igual que en el TypeScript.
--
--    El resto de la descripcion (potencia, tension, AT/BT, material, forma) se
--    conserva entero porque SI distingue un estandar de otro.
-- ------------------------------------------------------------
CREATE TEMP TABLE _mig AS
WITH base AS (
  SELECT
    e.id AS id_viejo,
    e.area,
    e.maquina_id,
    e.minutos,
    e.actualizado_en,
    btrim(regexp_replace(
      regexp_replace(e.modelo,
        '[[:space:]]*[-–·]?[[:space:]]*\y(F[[:space:]]?[123]|FASE[[:space:]]?[123])\y', ' ', 'gi'),
      '[[:space:]]{2,}', ' ', 'g')) AS modelo_base
  FROM tiempos_estandar e
  WHERE e.area = 'bobinado'
)
SELECT
  'bobinado||' || modelo_base || '||' || COALESCE(maquina_id, '') AS id_nuevo,
  modelo_base,
  area,
  maquina_id,
  ROUND(AVG(minutos))::int AS minutos,
  MAX(actualizado_en)      AS actualizado_en,
  COUNT(*)                 AS filas_fusionadas,
  MIN(minutos)             AS min_min,
  MAX(minutos)             AS max_min
FROM base
GROUP BY modelo_base, area, maquina_id;

-- Control: cuantas filas se fusionan y si habia dispersion entre fases.
-- Una diferencia grande entre min_min y max_min significa que las tres fases
-- tenian estandares muy distintos — vale la pena mirarlo.
SELECT id_nuevo, filas_fusionadas, minutos, min_min, max_min
FROM _mig
WHERE filas_fusionadas > 1
ORDER BY (max_min - min_min) DESC;

-- ------------------------------------------------------------
-- 3) Insertar/actualizar con la clave nueva.
--    ON CONFLICT hace que correrlo dos veces sea inofensivo.
-- ------------------------------------------------------------
INSERT INTO tiempos_estandar (id, area, modelo, maquina_id, minutos, actualizado_en)
SELECT id_nuevo, area, modelo_base, maquina_id, minutos, actualizado_en
FROM _mig
ON CONFLICT (id) DO UPDATE
  SET minutos        = EXCLUDED.minutos,
      modelo         = EXCLUDED.modelo,
      actualizado_en = EXCLUDED.actualizado_en;

-- ------------------------------------------------------------
-- 4) Borrar las filas viejas con clave por CODIGO de semielaborado.
--
--    Solo las de bobinado cuya clave tiene la forma `bobinado||<CODIGO>||...`,
--    es decir donde el tramo del medio es un codigo de item (BOBALT0000151) y
--    no una descripcion. Se identifica por el patron del codigo, no por
--    descarte: asi una descripcion no se borra nunca por error.
--
--    El respaldo del paso 0 permite volver atras si hiciera falta.
-- ------------------------------------------------------------
DELETE FROM tiempos_estandar
WHERE area = 'bobinado'
  AND id ~ '^bobinado\|\|(BOBALT|BOBBAJ)[0-9]{4,}\|\|';

COMMIT;

-- ------------------------------------------------------------
-- 5) Verificacion posterior. No deberia quedar ninguna clave por codigo.
-- ------------------------------------------------------------
SELECT COUNT(*) AS claves_viejas_restantes
FROM tiempos_estandar
WHERE id ~ '^bobinado\|\|(BOBALT|BOBBAJ)[0-9]{4,}\|\|';

SELECT COUNT(*) AS estandares_bobinado_ahora
FROM tiempos_estandar WHERE area = 'bobinado';

-- Y que ninguno quedo con la fase pegada en el nombre (en cualquier posicion):
SELECT id, modelo FROM tiempos_estandar
WHERE modelo ~* '\y(F[[:space:]]?[123]|FASE[[:space:]]?[123])\y';
