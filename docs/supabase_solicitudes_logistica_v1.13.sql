-- ============================================================
-- SOLICITUDES LOGISTICAS v1.13 — cola de pedidos de material.
-- Correr en Supabase -> SQL Editor. Idempotente.
--
-- 1 solicitud por PARADA de material (id = parada.id). Es la capa logistica
-- (asignado + estado de entrega) sobre la parada productiva. No toca 'tareas'.
--   estado: pendiente (rojo) -> en_camino (amarillo) -> entregado (verde)
-- ============================================================

create table if not exists solicitudes_logistica (
  id             uuid primary key,                 -- = parada.id (1:1)
  parada_id      uuid not null references paradas(id) on delete cascade,
  tarea_id       uuid not null references tareas(id) on delete cascade,
  asignado       text,                             -- responsable del equipo de logistica
  estado         text not null default 'pendiente'
                   check (estado in ('pendiente','en_camino','entregado')),
  creada_en      timestamptz not null,             -- = parada.inicio (cuando se pidio)
  tomada_en      timestamptz,                      -- paso a en_camino
  entregada_en   timestamptz,                      -- paso a entregado
  actualizado_en timestamptz default now()
);
create index if not exists idx_sollog_estado on solicitudes_logistica(estado);
create index if not exists idx_sollog_tarea  on solicitudes_logistica(tarea_id);

-- Realtime (badge del operario + cola en vivo).
alter table solicitudes_logistica replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'solicitudes_logistica'
  ) then
    alter publication supabase_realtime add table solicitudes_logistica;
  end if;
end $$;

-- RLS: todos los autenticados LEEN (el operario necesita ver el badge);
--      escriben logistica y planificador.
alter table solicitudes_logistica enable row level security;
drop policy if exists sel_sollog on solicitudes_logistica;
drop policy if exists wr_sollog  on solicitudes_logistica;

create policy sel_sollog on solicitudes_logistica for select to authenticated using (true);
create policy wr_sollog  on solicitudes_logistica for all to authenticated
  using (app_rol() in ('logistica','planificador'))
  with check (app_rol() in ('logistica','planificador'));

-- Verificacion
-- select * from solicitudes_logistica order by creada_en desc;
