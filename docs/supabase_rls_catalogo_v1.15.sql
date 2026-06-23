-- ============================================================
-- INELPA PWA — v1.15: RLS para las tablas de CATALOGO de modelos
--   modelos, componentes, modelo_componentes
--
-- PROBLEMA QUE RESUELVE: estas 3 tablas tienen RLS habilitado pero SIN
-- politicas -> Supabase no devuelve filas por la Data API ("No data will be
-- returned..."). La PWA no puede leer el catalogo de modelos/semielaborados.
--
-- CONVENCION DEL PROYECTO (igual que sectores/maquinas/causas):
--   - SELECT: cualquier usuario logueado (lectura del catalogo).
--   - Alta/edicion/borrado (ALL): solo 'planificador'.
--   (El seed por SQL Editor corre como owner y NO pasa por RLS, asi que
--    sembrar el catalogo sigue funcionando sin importar estas politicas.)
--
-- Correr en Supabase: SQL Editor -> New query -> pegar TODO -> Run.
-- Requisito: app_rol() ya existe (creada en supabase_realtime_rls.sql).
-- Re-ejecutable (drop ... if exists antes de cada create).
-- ============================================================

-- 1) Asegurar RLS habilitado (idempotente; ya aparece activo en el panel).
alter table modelos             enable row level security;
alter table componentes         enable row level security;
alter table modelo_componentes  enable row level security;

-- 2) Limpiar politicas previas (para re-ejecutar sin error).
drop policy if exists sel_modelos on modelos;            drop policy if exists wr_modelos on modelos;
drop policy if exists sel_componentes on componentes;    drop policy if exists wr_componentes on componentes;
drop policy if exists sel_modcomp on modelo_componentes; drop policy if exists wr_modcomp on modelo_componentes;

-- 3) Politicas.
-- ---- modelos ----
create policy sel_modelos on modelos for select to authenticated using (true);
create policy wr_modelos  on modelos for all    to authenticated
  using (app_rol() = 'planificador') with check (app_rol() = 'planificador');

-- ---- componentes (semielaborados / piezas del BOM) ----
create policy sel_componentes on componentes for select to authenticated using (true);
create policy wr_componentes  on componentes for all    to authenticated
  using (app_rol() = 'planificador') with check (app_rol() = 'planificador');

-- ---- modelo_componentes (BOM: que componentes lleva cada modelo) ----
create policy sel_modcomp on modelo_componentes for select to authenticated using (true);
create policy wr_modcomp  on modelo_componentes for all    to authenticated
  using (app_rol() = 'planificador') with check (app_rol() = 'planificador');

-- ============================================================
-- Verificacion (opcional):
--   select schemaname, tablename, policyname, cmd
--   from pg_policies
--   where tablename in ('modelos','componentes','modelo_componentes')
--   order by tablename, policyname;
-- Esperado: 2 politicas por tabla (sel_* SELECT, wr_* ALL).
-- ============================================================
