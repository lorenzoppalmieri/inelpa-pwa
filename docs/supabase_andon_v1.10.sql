-- ============================================================
-- ANDON v1.10 — Objetivos mensuales de produccion por area (premios)
-- Correr en Supabase -> SQL Editor. Idempotente.
--
-- El planificador carga la cantidad objetivo por area cada mes; el tablero ANDON
-- (visible para todos) compara lo terminado vs el objetivo y muestra el tramo de
-- premio. Premio POR EQUIPO/AREA, no individual.
-- ============================================================

create table if not exists objetivos (
  id            text primary key,          -- `${periodo}_${area}` (ej '2026-06_montaje_dist')
  periodo       text not null,             -- 'YYYY-MM'
  area          text not null,             -- montaje_dist | montaje_rural | bob_* | herreria_*
  cantidad      int  not null default 0,
  actualizado_en timestamptz default now()
);
create index if not exists idx_objetivos_periodo on objetivos(periodo);

-- Realtime: que los cambios de objetivos lleguen a las tablets al instante.
alter table objetivos replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'objetivos'
  ) then
    alter publication supabase_realtime add table objetivos;
  end if;
end $$;

-- RLS: todos los autenticados LEEN; solo el planificador ESCRIBE.
alter table objetivos enable row level security;
drop policy if exists sel_objetivos on objetivos;
drop policy if exists wr_objetivos  on objetivos;

create policy sel_objetivos on objetivos for select to authenticated using (true);
create policy wr_objetivos  on objetivos for all to authenticated
  using (app_rol() = 'planificador')
  with check (app_rol() = 'planificador');

-- Verificacion
-- select * from objetivos order by periodo desc, area;
