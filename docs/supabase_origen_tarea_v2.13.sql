-- ============================================================
-- v2.13 — ORIGEN DE UNA TAREA (arregla el botón "Generar Montaje PO")
--
-- EL BUG. El puente PA -> PO le ponía a la tarea nueva un id derivado del de la
-- parte activa: `po_<uuid de la PA>`. Pero `tareas.id` es UUID, y
-- `po_550e8400-...` NO es un UUID válido: Supabase lo rechazaba.
--
-- Como Dexie (la base local de la tablet) sí lo aceptaba, la tarea aparecía y el
-- cartel decía "generada"; después la cola de sync rebotaba y, al recargar los
-- datos de la nube, la tarea desaparecía. Eso es lo que reportó Luis:
-- "pone que se generó pero después no lo hace".
--
-- LA CORRECCIÓN. La PO pasa a tener un UUID normal y el vínculo con la parte
-- activa se guarda en esta columna. Además es mejor dato: antes el origen estaba
-- escondido dentro del id y no se podía consultar.
--
-- Correr entero. Es aditivo e idempotente: no toca ninguna fila existente.
-- ============================================================

alter table public.tareas
  add column if not exists origen_tarea_id uuid;

-- Si se borra la PA, la PO NO se borra: ya es trabajo con vida propia. Solo
-- pierde el vínculo.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'tareas_origen_tarea_id_fkey' and table_name = 'tareas'
  ) then
    alter table public.tareas
      add constraint tareas_origen_tarea_id_fkey
      foreign key (origen_tarea_id) references public.tareas(id) on delete set null;
  end if;
end $$;

-- "¿Esta PA ya tiene su PO?" es la consulta que decide si se muestra el botón.
create index if not exists tareas_origen_idx on public.tareas (origen_tarea_id);

-- ------------------------------------------------------------
-- LIMPIEZA — tareas PO que quedaron a medias mientras el bug estuvo vivo.
-- No deberían existir en Supabase (el servidor las rechazaba), pero pueden
-- haber quedado en el IndexedDB de alguna tablet. Esta consulta las busca:
-- si devuelve filas, avisar, porque significa que ALGUNAS sí entraron.
-- ------------------------------------------------------------
select id, modelo, nro_transformador, sector_id, estado
from public.tareas
where id::text like 'po\_%';

-- ------------------------------------------------------------
-- VERIFICACION
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'tareas'
       and column_name = 'origen_tarea_id')                              as columna_creada,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'tareas_origen_idx')    as indice_creado,
  (select count(*) from public.tareas where origen_tarea_id is not null) as pos_vinculadas;
