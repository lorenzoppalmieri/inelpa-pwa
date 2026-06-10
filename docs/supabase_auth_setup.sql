-- ============================================================
-- INELPA PWA — PASO 1: Perfiles de planta + vinculacion con Supabase Auth
-- Requisito previo: supabase_schema.sql y supabase_realtime_rls.sql ya corridos.
--
-- Convencion de login: el usuario entra con "usuario" (ej. lorenzo) y la app lo
-- convierte internamente al email "usuario@inelpa.local" para Supabase Auth.
--
-- ORDEN DE EJECUCION:
--   PARTE A (abajo): correr YA. Crea sectores + perfiles en la tabla 'usuarios'.
--   --- LUEGO crear las cuentas en Authentication -> Users (ver instrucciones) ---
--   PARTE B (abajo): correr DESPUES de crear las cuentas. Vincula auth_id.
-- Todo es re-ejecutable (usa "on conflict do nothing").
-- ============================================================


-- ============================================================
-- PARTE A — Catalogo de sectores + perfiles de planta
-- ============================================================

-- 1) Los 13 sectores de planta (necesarios para los sectores de cada usuario).
insert into sectores (id, nombre, linea, supervisor, operarios) values
  ('corte_conformado', 'Corte y conformado',                 'general',      'Santiago Yori', 3),
  ('soldadura_dist',   'Soldadura Cuba y Tapa Distribucion',  'distribucion', 'Santiago Yori', 4),
  ('soldadura_rural',  'Soldadura Cuba y Tapa Rural',         'rural',        'Santiago Yori', 2),
  ('lavado_pintura',   'Lavado y Pintura',                    'general',      'Santiago Yori', 2),
  ('bob_dist_at',      'Bobinado Distribucion A.T.',          'distribucion', 'Ulises Kaiser', 7),
  ('bob_dist_bt',      'Bobinado Distribucion B.T.',          'distribucion', 'Ulises Kaiser', 3),
  ('bob_rural_at',     'Bobinado Rural A.T.',                 'rural',        'Ulises Kaiser', 5),
  ('bob_rural_bt',     'Bobinado Rural B.T.',                 'rural',        'Ulises Kaiser', 1),
  ('montaje_pa_dist',  'Montaje PA Distribucion',             'distribucion', 'Omar Bender',   5),
  ('montaje_po_dist',  'Montaje PO Distribucion',             'distribucion', 'Omar Bender',   6),
  ('montaje_pa_rural', 'Montaje PA Rural',                    'rural',        'Omar Bender',   5),
  ('montaje_po_rural', 'Montaje PO Rural',                    'rural',        'Omar Bender',   3),
  ('laboratorio',      'Laboratorio',                         'general',      'Rocio',         2)
on conflict (id) do nothing;

-- 2) Perfiles de planta (sin auth_id todavia; se vincula en la PARTE B).
--    Empezamos con un set chico para la prueba: 2 jefaturas + 3 encargados + 2 operarios.
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Lorenzo Palmieri',       'lorenzo',          'planificador', null,            true),
  ('Rocio (Prog. y Control)','rocio',            'planificador', null,            true),
  ('Ulises Kaiser',          'ulises',           'encargado',    'bobinado_dist', true),
  ('Santiago Yori',          'santiago',         'encargado',    'herreria',      true),
  ('Omar Bender',            'omar',             'encargado',    'montaje_dist',  true),
  ('Carruega Roberto Hector','carruega.roberto', 'operario',     'bobinado_dist', true),
  ('Alegre Hugo Emiliano',   'alegre.hugo',      'operario',     'herreria',      true)
on conflict (usuario) do nothing;

-- 3) Sectores que ve/gestiona cada usuario (N:N). Planificadores ven todo por su
--    rol (no necesitan filas aqui). Cargamos encargados y operarios.
insert into usuario_sectores (usuario_id, sector_id)
select u.id, s.sector_id
from usuarios u
join (values
  ('ulises','bob_dist_at'), ('ulises','bob_dist_bt'), ('ulises','bob_rural_at'), ('ulises','bob_rural_bt'),
  ('santiago','corte_conformado'), ('santiago','soldadura_dist'), ('santiago','soldadura_rural'), ('santiago','lavado_pintura'),
  ('omar','montaje_pa_dist'), ('omar','montaje_po_dist'), ('omar','montaje_pa_rural'), ('omar','montaje_po_rural'),
  ('carruega.roberto','bob_dist_at'), ('carruega.roberto','bob_dist_bt'),
  ('alegre.hugo','corte_conformado'), ('alegre.hugo','soldadura_dist'), ('alegre.hugo','soldadura_rural'), ('alegre.hugo','lavado_pintura')
) as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;


-- ============================================================
-- >>> AHORA crear las cuentas en Authentication -> Users (dashboard) <<<
--     Para CADA usuario de arriba, crear una cuenta con:
--        Email   = usuario + "@inelpa.local"   (ej. lorenzo@inelpa.local)
--        Password= la que elijas
--        [x] Auto Confirm User   (importante: si no, no podra entrar)
--     Minimo para la prueba: lorenzo@inelpa.local y carruega.roberto@inelpa.local
-- ============================================================


-- ============================================================
-- PARTE B — Vincular cada cuenta de Auth con su perfil (por email)
--           Correr DESPUES de crear las cuentas.
-- ============================================================
update usuarios u
set auth_id = a.id
from auth.users a
where lower(a.email) = u.usuario || '@inelpa.local'
  and u.auth_id is distinct from a.id;

-- Verificacion: deberia listar cada usuario con su auth_id (no nulo) para los que creaste.
select usuario, rol, auth_id from usuarios order by rol, usuario;
