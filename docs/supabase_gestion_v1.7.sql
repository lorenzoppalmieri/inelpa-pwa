-- ============================================================
-- INELPA PWA — Altas de GESTION (encargados + planificadores) v1.7
-- Crea/actualiza los perfiles y deja todo listo para el login.
-- Idempotente: re-ejecutable (on conflict do update).
--
-- Usuarios (se guardan en MINUSCULA; en el login da igual mayus/minus):
--   ENCARGADOS:
--     bender.omar     (Omar Bender)      -> Montaje
--     kaiser.ulises   (Ulises Kaiser)    -> Bobinado
--     yori.santiago   (Santiago Yori)    -> Corte/Soldadura/Pintura
--   PLANIFICADORES (ven todos los sectores por su rol):
--     alassiato.lucas (Lucas Alassiato)
--     zurvera.rocio   (Rocio Zurvera)
--
-- Contrasena: 123456  -> se asigna al crear la cuenta de Auth (ver el final).
-- ============================================================

-- 1) Perfiles (rol + grupo). El grupo de los encargados define el pool de
--    colaboradores; los planificadores no llevan grupo.
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Omar Bender',      'bender.omar',     'encargado',    'montaje_dist',  true),
  ('Ulises Kaiser',    'kaiser.ulises',   'encargado',    'bobinado_dist', true),
  ('Santiago Yori',    'yori.santiago',   'encargado',    'herreria',      true),
  ('Lucas Alassiato',  'alassiato.lucas', 'planificador', null,            true),
  ('Rocio Zurvera',    'zurvera.rocio',   'planificador', null,            true)
on conflict (usuario) do update set
  nombre = excluded.nombre,
  rol = excluded.rol,
  grupo_nomina = excluded.grupo_nomina,
  activo = true;

-- 2) Sectores que gestiona cada ENCARGADO (N:N). Los planificadores ven todo.
insert into usuario_sectores (usuario_id, sector_id)
select u.id, s.sector_id
from usuarios u
join (values
  ('kaiser.ulises','bob_dist_at'), ('kaiser.ulises','bob_dist_bt'), ('kaiser.ulises','bob_rural_at'), ('kaiser.ulises','bob_rural_bt'),
  ('yori.santiago','corte_conformado'), ('yori.santiago','soldadura_dist'), ('yori.santiago','soldadura_rural'), ('yori.santiago','lavado_pintura'),
  ('bender.omar','montaje_pa_dist'), ('bender.omar','montaje_po_dist'), ('bender.omar','montaje_pa_rural'), ('bender.omar','montaje_po_rural')
) as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;

-- 3) (OPCIONAL) Desactivar los logins viejos de las MISMAS personas para no tener
--    perfiles duplicados. Comenta estas lineas si preferis conservarlos.
update usuarios set activo = false where usuario in ('omar', 'ulises', 'santiago', 'rocio');

-- ============================================================
-- >>> CREAR LAS CUENTAS DE ACCESO (contrasena 123456) <<<
-- Opcion A (recomendada, solo estas 5): Dashboard -> Authentication -> Users ->
--   "Add user" para cada uno:
--     Email = usuario + "@inelpa.local"   (ej. bender.omar@inelpa.local)
--     Password = 123456
--     [x] Auto Confirm User   (IMPORTANTE: sin esto no pueden entrar)
--
-- Opcion B (por terminal, crea las que falten): desde la carpeta inelpa-pwa
--     $env:SUPABASE_URL="https://TU-ID.supabase.co"
--     $env:SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."
--     $env:CLAVE_INICIAL="123456"
--     node scripts/crear_cuentas_auth.mjs
--   (Solo asigna 123456 a las cuentas NUEVAS; no cambia las que ya existen.)
-- ============================================================

-- 4) Vincular cada cuenta de Auth con su perfil (correr DESPUES de crearlas).
--    Insensible a mayus/minus. La Opcion B ya vincula sola; esto es por las dudas.
update usuarios u
set auth_id = a.id
from auth.users a
where lower(a.email) = lower(u.usuario) || '@inelpa.local'
  and u.auth_id is distinct from a.id;

-- Verificacion: las 5 deben quedar con auth_id no nulo.
select nombre, usuario, rol, (auth_id is not null) as tiene_cuenta
from usuarios
where usuario in ('bender.omar','kaiser.ulises','yori.santiago','alassiato.lucas','zurvera.rocio')
order by rol, usuario;
