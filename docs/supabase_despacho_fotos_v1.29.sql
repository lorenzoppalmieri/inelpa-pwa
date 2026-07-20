-- ============================================================
-- v1.29 — Despacho Fase 4: fotos por transformador (Supabase Storage)
--
-- 1) Columna 'fotos' (URLs públicas) en la tabla despachos.
-- 2) Bucket de Storage 'despacho-fotos' (público de lectura) + políticas para
--    que usuarios autenticados suban/borren.
--
-- Idempotente.
-- ============================================================

-- 1) Columna de fotos en despachos.
alter table despachos add column if not exists fotos jsonb;

-- 2) Bucket de Storage (público para poder mostrar las imágenes con URL directa).
insert into storage.buckets (id, name, public)
values ('despacho-fotos', 'despacho-fotos', true)
on conflict (id) do nothing;

-- 3) Políticas de acceso al bucket.
--    Lectura pública (para <img src=...>) y escritura/borrado sólo autenticados.
drop policy if exists "despacho_fotos_read"   on storage.objects;
drop policy if exists "despacho_fotos_write"  on storage.objects;
drop policy if exists "despacho_fotos_delete" on storage.objects;

create policy "despacho_fotos_read" on storage.objects
  for select using (bucket_id = 'despacho-fotos');

create policy "despacho_fotos_write" on storage.objects
  for insert with check (bucket_id = 'despacho-fotos' and auth.role() = 'authenticated');

create policy "despacho_fotos_delete" on storage.objects
  for delete using (bucket_id = 'despacho-fotos' and auth.role() = 'authenticated');
