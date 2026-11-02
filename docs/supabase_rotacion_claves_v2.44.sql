-- ============================================================
-- v2.44 — ROTACIÓN DE LA CLAVE service_role DE PRODUCCIÓN
--
-- La service_role de producción quedó visible en capturas de pantalla. Antes de
-- apagar las claves viejas hay que sacarla de TODO lo que la usa. Adentro de la
-- base hay un solo lugar: el cron nocturno `purgar-fotos-despacho`, que la tiene
-- ESCRITA en su definición (header Authorization: Bearer eyJ...).
--
-- La función se despliega con --no-verify-jwt y no revisa ningún token, así
-- que el cron no necesita mandar clave: se reprograma SIN ella. Una clave
-- menos guardada en texto plano.
--
-- Correr SOLO en PRODUCCIÓN (ref rpvwlgbwcwjllqejwzwm). En INELPA-TEST el cron
-- se apagó al armar el entorno (docs/test_post_clon_v2.42.sql).
-- Re-ejecutable.
-- ============================================================

-- ------------------------------------------------------------
-- 0) DIAGNÓSTICO (solo lectura). ¿Qué jobs tienen una clave adentro?
--    Esperado ANTES: el job purgar-fotos-despacho con tiene_clave = true.
-- ------------------------------------------------------------
-- select jobid, jobname, schedule, active,
--        (command ilike '%Bearer eyJ%' or command ilike '%sb_secret_%') as tiene_clave
-- from cron.job
-- order by jobid;

-- ------------------------------------------------------------
-- 1) REPROGRAMAR la purga sin clave (mismo horario: 03:00 UTC).
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purgar-fotos-despacho') then
    perform cron.unschedule('purgar-fotos-despacho');
  end if;
end $$;

select cron.schedule(
  'purgar-fotos-despacho',
  '0 3 * * *',
  $job$
  select net.http_post(
    url     := 'https://rpvwlgbwcwjllqejwzwm.supabase.co/functions/v1/purgar-fotos-despacho',
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  $job$
);

-- ============================================================
-- 2) VERIFICACIÓN — tiene que dar el job con tiene_clave = false.
-- ============================================================
-- select jobid, jobname, schedule, active,
--        (command ilike '%Bearer eyJ%' or command ilike '%sb_secret_%') as tiene_clave
-- from cron.job
-- where jobname = 'purgar-fotos-despacho';
--
-- Y al día siguiente, que la corrida de las 03:00 UTC haya salido bien:
-- select status, return_message, start_time
-- from cron.job_run_details
-- where jobid = (select jobid from cron.job where jobname = 'purgar-fotos-despacho')
-- order by start_time desc limit 3;
