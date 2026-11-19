-- ============================================================
-- v2.58 — PREPARACIÓN Y ENTREGA DE MATERIALES POR TAREA
--
-- La pestaña "Materiales por estación" de Logística mostraba TODO lo que había
-- que preparar, sin forma de marcar el avance. Ahora cada tarea pasa por:
--
--   (sin fila)        Por preparar
--   en_preparacion    Logística tocó "Preparar"  (quién y cuándo)
--   entregado         Logística tocó "Entregado" (quién y cuándo) -> sale de la lista
--
-- UNA fila por tarea: `id` ES el id de la tarea. Tocar dos veces el mismo botón
-- (o que la cola offline reintente) no duplica nada. "Deshacer" desde
-- en_preparacion borra la fila (vuelve a Por preparar).
--
-- `unidades_entregadas`: cuántas unidades de la tarea cubría la entrega. Si
-- después la planificadora sube la cantidad de la tarea (10 -> 15), la tarea
-- vuelve a "Por preparar" como COMPLEMENTO, solo por las 5 que faltan.
--
-- ALCANCE: es el registro OPERATIVO de la entrega física en planta. El
-- movimiento de stock sigue siendo la transferencia de SAP sobre la OF.
--
-- Idempotente: se puede correr dos veces.
-- ORDEN: correr ANTES de publicar el código v2.58 (INELPA-TEST -> staging;
-- después producción -> main).
-- ============================================================

create table if not exists preparaciones_material (
  id                  uuid primary key references tareas(id) on delete cascade,   -- = tarea.id (1:1)
  estado              text not null check (estado in ('en_preparacion', 'entregado')),
  responsable         text,                 -- quién del equipo de logística la prepara/entrega
  registrado_por      text,                 -- usuario que tocó el botón (trazabilidad)
  preparando_en       timestamptz,          -- tocó "Preparar"
  entregado_en        timestamptz,          -- tocó "Entregado"
  unidades_entregadas numeric(12,3) check (unidades_entregadas is null or unidades_entregadas > 0),
  actualizado_en      timestamptz not null default now()
);
create index if not exists idx_prepmat_estado   on preparaciones_material (estado);
create index if not exists idx_prepmat_entregado on preparaciones_material (entregado_en);

-- Realtime: el tablero de logística y el aviso en la tablet del operario se
-- actualizan solos en todos los equipos.
alter table preparaciones_material replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'preparaciones_material'
  ) then
    alter publication supabase_realtime add table preparaciones_material;
  end if;
end $$;

-- RLS: todos los autenticados LEEN (el operario ve si su material viene en
-- camino); escriben logística y planificación. Mismo criterio que
-- solicitudes_logistica (v1.13).
alter table preparaciones_material enable row level security;
drop policy if exists sel_prepmat on preparaciones_material;
drop policy if exists wr_prepmat  on preparaciones_material;
create policy sel_prepmat on preparaciones_material for select to authenticated using (true);
create policy wr_prepmat  on preparaciones_material for all to authenticated
  using (app_rol() in ('logistica', 'planificador'))
  with check (app_rol() in ('logistica', 'planificador'));

revoke all on preparaciones_material from anon;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- select estado, count(*) from preparaciones_material group by estado;
-- select tablename from pg_publication_tables
--   where pubname = 'supabase_realtime' and tablename = 'preparaciones_material';  -- 1 fila
