-- ============================================================
-- v1.59 - BORRADO DE KPI EXCLUSIVO PARA LORENZO
-- Ejecutar en Supabase > SQL Editor.
-- Puede ejecutarse aunque la política ya exista.
-- ============================================================

alter table public.sgo_indicadores enable row level security;

drop policy if exists sgo_indicadores_delete_lorenzo on public.sgo_indicadores;

create policy sgo_indicadores_delete_lorenzo
  on public.sgo_indicadores
  for delete
  to authenticated
  using (exists (
    select 1
    from public.usuarios u
    where u.auth_id = auth.uid()
      and u.activo = true
      and lower(trim(u.usuario)) = 'lorenzo'
  ));

-- Diagnóstico: debe devolver una fila con usuario = lorenzo y perfil_activo = true.
select u.usuario, u.nombre, u.rol, u.activo as perfil_activo, u.auth_id
from public.usuarios u
where lower(trim(u.usuario)) = 'lorenzo';
