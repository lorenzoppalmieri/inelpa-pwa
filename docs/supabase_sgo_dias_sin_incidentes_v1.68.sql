-- ============================================================
-- v1.68 - KPI GLOBAL DIAS SIN INCIDENTES
-- Ejecutar en Supabase > SQL Editor después de v1.59.
-- Protege ambos contadores de Seguridad: sólo Lorenzo puede
-- crearlos o actualizarlos. El resto de los KPI conserva la
-- política de acceso vigente para SGO y Planificación.
-- ============================================================

alter table public.sgo_indicadores enable row level security;

drop policy if exists sgo_indicadores_insert on public.sgo_indicadores;
drop policy if exists sgo_indicadores_update on public.sgo_indicadores;

create policy sgo_indicadores_insert
  on public.sgo_indicadores
  for insert
  to authenticated
  with check (exists (
    select 1
    from public.usuarios u
    where u.auth_id = auth.uid()
      and u.activo = true
      and u.rol::text in ('sgo', 'planificador')
      and (
        sgo_indicadores.id not in (
          'sgo-global-dias-sin-accidentes',
          'sgo-global-dias-sin-incidentes'
        )
        or lower(trim(u.usuario)) = 'lorenzo'
      )
  ));

create policy sgo_indicadores_update
  on public.sgo_indicadores
  for update
  to authenticated
  using (exists (
    select 1
    from public.usuarios u
    where u.auth_id = auth.uid()
      and u.activo = true
      and u.rol::text in ('sgo', 'planificador')
      and (
        sgo_indicadores.id not in (
          'sgo-global-dias-sin-accidentes',
          'sgo-global-dias-sin-incidentes'
        )
        or lower(trim(u.usuario)) = 'lorenzo'
      )
  ))
  with check (exists (
    select 1
    from public.usuarios u
    where u.auth_id = auth.uid()
      and u.activo = true
      and u.rol::text in ('sgo', 'planificador')
      and (
        sgo_indicadores.id not in (
          'sgo-global-dias-sin-accidentes',
          'sgo-global-dias-sin-incidentes'
        )
        or lower(trim(u.usuario)) = 'lorenzo'
      )
  ));

-- Control: debe devolver una fila activa para Lorenzo.
select u.usuario, u.nombre, u.rol, u.activo as perfil_activo, u.auth_id
from public.usuarios u
where lower(trim(u.usuario)) = 'lorenzo';
