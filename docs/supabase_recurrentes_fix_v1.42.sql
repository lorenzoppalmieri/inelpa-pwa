-- ============================================================
-- v1.42 — Fix del "respawn" de tareas recurrentes (logística / despacho)
--
-- Síntoma: al finalizar la instancia del día de una tarea recurrente, volvía a
-- aparecer como 'pendiente' para el MISMO día en vez de quedar en Finalizadas.
--
-- Causa: el motor de recurrencia corría en el cliente antes de que Dexie
-- resolviera la lista de tareas. Con la lista vacía creía que la instancia de
-- hoy no existía, la volvía a crear con el mismo id determinístico
-- (`${plantilla_id}_${YYYY-MM-DD}`) y el UPSERT PISABA la fila ya finalizada,
-- devolviéndola a 'pendiente' — y sincronizando ese pisotón al resto de tablets.
--
-- Fix de cliente: guardas de carga + no sobrescribir ids existentes.
-- Fix de datos: este candado `ultima_generacion` en la plantilla, que corta la
-- generación aunque la lista de instancias llegue incompleta.
--
-- Idempotente: se puede correr más de una vez sin romper nada.
-- ============================================================

-- 1) Candado de generación por plantilla ---------------------------------
alter table public.plantillas_recurrentes
  add column if not exists ultima_generacion text;

comment on column public.plantillas_recurrentes.ultima_generacion is
  'YYYY-MM-DD del último día para el que esta plantilla ya generó su instancia. Si >= hoy, el motor no genera nada.';

-- OJO con los tipos: fecha_instancia es TEXT ('YYYY-MM-DD', v1.39) y
-- fecha_programada es DATE (v1.23). Todo el archivo normaliza a texto ISO con
-- to_char(...) — un coalesce directo entre ambas falla (42804).

-- 2) Sellar las plantillas que YA tienen instancia generada ---------------
-- Evita que, al desplegar, el motor genere de nuevo para un día ya cubierto.
update public.plantillas_recurrentes p
set ultima_generacion = sub.ultima
from (
  select plantilla_id,
         max(coalesce(fecha_instancia, to_char(fecha_programada, 'YYYY-MM-DD'))) as ultima
  from public.tareas_logistica
  where plantilla_id is not null
  group by plantilla_id
) sub
where p.id = sub.plantilla_id
  and (p.ultima_generacion is null or p.ultima_generacion < sub.ultima);

-- 3) Limpieza de duplicados históricos ------------------------------------
-- Si el bug llegó a crear más de una instancia de la misma plantilla para el
-- mismo día, se conserva la más avanzada (finalizada > en curso > pendiente) y
-- se borran las demás. Revisá el SELECT antes de correr el DELETE.

-- SELECT de control (mirar qué se va a borrar):
-- select id, plantilla_id,
--        coalesce(fecha_instancia, to_char(fecha_programada, 'YYYY-MM-DD')) as dia,
--        estado, creada_en
-- from public.tareas_logistica
-- where plantilla_id is not null
-- order by plantilla_id, dia, creada_en;

with ranked as (
  select id,
         row_number() over (
           partition by plantilla_id, coalesce(fecha_instancia, to_char(fecha_programada, 'YYYY-MM-DD'))
           order by case estado
                      when 'finalizada' then 0
                      when 'en_curso'   then 1
                      when 'pausada'    then 2
                      when 'bloqueada'  then 3
                      else 4
                    end,
                    creada_en asc
         ) as rn
  from public.tareas_logistica
  where plantilla_id is not null
)
delete from public.tareas_logistica t
using ranked r
where t.id = r.id and r.rn > 1;

-- 4) Rellenar fecha_instancia en instancias viejas -------------------------
-- Alguna instancia de v1.39 puede tener plantilla_id pero no fecha_instancia.
-- Se completa desde fecha_programada para que el índice de abajo las cubra.
update public.tareas_logistica
set fecha_instancia = to_char(fecha_programada, 'YYYY-MM-DD')
where plantilla_id is not null
  and fecha_instancia is null
  and fecha_programada is not null;

-- 5) Candado duro en la base ----------------------------------------------
-- Una sola instancia por (plantilla, día). A partir de acá, aunque quede una
-- tablet con la versión vieja, Postgres rechaza el duplicado.
-- Se indexa fecha_instancia (text) a secas: un coalesce con fecha_programada
-- (date) exigiría to_char, que es STABLE y Postgres no acepta en un índice.
create unique index if not exists ux_tareas_logistica_plantilla_dia
  on public.tareas_logistica (plantilla_id, fecha_instancia)
  where plantilla_id is not null and fecha_instancia is not null;
