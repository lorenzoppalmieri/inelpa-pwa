-- ============================================================
-- TAREAS LOGISTICAS v1.12 — organizador de pedidos de abastecimiento.
-- Correr en Supabase -> SQL Editor. Idempotente.
--
-- Giuliano (logistica) crea y asigna; el equipo (logistica) marca finalizada.
-- El tiempo de resolucion = finalizada_en - creada_en se calcula en la app.
-- ============================================================

create table if not exists tareas_logistica (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  detalle        text,
  responsable    text not null,          -- nombre del equipo (Guillermo, Maximiliano, ...)
  prioridad      text not null default 'media' check (prioridad in ('alta','media','baja')),
  estado         text not null default 'pendiente' check (estado in ('pendiente','finalizada')),
  creada_en      timestamptz not null default now(),   -- cuando Giuliano dio la orden
  creada_por     text,
  finalizada_en  timestamptz,
  finalizada_por text
);
create index if not exists idx_tlog_estado on tareas_logistica(estado);

-- Realtime: cambios al instante en las tablets.
alter table tareas_logistica replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tareas_logistica'
  ) then
    alter publication supabase_realtime add table tareas_logistica;
  end if;
end $$;

-- RLS: logistica y planificador pueden ver y operar; el resto no.
alter table tareas_logistica enable row level security;
drop policy if exists sel_tlog on tareas_logistica;
drop policy if exists wr_tlog  on tareas_logistica;

create policy sel_tlog on tareas_logistica for select to authenticated
  using (app_rol() in ('logistica','planificador'));
create policy wr_tlog on tareas_logistica for all to authenticated
  using (app_rol() in ('logistica','planificador'))
  with check (app_rol() in ('logistica','planificador'));

-- Verificacion
-- select * from tareas_logistica order by creada_en desc;
