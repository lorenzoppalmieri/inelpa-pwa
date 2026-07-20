-- ============================================================
-- v1.28 — Despacho Fase 3: fletes / viajes internos (costos)
--
-- Registro de traslados internos (a depósito, reacomodo con grúa, etc.) con su
-- costo. Base de la estadística de gastos de flete (relevamiento, prioridad 2).
-- Las ALERTAS de la Fase 3 se calculan en el front sobre la tabla 'despachos'
-- (no necesitan tabla propia).
--
-- Idempotente.
-- ============================================================

create table if not exists fletes_internos (
  id            text primary key,
  fecha         timestamptz not null,       -- día del flete
  concepto      text not null,
  costo         numeric not null default 0, -- ARS
  transportista text,
  observaciones text,
  creada_en     timestamptz not null default now(),
  creada_por    text
);

create index if not exists idx_flete_fecha on fletes_internos (fecha);

alter table fletes_internos enable row level security;
drop policy if exists flete_select on fletes_internos;
create policy flete_select on fletes_internos for select using (auth.role() = 'authenticated');
drop policy if exists flete_write on fletes_internos;
create policy flete_write on fletes_internos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table fletes_internos;
