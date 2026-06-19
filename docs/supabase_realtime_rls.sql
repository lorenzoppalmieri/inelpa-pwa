-- ============================================================
-- INELPA PWA — PASO 3: Activar Realtime + Row Level Security (RLS)
-- Correr en Supabase: panel -> SQL Editor -> New query -> pegar TODO -> Run.
-- Requisito previo: haber corrido docs/supabase_schema.sql (tablas creadas).
-- Este script es re-ejecutable (usa "drop ... if exists" y "create or replace").
-- ============================================================

-- ------------------------------------------------------------
-- 0) FUNCIONES AYUDANTES (SECURITY DEFINER)
--    Resuelven quien es el usuario logueado SIN disparar RLS sobre
--    'usuarios' (evita recursion). Se usan dentro de las politicas.
-- ------------------------------------------------------------
create or replace function app_uid() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from usuarios where auth_id = auth.uid()
$$;

create or replace function app_rol() returns text
  language sql stable security definer set search_path = public as $$
  select rol::text from usuarios where auth_id = auth.uid()
$$;

create or replace function app_sectores() returns setof text
  language sql stable security definer set search_path = public as $$
  select us.sector_id
  from usuario_sectores us
  join usuarios u on u.id = us.usuario_id
  where u.auth_id = auth.uid()
$$;

-- ------------------------------------------------------------
-- 1) REALTIME
--    a) REPLICA IDENTITY FULL: para que los eventos UPDATE/DELETE
--       viajen con la fila completa (necesario para la UI y la RLS).
--    b) Agregar las tablas a la publicacion 'supabase_realtime'.
-- ------------------------------------------------------------
alter table tareas          replica identity full;
alter table paradas         replica identity full;
alter table ordenes         replica identity full;
alter table semielaborados  replica identity full;
alter table maquinas        replica identity full;
alter table usuarios        replica identity full;

do $$
declare t text;
begin
  foreach t in array array['tareas','paradas','ordenes','semielaborados','maquinas','usuarios'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2) HABILITAR RLS EN TODAS LAS TABLAS
-- ------------------------------------------------------------
alter table sectores         enable row level security;
alter table usuarios         enable row level security;
alter table usuario_sectores enable row level security;
alter table maquinas         enable row level security;
alter table causas_parada    enable row level security;
alter table ordenes          enable row level security;
alter table tareas           enable row level security;
alter table paradas          enable row level security;
alter table semielaborados   enable row level security;

-- ------------------------------------------------------------
-- 3) LIMPIAR POLITICAS PREVIAS (las del schema original y las de este script)
-- ------------------------------------------------------------
drop policy if exists operario_sus_tareas on tareas;
drop policy if exists gestion_por_sector  on tareas;

drop policy if exists sel_sectores on sectores;          drop policy if exists wr_sectores on sectores;
drop policy if exists sel_usuarios on usuarios;          drop policy if exists wr_usuarios on usuarios;
drop policy if exists sel_usec on usuario_sectores;      drop policy if exists wr_usec on usuario_sectores;
drop policy if exists sel_maquinas on maquinas;          drop policy if exists wr_maquinas on maquinas;
drop policy if exists sel_causas on causas_parada;       drop policy if exists wr_causas on causas_parada;
drop policy if exists sel_ordenes on ordenes;            drop policy if exists wr_ordenes on ordenes;
drop policy if exists sel_tareas on tareas;              drop policy if exists wr_tareas_gestion on tareas;
drop policy if exists upd_tareas_operario on tareas;
drop policy if exists sel_paradas on paradas;            drop policy if exists wr_paradas on paradas;
drop policy if exists sel_semi on semielaborados;        drop policy if exists wr_semi on semielaborados;

-- ------------------------------------------------------------
-- 4) POLITICAS
--    Convencion de roles del proyecto:
--      planificador / encargado = "Admin" (gestionan)
--      operario                 = ejecuta tareas de sus sectores
--    Todo exige estar autenticado (rol 'authenticated' de Supabase).
-- ------------------------------------------------------------

-- ---- Catalogos: lectura para todos los logueados; alta/edicion solo gestion ----
create policy sel_sectores on sectores for select to authenticated using (true);
create policy wr_sectores  on sectores for all    to authenticated
  using (app_rol() = 'planificador') with check (app_rol() = 'planificador');

create policy sel_maquinas on maquinas for select to authenticated using (true);
create policy wr_maquinas  on maquinas for all    to authenticated
  using (app_rol() = 'planificador') with check (app_rol() = 'planificador');

create policy sel_causas on causas_parada for select to authenticated using (true);
create policy wr_causas  on causas_parada for all    to authenticated
  using (app_rol() = 'planificador') with check (app_rol() = 'planificador');

create policy sel_usec on usuario_sectores for select to authenticated using (true);
create policy wr_usec  on usuario_sectores for all    to authenticated
  using (app_rol() = 'planificador') with check (app_rol() = 'planificador');

-- ---- Usuarios: todos leen perfiles (la UI muestra nombres); solo planificador edita ----
create policy sel_usuarios on usuarios for select to authenticated using (true);
create policy wr_usuarios  on usuarios for all    to authenticated
  using (app_rol() = 'planificador') with check (app_rol() = 'planificador');

-- ---- Ordenes: lectura para todos; alta/edicion para gestion ----
create policy sel_ordenes on ordenes for select to authenticated using (true);
create policy wr_ordenes  on ordenes for all    to authenticated
  using (app_rol() in ('planificador','encargado'))
  with check (app_rol() in ('planificador','encargado'));

-- ---- Tareas ----
-- Lectura: gestion ve todo; operario ve las de sus sectores o asignadas a el.
create policy sel_tareas on tareas for select to authenticated using (
  app_rol() in ('planificador','encargado','logistica')
  or operario_id = app_uid()
  or sector_id in (select app_sectores())
);
-- Alta/edicion/borrado: planificador = todo; encargado = SOLO reparaciones (v1.9).
create policy wr_tareas_gestion on tareas for all to authenticated
  using (
    app_rol() = 'planificador'
    or (app_rol() = 'encargado' and tipo = 'reparacion')
  )
  with check (
    app_rol() = 'planificador'
    or (app_rol() = 'encargado' and tipo = 'reparacion')
  );
-- Operario: puede ACTUALIZAR (cambiar estado, marcar inicio/fin) las tareas
-- de sus sectores o asignadas a el. No puede crear ni borrar.
create policy upd_tareas_operario on tareas for update to authenticated
  using (
    app_rol() = 'operario'
    and (operario_id = app_uid() or sector_id in (select app_sectores()))
  )
  with check (
    app_rol() = 'operario'
    and (operario_id = app_uid() or sector_id in (select app_sectores()))
  );

-- ---- Paradas: visibles/escribibles si su tarea es visible (la RLS de 'tareas'
--      aplica dentro del subquery). Operario tambien puede registrar paradas. ----
create policy sel_paradas on paradas for select to authenticated using (
  exists (select 1 from tareas t where t.id = paradas.tarea_id)
);
create policy wr_paradas on paradas for all to authenticated
  using (exists (select 1 from tareas t where t.id = paradas.tarea_id))
  with check (exists (select 1 from tareas t where t.id = paradas.tarea_id));

-- ---- Semielaborados: lectura para todos; gestion + operario pueden alta/edicion ----
create policy sel_semi on semielaborados for select to authenticated using (true);
create policy wr_semi  on semielaborados for all    to authenticated
  using (app_rol() in ('planificador','encargado','operario'))
  with check (app_rol() in ('planificador','encargado','operario'));

-- ============================================================
-- FIN. Verificacion rapida (opcional):
--   select tablename from pg_publication_tables where pubname='supabase_realtime';
--   select schemaname, tablename, policyname from pg_policies order by tablename;
-- ============================================================
