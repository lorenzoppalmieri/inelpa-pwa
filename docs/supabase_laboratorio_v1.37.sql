-- ============================================================
-- v1.37 — Laboratorio: cola de ensayos (puente Montaje PO -> Despacho)
--
-- Al finalizar una tarea de Montaje PO se crea una fila 'pendiente'. El
-- laboratorista corre los ensayos y al finalizar el front rutea: aprobado ->
-- crea el despacho; con algún rechazo -> retrabajo (lo ve el planificador).
--
-- Incluye el usuario 'laboratorio'. Idempotente.
-- ============================================================

create table if not exists laboratorio (
  id                text primary key,
  modelo            text not null,
  cliente           text,
  nro_serie         text,
  ot                text,
  linea             text,
  orden_id          text,
  tarea_origen_id   text,
  estado            text not null,          -- pendiente | en_ensayo | finalizada
  ensayos           jsonb,                  -- { key: 'sin'|'aprobado'|'rechazado' }
  comentario        text,
  resultado         text,                   -- aprobado | retrabajo
  retrabajo_resuelto boolean,
  creada_en         timestamptz not null default now(),
  creada_por        text,
  finalizada_en     timestamptz,
  finalizada_por    text
);
create index if not exists idx_lab_estado on laboratorio (estado);
create index if not exists idx_lab_origen on laboratorio (tarea_origen_id);

alter table laboratorio enable row level security;
drop policy if exists lab_select on laboratorio;
create policy lab_select on laboratorio for select using (auth.role() = 'authenticated');
drop policy if exists lab_write on laboratorio;
create policy lab_write on laboratorio for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table laboratorio;

-- ⚠ IMPORTANTE: el rol es un ENUM (rol_usuario). Hay que agregar 'laboratorio'
--   ANTES de insertar el usuario, y en un RUN SEPARADO (Postgres no deja usar un
--   valor de enum recién agregado en la misma transacción). Pasos:
--   1) Correr SOLO esta línea:
--        alter type rol_usuario add value if not exists 'laboratorio';
--   2) Después (otra ejecución) correr el insert de abajo.
alter type rol_usuario add value if not exists 'laboratorio';

-- Usuario del laboratorista (rol 'laboratorio'). Después: crear su cuenta de login
--   con scripts/crear_cuentas_auth.mjs (crea laboratorio@inelpa.local) + vincular auth_id.
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Laboratorio', 'laboratorio', 'laboratorio', null, true)
on conflict (usuario) do nothing;
