-- ============================================================
-- DIAGNÓSTICO v2.53 — "La OF de SAP se guarda pero no se ve en la PWA"
-- Correr en INELPA-TEST (chdzcymppxpkrivgzyrc). SOLO LECTURA: no cambia nada.
--
-- Qué confirma:
--   1. Que la OF existe y con qué datos quedó (línea, material, cantidad, modelo).
--   2. Que el modelo que mandó SAP (ItemName) existe en el catálogo del front:
--      si no existe, la OF aparece en el desplegable pero sin semielaborados.
--   3. Que `ordenes` está publicada en Realtime (si no, la OF solo aparece
--      al recargar la app).
-- ============================================================

-- 1) Últimas OF recibidas de SAP
select o.sap_abs_entry      as doc_entry,
       o.sap_doc_num        as doc_num,
       o.nro_orden,
       o.item_code,
       left(o.modelo, 50)   as modelo,
       o.linea, o.material, o.cantidad, o.fecha_entrega,
       o.creada_en, o.recibida_de_sap_en,
       o.sap_parent_abs_entry as of_padre,
       (select count(*) from tareas t where t.orden_id = o.id) as tareas
from ordenes o
where o.origen = 'sap'
order by o.recibida_de_sap_en desc nulls last
limit 30;

-- 2) Nombre con el que llegó vs. nombre del catálogo (tabla modelos, v1.5/v2.41).
--    nombre_coincide = false -> antes de la v2.53, "Asignar tarea" mostraba
--    "El modelo de la orden no esta en el catalogo maestro" y ningún semielaborado.
--    Desde la v2.53 la PWA busca primero por item_code, así que deja de importar.
select o.sap_doc_num, o.item_code,
       left(o.modelo, 45) as nombre_en_la_of,
       left(m.nombre, 45) as nombre_en_catalogo,
       (m.nombre = o.modelo) as nombre_coincide
from ordenes o
left join modelos m on m.codigo = o.item_code
where o.origen = 'sap'
order by o.recibida_de_sap_en desc nulls last
limit 30;

-- 3) ¿`ordenes` está en Realtime?
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'ordenes';
-- Tiene que devolver 1 fila. Si devuelve 0: correr docs/supabase_realtime_rls.sql en test.
