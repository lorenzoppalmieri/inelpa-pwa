-- ============================================================
-- v1.58 - KPI GLOBAL DIAS SIN ACCIDENTES
-- Ejecutar despues de supabase_sgo_periodicidad_borrado_v1.56.sql.
-- Restringe la edición del registro especial exclusivamente a Lorenzo.
-- ============================================================

drop policy if exists sgo_indicadores_insert on public.sgo_indicadores;
drop policy if exists sgo_indicadores_update on public.sgo_indicadores;

create policy sgo_indicadores_insert on public.sgo_indicadores for insert to authenticated
  with check (exists (
    select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
      and (
        sgo_indicadores.id <> 'sgo-global-dias-sin-accidentes'
        or lower(u.usuario) = 'lorenzo'
      )
  ));

create policy sgo_indicadores_update on public.sgo_indicadores for update to authenticated
  using (exists (
    select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
      and (
        sgo_indicadores.id <> 'sgo-global-dias-sin-accidentes'
        or lower(u.usuario) = 'lorenzo'
      )
  ))
  with check (exists (
    select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo
      and u.rol::text in ('sgo', 'planificador')
      and (
        sgo_indicadores.id <> 'sgo-global-dias-sin-accidentes'
        or lower(u.usuario) = 'lorenzo'
      )
  ));
