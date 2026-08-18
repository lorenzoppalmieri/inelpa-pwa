-- ============================================================
-- v1.88 - SGO: borrado de controles programados solo por Lorenzo
-- La PWA impide borrar controles con ejecuciones históricas y la FK
-- sgo_control_ejecuciones_control_id_fkey mantiene esa defensa en la base.
-- ============================================================

grant delete on table public.sgo_controles_programados to authenticated;

drop policy if exists sgo_controles_delete_lorenzo on public.sgo_controles_programados;
create policy sgo_controles_delete_lorenzo
  on public.sgo_controles_programados
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.usuarios u
      where u.auth_id = (select auth.uid())
        and u.activo
        and lower(u.usuario) = 'lorenzo'
    )
  );

-- Verificación esperada: una sola política DELETE exclusiva de Lorenzo.
select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'sgo_controles_programados'
  and cmd = 'DELETE';
