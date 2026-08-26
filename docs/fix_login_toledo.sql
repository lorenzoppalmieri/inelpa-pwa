-- ============================================================
-- FIX — Toledo: perfil renombrado que dejó a la persona sin acceso
--
-- QUÉ PASÓ (diagnosticado el 25/8/2026):
--   Alguien corrigió el nombre en el perfil y de paso le cambió el `usuario`:
--   de `toledo.rosario` pasó a `toledo.antonella`, y se creó una cuenta de Auth
--   nueva a la que se vinculó el perfil. Resultado:
--
--     · perfil `toledo.antonella`  -> vinculado a la cuenta NUEVA (nunca usada)
--     · cuenta `toledo.rosario`    -> autentica bien pero SIN perfil detrás
--
--   Ella sigue escribiendo el usuario de siempre, Supabase la autentica, y el
--   login la rechaza con "no tiene un perfil de planta asignado".
--
-- QUÉ HACE ESTE ARREGLO:
--   Devuelve el `usuario` a `toledo.rosario` y lo vincula a la cuenta que ella
--   YA USA (y cuya contraseña conoce). No toca el `nombre` ni el `id` del
--   perfil, así que NO se pierde nada del historial de trabajo: las tareas
--   apuntan al id del perfil, no al usuario ni al auth_id.
--
-- Los pasos 1 y 3 son de solo lectura.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ANTES — foto de la situación
-- ------------------------------------------------------------
select 'perfil' as origen, usuario as identificador, nombre, auth_id::text as ref
from usuarios where lower(usuario) like 'toledo%'
union all
select 'auth', email, coalesce(last_sign_in_at::text, 'nunca entró'), id::text
from auth.users where lower(email) like 'toledo%'
order by origen, identificador;


-- ------------------------------------------------------------
-- 2) EL ARREGLO
--    Es seguro: no hay ningún otro perfil con usuario 'toledo.rosario'
--    (se verificó: la consulta devolvió 0).
-- ------------------------------------------------------------
update usuarios
set usuario = 'toledo.rosario',
    auth_id = (select id from auth.users where lower(email) = 'toledo.rosario@inelpa.local'),
    activo  = true
where usuario = 'toledo.antonella';

-- NOTA: el `nombre` queda como está ("Toledo Antonella"). Si la corrección del
-- nombre fue deliberada, así debe quedar. Si el nombre correcto es otro:
-- update usuarios set nombre = 'Toledo Rosario Antonella' where usuario = 'toledo.rosario';


-- ------------------------------------------------------------
-- 3) DESPUÉS — verificación. Tiene que dar UNA fila con `puede_entrar` = true.
-- ------------------------------------------------------------
select u.usuario, u.nombre, u.rol, u.activo,
       a.email,
       (u.auth_id = a.id) as vinculo_ok,
       (u.activo and u.auth_id = a.id) as puede_entrar,
       (select count(*) from usuario_sectores us where us.usuario_id = u.id) as sectores
from usuarios u
join auth.users a on a.id = u.auth_id
where u.usuario = 'toledo.rosario';
--   Esperado: toledo.rosario · operario · activo · vinculo_ok true · sectores 2


-- ------------------------------------------------------------
-- 4) LA CUENTA HUÉRFANA
--    `toledo.antonella@inelpa.local` queda sin ningún perfil detrás y NUNCA se
--    usó. Conviene borrarla para que nadie la vincule por error más adelante.
--
--    NO se borra por SQL: hacerlo desde
--      Authentication -> Users -> toledo.antonella@inelpa.local -> Delete user
--    Es seguro: después del paso 2 ningún perfil apunta a ella.
-- ------------------------------------------------------------
select id, email, created_at, last_sign_in_at
from auth.users
where lower(email) = 'toledo.antonella@inelpa.local';
