-- ============================================================
-- v1.24 — Tiempos estándar dinámicos (asistente de mejora continua)
--
-- Repositorio de tiempos ESTIMADOS que se afinan con la mediana de los tiempos
-- reales. Lógica de negocio BIFURCADA:
--   * Bobinado: el estándar depende de MODELO + MÁQUINA  -> maquina_id con valor.
--   * Montaje (y sectores manuales): depende SOLO del MODELO -> maquina_id NULL.
--
-- El id es la clave de agrupamiento determinística que arma el front
-- (claveEstandar): `bobinado||<modelo>||<maquina_id>`  ó  `<area>||<modelo>`.
--
-- Idempotente.
-- ============================================================

create table if not exists tiempos_estandar (
  id             text primary key,          -- clave de agrupamiento (PK)
  area           text not null,             -- 'bobinado' | 'montaje' | 'herreria' | ...
  modelo         text not null,             -- modelo del transformador / bobina
  maquina_id     text,                      -- NULL en montaje y sectores manuales
  minutos        integer not null,          -- tiempo estándar vigente (min)
  actualizado_en timestamptz default now()
);

create index if not exists idx_estandar_modelo  on tiempos_estandar (modelo);
create index if not exists idx_estandar_maquina on tiempos_estandar (maquina_id);

-- ---------- RLS ----------
-- Lectura: cualquier usuario autenticado. Escritura: perfiles de planificación.
-- (Ajustá los nombres de rol a los que ya usás en las políticas de `objetivos`).
alter table tiempos_estandar enable row level security;

drop policy if exists estandar_select on tiempos_estandar;
create policy estandar_select on tiempos_estandar
  for select using (auth.role() = 'authenticated');

drop policy if exists estandar_write on tiempos_estandar;
create policy estandar_write on tiempos_estandar
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ---------- Realtime ----------
alter publication supabase_realtime add table tiempos_estandar;
