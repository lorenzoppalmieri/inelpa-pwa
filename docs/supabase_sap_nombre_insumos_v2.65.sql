-- ============================================================
-- v2.65 — NOMBRE DE LOS INSUMOS EN LAS RECETAS DE SAP
--
-- PROBLEMA: en el tablero de logística y en los materiales de la tarea,
-- algunos materiales salen con su descripción y otros con el código suelto
-- (ALAALU0000016, AISCAN0000013...). No es un error de ALAMO: el contrato
-- manda cada línea de receta solo con `itemCode`, y el nombre se busca en el
-- maestro de artículos. Los semielaborados tienen nombre porque llegan como
-- artículo (tienen receta propia); los insumos (alambre, chapa, canales,
-- bulones) nunca se mandaron como artículo. En INELPA-TEST: 303 códigos de
-- componentes sin artículo y 0 artículos de materia prima.
--
-- SOLUCIÓN: cada línea de receta acepta un `itemName` OPCIONAL (la descripción
-- del componente, que en SAP sale del mismo join OITM que ya usan). Se guarda
-- en la línea. Si después llega el artículo por su cuenta, manda el maestro.
-- Compatible hacia atrás: si no lo mandan, todo sigue igual.
--
--   1) sap_articulo_bom.child_name (nueva, opcional)
--   2) sap_alta_articulos: guarda bom[].itemName. Si un envío no lo trae, se
--      conserva el que había. El nombre NO cuenta como "cambio de receta".
--   3) v_receta_materiales: nombre = maestro de artículos, o el de la línea.
--
-- Idempotente. ORDEN: correr este SQL ANTES de desplegar la Edge Function
-- sap-articulos nueva (si la función manda itemName y la base todavía no lo
-- conoce, simplemente se ignora; al revés no rompe nada).
-- ============================================================

-- 1) Columna
alter table sap_articulo_bom add column if not exists child_name text;
comment on column sap_articulo_bom.child_name is
  'v2.65: descripción del componente que mandó SAP en la línea (bom[].itemName). El maestro sap_articulos tiene prioridad.';

-- 2) Función de alta de artículos (idéntica a v2.40 salvo el nombre de la línea)
create or replace function sap_alta_articulos(p_articulos jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  a              jsonb;
  res            jsonb := '[]'::jsonb;
  v_code         text;
  v_existia      boolean;
  v_antes        timestamptz;
  v_despues      timestamptz;
  v_bom_cambio   boolean;
  v_bom_antes    jsonb;
  v_nuevas       jsonb;
  v_lineas       int;
  v_bajas        int;
  v_sin_alta     int;
begin
  for a in select value from jsonb_array_elements(p_articulos) loop
    v_code := a->>'itemCode';
    begin
      select actualizado_en into v_antes from sap_articulos where item_code = v_code;
      v_existia := found;

      insert into sap_articulos as t
        (item_code, item_name, item_type, uom, activo, default_warehouse, maneja_lote)
      values
        (v_code, a->>'itemName', a->>'itemType', a->>'uom',
         (a->>'active')::boolean, a->>'defaultWarehouse', (a->>'hasBatch')::boolean)
      on conflict (item_code) do update set
        item_name         = excluded.item_name,
        item_type         = excluded.item_type,
        uom               = excluded.uom,
        activo            = excluded.activo,
        default_warehouse = excluded.default_warehouse,
        maneja_lote       = excluded.maneja_lote,
        -- solo se mueve la fecha si algo cambio de verdad
        actualizado_en = case
          when (t.item_name, t.item_type, t.uom, t.activo, t.default_warehouse, t.maneja_lote)
               is distinct from
               (excluded.item_name, excluded.item_type, excluded.uom, excluded.activo,
                excluded.default_warehouse, excluded.maneja_lote)
          then clock_timestamp() else t.actualizado_en end
      returning actualizado_en into v_despues;

      -- Receta: solo si el envio trae la clave "bom" como array.
      -- Ausente o null = no tocar (ej. se actualiza solo la descripcion).
      v_bom_cambio := false;
      v_lineas     := null;
      v_bajas      := null;
      v_sin_alta   := null;
      if jsonb_typeof(a->'bom') = 'array' then
        -- Foto de la receta vigente ANTES, para saber si algo cambio.
        select coalesce(jsonb_agg(jsonb_build_array(child_code, ocurrencia, linea, cantidad, uom)
                                  order by child_code, ocurrencia), '[]'::jsonb)
        into v_bom_antes
        from sap_articulo_bom where parent_code = v_code and activo;

        -- Receta que llego, normalizada: posicion y ocurrencia de cada componente.
        select coalesce(jsonb_agg(jsonb_build_object(
                 'child', s.child, 'ocurrencia', s.ocurrencia, 'linea', s.linea,
                 'cantidad', s.cantidad, 'uom', s.uom, 'nombre', s.nombre)), '[]'::jsonb)
        into v_nuevas
        from (
          select l->>'itemCode'                                              as child,
                 row_number() over (partition by l->>'itemCode' order by ord) as ocurrencia,
                 ord - 1                                                     as linea,
                 (l->>'quantity')::numeric                                   as cantidad,
                 l->>'uom'                                                   as uom,
                 -- v2.65: descripción del componente (opcional). Sirve para los
                 -- insumos que SAP no manda como artículo (alambre, chapa...).
                 nullif(btrim(l->>'itemName'), '')                           as nombre
          from jsonb_array_elements(a->'bom') with ordinality as x(l, ord)
        ) s;

        -- Alta / actualizacion / reactivacion de lo que vino.
        insert into sap_articulo_bom as b
          (parent_code, child_code, ocurrencia, linea, cantidad, uom, child_name, activo, alta_en, baja_en, actualizado_en)
        select v_code, n.child, n.ocurrencia, n.linea, n.cantidad, n.uom, n.nombre, true,
               clock_timestamp(), null, clock_timestamp()
        from jsonb_to_recordset(v_nuevas) as n(child text, ocurrencia int, linea int, cantidad numeric, uom text, nombre text)
        on conflict (parent_code, child_code, ocurrencia) do update set
          linea          = excluded.linea,
          cantidad       = excluded.cantidad,
          uom            = excluded.uom,
          -- Si un envío no trae el nombre, se conserva el que ya había.
          child_name     = coalesce(excluded.child_name, b.child_name),
          activo         = true,
          baja_en        = null,
          actualizado_en = case
            when (b.linea, b.cantidad, b.uom, b.activo) is distinct from (excluded.linea, excluded.cantidad, excluded.uom, true)
            then clock_timestamp() else b.actualizado_en end;

        -- Baja logica de lo que estaba vigente y ya no vino. Nunca DELETE.
        update sap_articulo_bom b
        set activo = false, baja_en = clock_timestamp(), actualizado_en = clock_timestamp()
        where b.parent_code = v_code
          and b.activo
          and not exists (
            select 1 from jsonb_to_recordset(v_nuevas) as n(child text, ocurrencia int)
            where n.child = b.child_code and n.ocurrencia = b.ocurrencia);
        get diagnostics v_bajas = row_count;

        v_bom_cambio := v_bom_antes is distinct from (
          select coalesce(jsonb_agg(jsonb_build_array(child_code, ocurrencia, linea, cantidad, uom)
                                    order by child_code, ocurrencia), '[]'::jsonb)
          from sap_articulo_bom where parent_code = v_code and activo);
        v_lineas := jsonb_array_length(a->'bom');
        -- Informativo: componentes de la receta que todavia no se dieron de alta.
        -- Es normal (un nivel por llamada, sin orden garantizado).
        select count(*) into v_sin_alta
        from jsonb_array_elements(a->'bom') as l
        where not exists (select 1 from sap_articulos s where s.item_code = l->>'itemCode');
      end if;

      res := res || jsonb_build_object(
        'itemCode',           v_code,
        'resultado',          case when not v_existia                          then 'creado'
                                   when v_bom_cambio or v_despues <> v_antes   then 'actualizado'
                                   else 'sin_cambios' end,
        'lineasReceta',       v_lineas,
        'lineasDadasDeBaja',  v_bajas,
        'componentesSinAlta', v_sin_alta);

    exception when others then
      res := res || jsonb_build_object(
        'itemCode',     v_code,
        'resultado',    'rechazado',
        'motivo',       sqlerrm,
        'codigoSql',    sqlstate,
        -- bloqueos / concurrencia / recursos: reintentable. Datos invalidos: no.
        'reintentable', (sqlstate like '40%' or sqlstate like '53%' or sqlstate = '55P03'));
    end;
  end loop;
  return res;
end $$;

revoke all     on function sap_alta_articulos(jsonb) from public, anon, authenticated;
grant  execute on function sap_alta_articulos(jsonb) to service_role;

-- 3) Vista de materiales (misma definición que v2.57, con el nombre de la línea como respaldo)
create or replace view v_receta_materiales
with (security_invoker = true) as
select
  b.parent_code || '|' || b.child_code || '|' || b.ocurrencia as id,
  b.parent_code,
  b.child_code,
  b.ocurrencia,
  b.linea,
  b.cantidad,
  b.uom,
  coalesce(a.item_name, b.child_name) as child_name,     -- v2.65
  exists (select 1 from sap_articulo_bom h
          where h.parent_code = b.child_code and h.activo) as child_con_receta
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

revoke all    on v_receta_materiales from anon;
grant  select on v_receta_materiales to authenticated;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- a) La columna existe:
-- select count(*) filter (where child_name is not null) as con_nombre_en_linea, count(*) from sap_articulo_bom;
--
-- b) Materiales todavía sin nombre (tiene que ir bajando a 0 cuando ALAMO
--    reenvíe las recetas con bom[].itemName):
-- select count(distinct child_code) from v_receta_materiales where child_name is null;
