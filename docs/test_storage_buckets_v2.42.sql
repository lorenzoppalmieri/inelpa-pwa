-- ============================================================
-- ENTORNO DE TEST · buckets y permisos de Storage                (v2.42)
--
-- >>> CORRER SOLO EN EL PROYECTO DE TEST, despues de clonarlo. <<<
--
-- POR QUE
-- "Restore to a new project" copia la base de datos pero NO los buckets de
-- Storage ni sus archivos (ver docs/ENTORNO_TEST.md, paso 4). Sin esto, en
-- test no se pueden subir fotos de despacho, protocolos, planos, evidencias
-- SGO ni fotos de mantenimiento.
--
-- QUE ES
-- Las mismas sentencias de Storage que ya se corrieron en produccion, copiadas
-- TEXTUALMENTE de sus archivos originales, en orden de version (la v2.39
-- redefine dos politicas de planos de la v2.38, asi que el orden importa).
-- 38 sentencias, 15 politicas, 5 buckets. Todas idempotentes
-- (on conflict / drop policy if exists): se puede correr dos veces.
--
-- LO QUE NO HACE: copiar archivos. Las fotos y PDF historicos siguen solo en
-- produccion; en test, abrir uno viejo da "no encontrado". Lo nuevo que se
-- suba en test funciona normal.
-- ============================================================


-- ---------- de docs/supabase_despacho_fotos_v1.29.sql ----------
insert into storage.buckets (id, name, public)
values ('despacho-fotos', 'despacho-fotos', true)
on conflict (id) do nothing;

drop policy if exists "despacho_fotos_read"   on storage.objects;

drop policy if exists "despacho_fotos_write"  on storage.objects;

drop policy if exists "despacho_fotos_delete" on storage.objects;

create policy "despacho_fotos_read" on storage.objects
  for select using (bucket_id = 'despacho-fotos');

create policy "despacho_fotos_write" on storage.objects
  for insert with check (bucket_id = 'despacho-fotos' and auth.role() = 'authenticated');

create policy "despacho_fotos_delete" on storage.objects
  for delete using (bucket_id = 'despacho-fotos' and auth.role() = 'authenticated');


-- ---------- de docs/supabase_purga_fotos_v1.46.sql ----------
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


-- ---------- de docs/supabase_protocolos_v1.47.sql ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('protocolos', 'protocolos', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf'];

drop policy if exists protocolos_leer on storage.objects;

create policy protocolos_leer on storage.objects
  for select to authenticated
  using (bucket_id = 'protocolos');

drop policy if exists protocolos_subir on storage.objects;

create policy protocolos_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'protocolos');

drop policy if exists protocolos_actualizar on storage.objects;

create policy protocolos_actualizar on storage.objects
  for update to authenticated
  using (bucket_id = 'protocolos')
  with check (bucket_id = 'protocolos');


-- ---------- de docs/supabase_mantenimiento_herreria_v1.66.sql ----------
insert into storage.buckets (id, name, public) values ('mantenimiento','mantenimiento', false)
  on conflict (id) do nothing;

drop policy if exists mant_fotos_read   on storage.objects;

drop policy if exists mant_fotos_write  on storage.objects;

create policy mant_fotos_read on storage.objects for select to authenticated
  using (bucket_id = 'mantenimiento');

create policy mant_fotos_write on storage.objects for all to authenticated
  using (bucket_id = 'mantenimiento' and app_es_admin_mant())
  with check (bucket_id = 'mantenimiento' and app_es_admin_mant());


-- ---------- de docs/supabase_sgo_controles_campo_v1.84.sql ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sgo-evidencias', 'sgo-evidencias', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists sgo_evidencias_select on storage.objects;

drop policy if exists sgo_evidencias_insert on storage.objects;

create policy sgo_evidencias_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sgo-evidencias'
    and exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador'))
  );

create policy sgo_evidencias_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sgo-evidencias'
    and exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.activo and u.rol::text in ('sgo','planificador'))
  );


-- ---------- de docs/supabase_planos_v2.38.sql ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('planos', 'planos', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 26214400,
      allowed_mime_types = array['application/pdf'];

drop policy if exists planos_storage_leer on storage.objects;

create policy planos_storage_leer on storage.objects
  for select to authenticated
  using (bucket_id = 'planos');

drop policy if exists planos_storage_subir on storage.objects;

create policy planos_storage_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'planos' and app_es_super_admin());

drop policy if exists planos_storage_actualizar on storage.objects;

create policy planos_storage_actualizar on storage.objects
  for update to authenticated
  using (bucket_id = 'planos' and app_es_super_admin())
  with check (bucket_id = 'planos' and app_es_super_admin());


-- ---------- de docs/supabase_rol_diseno_v2.39.sql ----------
drop policy if exists planos_storage_subir on storage.objects;

create policy planos_storage_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'planos' and app_puede_cargar_planos());

drop policy if exists planos_storage_actualizar on storage.objects;

create policy planos_storage_actualizar on storage.objects
  for update to authenticated
  using (bucket_id = 'planos' and app_puede_cargar_planos())
  with check (bucket_id = 'planos' and app_puede_cargar_planos());

drop policy if exists sgo_evidencias_select_diseno on storage.objects;

create policy sgo_evidencias_select_diseno on storage.objects
  for select to authenticated
  using (bucket_id = 'sgo-evidencias' and app_rol() = 'diseno');


-- ------------------------------------------------------------
-- VERIFICACION (debe listar los 5 buckets y 15 politicas)
-- ------------------------------------------------------------
select 'bucket' as tipo, id as nombre, public::text as detalle from storage.buckets
where id in ('despacho-fotos','protocolos','mantenimiento','sgo-evidencias','planos')
union all
select 'politica', policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('despacho_fotos_delete', 'despacho_fotos_delete_autenticados', 'despacho_fotos_read', 'despacho_fotos_write', 'mant_fotos_read', 'mant_fotos_write', 'planos_storage_actualizar', 'planos_storage_leer', 'planos_storage_subir', 'protocolos_actualizar', 'protocolos_leer', 'protocolos_subir', 'sgo_evidencias_insert', 'sgo_evidencias_select', 'sgo_evidencias_select_diseno')
order by 1, 2;
