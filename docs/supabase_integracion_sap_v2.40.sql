-- ============================================================
-- INTEGRACION SAP B1 — FASE 1: ENTRADA DE DATOS (SAP -> PWA)        v2.40
--
-- QUE RESUELVE
-- Prepara la base para los dos endpoints acordados con ALAMO (reuniones del
-- 21 y 22/10/2026):
--   * sap-articulos : SAP da de alta / actualiza articulos y su receta (BOM).
--   * sap-ordenes   : SAP da de alta ordenes de fabricacion LIBERADAS.
-- Las Edge Functions validan el pedido y llaman a las dos funciones de este
-- archivo, que escriben de forma atomica POR ITEM (si falla uno, los demas
-- del mismo envio se graban igual).
--
-- >>> CORRER EN EL PROYECTO DE TEST. NO EN PRODUCCION. <<<
-- Condicion acordada con ALAMO: nada de esto se prueba sobre la base donde
-- trabaja la planta. Ver docs/ALAMO_plan_endpoints_fase1.md.
--
-- ORDEN DE DESPLIEGUE
--   1. Este SQL (en el proyecto de test).
--   2. Secret SAP_INTEGRATION_TOKEN en ese proyecto.
--   3. Deploy de las Edge Functions sap-articulos y sap-ordenes.
--   4. Prueba con la coleccion de Postman (docs/postman/).
--
-- IDEMPOTENTE: se puede correr dos veces sin romper nada.
--
-- DECISIONES (y por que)
--   * ordenes conserva su PK uuid (pedido de ALAMO: DocEntry no es la PK).
--     sap_abs_entry (= DocEntry de SAP; la columna ya existia sin uso) pasa a
--     tener UNIQUE: es la clave de idempotencia. UNIQUE comun y no parcial,
--     porque Postgres admite muchos NULL —las ordenes historicas cargadas a
--     mano quedan en NULL y no chocan— y porque ON CONFLICT necesita un indice
--     no parcial para engancharse.
--   * El vinculo padre-hija se guarda como el DocEntry del padre
--     (sap_parent_abs_entry), SIN clave foranea. SAP no garantiza que el padre
--     llegue antes que las hijas; asi el orden de llegada no importa: la
--     relacion se resuelve al leer, cruzando sap_parent_abs_entry con
--     sap_abs_entry.
--   * Las OF no se reenvian con cambios (reunion 2). Un DocEntry repetido es
--     un reintento de red: se responde 'duplicada' y NO se toca la orden.
--   * La etiqueta, la linea y el material de cada OF salen del articulo de
--     SAP, NO de las tablas modelos/componentes de Supabase, que estan
--     desactualizadas (ver la seccion 5.3).
--   * El maestro de SAP va a tablas espejo nuevas (sap_articulos,
--     sap_articulo_bom), NO a modelos/componentes. Esas dos son destino de la
--     clave foranea tareas.componente_codigo: escribir ahi desde un endpoint
--     externo durante una prueba arriesga la planificacion. Pasar el front a
--     leer el catalogo desde la base es la fase siguiente.
--   * Articulos: nunca se borran (las tareas guardan el codigo).
--     Lineas de receta: reemplazo completo cuando el envio trae "bom"
--     (SAP no guarda historial de una linea quitada, no puede avisar "se
--     desactivo"). Si el envio NO trae "bom", la receta no se toca.
--   * Las funciones solo las puede ejecutar service_role. Sin el REVOKE,
--     cualquiera con la anon key (que es publica) podria llamarlas por
--     /rest/v1/rpc y saltearse el token del endpoint.
-- ============================================================


-- ------------------------------------------------------------
-- 0) DIAGNOSTICO PREVIO (opcional, solo lectura)
--    El UNIQUE de la seccion 1 falla si ya hubiera dos ordenes con el mismo
--    sap_abs_entry. Hoy la columna no se usa: deberia devolver 0 filas.
-- ------------------------------------------------------------
-- select sap_abs_entry, count(*) from ordenes
-- where sap_abs_entry is not null group by 1 having count(*) > 1;


-- ------------------------------------------------------------
-- 1) ORDENES: campos de SAP
-- ------------------------------------------------------------
alter table ordenes add column if not exists origen               text not null default 'pwa';
alter table ordenes add column if not exists sap_doc_num          text;
alter table ordenes add column if not exists sap_parent_abs_entry int;
alter table ordenes add column if not exists item_code            text;
alter table ordenes add column if not exists sap_warehouse        text;
alter table ordenes add column if not exists sap_batch            text;
alter table ordenes add column if not exists sap_status           text;
alter table ordenes add column if not exists fecha_inicio_plan    date;
alter table ordenes add column if not exists recibida_de_sap_en   timestamptz;

comment on column ordenes.origen               is 'pwa = cargada a mano en la PWA | sap = recibida por el endpoint sap-ordenes';
comment on column ordenes.sap_abs_entry        is 'DocEntry (AbsoluteEntry) de la OF en SAP B1. Clave de idempotencia del endpoint.';
comment on column ordenes.sap_doc_num          is 'DocNum de SAP: numero visible de la OF.';
comment on column ordenes.sap_parent_abs_entry is 'DocEntry de la OF del transformador (padre). Sin FK: puede llegar antes que el padre.';
comment on column ordenes.item_code            is 'ItemCode SAP del articulo a fabricar. ordenes.modelo guarda el NOMBRE (compatibilidad con el front).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordenes_origen_chk') then
    alter table ordenes add constraint ordenes_origen_chk check (origen in ('pwa', 'sap'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ordenes_sap_abs_entry_key') then
    alter table ordenes add constraint ordenes_sap_abs_entry_key unique (sap_abs_entry);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ordenes_sap_padre_distinto_chk') then
    alter table ordenes add constraint ordenes_sap_padre_distinto_chk
      check (sap_parent_abs_entry is null or sap_parent_abs_entry <> sap_abs_entry);
  end if;
end $$;

-- Para encontrar rapido las hijas de un transformador.
create index if not exists idx_ordenes_sap_parent
  on ordenes (sap_parent_abs_entry) where sap_parent_abs_entry is not null;


-- ------------------------------------------------------------
-- 2) ESPEJO DEL MAESTRO DE ARTICULOS DE SAP
-- ------------------------------------------------------------
create table if not exists sap_articulos (
  item_code         text primary key,                     -- ItemCode (OITM)
  item_name         text not null,                        -- ItemName
  item_type         text not null,                        -- PT producto terminado | SE semielaborado | MP materia prima
  uom               text,
  activo            boolean not null default true,        -- discontinuado en SAP = false. Nunca se borra.
  default_warehouse text,
  maneja_lote       boolean not null default false,
  recibido_en       timestamptz not null default now(),   -- primera vez que llego
  actualizado_en    timestamptz not null default now(),   -- ultima vez que cambio algo
  constraint sap_articulos_tipo_chk check (item_type in ('PT', 'SE', 'MP'))
);

-- Un nivel de receta por articulo. El arbol se arma con envios sucesivos.
create table if not exists sap_articulo_bom (
  parent_code text    not null references sap_articulos (item_code),  -- sin cascade: los articulos no se borran
  linea       int     not null,                                       -- posicion en la receta (0..n)
  child_code  text    not null,                                       -- sin FK: el componente puede llegar despues
  cantidad    numeric not null,
  uom         text,
  primary key (parent_code, linea),
  constraint sap_bom_cantidad_chk     check (cantidad > 0),
  constraint sap_bom_no_autorref_chk  check (child_code <> parent_code)
);
create index if not exists idx_sap_bom_child on sap_articulo_bom (child_code);


-- ------------------------------------------------------------
-- 3) RLS: lectura para usuarios logueados; escritura solo service_role
--    (las Edge Functions). Sin politicas de escritura a proposito.
-- ------------------------------------------------------------
alter table sap_articulos    enable row level security;
alter table sap_articulo_bom enable row level security;

drop policy if exists sel_sap_articulos on sap_articulos;
create policy sel_sap_articulos on sap_articulos for select to authenticated using (true);

drop policy if exists sel_sap_bom on sap_articulo_bom;
create policy sel_sap_bom on sap_articulo_bom for select to authenticated using (true);


-- ------------------------------------------------------------
-- 4) ALTA / ACTUALIZACION DE ARTICULOS
--    Recibe el array ya validado por la Edge Function. Devuelve un resultado
--    por articulo: creado | actualizado | sin_cambios | rechazado.
-- ------------------------------------------------------------
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
  v_lineas       int;
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
      v_sin_alta   := null;
      if jsonb_typeof(a->'bom') = 'array' then
        if (select coalesce(jsonb_agg(jsonb_build_array(child_code, cantidad, uom) order by linea), '[]'::jsonb)
              from sap_articulo_bom where parent_code = v_code)
           is distinct from
           (select coalesce(jsonb_agg(jsonb_build_array(l->>'itemCode', (l->>'quantity')::numeric, l->>'uom') order by ord), '[]'::jsonb)
              from jsonb_array_elements(a->'bom') with ordinality as x(l, ord))
        then
          delete from sap_articulo_bom where parent_code = v_code;
          insert into sap_articulo_bom (parent_code, linea, child_code, cantidad, uom)
          select v_code, (ord - 1)::int, l->>'itemCode', (l->>'quantity')::numeric, l->>'uom'
          from jsonb_array_elements(a->'bom') with ordinality as x(l, ord);
          v_bom_cambio := true;
        end if;
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


-- ------------------------------------------------------------
-- 5) ALTA DE ORDENES DE FABRICACION
--    Recibe el array ya validado (solo liberadas). Devuelve un resultado por
--    orden: creada | duplicada | rechazada.
-- ------------------------------------------------------------
create or replace function sap_alta_ordenes(p_ordenes jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  o              jsonb;
  res            jsonb := '[]'::jsonb;
  v_entry        int;
  v_parent       int;
  v_id           uuid;
  v_exist        record;
  v_art          record;
  v_cat          record;
  v_modelo       text;
  v_linea        linea_prod;
  v_material     material_bobina;
  v_avisos       jsonb;
begin
  for o in select value from jsonb_array_elements(p_ordenes) loop
    v_entry  := null;
    v_parent := null;
    v_id     := null;
    v_avisos := '[]'::jsonb;
    begin
      -- Los casts van DENTRO del bloque protegido: un valor invalido rechaza
      -- solo esta orden, no el lote entero. (La Edge Function ya valida; esto
      -- es la segunda linea de defensa.)
      v_entry  := (o->>'docEntry')::int;
      v_parent := (o->>'parentDocEntry')::int;
      -- 5.1 ¿Ya existe? Reintento de red: no se toca. Si los datos difieren,
      --     se avisa (las OF no se modifican: se cancela y se emite otra).
      select id, item_code, cantidad, fecha_entrega into v_exist
      from ordenes where sap_abs_entry = v_entry;
      if found then
        if (v_exist.item_code, v_exist.cantidad, v_exist.fecha_entrega)
           is distinct from (o->>'itemCode', (o->>'plannedQty')::int, (o->>'dueDate')::date) then
          v_avisos := v_avisos || to_jsonb('Difiere de la orden recibida originalmente; se conserva la original. Las OF no se modifican: hay que cancelarla y emitir una nueva.'::text);
        end if;
        res := res || jsonb_build_object('docEntry', v_entry, 'resultado', 'duplicada',
                                         'id', v_exist.id, 'avisos', v_avisos);
        continue;
      end if;

      -- 5.2 El articulo tiene que estar dado de alta antes (sap-articulos).
      select item_code, item_name, item_type, activo into v_art
      from sap_articulos where item_code = o->>'itemCode';
      if not found then
        res := res || jsonb_build_object(
          'docEntry', v_entry, 'resultado', 'rechazada', 'reintentable', true,
          'motivo', format('El articulo %s todavia no esta dado de alta en la PWA. Enviarlo primero por sap-articulos y reintentar esta orden.', o->>'itemCode'));
        continue;
      end if;
      if not v_art.activo then
        v_avisos := v_avisos || to_jsonb('El articulo esta marcado como inactivo.'::text);
      end if;
      if v_art.item_type = 'MP' then
        v_avisos := v_avisos || to_jsonb('El articulo es materia prima: no deberia tener orden de fabricacion.'::text);
      end if;

      -- 5.3 Datos que el front necesita (modelo, linea, material son NOT NULL).
      --     La FUENTE es el articulo de SAP. Las tablas modelos/componentes de
      --     Supabase solo se consultan como ULTIMO recurso: el diagnostico del
      --     26/10 mostro que son una foto de junio, con 179 codigos faltantes y
      --     al menos un error (TMR19V0000001 figuraba como "TMR 40/7 Aluminio"
      --     cuando es un 5/19 Cobre). Si la etiqueta saliera de ahi, el
      --     planificador desplegaria la receta del transformador equivocado.
      select m.linea, m.material into v_cat from modelos m where m.codigo = v_art.item_code;
      if not found then
        select c.linea, c.material into v_cat from componentes c where c.codigo = v_art.item_code;
      end if;

      -- Etiqueta para el operario: el ItemName de SAP. Es identico al nombre
      -- del catalogo del front (verificado: 309/309 modelos y 1383/1383
      -- semielaborados del export del 15/9), asi que el planificador actual
      -- lo reconoce. ordenes.modelo guarda nombres, no codigos.
      v_modelo := v_art.item_name;

      -- Linea: prefijo del codigo > nombre > catalogo PWA (ultimo recurso).
      -- Las bobinas (BOBALT/BOBBAJ) no dicen la linea en el codigo, pero si en
      -- el nombre ("Bobina AT Distribucion ...", "Bobina BT Rural ...").
      v_linea := case
        when v_art.item_code ~ '^(TMR|TBR|TTR|CUBRUR|TAPRUR|PARRUR)'          then 'rural'::linea_prod
        when v_art.item_code ~ '^(TTD|CUBDIS|TAPDIS|TANDIS|PARDIS)'           then 'distribucion'::linea_prod
        when v_art.item_name ~* '\mrural\M'                                   then 'rural'::linea_prod
        when v_art.item_name ~* '\mdistribuci[oó]n\M'                         then 'distribucion'::linea_prod
        when v_cat.linea in ('distribucion', 'rural', 'general')            then v_cat.linea::linea_prod
        else null end;
      if v_linea is null then
        v_linea  := 'general';
        v_avisos := v_avisos || to_jsonb('No se pudo deducir la linea (rural/distribucion); se cargo como general.'::text);
      end if;

      -- Material: nombre de SAP > catalogo PWA (ultimo recurso).
      v_material := case
        when v_art.item_name ~* '\m(cobre|cu)\M'           then 'cobre'::material_bobina
        when v_art.item_name ~* '\m(aluminio|al)\M'        then 'aluminio'::material_bobina
        when v_cat.material in ('cobre', 'aluminio')       then v_cat.material::material_bobina
        else null end;
      if v_material is null then
        v_material := 'cobre';
        v_avisos   := v_avisos || to_jsonb('Material no deducible del articulo; se asumio cobre.'::text);
      end if;

      -- 5.4 Alta. ON CONFLICT cubre la carrera de dos envios simultaneos.
      insert into ordenes
        (nro_orden, modelo, material, linea, cantidad, fecha_entrega, creada_en,
         origen, sap_abs_entry, sap_doc_num, sap_parent_abs_entry, item_code,
         sap_warehouse, sap_batch, sap_status, fecha_inicio_plan, recibida_de_sap_en)
      values
        (coalesce(o->>'docNum', v_entry::text), v_modelo, v_material, v_linea,
         (o->>'plannedQty')::int, (o->>'dueDate')::date, now(),
         'sap', v_entry, o->>'docNum', v_parent, v_art.item_code,
         o->>'warehouse', o->>'batchNumber', o->>'status', (o->>'startDate')::date, now())
      on conflict (sap_abs_entry) do nothing
      returning id into v_id;

      if v_id is null then
        select id into v_id from ordenes where sap_abs_entry = v_entry;
        res := res || jsonb_build_object('docEntry', v_entry, 'resultado', 'duplicada',
                                         'id', v_id, 'avisos', v_avisos);
        continue;
      end if;

      res := res || jsonb_build_object(
        'docEntry',      v_entry,
        'resultado',     'creada',
        'id',            v_id,
        -- Informativo. false es normal si las hijas llegan antes o en el mismo lote.
        'padreRecibido', case when v_parent is null then null
                              else exists (select 1 from ordenes where sap_abs_entry = v_parent) end,
        'avisos',        v_avisos);

    exception when others then
      res := res || jsonb_build_object(
        'docEntry',     coalesce(to_jsonb(v_entry), o->'docEntry'),
        'resultado',    'rechazada',
        'motivo',       sqlerrm,
        'codigoSql',    sqlstate,
        'reintentable', (sqlstate like '40%' or sqlstate like '53%' or sqlstate = '55P03'));
    end;
  end loop;
  return res;
end $$;


-- ------------------------------------------------------------
-- 6) PERMISOS: solo service_role ejecuta las funciones.
--    Supabase da EXECUTE a anon/authenticated por defecto en el esquema
--    public; sin estos REVOKE se podrian llamar con la anon key.
-- ------------------------------------------------------------
revoke all     on function sap_alta_articulos(jsonb) from public, anon, authenticated;
revoke all     on function sap_alta_ordenes(jsonb)   from public, anon, authenticated;
grant  execute on function sap_alta_articulos(jsonb) to service_role;
grant  execute on function sap_alta_ordenes(jsonb)   to service_role;


-- ------------------------------------------------------------
-- 7) VERIFICACION (correr despues, solo lectura)
-- ------------------------------------------------------------
-- Columnas nuevas en ordenes (debe listar 9):
-- select column_name from information_schema.columns
-- where table_name = 'ordenes'
--   and column_name in ('origen','sap_doc_num','sap_parent_abs_entry','item_code','sap_warehouse',
--                       'sap_batch','sap_status','fecha_inicio_plan','recibida_de_sap_en');
--
-- Restricciones (debe listar las 3):
-- select conname from pg_constraint
-- where conname in ('ordenes_origen_chk','ordenes_sap_abs_entry_key','ordenes_sap_padre_distinto_chk');
--
-- Permisos (anon y authenticated deben dar false; service_role true):
-- select r, has_function_privilege(r, 'sap_alta_ordenes(jsonb)', 'execute')
-- from unnest(array['anon','authenticated','service_role']) as r;
--
-- Despues de la prueba con Postman, ver lo que llego:
-- select sap_abs_entry, sap_doc_num, sap_parent_abs_entry, item_code, modelo, linea, material,
--        cantidad, fecha_entrega, origen
-- from ordenes where origen = 'sap' order by recibida_de_sap_en desc;
--
-- Transformador con sus hijas:
-- select p.sap_doc_num as trafo, h.sap_doc_num as hija, h.item_code, h.modelo
-- from ordenes h left join ordenes p on p.sap_abs_entry = h.sap_parent_abs_entry
-- where h.origen = 'sap' order by p.sap_abs_entry, h.sap_abs_entry;
