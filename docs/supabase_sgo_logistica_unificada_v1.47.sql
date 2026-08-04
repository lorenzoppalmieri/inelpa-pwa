-- ============================================================
-- v1.47 — SGO: se unifica el área de Logística
--
-- El organigrama cambió: desaparece "Logística Administrativa" y "Logística
-- Operativa" pasa a llamarse simplemente "LOGÍSTICA". Giuliano queda a cargo de
-- todo el frente.
--
-- Criterio: se CONSERVA el id 'logistica_operativa' (solo cambia la etiqueta en
-- la app) y se remapea a él todo lo que estaba cargado como
-- 'logistica_administrativa'. Así ningún expediente ni KPI pierde su área.
--
-- OJO — por qué el orden importa:
--   sgo_indicadores tiene un índice ÚNICO sobre (area_id, pilar, lower(nombre)).
--   Si el mismo KPI existe en las dos logísticas, mover el administrativo al
--   área operativa choca contra el que ya está ahí y el UPDATE falla entero
--   (error 23505). Por eso PRIMERO se resuelven los duplicados y RECIÉN DESPUÉS
--   se hace el update.
--
-- Idempotente: se puede correr más de una vez.
-- ============================================================

-- ============================================================
-- PASO 0 — VISTA PREVIA (opcional, no modifica nada)
-- Descomentá y corré solo esto para ver qué KPIs están duplicados y cuál se va
-- a conservar antes de tocar los datos.
-- ============================================================
-- select
--   a.pilar,
--   a.nombre                                     as nombre_administrativa,
--   o.nombre                                     as nombre_operativa,
--   a.actualizado_en                             as act_administrativa,
--   o.actualizado_en                             as act_operativa,
--   case when a.actualizado_en > o.actualizado_en
--        then 'se conserva el de ADMINISTRATIVA'
--        else 'se conserva el de OPERATIVA' end  as decision
-- from public.sgo_indicadores a
-- join public.sgo_indicadores o
--   on o.area_id = 'logistica_operativa'
--  and o.pilar = a.pilar
--  and lower(o.nombre) = lower(a.nombre)
-- where a.area_id = 'logistica_administrativa';

-- ============================================================
-- PASO 1 — Aflojar los CHECK de area_id
-- Si no, los propios updates de abajo se rechazan solos.
-- ============================================================
do $$
declare c record;
begin
  for c in
    select conrelid::regclass as tabla, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in (
        'public.sgo_eventos'::regclass,
        'public.sgo_indicadores'::regclass
      )
      and pg_get_constraintdef(oid) ilike '%area_id%'
  loop
    execute format('alter table %s drop constraint %I', c.tabla, c.conname);
  end loop;
end $$;

-- ============================================================
-- PASO 2 — Eventos / expedientes (no tienen unicidad: update directo)
-- ============================================================
update public.sgo_eventos
set area_id = 'logistica_operativa'
where area_id = 'logistica_administrativa';

update public.sgo_eventos
set area_origen_id = 'logistica_operativa'
where area_origen_id = 'logistica_administrativa';

-- ============================================================
-- PASO 3 — Indicadores: resolver duplicados ANTES de mover
--
-- De cada par en conflicto se conserva el más actualizado. Del que se descarta
-- se rescatan las mediciones históricas de los períodos que al ganador le
-- faltan; el resto se pierde junto con la fila (la FK borra en cascada).
-- ============================================================

-- 3.a) Identificar ganador y perdedor de cada colisión.
create temporary table _log_dup on commit drop as
select
  case when a.actualizado_en > o.actualizado_en then a.id else o.id end as id_gana,
  case when a.actualizado_en > o.actualizado_en then o.id else a.id end as id_pierde
from public.sgo_indicadores a
join public.sgo_indicadores o
  on o.area_id = 'logistica_operativa'
 and o.pilar = a.pilar
 and lower(o.nombre) = lower(a.nombre)
where a.area_id = 'logistica_administrativa';

-- 3.b) Rescatar las mediciones de períodos que el ganador no tiene.
update public.sgo_indicador_mediciones m
set indicador_id = d.id_gana
from _log_dup d
where m.indicador_id = d.id_pierde
  and not exists (
    select 1 from public.sgo_indicador_mediciones m2
    where m2.indicador_id = d.id_gana and m2.periodo = m.periodo
  );

-- 3.c) Borrar el perdedor (sus mediciones restantes se van en cascada).
delete from public.sgo_indicadores i
using _log_dup d
where i.id = d.id_pierde;

-- 3.d) Ahora sí, mover lo que quedó en el área vieja.
update public.sgo_indicadores
set area_id = 'logistica_operativa'
where area_id = 'logistica_administrativa';

-- ============================================================
-- PASO 4 — Controles programados, si guardan área
-- ============================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sgo_controles_programados'
      and column_name = 'area_id'
  ) then
    update public.sgo_controles_programados
    set area_id = 'logistica_operativa'
    where area_id = 'logistica_administrativa';
  end if;
end $$;

-- ============================================================
-- PASO 5 — Recrear los CHECK ya sin el área retirada
-- ============================================================
alter table public.sgo_eventos
  add constraint sgo_eventos_area_id_check check (area_id is null or area_id in (
    'bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural',
    'herreria_pintura','laminado','administracion','logistica_operativa',
    'mantenimiento','automatismo','it','planificacion_produccion','laboratorio',
    'gerencia_directorio','diseno'
  )) not valid;
alter table public.sgo_eventos validate constraint sgo_eventos_area_id_check;

alter table public.sgo_indicadores
  add constraint sgo_indicadores_area_id_check check (area_id in (
    'bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural',
    'herreria_pintura','laminado','administracion','logistica_operativa',
    'mantenimiento','automatismo','it','planificacion_produccion','laboratorio',
    'gerencia_directorio','diseno'
  )) not valid;
alter table public.sgo_indicadores validate constraint sgo_indicadores_area_id_check;

-- ============================================================
-- CONTROL — que no quede nada con el área vieja
-- ============================================================
select 'eventos'          as tabla, count(*) as con_area_vieja from public.sgo_eventos      where area_id = 'logistica_administrativa'
union all
select 'eventos (origen)', count(*) from public.sgo_eventos      where area_origen_id = 'logistica_administrativa'
union all
select 'indicadores',      count(*) from public.sgo_indicadores  where area_id = 'logistica_administrativa';
