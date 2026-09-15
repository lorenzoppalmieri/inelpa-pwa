-- ============================================================
-- DIAGNOSTICO — ORDENES DE FABRICACION CON N° REPETIDO (v2.16)
--
-- Desde v2.16 la PWA NO deja crear una orden con un N° que ya existe. La
-- validacion es SOLO de aplicacion, a proposito: NO se puso un UNIQUE en la
-- tabla porque la base puede tener duplicados cargados antes, y una restriccion
-- los volveria imposibles de editar o borrar. El historial se conserva.
--
-- Este script NO modifica nada. Sirve para ver que duplicados quedaron de antes
-- y decidir a mano que hacer con cada uno.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Numeros de orden repetidos.
--    Se compara NORMALIZADO (sin espacios, en mayusculas) igual que la app:
--    'of-2605', 'OF-2605' y ' OF-2605 ' son la misma orden para quien la lee.
-- ------------------------------------------------------------
with norm as (
  select
    id,
    nro_orden,
    upper(regexp_replace(nro_orden, '\s', '', 'g')) as clave,
    modelo, cantidad, fecha_entrega, creada
  from public.ordenes
)
select
  clave                                   as nro_normalizado,
  count(*)                                as veces,
  array_agg(nro_orden order by creada)    as como_fue_escrito,
  array_agg(modelo    order by creada)    as modelos,
  array_agg(cantidad  order by creada)    as cantidades,
  array_agg(creada    order by creada)    as fechas_de_carga,
  array_agg(id        order by creada)    as ids
from norm
group by clave
having count(*) > 1
order by veces desc, clave;

-- ------------------------------------------------------------
-- 2) Cuantas TAREAS cuelga cada una de las duplicadas.
--    Es el dato que decide si se puede borrar una: la que no tiene tareas se
--    elimina sin consecuencias; la que si tiene, hay que mirarla de cerca
--    porque borrarla se lleva produccion registrada.
-- ------------------------------------------------------------
with norm as (
  select id, nro_orden, upper(regexp_replace(nro_orden, '\s', '', 'g')) as clave
  from public.ordenes
),
repetidas as (
  select clave from norm group by clave having count(*) > 1
)
select
  n.clave                                                as nro_normalizado,
  n.id                                                   as orden_id,
  n.nro_orden,
  count(t.id)                                            as tareas,
  count(t.id) filter (where t.estado = 'finalizada')      as finalizadas,
  count(t.id) filter (where t.estado <> 'pendiente')      as con_produccion
from norm n
join repetidas r on r.clave = n.clave
left join public.tareas t on t.orden_id = n.id
group by n.clave, n.id, n.nro_orden
order by n.clave, tareas desc;

-- ------------------------------------------------------------
-- 3) Resumen: cuanto trabajo de limpieza hay.
-- ------------------------------------------------------------
with norm as (
  select upper(regexp_replace(nro_orden, '\s', '', 'g')) as clave from public.ordenes
)
select
  (select count(*) from public.ordenes)                                  as ordenes_totales,
  (select count(*) from (select clave from norm group by clave
                          having count(*) > 1) x)                        as numeros_repetidos,
  (select coalesce(sum(c), 0) from (select count(*) - 1 as c from norm
     group by clave having count(*) > 1) y)                              as filas_de_mas;
