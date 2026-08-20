-- ============================================================
-- v1.93 - SGO EVIDENCIAS 5S OFFLINE Y POSTERIORES AL CIERRE
-- Permite anexar fotografías a una auditoría 5S finalizada sin
-- modificar respuestas, puntajes, fechas, hallazgos ni fotos previas.
-- ============================================================

begin;

create or replace function public.sgo_proteger_evidencias_5s_cerradas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  anterior_sin_evidencias jsonb;
  nueva_sin_evidencias jsonb;
  respuesta_anterior jsonb;
  respuesta_nueva jsonb;
  path_anterior text;
  cantidad_anterior integer := 0;
  cantidad_nueva integer := 0;
  cantidad_agregada integer;
  actor text;
  instante text;
  historial jsonb;
begin
  if old.auditoria_campo is null
     or new.auditoria_campo is null
     or old.auditoria_campo ->> 'tipo' <> '5s'
     or new.auditoria_campo ->> 'tipo' <> '5s' then
    raise exception 'Solo se permite anexar evidencias a auditorías 5S cerradas.';
  end if;

  -- Ninguna columna operativa de la ejecución puede cambiar.
  if (to_jsonb(new) - 'auditoria_campo' - 'evidencia')
     is distinct from
     (to_jsonb(old) - 'auditoria_campo' - 'evidencia') then
    raise exception 'La auditoría está cerrada: solo se pueden agregar fotografías.';
  end if;

  -- Para comparar el contenido se excluyen exclusivamente los paths y
  -- la bitácora de incorporación de fotos.
  select jsonb_set(
    old.auditoria_campo - 'evidenciasActualizadasEn' - 'evidenciasActualizadasPor' - 'evidenciasActualizaciones',
    '{respuestas}',
    coalesce(jsonb_agg(value - 'evidenciaPaths'), '[]'::jsonb),
    true
  ) into anterior_sin_evidencias
  from jsonb_array_elements(old.auditoria_campo -> 'respuestas');

  select jsonb_set(
    new.auditoria_campo - 'evidenciasActualizadasEn' - 'evidenciasActualizadasPor' - 'evidenciasActualizaciones',
    '{respuestas}',
    coalesce(jsonb_agg(value - 'evidenciaPaths'), '[]'::jsonb),
    true
  ) into nueva_sin_evidencias
  from jsonb_array_elements(new.auditoria_campo -> 'respuestas');

  if nueva_sin_evidencias is distinct from anterior_sin_evidencias then
    raise exception 'La auditoría está cerrada: respuestas, puntajes y hallazgos no se pueden modificar.';
  end if;

  -- Las evidencias existentes tampoco se pueden borrar o reemplazar.
  for respuesta_anterior in select value from jsonb_array_elements(old.auditoria_campo -> 'respuestas') loop
    select value into respuesta_nueva
    from jsonb_array_elements(new.auditoria_campo -> 'respuestas')
    where value ->> 'itemId' = respuesta_anterior ->> 'itemId'
    limit 1;

    if respuesta_nueva is null then
      raise exception 'No se puede eliminar un punto de una auditoría cerrada.';
    end if;

    if respuesta_nueva ? 'evidenciaPaths'
       and jsonb_typeof(respuesta_nueva -> 'evidenciaPaths') <> 'array' then
      raise exception 'El formato de las evidencias no es válido.';
    end if;

    for path_anterior in
      select jsonb_array_elements_text(coalesce(respuesta_anterior -> 'evidenciaPaths', '[]'::jsonb))
    loop
      if not coalesce(respuesta_nueva -> 'evidenciaPaths', '[]'::jsonb) ? path_anterior then
        raise exception 'Las fotografías existentes no se pueden eliminar.';
      end if;
    end loop;
  end loop;

  select count(*) into cantidad_anterior
  from jsonb_array_elements(old.auditoria_campo -> 'respuestas') r,
       jsonb_array_elements_text(coalesce(r -> 'evidenciaPaths', '[]'::jsonb));
  select count(*) into cantidad_nueva
  from jsonb_array_elements(new.auditoria_campo -> 'respuestas') r,
       jsonb_array_elements_text(coalesce(r -> 'evidenciaPaths', '[]'::jsonb));

  cantidad_agregada := cantidad_nueva - cantidad_anterior;
  if cantidad_agregada <= 0 then
    raise exception 'La actualización debe incorporar al menos una fotografía nueva.';
  end if;

  select u.usuario into actor
  from public.usuarios u
  where u.auth_id = (select auth.uid()) and u.activo
  limit 1;
  actor := coalesce(actor, current_user);
  instante := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  historial := coalesce(old.auditoria_campo -> 'evidenciasActualizaciones', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'actualizadoEn', instante,
      'actualizadoPor', actor,
      'cantidadAgregada', cantidad_agregada
    ));

  new.auditoria_campo := (new.auditoria_campo
    - 'evidenciasActualizadasEn' - 'evidenciasActualizadasPor' - 'evidenciasActualizaciones')
    || jsonb_build_object(
      'evidenciasActualizadasEn', instante,
      'evidenciasActualizadasPor', actor,
      'evidenciasActualizaciones', historial
    );
  return new;
end $$;

drop trigger if exists trg_sgo_proteger_evidencias_5s_cerradas on public.sgo_control_ejecuciones;
create trigger trg_sgo_proteger_evidencias_5s_cerradas
before update on public.sgo_control_ejecuciones
for each row execute function public.sgo_proteger_evidencias_5s_cerradas();

drop policy if exists sgo_control_ejecuciones_update_evidencias_5s on public.sgo_control_ejecuciones;
create policy sgo_control_ejecuciones_update_evidencias_5s
on public.sgo_control_ejecuciones for update to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.auth_id = (select auth.uid())
      and u.activo
      and u.rol::text in ('sgo','planificador')
  )
)
with check (
  exists (
    select 1 from public.usuarios u
    where u.auth_id = (select auth.uid())
      and u.activo
      and u.rol::text in ('sgo','planificador')
  )
);

-- La actualización queda registrada completa en la bitácora SGO.
drop trigger if exists trg_sgo_control_ejecuciones_auditoria on public.sgo_control_ejecuciones;
create trigger trg_sgo_control_ejecuciones_auditoria
after insert or update on public.sgo_control_ejecuciones
for each row execute function public.sgo_registrar_auditoria();

comment on column public.sgo_control_ejecuciones.auditoria_campo is
  'Informe 5S cerrado. Solo admite anexar evidencia fotográfica con trazabilidad posterior al cierre.';

notify pgrst, 'reload schema';
commit;

select 'SGO evidencias 5S offline v1.93 instalado' as resultado;
