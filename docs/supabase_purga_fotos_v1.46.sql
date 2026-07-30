-- ============================================================
-- v1.46 — Limpieza automática de fotos de despacho (control de storage)
--
-- Las fotos del embalaje sirven mientras el trafo está en juego: si el cliente
-- reclama un golpe o un faltante, se miran. Pasados 3 meses desde la ENTREGA
-- nadie las vuelve a abrir, pero se siguen pagando todos los meses.
--
-- Política: a los 90 días de entregado, las fotos se borran del bucket y en el
-- registro queda `fotos_purgadas` = { fecha, cantidad }, para no confundir un
-- borrado deliberado con un embalaje que nunca se fotografió.
--
-- Este archivo tiene 3 partes. La 1 es obligatoria; las otras dos solo si querés
-- que la limpieza corra sola en el servidor (si no, corre en la app).
--
-- Idempotente: se puede correr más de una vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1) OBLIGATORIO — columna de la marca de purga
-- ------------------------------------------------------------
alter table public.despachos
  add column if not exists fotos_purgadas jsonb;

comment on column public.despachos.fotos_purgadas is
  'Constancia de la limpieza automática de fotos: { fecha, cantidad }. NULL = nunca se purgó.';

-- Índice para que el barrido no recorra toda la tabla.
create index if not exists idx_despacho_purga_fotos
  on public.despachos (entregada_en)
  where estado = 'entregado' and fotos is not null;

-- ------------------------------------------------------------
-- 2) OBLIGATORIO si borra la APP — permiso de delete en el bucket
-- ------------------------------------------------------------
-- Sin esta policy, storage.remove() desde el navegador devuelve 401 y las fotos
-- quedan en la nube aunque el registro diga que se limpiaron. (El motor de la
-- app está hecho para NO marcar cuando el borrado falla, así que en ese caso
-- reintentaría todos los días sin borrar nunca: revisá esto si no baja el uso.)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'despacho_fotos_delete_autenticados'
  ) then
    create policy despacho_fotos_delete_autenticados
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'despacho-fotos');
  end if;
end $$;

-- ------------------------------------------------------------
-- 3) OPCIONAL — cron nocturno que llama a la Edge Function
-- ------------------------------------------------------------
-- Requiere haber desplegado supabase/functions/purgar-fotos-despacho.
-- Ventaja sobre el barrido de la app: no depende de que nadie la abra.
--
-- Reemplazá <TU_PROJECT_REF> y <TU_SERVICE_ROLE_KEY> antes de correr esto.
-- Ojo: la service_role key queda escrita en la definición del job. Si preferís
-- no dejarla ahí, guardala en Vault y leela con vault.decrypted_secrets.

-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'purgar-fotos-despacho',
--   '0 3 * * *',                       -- todos los días a las 03:00 UTC
--   $$
--   select net.http_post(
--     url     := 'https://<TU_PROJECT_REF>.supabase.co/functions/v1/purgar-fotos-despacho',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <TU_SERVICE_ROLE_KEY>"}'::jsonb
--   );
--   $$
-- );

-- Para ver los jobs programados:
-- select jobid, jobname, schedule, active from cron.job;
-- Para borrar el job:
-- select cron.unschedule('purgar-fotos-despacho');

-- ------------------------------------------------------------
-- Controles
-- ------------------------------------------------------------
-- ¿Cuánto hay para purgar hoy?
-- select count(*) as registros, coalesce(sum(array_length(fotos, 1)), 0) as fotos
-- from public.despachos
-- where estado = 'entregado'
--   and entregada_en < now() - interval '90 days'
--   and fotos is not null;

-- ¿Qué se purgó ya?
-- select nro_serie, cliente, entregada_en::date, fotos_purgadas
-- from public.despachos
-- where fotos_purgadas is not null
-- order by (fotos_purgadas->>'fecha') desc;
