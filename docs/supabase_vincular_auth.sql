-- ============================================================
-- ARREGLO: "La cuenta no tiene un perfil de planta asignado o esta inactiva"
--
-- QUÉ SIGNIFICA: la contraseña estuvo BIEN (Supabase Auth aceptó el login),
-- pero la app no encontró el perfil de ese usuario en la tabla `usuarios`.
-- La app busca así:  select * from usuarios where auth_id = <id de la cuenta>
--
-- O sea que falla por una de estas tres razones:
--   A) La fila en `usuarios` no existe (no se corrió el SQL de alta).
--   B) La fila existe pero tiene auth_id en NULL (la cuenta se creó a mano en
--      el panel de Authentication, que NO completa ese vínculo).  <-- lo habitual
--   C) La fila existe pero está inactiva (activo = false).
--
-- Correr los pasos EN ORDEN.
-- ============================================================

-- ------------------------------------------------------------
-- PASO 1 — DIAGNÓSTICO: te dice exactamente cuál de las tres es.
-- ------------------------------------------------------------
select
  coalesce(u.usuario, split_part(a.email, '@', 1)) as usuario,
  case when u.id is null then '❌ FALTA la fila en usuarios (correr el SQL de alta)'
       when u.auth_id is null then '❌ FALTA vincular auth_id -> lo arregla el PASO 2'
       when a.id is null then '❌ NO existe la cuenta de Auth con ese email'
       when u.activo is not true then '❌ El usuario está INACTIVO -> PASO 3'
       else '✅ OK, debería poder entrar'
  end as diagnostico,
  u.rol, u.activo, a.email as email_auth, u.auth_id
from usuarios u
full outer join auth.users a
  on lower(a.email) = u.usuario || '@inelpa.local'
where coalesce(u.usuario, split_part(a.email, '@', 1))
      in ('mantenimiento', 'mazza.alexander', 'retamoso.nicolas')
order by 1;

-- ------------------------------------------------------------
-- PASO 2 — EL ARREGLO (caso B, el más común):
-- vincula cada perfil con su cuenta de Auth por email.
-- Es seguro correrlo siempre: solo toca los que están desvinculados.
-- ------------------------------------------------------------
update usuarios u
set auth_id = a.id
from auth.users a
where lower(a.email) = u.usuario || '@inelpa.local'
  and u.auth_id is distinct from a.id;

-- ------------------------------------------------------------
-- PASO 3 — Por las dudas, asegurar que estén activos.
-- ------------------------------------------------------------
update usuarios
set activo = true
where usuario in ('mantenimiento', 'mazza.alexander', 'retamoso.nicolas')
  and activo is not true;

-- ------------------------------------------------------------
-- PASO 4 — Volver a correr el PASO 1: los tres deben decir "✅ OK".
-- ------------------------------------------------------------

-- ============================================================
-- SI EL PASO 1 DICE "NO existe la cuenta de Auth con ese email"
-- ============================================================
-- Es que la cuenta se creó con OTRO email. La app arma el email solo, como
-- usuario@inelpa.local, así que tiene que ser EXACTAMENTE:
--     mantenimiento@inelpa.local
--     mazza.alexander@inelpa.local
-- Revisalo en Authentication -> Users. Si está mal escrito, editá el email ahí
-- (o borrá la cuenta y volvé a crearla) y repetí el PASO 2.
--
-- Para ver qué emails hay cargados:
-- select email, created_at from auth.users order by created_at desc limit 20;

-- ============================================================
-- CÓMO EVITAR ESTO EN EL FUTURO
-- ============================================================
-- En vez de crear las cuentas a mano en el panel, correr:
--     node scripts/crear_cuentas_auth.mjs
-- El script crea la cuenta de Auth Y vincula el auth_id en un solo paso, así
-- que este error no aparece. (Es el mismo problema que tuvimos con el usuario
-- 'laboratorio'.)
