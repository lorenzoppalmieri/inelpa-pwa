-- ============================================================
-- v1.47 — PROTOCOLO DE ENSAYO (PDF) del laboratorio
--
-- ARQUITECTURA DE ALMACENAMIENTO
-- El PDF NO se guarda en la base de datos. Va a Supabase Storage (almacenamiento
-- de objetos) en un bucket PRIVADO llamado 'protocolos'. En las tablas solo se
-- guarda la RUTA del archivo (un texto de ~40 caracteres).
--
-- ¿Por qué? La PWA es offline-first: cada tablet espeja TODAS las filas de cada
-- tabla en su base local (Dexie). Si el PDF viviera en una columna, cada tablet
-- de planta se descargaría los miles de protocolos en cada sincronización.
-- Guardando la ruta, la tablet sincroniza texto y el PDF se baja solo cuando
-- alguien lo abre, con un link firmado que vence a los 5 minutos.
--
-- Volumen esperado: ~2000 PDF/año de ~200 KB = ~400 MB/año. El plan Pro incluye
-- 100 GB de archivos, así que hay margen para décadas.
--
-- Idempotente.
-- ============================================================

-- ============================================================
-- 1) COLUMNAS (solo la ruta + metadatos, nunca el binario)
-- ============================================================
alter table laboratorio add column if not exists protocolo_path       text;
alter table laboratorio add column if not exists protocolo_nombre     text;
alter table laboratorio add column if not exists protocolo_subido_en  timestamptz;

-- El despacho hereda la ruta para que Melany exporte sin entrar a laboratorio.
alter table despachos   add column if not exists protocolo_path   text;
alter table despachos   add column if not exists protocolo_nombre text;

-- ============================================================
-- 2) BUCKET PRIVADO
--    public = false  -> no hay URL pública; se accede solo con link firmado.
--    Límite de 10 MB por archivo y solo PDF (defensa del lado del servidor,
--    además de la validación que ya hace la app).
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('protocolos', 'protocolos', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf'];

-- ============================================================
-- 3) POLÍTICAS DE ACCESO (RLS sobre storage.objects)
--    Cualquier usuario logueado de la planta puede subir y leer los protocolos.
--    Nadie anónimo accede. El borrado queda deshabilitado a propósito: un
--    protocolo es documentación de calidad, se REEMPLAZA (upsert), no se borra.
-- ============================================================
drop policy if exists protocolos_leer on storage.objects;
create policy protocolos_leer on storage.objects
  for select to authenticated
  using (bucket_id = 'protocolos');

drop policy if exists protocolos_subir on storage.objects;
create policy protocolos_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'protocolos');

-- Reemplazo (la app sube con upsert: true cuando corrigen el archivo).
drop policy if exists protocolos_actualizar on storage.objects;
create policy protocolos_actualizar on storage.objects
  for update to authenticated
  using (bucket_id = 'protocolos')
  with check (bucket_id = 'protocolos');

-- ============================================================
-- 4) VERIFICACIÓN
-- ============================================================
-- select id, public, file_size_limit from storage.buckets where id = 'protocolos';
-- select count(*) from laboratorio where protocolo_path is not null;
