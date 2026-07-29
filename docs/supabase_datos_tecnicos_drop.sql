-- ============================================================
-- BORRAR la tabla datos_tecnicos (quedó mal cargada)
--
-- Correr los pasos EN ORDEN. El 1 y el 2 son de inspección/respaldo y no
-- modifican nada; el 3 es el que borra.
-- ============================================================

-- ------------------------------------------------------------
-- 1) MIRAR qué hay antes de borrar (columnas reales + cantidad de filas).
--    Sirve para saber cómo quedó armada y no repetir el error al recargarla.
-- ------------------------------------------------------------
select column_name, data_type
from information_schema.columns
where table_name = 'datos_tecnicos'
order by ordinal_position;

select count(*) as filas from datos_tecnicos;

-- ------------------------------------------------------------
-- 2) RESPALDO opcional (por si hubiera filas rescatables).
--    Deja una copia como datos_tecnicos_backup y NO bloquea el borrado.
--    Si no te interesa conservar nada, saltealo.
-- ------------------------------------------------------------
-- create table datos_tecnicos_backup as select * from datos_tecnicos;

-- ------------------------------------------------------------
-- 3) BORRAR. Se lleva con ella sus políticas RLS e índices.
--    'if exists' -> no falla si ya no está.
-- ------------------------------------------------------------
drop table if exists datos_tecnicos;

-- ------------------------------------------------------------
-- 4) VERIFICAR que se fue (debe devolver 0 filas).
-- ------------------------------------------------------------
select table_name
from information_schema.tables
where table_name in ('datos_tecnicos', 'datos_tecnicos_backup');
