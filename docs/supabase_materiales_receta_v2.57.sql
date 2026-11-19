-- ============================================================
-- v2.57 — MATERIALES DE CADA TAREA (receta de SAP × cantidad asignada)
--
-- SAP ya manda las recetas por el endpoint de artículos (sap_articulo_bom:
-- en INELPA-TEST hay ~20.000 líneas). La PWA no las usaba. Ahora:
--   · la planificadora y el operario ven, dentro de la tarea, qué materiales
--     lleva y cuánto (receta del artículo × cantidad de la tarea);
--   · logística ve qué preparar por estación.
-- Es SOLO LECTURA: la transferencia de materiales sigue en SAP.
--
-- POR QUÉ UNA VISTA Y NO LA TABLA ENTERA: cada tablet espeja lo que baja. Las
-- 20.000 líneas no le sirven a nadie; solo hacen falta las recetas de los
-- artículos que tienen una OF de SAP VIGENTE (hoy en test: ~415 líneas de 77
-- artículos). "Vigente" = entrega en los últimos 60 días o futura, o con
-- alguna tarea todavía abierta (para no perder una OF atrasada).
--
-- SEGURIDAD: `security_invoker = true` hace que la vista respete el RLS de
-- las tablas de abajo (solo usuarios autenticados). Sin eso, la vista se
-- ejecuta con los permisos de su dueño y queda leíble con la clave pública:
-- es el problema de las 34 vistas viejas que tenemos pendiente.
--
-- Idempotente: se puede correr dos veces.
--
-- ORDEN: correr ANTES de publicar el código v2.57.
--   1) INELPA-TEST -> push a staging
--   2) PRODUCCIÓN  -> merge a main (en producción la vista va a estar vacía
--      hasta que SAP mande OF; la PWA lo tolera).
-- ============================================================

create or replace view v_receta_materiales
with (security_invoker = true) as
select
  b.parent_code || '|' || b.child_code || '|' || b.ocurrencia as id,   -- clave estable (espejo local + paginado)
  b.parent_code,
  b.child_code,
  b.ocurrencia,
  b.linea,
  b.cantidad,                                   -- POR UNIDAD del artículo padre
  b.uom,
  a.item_name   as child_name,                  -- null si SAP todavía no mandó ese artículo (insumos)
  exists (select 1 from sap_articulo_bom h
          where h.parent_code = b.child_code and h.activo) as child_con_receta  -- true = semielaborado
from sap_articulo_bom b
left join sap_articulos a on a.item_code = b.child_code
where b.activo
  and b.parent_code in (
    select o.item_code
    from ordenes o
    where o.origen = 'sap'
      and o.item_code is not null
      and (o.fecha_entrega is null
           or o.fecha_entrega >= current_date - 60
           or exists (select 1 from tareas t where t.orden_id = o.id and t.estado <> 'finalizada'))
  );

comment on view v_receta_materiales is
  'v2.57: líneas activas de receta de los artículos con OF de SAP vigente. Solo lectura. La PWA multiplica por la cantidad de cada tarea.';

revoke all    on v_receta_materiales from anon;
grant  select on v_receta_materiales to authenticated;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Tiene que devolver filas (en test, ~415):
-- select count(*), count(distinct parent_code) from v_receta_materiales;
--
-- 2) Tiene que decir security_invoker=true:
-- select reloptions from pg_class where relname = 'v_receta_materiales';
--
-- 3) Insumos sin nombre (SAP todavía no mandó el maestro de materia prima):
-- select count(*) from v_receta_materiales where child_name is null;
