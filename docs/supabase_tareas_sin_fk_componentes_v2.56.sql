-- ============================================================
-- v2.56 — LAS TAREAS DEJAN DE DEPENDER DEL CATÁLOGO VIEJO DE COMPONENTES
--
-- Con SAP, cada OF trae su artículo (PARDIS0000122, NUCSTE0000011,
-- TAPIDF0000001...) y la tarea guarda ese código en `componente_codigo`.
-- Muchos de esos códigos NO existen en la tabla `componentes` (el catálogo de
-- junio, que va a desaparecer). Con la clave foránea actual, el alta de la
-- tarea falla, y como la cola offline trata una violación de clave foránea
-- como TRANSITORIA (el padre "llega después"), la tarea queda reintentando
-- para siempre y nunca sube.
--
-- Se suelta SOLO esa relación. El código queda como texto: las 2.036 tareas
-- históricas conservan su valor, no se toca ningún dato. Es el primer paso
-- acordado para poder retirar el catálogo viejo más adelante.
--
-- Idempotente: se puede correr dos veces.
--
-- ORDEN: correr ANTES de publicar el código v2.56.
--   1) INELPA-TEST (junto con docs/supabase_tareas_cantidad_v2.55.sql, que
--      todavía no se corrió ahí) -> push a staging
--   2) PRODUCCIÓN -> recién ahí merge a main
-- ============================================================

-- DIAGNÓSTICO (opcional, antes de correr): la relación que se va a soltar.
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.tareas'::regclass and contype = 'f'
--   and pg_get_constraintdef(oid) ilike '%componentes%';

do $$
declare r record;
begin
  -- Por nombre real (no se asume `tareas_componente_codigo_fkey`): cualquier
  -- FK de tareas que apunte a componentes.
  for r in
    select conname from pg_constraint
    where conrelid = 'public.tareas'::regclass and contype = 'f'
      and confrelid = 'public.componentes'::regclass
  loop
    execute format('alter table public.tareas drop constraint %I', r.conname);
    raise notice 'Se soltó %', r.conname;
  end loop;
end $$;

comment on column tareas.componente_codigo is
  'v2.56: ItemCode del semielaborado (SAP). Texto libre, sin FK al catálogo viejo `componentes`.';

-- ------------------------------------------------------------
-- VERIFICACIÓN: tiene que devolver 0 filas.
-- ------------------------------------------------------------
-- select conname from pg_constraint
-- where conrelid = 'public.tareas'::regclass and contype = 'f'
--   and confrelid = 'public.componentes'::regclass;
