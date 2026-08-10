-- ============================================================
-- SGO v1.69 - BORRADO DE EVENTOS Y KPI EXCLUSIVO PARA LORENZO
-- Ejecutar en Supabase > SQL Editor.
-- Puede ejecutarse más de una vez.
-- ============================================================

alter table public.sgo_eventos enable row level security;
alter table public.sgo_acciones enable row level security;
alter table public.sgo_indicadores enable row level security;
alter table public.sgo_indicador_mediciones enable row level security;

-- Elimina políticas antiguas FOR ALL para que no se sumen por OR y habiliten
-- borrados a otros perfiles. Se reconstruyen explícitamente todos los accesos.
drop policy if exists sgo_eventos_acceso on public.sgo_eventos;
drop policy if exists sgo_eventos_select on public.sgo_eventos;
drop policy if exists sgo_eventos_insert on public.sgo_eventos;
drop policy if exists sgo_eventos_update on public.sgo_eventos;
drop policy if exists sgo_eventos_delete_lorenzo on public.sgo_eventos;

create policy sgo_eventos_select on public.sgo_eventos for select to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_eventos_insert on public.sgo_eventos for insert to authenticated
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_eventos_update on public.sgo_eventos for update to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')))
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_eventos_delete_lorenzo
  on public.sgo_eventos
  for delete
  to authenticated
  using (exists (
    select 1
    from public.usuarios u
    where u.auth_id = auth.uid()
      and u.activo = true
      and lower(trim(u.usuario)) = 'lorenzo'
  ));

drop policy if exists sgo_acciones_acceso on public.sgo_acciones;
drop policy if exists sgo_acciones_select on public.sgo_acciones;
drop policy if exists sgo_acciones_insert on public.sgo_acciones;
drop policy if exists sgo_acciones_update on public.sgo_acciones;
drop policy if exists sgo_acciones_delete_lorenzo on public.sgo_acciones;

create policy sgo_acciones_select on public.sgo_acciones for select to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_acciones_insert on public.sgo_acciones for insert to authenticated
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_acciones_update on public.sgo_acciones for update to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')))
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_acciones_delete_lorenzo on public.sgo_acciones for delete to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and lower(trim(u.usuario)) = 'lorenzo'));

drop policy if exists sgo_indicadores_acceso on public.sgo_indicadores;
drop policy if exists sgo_indicadores_select on public.sgo_indicadores;
drop policy if exists sgo_indicadores_insert on public.sgo_indicadores;
drop policy if exists sgo_indicadores_update on public.sgo_indicadores;
drop policy if exists sgo_indicadores_delete_lorenzo on public.sgo_indicadores;

create policy sgo_indicadores_select on public.sgo_indicadores for select to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')));
create policy sgo_indicadores_insert on public.sgo_indicadores for insert to authenticated
  with check (exists (
    select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')
      and (sgo_indicadores.id not in ('sgo-global-dias-sin-accidentes','sgo-global-dias-sin-incidentes') or lower(trim(u.usuario)) = 'lorenzo')
  ));
create policy sgo_indicadores_update on public.sgo_indicadores for update to authenticated
  using (exists (
    select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')
      and (sgo_indicadores.id not in ('sgo-global-dias-sin-accidentes','sgo-global-dias-sin-incidentes') or lower(trim(u.usuario)) = 'lorenzo')
  ))
  with check (exists (
    select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador')
      and (sgo_indicadores.id not in ('sgo-global-dias-sin-accidentes','sgo-global-dias-sin-incidentes') or lower(trim(u.usuario)) = 'lorenzo')
  ));
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

drop policy if exists sgo_mediciones_delete_lorenzo on public.sgo_indicador_mediciones;
create policy sgo_mediciones_delete_lorenzo
  on public.sgo_indicador_mediciones
  for delete
  to authenticated
  using (exists (
    select 1
    from public.usuarios u
    where u.auth_id = auth.uid()
      and u.activo = true
      and lower(trim(u.usuario)) = 'lorenzo'
  ));

-- Una garantía no se elimina junto con su expediente: queda preservada y sin vínculo.
alter table public.sgo_garantias_iso
  drop constraint if exists sgo_garantias_iso_evento_id_fkey;
alter table public.sgo_garantias_iso
  add constraint sgo_garantias_iso_evento_id_fkey
  foreign key (evento_id) references public.sgo_eventos(id) on delete set null;

-- Diagnóstico: debe devolver una única fila activa para Lorenzo.
select u.usuario, u.nombre, u.rol, u.activo as perfil_activo, u.auth_id
from public.usuarios u
where lower(trim(u.usuario)) = 'lorenzo';
