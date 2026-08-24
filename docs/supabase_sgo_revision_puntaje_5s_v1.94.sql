-- ============================================================
-- v1.94 - REVISION TRAZABLE DE PUNTAJE PREMIABLE 5S
-- Conserva respuestas y puntajes originales. Lara, Nicolas, Azul,
-- GestionSGO y Lorenzo pueden solicitar una revision; solo Lorenzo
-- puede aprobarla o rechazarla. Las fotos posteriores siguen habilitadas.
-- ============================================================

begin;

create or replace function public.sgo_proteger_evidencias_5s_cerradas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  anterior_base jsonb;
  nueva_base jsonb;
  respuesta_anterior jsonb;
  respuesta_nueva jsonb;
  path_anterior text;
  cantidad_fotos_anterior integer := 0;
  cantidad_fotos_nueva integer := 0;
  cantidad_fotos_agregada integer := 0;
  revisiones_anteriores jsonb := coalesce(old.auditoria_campo -> 'revisionesPuntaje', '[]'::jsonb);
  revisiones_nuevas jsonb := coalesce(new.auditoria_campo -> 'revisionesPuntaje', '[]'::jsonb);
  cantidad_revision_anterior integer;
  cantidad_revision_nueva integer;
  revision_anterior jsonb;
  revision_nueva jsonb;
  indice integer;
  indice_modificado integer := -1;
  cantidad_modificada integer := 0;
  cambio_revision boolean := false;
  actor text;
  actor_rol text;
  instante text;
  historial_fotos jsonb;
begin
  if old.auditoria_campo is null
     or new.auditoria_campo is null
     or old.auditoria_campo ->> 'tipo' <> '5s'
     or new.auditoria_campo ->> 'tipo' <> '5s' then
    raise exception 'Solo se permiten actualizaciones controladas sobre auditorias 5S cerradas.';
  end if;

  select u.usuario, u.rol::text into actor, actor_rol
  from public.usuarios u
  where u.auth_id = (select auth.uid()) and u.activo
  limit 1;

  if actor is null
     or actor not in ('lorenzo', 'lara', 'nicolas.sgo', 'azul', 'gestionsgo')
     or actor_rol not in ('sgo', 'planificador') then
    raise exception 'El usuario no esta autorizado para revisar auditorias 5S.';
  end if;
  instante := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  -- Ninguna columna operativa de la ejecucion puede cambiar.
  if (to_jsonb(new) - 'auditoria_campo' - 'evidencia')
     is distinct from
     (to_jsonb(old) - 'auditoria_campo' - 'evidencia') then
    raise exception 'La auditoria esta cerrada: no se pueden modificar sus datos operativos.';
  end if;

  if (new.auditoria_campo ? 'revisionesPuntaje')
     and jsonb_typeof(new.auditoria_campo -> 'revisionesPuntaje') <> 'array' then
    raise exception 'El formato de las revisiones de puntaje no es valido.';
  end if;

  -- Compara toda la auditoria excepto fotos, trazas fotograficas y revisiones.
  -- Por lo tanto respuestas, puntajes, fechas y porcentajes originales quedan inmoviles.
  select jsonb_set(
    old.auditoria_campo - 'evidenciasActualizadasEn' - 'evidenciasActualizadasPor'
      - 'evidenciasActualizaciones' - 'revisionesPuntaje',
    '{respuestas}',
    coalesce(jsonb_agg(value - 'evidenciaPaths' order by orden), '[]'::jsonb),
    true
  ) into anterior_base
  from jsonb_array_elements(old.auditoria_campo -> 'respuestas') with ordinality as r(value, orden);

  select jsonb_set(
    new.auditoria_campo - 'evidenciasActualizadasEn' - 'evidenciasActualizadasPor'
      - 'evidenciasActualizaciones' - 'revisionesPuntaje',
    '{respuestas}',
    coalesce(jsonb_agg(value - 'evidenciaPaths' order by orden), '[]'::jsonb),
    true
  ) into nueva_base
  from jsonb_array_elements(new.auditoria_campo -> 'respuestas') with ordinality as r(value, orden);

  if nueva_base is distinct from anterior_base then
    raise exception 'Las respuestas, puntajes y resultados originales de la auditoria no se pueden modificar.';
  end if;

  -- Las evidencias existentes no se pueden borrar ni reemplazar.
  for respuesta_anterior in select value from jsonb_array_elements(old.auditoria_campo -> 'respuestas') loop
    select value into respuesta_nueva
    from jsonb_array_elements(new.auditoria_campo -> 'respuestas')
    where value ->> 'itemId' = respuesta_anterior ->> 'itemId'
    limit 1;

    if respuesta_nueva is null then
      raise exception 'No se puede eliminar un punto de una auditoria cerrada.';
    end if;
    if respuesta_nueva ? 'evidenciaPaths'
       and jsonb_typeof(respuesta_nueva -> 'evidenciaPaths') <> 'array' then
      raise exception 'El formato de las evidencias no es valido.';
    end if;
    for path_anterior in
      select jsonb_array_elements_text(coalesce(respuesta_anterior -> 'evidenciaPaths', '[]'::jsonb))
    loop
      if not coalesce(respuesta_nueva -> 'evidenciaPaths', '[]'::jsonb) ? path_anterior then
        raise exception 'Las fotografias existentes no se pueden eliminar ni reemplazar.';
      end if;
    end loop;
  end loop;

  select count(*) into cantidad_fotos_anterior
  from jsonb_array_elements(old.auditoria_campo -> 'respuestas') r,
       jsonb_array_elements_text(coalesce(r -> 'evidenciaPaths', '[]'::jsonb));
  select count(*) into cantidad_fotos_nueva
  from jsonb_array_elements(new.auditoria_campo -> 'respuestas') r,
       jsonb_array_elements_text(coalesce(r -> 'evidenciaPaths', '[]'::jsonb));
  cantidad_fotos_agregada := cantidad_fotos_nueva - cantidad_fotos_anterior;

  -- Alta de una solicitud: se anexa una unica revision pendiente.
  cantidad_revision_anterior := jsonb_array_length(revisiones_anteriores);
  cantidad_revision_nueva := jsonb_array_length(revisiones_nuevas);
  if revisiones_nuevas is distinct from revisiones_anteriores then
    if cantidad_revision_nueva = cantidad_revision_anterior + 1
       and (revisiones_nuevas - (cantidad_revision_nueva - 1)) = revisiones_anteriores then
      revision_nueva := revisiones_nuevas -> (cantidad_revision_nueva - 1);
      if coalesce(btrim(revision_nueva ->> 'id'), '') = ''
         or coalesce(btrim(revision_nueva ->> 'itemId'), '') = ''
         or coalesce(btrim(revision_nueva ->> 'investigadaPor'), '') = ''
         or coalesce(btrim(revision_nueva ->> 'resultadoInvestigacion'), '') = ''
         or coalesce(btrim(revision_nueva ->> 'causaComprobada'), '') = ''
         or coalesce(btrim(revision_nueva ->> 'areaResponsableId'), '') = ''
         or coalesce(btrim(revision_nueva ->> 'responsableReal'), '') = ''
         or coalesce(btrim(revision_nueva ->> 'evidencia'), '') = ''
         or coalesce(btrim(revision_nueva ->> 'motivoAjuste'), '') = '' then
        raise exception 'La solicitud de revision esta incompleta.';
      end if;
      if exists (
        select 1 from jsonb_array_elements(revisiones_anteriores) r
        where r ->> 'id' = revision_nueva ->> 'id'
      ) then
        raise exception 'El identificador de la revision ya existe.';
      end if;
      if exists (
        select 1 from jsonb_array_elements(revisiones_anteriores) r
        where r ->> 'itemId' = revision_nueva ->> 'itemId' and r ->> 'estado' = 'pendiente'
      ) then
        raise exception 'El hallazgo ya tiene una revision pendiente.';
      end if;
      select value into respuesta_anterior
      from jsonb_array_elements(old.auditoria_campo -> 'respuestas')
      where value ->> 'itemId' = revision_nueva ->> 'itemId'
      limit 1;
      if respuesta_anterior is null
         or respuesta_anterior ->> 'puntaje' not in ('0', '1')
         or revision_nueva ->> 'puntajeOriginal' <> respuesta_anterior ->> 'puntaje'
         or revision_nueva ->> 'puntajePropuesto' not in ('1', '2')
         or (revision_nueva ->> 'puntajePropuesto')::integer <= (respuesta_anterior ->> 'puntaje')::integer then
        raise exception 'La revision solo puede aumentar un hallazgo original de 0 o 1.';
      end if;
      revision_nueva := revision_nueva
        - 'estado' - 'solicitadaEn' - 'solicitadaPor'
        - 'decididaEn' - 'decididaPor' - 'decisionComentario' - 'mejoraEventoId';
      revision_nueva := revision_nueva || jsonb_build_object(
        'estado', 'pendiente', 'solicitadaEn', instante, 'solicitadaPor', actor
      );
      revisiones_nuevas := revisiones_anteriores || jsonb_build_array(revision_nueva);
      cambio_revision := true;

    -- Resolucion: solo cambia una solicitud pendiente y exclusivamente por Lorenzo.
    elsif cantidad_revision_nueva = cantidad_revision_anterior then
      if actor <> 'lorenzo' then
        raise exception 'Solo Lorenzo puede aprobar o rechazar revisiones de puntaje.';
      end if;
      if cantidad_revision_anterior = 0 then
        raise exception 'No existe una revision para resolver.';
      end if;
      for indice in 0..cantidad_revision_anterior - 1 loop
        if revisiones_anteriores -> indice is distinct from revisiones_nuevas -> indice then
          cantidad_modificada := cantidad_modificada + 1;
          indice_modificado := indice;
        end if;
      end loop;
      if cantidad_modificada <> 1 then
        raise exception 'La decision debe resolver exactamente una revision pendiente.';
      end if;
      revision_anterior := revisiones_anteriores -> indice_modificado;
      revision_nueva := revisiones_nuevas -> indice_modificado;
      if revision_anterior ->> 'estado' <> 'pendiente'
         or revision_nueva ->> 'estado' not in ('aprobada', 'rechazada')
         or coalesce(btrim(revision_nueva ->> 'decisionComentario'), '') = '' then
        raise exception 'La decision de la revision no es valida o no tiene fundamento.';
      end if;
      if (revision_nueva - 'estado' - 'decididaEn' - 'decididaPor' - 'decisionComentario' - 'mejoraEventoId')
         is distinct from
         (revision_anterior - 'estado' - 'decididaEn' - 'decididaPor' - 'decisionComentario' - 'mejoraEventoId') then
        raise exception 'La investigacion original de la revision no se puede modificar.';
      end if;
      if revision_nueva ->> 'estado' = 'aprobada'
         and coalesce(btrim(revision_nueva ->> 'mejoraEventoId'), '') = '' then
        raise exception 'Toda revision aprobada debe quedar vinculada a una mejora continua.';
      end if;
      revision_nueva := revision_nueva - 'decididaEn' - 'decididaPor';
      revision_nueva := revision_nueva || jsonb_build_object('decididaEn', instante, 'decididaPor', actor);
      if revision_nueva ->> 'estado' = 'rechazada' then
        revision_nueva := revision_nueva - 'mejoraEventoId';
      end if;
      revisiones_nuevas := jsonb_set(revisiones_anteriores, array[indice_modificado::text], revision_nueva, false);
      cambio_revision := true;
    else
      raise exception 'La bitacora de revisiones no se puede borrar, reemplazar ni reordenar.';
    end if;
  end if;

  if cantidad_fotos_agregada < 0 then
    raise exception 'Las fotografias existentes no se pueden eliminar.';
  elsif cantidad_fotos_agregada > 0 then
    historial_fotos := coalesce(old.auditoria_campo -> 'evidenciasActualizaciones', '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
        'actualizadoEn', instante, 'actualizadoPor', actor, 'cantidadAgregada', cantidad_fotos_agregada
      ));
    new.auditoria_campo := (new.auditoria_campo
      - 'evidenciasActualizadasEn' - 'evidenciasActualizadasPor' - 'evidenciasActualizaciones')
      || jsonb_build_object(
        'evidenciasActualizadasEn', instante,
        'evidenciasActualizadasPor', actor,
        'evidenciasActualizaciones', historial_fotos
      );
  else
    if new.evidencia is distinct from old.evidencia
       or new.auditoria_campo -> 'evidenciasActualizadasEn' is distinct from old.auditoria_campo -> 'evidenciasActualizadasEn'
       or new.auditoria_campo -> 'evidenciasActualizadasPor' is distinct from old.auditoria_campo -> 'evidenciasActualizadasPor'
       or new.auditoria_campo -> 'evidenciasActualizaciones' is distinct from old.auditoria_campo -> 'evidenciasActualizaciones' then
      raise exception 'La trazabilidad fotografica no se puede modificar sin agregar evidencias.';
    end if;
  end if;

  if cambio_revision then
    new.auditoria_campo := jsonb_set(new.auditoria_campo, '{revisionesPuntaje}', revisiones_nuevas, true);
  end if;
  if cantidad_fotos_agregada = 0 and not cambio_revision then
    raise exception 'La actualizacion no agrega evidencias ni una revision valida.';
  end if;
  return new;
end $$;

drop policy if exists sgo_control_ejecuciones_update_evidencias_5s on public.sgo_control_ejecuciones;
drop policy if exists sgo_control_ejecuciones_update_post_cierre_5s on public.sgo_control_ejecuciones;
create policy sgo_control_ejecuciones_update_post_cierre_5s
on public.sgo_control_ejecuciones for update to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.auth_id = (select auth.uid())
      and u.activo
      and u.usuario in ('lorenzo', 'lara', 'nicolas.sgo', 'azul', 'gestionsgo')
      and u.rol::text in ('sgo', 'planificador')
  )
)
with check (
  exists (
    select 1 from public.usuarios u
    where u.auth_id = (select auth.uid())
      and u.activo
      and u.usuario in ('lorenzo', 'lara', 'nicolas.sgo', 'azul', 'gestionsgo')
      and u.rol::text in ('sgo', 'planificador')
  )
);

-- Mantiene el comportamiento existente de lectura/alta, evitando recalcular
-- auth.uid() por cada fila y dejando indexada la FK usada en expedientes.
drop policy if exists sgo_control_ejecuciones_select on public.sgo_control_ejecuciones;
create policy sgo_control_ejecuciones_select
on public.sgo_control_ejecuciones for select to authenticated
using (
  exists (
    select 1 from public.usuarios u
    where u.auth_id = (select auth.uid())
      and u.activo
      and u.rol::text in ('sgo', 'planificador')
  )
);

drop policy if exists sgo_control_ejecuciones_insert on public.sgo_control_ejecuciones;
create policy sgo_control_ejecuciones_insert
on public.sgo_control_ejecuciones for insert to authenticated
with check (
  exists (
    select 1 from public.usuarios u
    where u.auth_id = (select auth.uid())
      and u.activo
      and u.rol::text in ('sgo', 'planificador')
  )
);

create index if not exists idx_sgo_control_ejecuciones_evento_id
  on public.sgo_control_ejecuciones (evento_id)
  where evento_id is not null;

comment on function public.sgo_proteger_evidencias_5s_cerradas() is
  'Protege auditorias 5S cerradas: solo permite anexar fotos, solicitar revision premiable o resolverla con trazabilidad.';

notify pgrst, 'reload schema';
commit;

select 'SGO revision de puntaje 5S v1.94 instalada' as resultado;
