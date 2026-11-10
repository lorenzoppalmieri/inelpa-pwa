-- SGO v2.48 - Mejora continua: nueva decisión 'en_proceso' ("En proceso").
-- Solo amplía el CHECK de la ficha de mejora (v1.88). No modifica datos.
-- Idempotente. Correr PRIMERO en INELPA-TEST y después en producción,
-- SIEMPRE ANTES de subir el código (si no, guardar "En proceso" da error).
begin;

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
      and mejora ->> 'decision' in ('pendiente','aprobada','en_proceso','a_futuro','no_viable')
      and mejora ->> 'prioridad' in ('baja','media','alta','critica')
      and jsonb_typeof(mejora -> 'pilaresBeneficiados') = 'array'
    )
  );

notify pgrst, 'reload schema';
commit;

-- Verificación esperada: una fila que incluya 'en_proceso'.
select pg_get_constraintdef(oid) as definicion
from pg_constraint
where conname = 'sgo_eventos_mejora_check';
