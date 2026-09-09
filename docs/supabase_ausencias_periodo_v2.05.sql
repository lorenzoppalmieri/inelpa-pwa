-- ============================================================
-- v2.05 — AUSENCIAS POR RANGO (vacaciones, licencia medica, maternidad)
--
-- Una licencia puede ser de 1 dia o de varios meses. Se sigue guardando UNA FILA
-- POR DIA HABIL —el motor de calendario razona por dia, y guardar el rango
-- obligaria a expandirlo en cada calculo de cada tarea— pero ahora los dias de
-- una misma licencia comparten `periodo_id` para poder mostrarlos y borrarlos
-- juntos.
--
-- Correr DESPUES de supabase_ausencias_v2.04.sql. Es aditivo e idempotente.
-- ============================================================

alter table public.ausencias
  add column if not exists periodo_id text;

-- "Todos los dias de esta licencia" es la consulta de borrado del panel.
create index if not exists ausencias_periodo_idx
  on public.ausencias (periodo_id);

-- ------------------------------------------------------------
-- VERIFICACION — columna creada e indice presente.
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'ausencias'
       and column_name = 'periodo_id')                                as columna_creada,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'ausencias_periodo_idx') as indice_creado,
  (select count(*) from public.ausencias)                             as ausencias_cargadas,
  (select count(distinct periodo_id) from public.ausencias
     where periodo_id is not null)                                    as periodos_cargados;
