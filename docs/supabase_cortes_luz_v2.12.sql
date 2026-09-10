-- ============================================================
-- v2.12 — CORTES DE LUZ
--
-- Las tablets estan enchufadas a 220 V: cuando se corta la luz se apagan, justo
-- cuando el operario tendria que registrar la parada. El planificador carga el
-- corte cuando vuelve la luz y el sistema le suma esa parada a toda tarea cuyo
-- trabajo lo haya cruzado.
--
-- IMPORTANTE: las paradas NO se guardan. Se derivan de estas filas cada vez que
-- se calcula (ver src/lib/cortesLuz.ts). Por eso NO hay que tocar la tabla
-- `paradas` ni migrar nada: corregir la hora de un corte o borrarlo recalcula
-- todo solo.
--
-- Correr entero. Es idempotente.
-- ============================================================

create table if not exists public.cortes_luz (
  id             text primary key,
  desde          timestamptz not null,
  hasta          timestamptz not null,
  -- Sectores afectados. ARRAY VACIO = toda la planta (a veces el corte es
  -- parcial y baja solo una fase).
  sectores       text[] not null default '{}',
  nota           text,
  cargado_por    text not null,
  actualizado_en timestamptz not null default now(),

  -- Un corte que "vuelve" antes de empezar es un error de carga, no un dato.
  constraint cortes_luz_rango_valido check (hasta > desde)
);

-- La consulta habitual es "cortes de este mes" y el listado ordena por fecha.
create index if not exists cortes_luz_desde_idx on public.cortes_luz (desde desc);

-- ------------------------------------------------------------
-- RLS: misma politica que el resto de las tablas operativas.
-- ------------------------------------------------------------
alter table public.cortes_luz enable row level security;

drop policy if exists cortes_luz_select on public.cortes_luz;
create policy cortes_luz_select on public.cortes_luz
  for select to authenticated using (true);

drop policy if exists cortes_luz_write on public.cortes_luz;
create policy cortes_luz_write on public.cortes_luz
  for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- REALTIME: sin esto, un corte cargado desde la PC de planificacion no
-- recalcula los tiempos en las tablets hasta que recarguen la pagina.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cortes_luz'
  ) then
    alter publication supabase_realtime add table public.cortes_luz;
  end if;
end $$;

-- ------------------------------------------------------------
-- VERIFICACION
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'cortes_luz')      as tabla_creada,
  (select count(*) from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'cortes_luz') as en_realtime,
  (select count(*) from public.cortes_luz)                             as cortes_cargados;
