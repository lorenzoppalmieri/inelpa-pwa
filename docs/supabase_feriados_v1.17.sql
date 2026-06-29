-- ============================================================
-- INELPA PWA — v1.17: FERIADOS / dias no laborables de planta
--
-- Tabla que el planificador administra desde Planificacion -> Feriados. El motor
-- de calendario de la app trata estas fechas como dia cerrado (toda la planta):
-- no se agendan tareas, el Gantt no las dibuja y no cuentan para los KPIs.
--
-- Correr en Supabase: SQL Editor -> pegar TODO -> Run. Re-ejecutable.
-- Requisito: app_rol() ya existe (creada en supabase_realtime_rls.sql).
-- ============================================================

-- 1) Tabla. id = fecha 'YYYY-MM-DD' (un feriado por dia).
create table if not exists feriados (
  id             text primary key,
  fecha          date not null,
  descripcion    text,
  actualizado_en timestamptz not null default now()
);

-- 2) RLS: lectura para todos los logueados; alta/baja solo planificador.
alter table feriados enable row level security;
drop policy if exists sel_feriados on feriados;
drop policy if exists wr_feriados  on feriados;
create policy sel_feriados on feriados for select to authenticated using (true);
create policy wr_feriados  on feriados for all    to authenticated
  using (app_rol() = 'planificador') with check (app_rol() = 'planificador');

-- 3) Realtime: que los cambios de feriados lleguen en vivo a todas las tablets.
alter table feriados replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feriados'
  ) then
    execute 'alter publication supabase_realtime add table public.feriados';
  end if;
end $$;

-- Verificacion (opcional):
--   select * from feriados order by fecha;
