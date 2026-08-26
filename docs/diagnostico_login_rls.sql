-- ============================================================
-- LOGIN: "no tiene un perfil de planta" con la base APARENTEMENTE OK
--
-- Caso Toledo Rosario (20/8/2026): entraba ayer, hoy no. El diagnostico por
-- usuario dio todo bien (perfil existe, activo, auth vinculado).
--
-- POR QUE ESE DIAGNOSTICO NO ALCANZA: corre en el editor SQL como admin y
-- SALTEA RLS. La app corre en el navegador con la sesion de ella y SI pasa por
-- RLS. Ademas `cargarPerfil` usa `.maybeSingle()` y ante CUALQUIER error que no
-- sea de red devuelve null en silencio -> se muestra ese mensaje.
--
-- O sea: el cartel no dice "no hay perfil", dice "la consulta no devolvio
-- exactamente un perfil". Hay tres formas de llegar ahi:
--   A. RLS le bloquea el SELECT sobre `usuarios`.
--   B. Hay MAS DE UNA fila con su mismo auth_id -> maybeSingle da error.
--   C. El perfil esta inactivo (ya descartado).
--
-- TODO ESTE ARCHIVO ES DE SOLO LECTURA.
-- ============================================================


-- ------------------------------------------------------------
-- A) RLS — ¿que politicas hay hoy sobre las tablas del login?
--    Tiene que existir una policy de SELECT sobre `usuarios` que le permita a
--    un usuario logueado leer SU PROPIA fila (algo como auth.uid() = auth_id).
--    Lo mismo para `usuario_sectores`.
--
--    ⚠ Si esta lista salio vacia o cambio hoy, ES ESTO. Se corrio mucho SQL en
--    las ultimas horas (v1.77 a v1.91, propio y de otro desarrollo en paralelo).
-- ------------------------------------------------------------
select tablename, policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where tablename in ('usuarios', 'usuario_sectores')
order by tablename, cmd, policyname;

-- ¿Las tablas tienen RLS activado?
select relname as tabla, relrowsecurity as rls_activado, relforcerowsecurity as rls_forzado
from pg_class
where relname in ('usuarios', 'usuario_sectores');


-- ------------------------------------------------------------
-- B) DUPLICADOS DE auth_id — rompen maybeSingle()
--    Si un auth_id aparece en DOS filas de `usuarios`, la consulta del login
--    falla y se muestra el mismo mensaje. Esto NO lo detecta el diagnostico por
--    usuario, porque cada fila por separado se ve perfecta.
-- ------------------------------------------------------------
select auth_id, count(*) as filas, string_agg(usuario, ', ' order by usuario) as usuarios
from usuarios
where auth_id is not null
group by auth_id
having count(*) > 1;

-- Y al reves: ¿un mismo `usuario` repetido?
select usuario, count(*) as filas
from usuarios
group by usuario
having count(*) > 1;


-- ------------------------------------------------------------
-- C) LA FILA DE ELLA, tal cual la ve el login
-- ------------------------------------------------------------
select u.id, u.usuario, u.nombre, u.rol, u.grupo_nomina, u.activo, u.auth_id,
       a.email, a.banned_until, a.deleted_at,
       (a.confirmed_at is not null) as email_confirmado,
       a.last_sign_in_at
from usuarios u
left join auth.users a on a.id = u.auth_id
where u.usuario = 'toledo.rosario';
--   `banned_until` y `deleted_at` con valor explican que Auth la rechace.
--   `last_sign_in_at` confirma cuando entro por ultima vez.


-- ------------------------------------------------------------
-- D) ¿Cuantas filas devolveria SU consulta exacta?
--    Tiene que dar 1. Si da 0 o 2, ahi esta el problema.
-- ------------------------------------------------------------
select count(*) as filas_que_ve_el_login
from usuarios
where auth_id = (select id from auth.users where lower(email) = 'toledo.rosario@inelpa.local');


-- ============================================================
-- E) PRUEBA DEFINITIVA — simular SU sesion (con RLS aplicado).
--    Ejecutar como bloque. Si devuelve 0 filas pero la consulta C si trae la
--    fila, esta CONFIRMADO que es RLS.
-- ============================================================
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims to
--     (select json_build_object('sub', id::text, 'role', 'authenticated')::text
--        from auth.users where lower(email) = 'toledo.rosario@inelpa.local');
--   select id, usuario, activo from usuarios where auth_id = auth.uid();
--   select count(*) as sectores from usuario_sectores
--    where usuario_id = (select id from usuarios where auth_id = auth.uid());
-- rollback;
