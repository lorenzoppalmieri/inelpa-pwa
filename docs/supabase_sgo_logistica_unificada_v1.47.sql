-- ============================================================
-- v1.47 — SGO: se unifica el área de Logística
--
-- El organigrama cambió: desaparece "Logística Administrativa" y "Logística
-- Operativa" pasa a llamarse simplemente "LOGÍSTICA". Giuliano queda a cargo de
-- todo el frente.
--
-- Criterio: se CONSERVA el id 'logistica_operativa' (solo cambia la etiqueta en
-- la app) y se remapea a él todo lo que estaba cargado como
-- 'logistica_administrativa'. Así ningún expediente, KPI ni indicador pierde su
-- área ni queda como "Sin área" en la matriz.
--
-- Idempotente: se puede correr más de una vez.
-- ============================================================

-- 1) Eventos / expedientes -------------------------------------------------
-- Primero se afloja el CHECK, si no el update se rechaza a sí mismo.
alter table public.sgo_eventos drop constraint if exists sgo_eventos_area_id_check;

update public.sgo_eventos
set area_id = 'logistica_operativa'
where area_id = 'logistica_administrativa';

update public.sgo_eventos
set area_origen_id = 'logistica_operativa'
where area_origen_id = 'logistica_administrativa';

-- CHECK nuevo, ya sin el área retirada.
alter table public.sgo_eventos add constraint sgo_eventos_area_id_check check (area_id is null or area_id in (
  'bobinado_rural',
  'bobinado_distribucion',
  'montaje_distribucion',
  'montaje_rural',
  'herreria_pintura',
  'laminado',
  'administracion',
  'logistica_operativa',
  'mantenimiento',
  'automatismo',
  'it',
  'planificacion_produccion',
  'laboratorio',
  'gerencia_directorio',
  'diseno'
)) not valid;

alter table public.sgo_eventos validate constraint sgo_eventos_area_id_check;

-- 2) Indicadores / KPIs ----------------------------------------------------
-- Ojo: si un área tenía el MISMO indicador en las dos logísticas, al unificar
-- quedan dos filas iguales. Se conserva la más actualizada y se borra la otra.
update public.sgo_indicadores
set area_id = 'logistica_operativa'
where area_id = 'logistica_administrativa';

with duplicados as (
  select id,
         row_number() over (
           partition by area_id, pilar, nombre, periodo
           order by actualizado_en desc
         ) as rn
  from public.sgo_indicadores
  where area_id = 'logistica_operativa'
)
delete from public.sgo_indicadores i
using duplicados d
where i.id = d.id and d.rn > 1;

-- 3) Controles programados, si guardan área ---------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sgo_controles_programados' and column_name = 'area_id'
  ) then
    update public.sgo_controles_programados
    set area_id = 'logistica_operativa'
    where area_id = 'logistica_administrativa';
  end if;
end $$;

-- Control: que no quede nada con el área vieja.
-- select 'eventos' as tabla, count(*) from public.sgo_eventos where area_id = 'logistica_administrativa'
-- union all
-- select 'indicadores', count(*) from public.sgo_indicadores where area_id = 'logistica_administrativa';

-- Control: cómo queda la fila de Logística en la matriz.
-- select area_id, pilar, count(*)
-- from public.sgo_indicadores
-- where area_id = 'logistica_operativa'
-- group by 1, 2
-- order by 2;
