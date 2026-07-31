-- ============================================================
-- v1.64 - MANTENIMIENTO · KPIs SOBRE HISTORIAL REAL + GENERADOR DE OT
-- Las vistas mant_v_* de v1.62 calculaban sobre OT cerradas (hoy 0).
-- Estas vistas calculan sobre mant_registros (3 años ya migrados), asi
-- que dan numeros desde el dia 1: MTBF, ranking de fallas, tendencia.
-- Correr DESPUES de v1.62 + v1.63 + gamas v1.64. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. KPI por activo (confiabilidad desde el historial)
--    MTBF (dias) = dias entre la primera y la ultima correctiva / (correctivas - 1)
-- ------------------------------------------------------------
create or replace view public.mant_v_kpi_activo as
with base as (
  select
    activo_id,
    count(*) filter (where tipo = 'correctivo')                       as correctivos,
    count(*) filter (where tipo = 'preventivo')                       as preventivos,
    count(*)                                                          as intervenciones,
    min(fecha)                                                        as primera,
    max(fecha)                                                        as ultima,
    max(fecha) filter (where tipo = 'correctivo')                    as ultima_correctiva,
    round(coalesce(sum(horas), 0)::numeric, 1)                       as horas_total
  from public.mant_registros
  where activo_id is not null
  group by activo_id
)
select
  b.*,
  case
    when b.correctivos > 1 then
      round((extract(epoch from (b.ultima - b.primera)) / 86400.0)::numeric
            / nullif(b.correctivos - 1, 0), 0)
  end as mtbf_dias,
  (current_date - b.ultima_correctiva::date) as dias_desde_ultima_correctiva
from base b;

-- ------------------------------------------------------------
-- 2. Ranking de fallas (activos que mas correctivo consumen)
-- ------------------------------------------------------------
create or replace view public.mant_v_ranking_fallas as
select
  k.activo_id,
  a.nombre,
  a.planta_id,
  s.nombre       as sector,
  a.criticidad,
  k.correctivos,
  k.preventivos,
  k.horas_total,
  k.mtbf_dias,
  k.ultima_correctiva
from public.mant_v_kpi_activo k
join public.mant_activos  a on a.id = k.activo_id
left join public.mant_sectores s on s.id = a.sector_id
order by k.correctivos desc, k.horas_total desc;

-- ------------------------------------------------------------
-- 3. Tendencia mensual (correctivo vs preventivo)
-- ------------------------------------------------------------
create or replace view public.mant_v_kpi_mensual as
select
  date_trunc('month', fecha)::date              as mes,
  count(*) filter (where tipo = 'correctivo')   as correctivos,
  count(*) filter (where tipo = 'preventivo')   as preventivos,
  round(coalesce(sum(horas), 0)::numeric, 1)    as horas
from public.mant_registros
group by 1
order by 1;

-- ------------------------------------------------------------
-- 4. Resumen global (una fila, para las tarjetas del panel)
-- ------------------------------------------------------------
create or replace view public.mant_v_resumen as
select
  (select count(*) from public.mant_activos where activo)                          as activos,
  (select count(*) from public.mant_activos where activo and criticidad = 'A')     as activos_criticos,
  (select count(*) from public.mant_registros where tipo = 'correctivo')           as correctivos_hist,
  (select count(*) from public.mant_registros where tipo = 'preventivo')           as preventivos_hist,
  (select round(coalesce(sum(horas),0)::numeric,0) from public.mant_registros)     as horas_hist,
  (select count(*) from public.mant_avisos where estado = 'nuevo')                 as avisos_abiertos,
  (select count(*) from public.mant_ordenes_trabajo
     where estado in ('creada','planificada','en_ejecucion','en_espera'))          as ot_abiertas,
  (select count(*) from public.mant_gamas where activa)                            as gamas_activas;

-- ============================================================
-- GENERADOR DE OT PREVENTIVAS (Pilar 3 -> Pilar 4)
-- Crea una OT 'creada' por cada gama activa con activo_id que NO tenga
-- ya una OT preventiva abierta para ese activo+gama. La fecha objetivo
-- se calcula desde la frecuencia. Idempotente: no duplica mientras la
-- OT anterior siga abierta. Devuelve cuantas creo.
-- Se llama desde la app (RPC) con el boton "Generar OT preventivas".
-- ============================================================
create or replace function public.mant_generar_ot_preventivas()
returns integer
language plpgsql
security invoker            -- respeta la RLS: solo equipo de mantenimiento puede insertar OT
set search_path = public as $$
declare
  v_creadas integer := 0;
  g record;
  v_dias integer;
begin
  for g in
    select * from public.mant_gamas
    where activa and activo_id is not null
  loop
    -- ya hay una OT preventiva abierta para este activo+gama? -> saltar
    if exists (
      select 1 from public.mant_ordenes_trabajo
      where activo_id = g.activo_id and gama_id = g.id
        and estado in ('creada','planificada','en_ejecucion','en_espera')
    ) then
      continue;
    end if;

    v_dias := case g.frecuencia
      when 'diaria' then 1 when 'semanal' then 7 when 'quincenal' then 14
      when 'mensual' then 30 when 'trimestral' then 90 when 'semestral' then 180
      when 'anual' then 365 else 30 end;

    insert into public.mant_ordenes_trabajo
      (tipo, estado, prioridad, activo_id, origen, gama_id, descripcion,
       fecha_objetivo, creado_por)
    values
      ('preventiva', 'creada', 'media', g.activo_id, 'automatica', g.id, g.tarea,
       current_date + (v_dias || ' days')::interval, 'sistema');

    v_creadas := v_creadas + 1;
  end loop;
  return v_creadas;
end $$;

-- Verificacion:
-- select * from mant_v_resumen;
-- select * from mant_v_ranking_fallas limit 15;
-- select mant_generar_ot_preventivas();   -- crea las OT preventivas pendientes
