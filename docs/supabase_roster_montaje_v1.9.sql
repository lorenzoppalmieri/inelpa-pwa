-- ============================================================
-- ROSTER v1.9 — Cuentas GRUPALES de Montaje (correr en Supabase -> SQL Editor)
-- En Montaje se trabaja por equipo/linea, no por puesto: una cuenta por seccion.
-- Idempotente (on conflict do nothing). Ya esta incluido en supabase_roster_seed.sql
-- para instalaciones nuevas; este archivo es para una base YA desplegada.
--
-- DESPUES de correr esto: crear las cuentas de Auth con PIN 123456 (ver al final).
-- ============================================================

-- 1) Perfiles (rol operario).
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Equipo Montaje PA Distribucion', 'montaje_linea1_pad', 'operario', 'montaje_dist',  true),
  ('Equipo Montaje PO Distribucion', 'montaje_linea1_pod', 'operario', 'montaje_dist',  true),
  ('Equipo Montaje PA Rural',        'montaje_linea2_par', 'operario', 'montaje_rural', true),
  ('Equipo Montaje PO Rural',        'montaje_linea2_por', 'operario', 'montaje_rural', true)
on conflict (usuario) do nothing;

-- 2) Cada cuenta grupal -> su linea/sector (para ver su cola y registrar demoras).
insert into usuario_sectores (usuario_id, sector_id)
select u.id, s.sector_id
from usuarios u
join (values
  ('montaje_linea1_pad','montaje_pa_dist'),
  ('montaje_linea1_pod','montaje_po_dist'),
  ('montaje_linea2_par','montaje_pa_rural'),
  ('montaje_linea2_por','montaje_po_rural')
) as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;

-- Verificacion
select u.usuario, u.rol, array_agg(us.sector_id) as sectores
from usuarios u left join usuario_sectores us on us.usuario_id = u.id
where u.usuario like 'montaje_linea%'
group by u.usuario, u.rol order by u.usuario;

-- ============================================================
-- >>> CREAR LAS CUENTAS DE ACCESO (PIN 123456) <<<
-- El script scripts/crear_cuentas_auth.mjs es generico: lee la tabla 'usuarios'
-- y crea las cuentas que falten. NO necesita modificarse. Corrercon PIN 123456:
--   (PowerShell, desde la carpeta inelpa-pwa)
--   $env:SUPABASE_URL="https://TU-ID.supabase.co"
--   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."
--   $env:CLAVE_INICIAL="123456"
--   node scripts/crear_cuentas_auth.mjs
-- Crea montaje_linea1_pad@inelpa.local ... con PIN 123456 y vincula auth_id.
-- (Solo asigna 123456 a las cuentas NUEVAS; no cambia las existentes.)
-- ============================================================
