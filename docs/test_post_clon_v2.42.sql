-- ============================================================
-- ENTORNO DE TEST · primer control despues de clonar             (v2.42)
--
-- >>> SOLO EN EL PROYECTO DE TEST. <<<
-- Antes de cada Run, mira arriba a la izquierda del dashboard que el proyecto
-- abierto sea INELPA-TEST. Por dentro, el clon y produccion son identicos:
-- la base no tiene forma de saber en cual estas.
--
-- POR QUE
-- "Restore to a new project" es una copia binaria: trae tambien los trabajos
-- programados de pg_cron, y arrancan a correr apenas termina el clon. En
-- produccion hay (o puede haber) dos:
--   * purgar-fotos-despacho: llama por HTTP a la Edge Function de PRODUCCION,
--     con la service_role key de PRODUCCION escrita en el comando. Desde test
--     estaria disparando la purga de produccion, y ademas deja esa clave
--     guardada en la base de test.
--   * sgo-5s-lunes: genera los controles 5S de la semana. En test no hace
--     dano, pero llena la base de prueba de tareas que nadie va a hacer.
-- Test tiene que ser pasivo: no dispara nada solo.
--
-- COMO USARLO
--   1. Run tal cual: solo lee. Devuelve una grilla con lo que hay.
--   2. Si aparecen trabajos de cron, descomentar el bloque B y correrlo.
--   3. Si aparecen triggers que llaman por HTTP, avisame antes de tocar nada.
-- ============================================================


-- ------------------------------------------------------------
-- A) DIAGNOSTICO (solo lectura)
-- ------------------------------------------------------------
select 'cron' as que, jobname as nombre,
       schedule || ' · ' || left(regexp_replace(command, 'Bearer\s+\S+', 'Bearer <oculto>'), 90) as detalle
from cron.job

union all
-- Triggers propios que hacen llamadas HTTP (webhooks de base, pg_net)
select 'trigger http', tgname, tgrelid::regclass::text || ' -> ' || tgfoid::regproc::text
from pg_trigger
where not tgisinternal
  and (tgfoid::regproc::text ilike '%http%' or tgfoid::regproc::text ilike 'supabase_functions.%')

union all
-- Tablas publicadas para Realtime (la app las necesita para refrescar sola)
select 'realtime', tablename, schemaname
from pg_publication_tables where pubname = 'supabase_realtime'

union all
select 'usuarios auth', count(*)::text, 'tienen que ser los mismos que en produccion'
from auth.users

order by 1, 2;

-- Que esperar:
--   * realtime: tienen que aparecer, al menos, tareas, paradas, ordenes,
--     semielaborados, maquinas y usuarios. Si no aparece ninguna, correr
--     docs/supabase_realtime_rls.sql en test.
--   * usuarios auth: el mismo numero que en produccion (el clon trae los
--     usuarios con sus contrasenas: cada uno entra a test con su clave).


-- ------------------------------------------------------------
-- B) DESACTIVAR LOS TRABAJOS PROGRAMADOS EN TEST
--    Descomentar y correr SOLO si estas en INELPA-TEST.
-- ------------------------------------------------------------
-- select cron.unschedule(jobid) from cron.job;
-- select count(*) as trabajos_que_quedan from cron.job;   -- tiene que dar 0
