-- ============================================================
-- v1.27 — Despacho y embalaje (sector Melany) · Fase 1
--
-- Seguimiento de cada transformador desde el ingreso a stock hasta la entrega:
-- estados, tiempos de embalaje, checklist de liberación (bloquea el despacho),
-- demoras con causa y datos de transporte (incluye redespacho).
--
-- Idempotente.
-- ============================================================

create table if not exists despachos (
  id             text primary key,
  -- datos generales
  ot             text not null,
  cliente        text not null,
  nro_serie      text not null,
  potencia       text,
  tipo           text,
  linea          text not null,              -- 'distribucion' | 'rural'
  fecha_ingreso  timestamptz not null,
  -- estado
  estado         text not null,              -- esperando_embalaje|embalando|demorado|embalado|despachado|entregado
  -- embalaje
  operario       text,
  embalaje_inicio timestamptz,
  embalaje_fin   timestamptz,
  tipo_embalaje  text,
  observaciones  text,
  demora_en_curso timestamptz,
  minutos_demora integer,
  demoras        jsonb,                       -- [{ causa, inicio, fin }]
  -- checklist de liberación
  checklist      jsonb,                       -- { pintura, limpieza, placa, accesorios, manual, fechas, etiquetas, fotos }
  -- despacho
  fecha_despacho timestamptz,
  transportista  text,
  patente        text,
  remito         text,
  destino        text,
  redespacho     boolean,
  transportista2 text,
  patente2       text,
  -- meta
  creada_en      timestamptz not null default now(),
  creada_por     text,
  entregada_en   timestamptz
);

create index if not exists idx_despacho_estado on despachos (estado);
create index if not exists idx_despacho_serie  on despachos (nro_serie);

-- ---------- RLS ----------
alter table despachos enable row level security;
drop policy if exists despacho_select on despachos;
create policy despacho_select on despachos for select using (auth.role() = 'authenticated');
drop policy if exists despacho_write on despachos;
create policy despacho_write on despachos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------- Realtime ----------
alter publication supabase_realtime add table despachos;
