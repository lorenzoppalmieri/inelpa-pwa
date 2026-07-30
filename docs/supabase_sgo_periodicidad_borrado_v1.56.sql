-- ============================================================
-- v1.56 - PERIODICIDAD KPI + BORRADO EXCLUSIVO DE LORENZO
-- Ejecutar despues de supabase_sgo_kpi_automaticos_v1.54.sql.
-- ============================================================

alter table sgo_indicadores
  add column if not exists frecuencia text not null default 'mensual';

update sgo_indicadores set frecuencia = 'mensual' where frecuencia is null;

alter table sgo_indicadores drop constraint if exists sgo_indicadores_frecuencia_check;
alter table sgo_indicadores add constraint sgo_indicadores_frecuencia_check
  check (frecuencia in ('mensual','bimestral','trimestral','semestral','anual'));

-- Lectura y carga: equipo SGO y planificadores.
-- Borrado fisico: solamente el perfil activo cuyo login es Lorenzo.
drop policy if exists sgo_indicadores_acceso on sgo_indicadores;
drop policy if exists sgo_indicadores_select on sgo_indicadores;
drop policy if exists sgo_indicadores_insert on sgo_indicadores;
drop policy if exists sgo_indicadores_update on sgo_indicadores;
drop policy if exists sgo_indicadores_delete_lorenzo on sgo_indicadores;

create policy sgo_indicadores_select on sgo_indicadores for select to authenticated
  using (exists (
    select 1 from usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
  ));

create policy sgo_indicadores_insert on sgo_indicadores for insert to authenticated
  with check (exists (
    select 1 from usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
  ));

create policy sgo_indicadores_update on sgo_indicadores for update to authenticated
  using (exists (
    select 1 from usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
  ))
  with check (exists (
    select 1 from usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
  ));

create policy sgo_indicadores_delete_lorenzo on sgo_indicadores for delete to authenticated
  using (exists (
    select 1 from usuarios u where u.auth_id = auth.uid() and u.activo
      and lower(u.usuario) = 'lorenzo'
  ));
