-- ============================================================
-- v1.39 — Tareas recurrentes / repetitivas (pañol / logística)
--
-- MODELO: separamos la DEFINICIÓN (plantilla) de las tareas GENERADAS.
--   - plantillas_recurrentes: la rutina (qué tarea, para quién, qué días). La
--     administra Giuliano (o Melany para despacho). NO es una tarea en sí.
--   - tareas_logistica: cada instancia diaria es una tarea normal, ligada a su
--     plantilla por plantilla_id + fecha_instancia. El id de la instancia es
--     determinístico ("<plantilla_id>_<YYYY-MM-DD>") para deduplicar entre tablets.
--
-- ANTI-SPAM: el front solo crea la instancia del DÍA ACTUAL y una a la vez (la
--   siguiente recién cuando la anterior se finalizó). No se acumulan a futuro.
--   'salteos' permite excluir fechas puntuales (feriados) sin borrar la rutina.
--
-- Idempotente.
-- ============================================================

-- 1) Nuevas columnas en las tareas para ligarlas a su plantilla.
alter table tareas_logistica add column if not exists plantilla_id   text;
alter table tareas_logistica add column if not exists fecha_instancia text;  -- 'YYYY-MM-DD'
create index if not exists idx_tlog_plantilla on tareas_logistica (plantilla_id);

-- 2) Tabla de plantillas.
create table if not exists plantillas_recurrentes (
  id            text primary key,
  origen        text,                       -- 'logistica' | 'despacho'
  titulo        text not null,
  detalle       text,
  responsables  text[],                     -- colaboradores asignados (vacío = sin asignar)
  prioridad     text not null,              -- alta | media | baja
  estimado_min  integer,
  dias          integer[] not null default '{}', -- getDay(): 1=Lun..5=Vie, 6=Sáb, 0=Dom
  hora          text,                       -- 'HH:MM' informativa
  activa        boolean not null default true,
  salteos       text[],                     -- fechas 'YYYY-MM-DD' a NO generar (feriados)
  creada_en     timestamptz not null default now(),
  creada_por    text
);
create index if not exists idx_plantillas_origen on plantillas_recurrentes (origen);

-- 3) RLS (mismo patrón que el resto de las tablas: authenticated lee y escribe).
alter table plantillas_recurrentes enable row level security;
drop policy if exists plantillas_select on plantillas_recurrentes;
create policy plantillas_select on plantillas_recurrentes for select using (auth.role() = 'authenticated');
drop policy if exists plantillas_write on plantillas_recurrentes;
create policy plantillas_write on plantillas_recurrentes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 4) Realtime.
alter publication supabase_realtime add table plantillas_recurrentes;
