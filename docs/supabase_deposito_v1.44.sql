-- ============================================================
-- v1.44 — Guardado en depósito + stock por ubicación (Despacho / Melany)
--
-- Un trafo embalado no siempre sale directo al cliente: puede quedar guardado
-- en un depósito por tiempo indefinido y recién después despacharse. El estado
-- 'en_deposito' modela esa etapa sin perder el cliente asignado.
--
-- Flujo completo:
--   esperando_embalaje -> embalando (<-> demorado) -> embalado
--        -> despachado -> entregado                    (sale directo)
--        -> en_deposito -> despachado -> entregado     (pasa por depósito)
--
-- Depósitos: 'Lorenzatti', 'Cerdán', '25 de Mayo'. Lo que sigue en planta queda
-- como 'embalado' sin depósito y el KPI lo cuenta como "INELPA (planta)".
--
-- OJO: la columna `ubicacion_deposito` que ya existía (v1.33) es OTRA cosa —
-- es dónde se HIZO el embalaje. No se toca.
--
-- Idempotente: se puede correr más de una vez.
-- ============================================================

-- 1) Columnas del guardado en depósito -------------------------------------
alter table public.despachos
  add column if not exists deposito       text,
  add column if not exists fecha_deposito timestamptz,
  add column if not exists movimientos    jsonb;

comment on column public.despachos.deposito is
  'Depósito donde está guardado hoy el trafo embalado (Lorenzatti / Cerdán / 25 de Mayo). NULL = sigue en planta.';
comment on column public.despachos.fecha_deposito is
  'Ingreso al depósito actual. Alimenta la antigüedad del stock guardado.';
comment on column public.despachos.movimientos is
  'Historial de traslados: [{ deposito, desde, fecha, usuario, nota }].';

-- 2) Índice para el KPI de stock por depósito ------------------------------
-- Solo indexa lo que todavía no se despachó, que es lo único que se consulta.
create index if not exists idx_despacho_deposito
  on public.despachos (deposito)
  where estado in ('embalado', 'en_deposito');

-- Índice de la comparativa de entregas por mes / año.
create index if not exists idx_despacho_entregada
  on public.despachos (entregada_en)
  where estado = 'entregado';

-- 3) Chequeo del estado (si existe una constraint vieja, se reemplaza) ------
-- Si el estado se validaba con un CHECK, hay que sumarle 'en_deposito' o los
-- upserts fallan. Si nunca hubo constraint, este bloque no hace nada.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.despachos'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%estado%'
  loop
    execute format('alter table public.despachos drop constraint %I', c.conname);
  end loop;

  alter table public.despachos
    add constraint despachos_estado_check
    check (estado in ('esperando_embalaje','embalando','demorado','embalado','en_deposito','despachado','entregado'));
end $$;

-- Control: stock guardado por depósito.
-- select coalesce(deposito, 'INELPA (planta)') as ubicacion, count(*)
-- from public.despachos
-- where estado in ('embalado', 'en_deposito')
-- group by 1
-- order by 2 desc;

-- Control: entregas del mes vs mes anterior vs año.
-- select
--   count(*) filter (where entregada_en >= date_trunc('month', now()))                          as mes_actual,
--   count(*) filter (where entregada_en >= date_trunc('month', now()) - interval '1 month'
--                      and entregada_en <  date_trunc('month', now()))                          as mes_anterior,
--   count(*) filter (where entregada_en >= date_trunc('year', now()))                           as anual
-- from public.despachos
-- where estado = 'entregado';
