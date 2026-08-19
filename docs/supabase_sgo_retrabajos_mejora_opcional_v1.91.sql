-- SGO v1.91 - Una investigacion puede proponer una mejora, pero no todas
-- las no conformidades se convierten automaticamente en mejora continua.

begin;

drop policy if exists sgo_eventos_insert on public.sgo_eventos;
create policy sgo_eventos_insert on public.sgo_eventos
for insert to authenticated
with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_id = (select auth.uid())
      and u.activo
      and (
        u.rol::text in ('sgo', 'planificador')
        or (
          u.rol::text in ('operario', 'encargado', 'laboratorio')
          and tipo = 'no_conformidad'
          and pilar = 'calidad'
          and estado = 'abierto'
          and lower(trim(responsable)) = 'lara'
          and lower(trim(detectado_por)) = lower(trim(u.usuario))
          and retrabajo is not null
          and lower(trim(retrabajo ->> 'asignadoA')) = 'lara'
          and (
            (retrabajo ->> 'origen' = 'parada_calidad' and parada_id is not null)
            or (retrabajo ->> 'origen' = 'defecto_final' and tarea_id is not null)
            or (retrabajo ->> 'origen' = 'laboratorio' and laboratorio_id is not null)
          )
        )
      )
  )
);

commit;
