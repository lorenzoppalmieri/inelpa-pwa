-- ============================================================
-- DIAGNOSTICO DE LOGIN — "La cuenta no tiene un perfil de planta asignado o
-- esta inactiva"
--
-- Ese mensaje tapa TRES causas distintas. Este script dice cual es y trae el
-- arreglo de cada una.
--
-- Cambiar el usuario en la primera linea si hace falta.
-- Los pasos 1 y 2 son SOLO LECTURA.
-- ============================================================

-- ------------------------------------------------------------
-- 1) DIAGNOSTICO — que le pasa a este usuario
-- ------------------------------------------------------------
with objetivo as (select 'toledo.rosario'::text as usuario)
select
  o.usuario,
  (u.id is not null)                                  as perfil_existe,
  u.nombre,
  u.rol,
  u.activo,
  (a.id is not null)                                  as cuenta_auth_existe,
  (u.auth_id is not null)                             as auth_id_vinculado,
  (u.auth_id = a.id)                                  as vinculo_correcto,
  (select count(*) from usuario_sectores us where us.usuario_id = u.id) as sectores,
  case
    when u.id is null                 then '1 · NO EXISTE EL PERFIL  -> paso 3'
    when u.activo is not true         then '2 · PERFIL INACTIVO      -> paso 4'
    when a.id is null                 then '3 · NO EXISTE LA CUENTA DE AUTH -> correr crear_cuentas_auth.mjs'
    when u.auth_id is distinct from a.id then '4 · AUTH_ID SIN VINCULAR -> paso 5'
    else                                   '0 · TODO OK: el problema es la contrasena'
  end                                                 as diagnostico
from objetivo o
left join usuarios  u on u.usuario = o.usuario
left join auth.users a on lower(a.email) = o.usuario || '@inelpa.local';


-- ------------------------------------------------------------
-- 2) CONTEXTO — ¿le pasa solo a ella o a mas gente?
--    Lista TODOS los perfiles que hoy no podrian entrar.
-- ------------------------------------------------------------
select u.usuario, u.nombre, u.rol, u.activo,
       (a.id is not null)  as tiene_auth,
       (u.auth_id is not null) as vinculado
from usuarios u
left join auth.users a on lower(a.email) = u.usuario || '@inelpa.local'
where u.activo is not true
   or a.id is null
   or u.auth_id is distinct from a.id
order by u.usuario;


-- ============================================================
-- ARREGLOS — correr SOLO el que corresponda segun el paso 1
-- ============================================================

-- ------------------------------------------------------------
-- 3) NO EXISTE EL PERFIL: darla de alta.
--    Datos de la nomina (docs/supabase_roster_seed.sql:34): operaria de
--    Bobinado Distribucion, sectores bob_dist_at y bob_dist_bt.
-- ------------------------------------------------------------
-- insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
--   ('Toledo Rosario', 'toledo.rosario', 'operario', 'bobinado_dist', true)
-- on conflict (usuario) do update set activo = true;
--
-- insert into usuario_sectores (usuario_id, sector_id)
-- select u.id, s.sector_id
-- from usuarios u
-- join (values ('toledo.rosario','bob_dist_at'), ('toledo.rosario','bob_dist_bt'))
--      as s(usuario, sector_id) on s.usuario = u.usuario
-- on conflict do nothing;

-- ------------------------------------------------------------
-- 4) PERFIL INACTIVO: reactivarlo.
--    OJO: si se desactivo a proposito (baja del personal), NO correr esto.
-- ------------------------------------------------------------
-- update usuarios set activo = true where usuario = 'toledo.rosario';

-- ------------------------------------------------------------
-- 5) AUTH_ID SIN VINCULAR: el arreglo de siempre.
--    Pasa cuando la cuenta se crea A MANO en el panel de Authentication: el
--    panel NO completa el vinculo. Esta sentencia repara TODOS los usuarios
--    a la vez, no solo este.
-- ------------------------------------------------------------
-- update usuarios u
-- set auth_id = a.id
-- from auth.users a
-- where lower(a.email) = u.usuario || '@inelpa.local'
--   and u.auth_id is distinct from a.id;

-- ------------------------------------------------------------
-- 6) SI NO EXISTE LA CUENTA DE AUTH: no se arregla con SQL.
--    Correr, desde la carpeta inelpa-pwa:
--      $env:SUPABASE_URL="https://TU-ID.supabase.co"
--      $env:SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."
--      node scripts/crear_cuentas_auth.mjs
--    Crea la cuenta Y vincula el auth_id en un solo paso. Es idempotente y de
--    paso repara a cualquier otro que haya quedado desvinculado.
-- ------------------------------------------------------------


-- ============================================================
-- 7) VERIFICACION (repetir el paso 1: debe decir "0 · TODO OK")
-- ============================================================
