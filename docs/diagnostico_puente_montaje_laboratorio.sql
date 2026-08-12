-- ============================================================
-- DIAGNOSTICO — ¿todo lo que sale de Montaje PO llega a Laboratorio?
--
-- El codigo cubre las DOS lineas desde v1.37 (TareaCard.finalizar):
--     esMontajePO = sector_id in ('montaje_po_dist', 'montaje_po_rural')
-- y `linea` en la ficha solo se usa como etiqueta, nunca como filtro.
--
-- Pero el puente corre EN LA TABLET, en el momento de finalizar. Si una tarea
-- se finalizo antes de v1.37, o el alta de la ficha se perdio en la cola
-- offline, el trafo quedo terminado y sin ensayo, sin que nadie se entere.
-- Esto lo detecta.
--
-- TODO ESTE ARCHIVO ES DE SOLO LECTURA. No modifica nada.
-- ============================================================


-- ------------------------------------------------------------
-- 1) FOTO GENERAL — ¿cuanto sale de cada Montaje PO y cuanto llego al lab?
-- ------------------------------------------------------------
select
  t.sector_id,
  count(*)                                              as finalizadas,
  count(l.id)                                           as con_ficha_de_lab,
  count(*) - count(l.id)                                as SIN_FICHA,
  min(t.fin_real)::date                                 as primera,
  max(t.fin_real)::date                                 as ultima
from tareas t
left join laboratorio l on l.tarea_origen_id = t.id
where t.sector_id in ('montaje_po_dist', 'montaje_po_rural')
  and t.estado = 'finalizada'
group by t.sector_id
order by t.sector_id;

-- Lectura: si 'montaje_po_rural' aparece con finalizadas = 0, el puente nunca
-- se ejercito en rural porque todavia no se termino ningun trafo ahi (no es un
-- bug). Si tiene finalizadas > 0 y SIN_FICHA > 0, ahi si hay trabajo perdido.


-- ------------------------------------------------------------
-- 2) EL DETALLE — trafos terminados que NUNCA generaron ficha de ensayo.
--    Estos son los que hay que dar de alta a mano en Laboratorio.
-- ------------------------------------------------------------
select t.id, t.sector_id, t.modelo, t.nro_transformador, t.cliente,
       t.fin_real, t.operario_id, o.nro_orden
from tareas t
left join laboratorio l on l.tarea_origen_id = t.id
left join ordenes o on o.id = t.orden_id
where t.sector_id in ('montaje_po_dist', 'montaje_po_rural')
  and t.estado = 'finalizada'
  and l.id is null
order by t.fin_real desc;


-- ------------------------------------------------------------
-- 3) LA COLA DE LABORATORIO POR LINEA — ¿hay rural esperando ensayo?
-- ------------------------------------------------------------
select coalesce(linea, '(sin linea)') as linea, estado, count(*)
from laboratorio
group by coalesce(linea, '(sin linea)'), estado
order by linea, estado;


-- ------------------------------------------------------------
-- 4) CONTROL INVERSO — fichas de lab cuya tarea de origen ya no existe.
--    Serian huerfanas (tarea borrada por el planificador despues del alta).
-- ------------------------------------------------------------
select l.id, l.modelo, l.nro_serie, l.linea, l.estado, l.creada_en
from laboratorio l
left join tareas t on t.id = l.tarea_origen_id
where l.tarea_origen_id is not null and t.id is null
order by l.creada_en desc;


-- ------------------------------------------------------------
-- 5) ¿SE ESTA PLANIFICANDO MONTAJE PO EN RURAL?
--    Si rural solo tiene tareas de PA y ninguna de PO, el trafo nunca se
--    "termina" para la app y por eso no hay ensayos rurales. Eso no se arregla
--    con codigo: es como se esta cargando la planificacion.
-- ------------------------------------------------------------
select sector_id, estado, count(*)
from tareas
where sector_id in ('montaje_pa_dist', 'montaje_po_dist', 'montaje_pa_rural', 'montaje_po_rural')
group by sector_id, estado
order by sector_id, estado;
