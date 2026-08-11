-- ============================================================
-- v1.80 — ANULAR FICHAS DE LABORATORIO (super admin)
--
-- Permite sacar de la cola de ensayos un trafo desfasado, duplicado o cargado
-- por error, SIN borrar la fila: queda con motivo, autor y fecha, y se puede
-- devolver a la cola. Asi se puede explicar por que un trafo terminado no tiene
-- ensayo (trazabilidad SGO/ISO).
--
-- ⚠ CORRER ESTE ARCHIVO **ANTES** DEL `git push`.
--    El codigo nuevo escribe en columnas que todavia no existen; si sube
--    primero el front, la cola de sync va a rechazar los upserts.
--
-- ⚠ EL PASO 1 VA SOLO, EN UNA EJECUCION APARTE (si el estado es un enum).
--    Postgres no acepta usar un valor de enum recien agregado en la misma
--    transaccion. Es el mismo problema que ya paso con el rol 'laboratorio'.
-- ============================================================


-- ------------------------------------------------------------
-- 0) DIAGNOSTICO PREVIO — ¿el estado es enum o texto? (solo lectura)
--    Si udt_name empieza con '_' o no es 'text'/'varchar', es un ENUM y hay que
--    correr el paso 1. Si es 'text' o 'varchar', SALTEAR el paso 1.
-- ------------------------------------------------------------
select column_name, data_type, udt_name
from information_schema.columns
where table_name = 'laboratorio' and column_name = 'estado';


-- ------------------------------------------------------------
-- 1) SOLO SI el paso 0 dijo que es un ENUM: agregar el valor.
--    ⚠ EJECUTAR ESTA SENTENCIA SOLA Y NADA MAS. Despues seguir con el paso 2.
-- ------------------------------------------------------------
-- alter type estado_lab add value if not exists 'anulada';


-- ------------------------------------------------------------
-- 2) COLUMNAS DE AUDITORIA. Idempotente: se puede correr dos veces.
-- ------------------------------------------------------------
alter table laboratorio add column if not exists anulada_en       timestamptz;
alter table laboratorio add column if not exists anulada_por      text;
alter table laboratorio add column if not exists motivo_anulacion text;

comment on column laboratorio.motivo_anulacion is
  'v1.80: por que se saco de la cola de ensayos. Obligatorio al anular.';


-- ------------------------------------------------------------
-- 3) PERMISOS — que el super admin pueda actualizar la ficha.
--    Anular es un UPDATE (no un DELETE), asi que si el laboratorio ya podia
--    editar sus fichas, lo mas probable es que no haga falta nada.
--    Esta consulta lista las policies vigentes: revisá que exista una de UPDATE
--    que alcance a tu usuario.
-- ------------------------------------------------------------
select policyname, cmd, roles, qual, with_check
from pg_policies
where tablename = 'laboratorio'
order by cmd, policyname;


-- ------------------------------------------------------------
-- 4) IDENTIFICAR LAS FICHAS A ANULAR (solo lectura).
--    Los trafos 31, 32 y los DOS 33 que quedaron en el medio.
--    Mirá el resultado y anotá los id antes de tocar nada por la interfaz.
-- ------------------------------------------------------------
select l.id, l.modelo, l.nro_serie, l.ot, l.cliente, l.estado,
       l.creada_en,
       (select count(*) from despachos d where d.id = 'desp_' || l.id) as ya_tiene_despacho
from laboratorio l
where l.estado <> 'finalizada'
  and (l.nro_serie ilike '%31%' or l.nro_serie ilike '%32%' or l.nro_serie ilike '%33%')
order by l.creada_en;

-- ¿Hay SERIES REPETIDAS en la cola? (el caso de los dos "STOCK 33")
select nro_serie, count(*) as veces, string_agg(id::text, ', ') as ids
from laboratorio
where estado <> 'finalizada' and nro_serie is not null
group by nro_serie
having count(*) > 1
order by veces desc;


-- ============================================================
-- 5) VERIFICACION (correr despues del push, con una ficha ya anulada)
-- ============================================================
-- select id, modelo, nro_serie, estado, anulada_por, anulada_en, motivo_anulacion
-- from laboratorio
-- where estado = 'anulada'
-- order by anulada_en desc;
--
-- Esperado: las fichas anuladas con TU usuario y el motivo que escribiste.
-- En la interfaz tienen que haber desaparecido de "Pendientes de ensayo" y
-- aparecer en "Ver fichas anuladas" al pie, con el boton para devolverlas.


-- ============================================================
-- 6) SALIDA DE EMERGENCIA — deshacer una anulacion desde SQL.
--    Normalmente NO hace falta: se hace con "↺ Devolver a la cola".
-- ============================================================
-- update laboratorio
-- set estado = 'pendiente', anulada_en = null, anulada_por = null, motivo_anulacion = null
-- where id = 'PEGAR-EL-ID-ACA';
