-- ============================================================
-- v2.38 — PLANOS (PDF) DE CADA SEMIELABORADO
--
-- Objetivo: que el operario vea el plano del semielaborado ADENTRO de su tarea,
-- sin descargar nada ni salir de la app.
--
-- ARQUITECTURA
--  - El PDF va a Supabase Storage, bucket PRIVADO 'planos'. En la tabla queda
--    solo la RUTA. Nunca el binario en una columna: cada tablet espeja todas
--    las tablas y se bajaría cientos de planos en cada sincronización.
--  - Tabla aparte `planos` (no una columna en `componentes`) por tres motivos:
--      1) REVISIONES: un plano pasa de Rev A a Rev B. El operario ve SIEMPRE la
--         vigente y el historial queda (control de documentos ISO).
--      2) La tabla `componentes` la va a reescribir la sincronización con SAP;
--         un dato propio de la PWA ahí adentro se podría perder.
--      3) Un mismo PDF puede servir para varios semielaborados (ej. variante
--         cobre y aluminio): se sube UNA vez y se vincula a cada código.
--  - La tarea ya sabe su semielaborado (`componente_codigo`), así que el plano
--    se resuelve solo: no hay que tocar las tareas.
--  - Esta tabla NO se espeja en las tablets: el visor la consulta en línea al
--    abrir la tarea (decisión: los planos se ven solo con conexión).
--
-- Sin FK a `componentes` A PROPÓSITO: si la sincronización con SAP borra y
-- recrea códigos, una FK la haría fallar o (con cascade) borraría los planos.
-- La consulta 5) lista planos cuyo código ya no existe en el catálogo.
--
-- Quién sube: solo Super Admin (lorenzo, direccion), igual que en la app
-- (SUPER_ADMINS en src/auth/roles.ts). La carga masiva usa el script
-- scripts/cargar_planos.mjs con la service_role, que no pasa por RLS.
-- Quién lee: cualquier usuario logueado.
--
-- Idempotente. Correr ANTES del push.
-- ============================================================

-- ============================================================
-- 1) HELPER: ¿el usuario logueado es Super Admin?
--    Misma lista que SUPER_ADMINS en src/auth/roles.ts. Si se agrega alguien
--    allá, hay que agregarlo acá también.
-- ============================================================
create or replace function app_es_super_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuarios u
    where u.auth_id = auth.uid() and u.activo
      and lower(trim(u.usuario)) in ('lorenzo', 'direccion')
  )
$$;

-- ============================================================
-- 2) TABLA
-- ============================================================
create table if not exists planos (
  id                 uuid primary key default gen_random_uuid(),
  componente_codigo  text not null,          -- = componentes.codigo (ItemCode SAP)
  revision           text,                   -- 'A', 'B', '02'... (puede venir vacía)
  ruta               text not null,          -- ruta dentro del bucket 'planos'
  nombre_archivo     text,                   -- nombre original, para mostrarlo
  vigente            boolean not null default true,
  subido_por         text,
  subido_en          timestamptz not null default now(),
  observacion        text
);

-- Un solo plano VIGENTE por semielaborado. Las revisiones viejas quedan con
-- vigente = false (historial).
create unique index if not exists planos_un_vigente_por_componente
  on planos (componente_codigo) where vigente;

create index if not exists planos_por_componente on planos (componente_codigo);
create index if not exists planos_por_ruta on planos (ruta);

-- ============================================================
-- 3) RLS DE LA TABLA
-- ============================================================
alter table planos enable row level security;

drop policy if exists planos_leer on planos;
create policy planos_leer on planos
  for select to authenticated
  using (true);

drop policy if exists planos_alta on planos;
create policy planos_alta on planos
  for insert to authenticated
  with check (app_es_super_admin());

drop policy if exists planos_modificar on planos;
create policy planos_modificar on planos
  for update to authenticated
  using (app_es_super_admin())
  with check (app_es_super_admin());

-- Sin política de DELETE a propósito: un plano es documentación de calidad.
-- Se reemplaza por una revisión nueva (la vieja queda con vigente = false).

-- ============================================================
-- 4) BUCKET PRIVADO + POLÍTICAS DE STORAGE
--    public = false -> no hay URL pública; solo link firmado y temporal.
--    Límite 25 MB por archivo (los planos pesan más que un protocolo) y solo PDF.
-- ============================================================
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

-- ============================================================
-- 5) VERIFICACIÓN
-- ============================================================
-- Bucket creado y privado:
-- select id, public, file_size_limit from storage.buckets where id = 'planos';
--
-- Tú sos Super Admin (debe dar true si lo corrés logueado; en el SQL Editor da
-- false porque ahí no hay usuario de la app, es normal):
-- select app_es_super_admin();
--
-- Cobertura: cuántos semielaborados activos tienen plano vigente.
-- select count(*) filter (where p.id is not null) as con_plano,
--        count(*) filter (where p.id is null)     as sin_plano
-- from componentes c
-- left join planos p on p.componente_codigo = c.codigo and p.vigente
-- where c.activo;
--
-- Planos vinculados a un código que no existe en el catálogo:
-- select p.componente_codigo, p.nombre_archivo
-- from planos p left join componentes c on c.codigo = p.componente_codigo
-- where p.vigente and c.codigo is null;
