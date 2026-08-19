-- SGO v1.88 - Mejora continua integrada sobre eventos y acciones existentes.
-- No migra ni inserta datos históricos. Es idempotente.
begin;

alter table public.sgo_eventos
  add column if not exists mejora jsonb;

comment on column public.sgo_eventos.mejora is
  'Ficha de mejora continua: fuente, evaluación, decisión, resultado y seguimiento posterior al cierre.';

alter table public.sgo_eventos
  drop constraint if exists sgo_eventos_mejora_check;

alter table public.sgo_eventos
  add constraint sgo_eventos_mejora_check check (
    mejora is null or (
      jsonb_typeof(mejora) = 'object'
      and mejora ? 'clase'
      and mejora ? 'fuente'
      and mejora ? 'decision'
      and mejora ? 'prioridad'
      and mejora ? 'pilaresBeneficiados'
      and mejora ->> 'clase' in ('idea','observacion','oportunidad','mejora','no_conformidad')
      and mejora ->> 'decision' in ('pendiente','aprobada','a_futuro','no_viable')
      and mejora ->> 'prioridad' in ('baja','media','alta','critica')
      and jsonb_typeof(mejora -> 'pilaresBeneficiados') = 'array'
    )
  );

create index if not exists idx_sgo_eventos_mejora_gestion
  on public.sgo_eventos ((mejora ->> 'decision'), estado, detectado_en desc)
  where mejora is not null;

-- Las políticas RLS de sgo_eventos ya limitan el acceso a SGO/Planificación y
-- el borrado a Lorenzo. Este trigger agrega las decisiones exclusivas del líder.
create or replace function public.sgo_proteger_mejora_continua()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor text;
  decision_nueva text;
  decision_anterior text;
begin
  if (tg_op = 'INSERT' and new.mejora is null)
    or (tg_op = 'UPDATE' and old.mejora is null and new.mejora is null) then
    return new;
  end if;

  select lower(trim(u.usuario))
    into actor
  from public.usuarios u
  where u.auth_id = (select auth.uid())
    and u.activo
  limit 1;

  if actor is null and session_user in ('postgres','service_role','supabase_admin') then
    return new;
  end if;
  if actor is null then
    raise exception 'No se pudo identificar al usuario activo.';
  end if;

  if actor <> 'lorenzo' then
    if tg_op = 'UPDATE' and old.mejora is not null and new.mejora is null then
      raise exception 'Solo Lorenzo puede quitar la información de mejora continua de un expediente.';
    end if;
  end if;

  if new.mejora is null then
    return new;
  end if;

  decision_nueva := new.mejora ->> 'decision';
  decision_anterior := case when tg_op = 'UPDATE' and old.mejora is not null then old.mejora ->> 'decision' else null end;

  if actor <> 'lorenzo' then
    if tg_op = 'INSERT' and decision_nueva <> 'pendiente' then
      raise exception 'Solo Lorenzo puede definir la decisión de una mejora.';
    end if;
    if tg_op = 'UPDATE' and decision_nueva is distinct from decision_anterior then
      raise exception 'Solo Lorenzo puede aprobar, postergar o declarar no viable una mejora.';
    end if;
    if tg_op = 'UPDATE' and new.estado is distinct from old.estado
      and (new.estado = 'cerrado' or old.estado = 'cerrado') then
      raise exception 'Solo Lorenzo puede cerrar o reabrir una mejora.';
    end if;
    if tg_op = 'UPDATE' and (
      new.mejora ->> 'seguimientoResultado' is distinct from old.mejora ->> 'seguimientoResultado'
      or new.mejora ->> 'seguimientoObservacion' is distinct from old.mejora ->> 'seguimientoObservacion'
      or new.mejora ->> 'seguimientoEn' is distinct from old.mejora ->> 'seguimientoEn'
    ) then
      raise exception 'Solo Lorenzo puede verificar el sostenimiento de una mejora.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sgo_proteger_mejora_continua on public.sgo_eventos;
create trigger trg_sgo_proteger_mejora_continua
before insert or update on public.sgo_eventos
for each row execute function public.sgo_proteger_mejora_continua();

notify pgrst, 'reload schema';
commit;

-- Verificación esperada: una fila, jsonb, nullable YES.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'sgo_eventos' and column_name = 'mejora';
