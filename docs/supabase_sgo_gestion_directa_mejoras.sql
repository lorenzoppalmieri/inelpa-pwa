-- Gestión directa de Mejora continua. No modifica datos ni otros módulos.
-- Sustituye únicamente la validación de permisos de la ficha de mejora.
-- Conserva auditoría, gestor asignado, decisión y datos de verificación.
begin;
CREATE OR REPLACE FUNCTION public.sgo_proteger_mejora_continua()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  actor text;
  gestor_nuevo text;
  gestor_anterior text;
  gestor_sugerido text;
  fuente_nueva text;
  decision_nueva text;
  decision_anterior text;
  equipo_sgo constant text[] := array['lorenzo', 'lara', 'nicolas.sgo', 'azul'];
begin
  if (tg_op = 'INSERT' and new.mejora is null)
    or (tg_op = 'UPDATE' and old.mejora is null and new.mejora is null) then
    return new;
  end if;

  select lower(trim(u.usuario)) into actor
  from public.usuarios u
  where u.auth_id = (select auth.uid()) and u.activo
  limit 1;

  if actor in ('nicolas', 'nicolás') then actor := 'nicolas.sgo'; end if;

  if actor is null and (
    session_user in ('postgres', 'service_role', 'supabase_admin')
    or current_user in ('postgres', 'service_role', 'supabase_admin')
  ) then
    return new;
  end if;
  if actor is null then raise exception 'No se pudo identificar al usuario activo.'; end if;

  if tg_op = 'UPDATE' and old.mejora is not null and new.mejora is null then
    if actor <> 'lorenzo' then
      raise exception 'Solo Lorenzo puede eliminar el expediente de mejora continua.';
    end if;
    return new;
  end if;
  if new.mejora is null then return new; end if;

  fuente_nueva := coalesce(new.mejora ->> 'fuente', '');
  gestor_sugerido := case
    when new.retrabajo is not null or fuente_nueva = 'retrabajo_produccion' then 'lara'
    when fuente_nueva in ('auditoria_logistica', 'reunion_logistica') then 'nicolas.sgo'
    when fuente_nueva in ('auditoria_iso_interna', 'auditoria_iso_externa', 'revision_direccion') then 'azul'
    when new.area_id in ('logistica_operativa', 'logistica_despacho', 'logistica_administrativa') then 'nicolas.sgo'
    when new.area_id in ('administracion', 'it', 'gerencia_directorio', 'rrhh') then 'azul'
    else 'lara'
  end;

  gestor_nuevo := lower(trim(coalesce(new.mejora ->> 'gestorSGO', gestor_sugerido)));
  if gestor_nuevo in ('nicolas', 'nicolás') then gestor_nuevo := 'nicolas.sgo'; end if;
  if not (gestor_nuevo = any(equipo_sgo)) then gestor_nuevo := gestor_sugerido; end if;

  new.mejora := jsonb_set(new.mejora, '{gestorSGO}', to_jsonb(gestor_nuevo), true);
  new.mejora := jsonb_set(new.mejora, '{autorizacionRequerida}', 'false'::jsonb, true);
  new.mejora := jsonb_set(new.mejora, '{autorizacionEstado}', '"no_requiere"'::jsonb, true);

  decision_nueva := coalesce(new.mejora ->> 'decision', 'pendiente');

  if tg_op = 'INSERT' or old.mejora is null then
    if decision_nueva <> 'pendiente' and actor = gestor_nuevo then
      new.mejora := jsonb_set(new.mejora, '{decisionEn}', to_jsonb(now()::text), true);
      new.mejora := jsonb_set(new.mejora, '{decisionPor}', to_jsonb(actor), true);
    elsif decision_nueva <> 'pendiente' then
      new.mejora := jsonb_set(new.mejora, '{decision}', '"pendiente"'::jsonb, true);
      new.mejora := new.mejora - 'decisionEn' - 'decisionPor';
    end if;
    return new;
  end if;

  gestor_anterior := lower(trim(coalesce(old.mejora ->> 'gestorSGO', gestor_sugerido)));
  if gestor_anterior in ('nicolas', 'nicolás') then gestor_anterior := 'nicolas.sgo'; end if;
  if not (gestor_anterior = any(equipo_sgo)) then gestor_anterior := gestor_sugerido; end if;

  if gestor_nuevo is distinct from gestor_anterior and not (actor = any(equipo_sgo)) then
    raise exception 'Solo Lorenzo, Lara, Nicolás o Azul pueden reasignar una mejora continua.';
  end if;

  if (
    new.mejora
      - 'gestorSGO'
      - 'verificacionSGOEn'
      - 'verificacionSGOPor'
      - 'autorizacionRequerida'
      - 'autorizacionEstado'
      - 'umbralAutorizacionAplicado'
      - 'autorizacionDecididaEn'
      - 'autorizacionDecididaPor'
  ) is distinct from (
    old.mejora
      - 'gestorSGO'
      - 'verificacionSGOEn'
      - 'verificacionSGOPor'
      - 'autorizacionRequerida'
      - 'autorizacionEstado'
      - 'umbralAutorizacionAplicado'
      - 'autorizacionDecididaEn'
      - 'autorizacionDecididaPor'
  ) and actor <> gestor_nuevo then
    raise exception 'La gestión de esta mejora corresponde al integrante SGO asignado.';
  end if;

  decision_anterior := coalesce(old.mejora ->> 'decision', 'pendiente');
  if decision_nueva is distinct from decision_anterior then
    if actor <> gestor_nuevo then
      raise exception 'Solo el integrante SGO asignado puede registrar la decisión.';
    end if;
    new.mejora := jsonb_set(new.mejora, '{decisionEn}', to_jsonb(now()::text), true);
    new.mejora := jsonb_set(new.mejora, '{decisionPor}', to_jsonb(actor), true);
  end if;

  if new.estado is distinct from old.estado then
    if new.estado = 'cerrado' then
      if decision_nueva in ('pendiente', 'a_futuro') then
        raise exception 'La mejora debe tener una decisión definitiva antes del cierre.';
      end if;

      if actor <> gestor_nuevo then
        raise exception 'Solo el integrante SGO asignado puede cerrar esta mejora.';
      end if;

      new.mejora := jsonb_set(new.mejora, '{verificacionSGOEn}', to_jsonb(now()::text), true);
      new.mejora := jsonb_set(new.mejora, '{verificacionSGOPor}', to_jsonb(actor), true);
      new.cerrado_por := actor;
      new.cerrado_en := coalesce(new.cerrado_en, now());
    elsif old.estado = 'cerrado' and actor <> gestor_nuevo then
      raise exception 'Solo el integrante SGO asignado puede reabrir esta mejora.';
    elsif actor <> gestor_nuevo then
      raise exception 'Solo el integrante SGO asignado puede cambiar el estado de esta mejora.';
    end if;
  end if;

  if (new.cerrado_en is distinct from old.cerrado_en or new.cerrado_por is distinct from old.cerrado_por)
    and new.estado <> 'cerrado' and actor <> gestor_nuevo then
    raise exception 'Solo el integrante SGO asignado puede modificar los datos de cierre.';
  end if;

  return new;
end;
$function$

commit;

