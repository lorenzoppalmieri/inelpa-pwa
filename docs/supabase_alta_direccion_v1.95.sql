-- ============================================================
-- v1.95 — ALTA DEL USUARIO "DIRECCION" (Guillermo y Mario)
--
-- Cuenta COMPARTIDA del directorio. Sigue la convencion de las cuentas de area
-- (sin punto, como `mantenimiento` y `despacho`): usuario `direccion`, email
-- sintetico `direccion@inelpa.local`.
--
-- QUE VE: lo mismo que Lorenzo — sidebar ERP, Produccion, Planificacion,
-- Logistica, Laboratorio, Despacho, SGO y la vista ejecutiva 📊 Direccion.
--
-- QUE **NO** PUEDE: eliminar registros de SGO, cerrar retrabajos criticos,
-- confirmar el costeo de un retrabajo critico ni cambiar el tarifario de costos.
-- Eso sigue siendo exclusivo de `lorenzo` (`usuarioEsLorenzo` en sgo/permisos.ts).
-- Es una decision, no un olvido: al ser una cuenta de dos personas, la auditoria
-- no podria decir quien hizo que.
--
-- Rol `planificador`: es el que ya usa Lorenzo y el que habilita dashboard, KPIs
-- y planificacion. NO hace falta tocar el enum `rol_usuario`, asi que esto se
-- corre de una sola vez.
--
-- Idempotente: se puede correr dos veces sin duplicar nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1) PERFIL
-- ------------------------------------------------------------
insert into usuarios (nombre, usuario, rol, activo) values
  ('Dirección (Guillermo y Mario)', 'direccion', 'planificador', true)
on conflict (usuario) do update set
  nombre = excluded.nombre,
  rol    = excluded.rol,
  activo = true;

-- ------------------------------------------------------------
-- 2) SECTORES — NO se cargan a proposito.
--    Direccion no ejecuta tareas de planta: mira. `usuario_sectores` solo sirve
--    para que a alguien le aparezcan tareas asignadas en la tablet, y eso aca
--    no aplica.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3) LOGIN
--    Despues de correr esto, crear la cuenta de acceso con:
--        node scripts/crear_cuentas_auth.mjs
--    Ese script crea el usuario en Authentication **y** vincula el `auth_id` en
--    un solo paso. Si la cuenta se crea a mano desde el panel de Supabase, el
--    vinculo queda vacio y el login falla con "La cuenta no tiene un perfil de
--    planta asignado o esta inactiva" — ya paso con melany, laboratorio,
--    mantenimiento y alderete.
-- ------------------------------------------------------------

-- ============================================================
-- 4) VERIFICACION
-- ============================================================
-- select usuario, nombre, rol, activo, (auth_id is not null) as tiene_login
-- from usuarios where usuario = 'direccion';
--
-- Esperado:
--   direccion | Dirección (Guillermo y Mario) | planificador | true
--   tiene_login: false ANTES de correr el script, true DESPUES.

-- ============================================================
-- 5) SOLO SI el login falla con "no tiene un perfil de planta asignado"
--    (pasa si la cuenta se creo a mano en Authentication en vez de con el
--     script: el panel NO completa el vinculo auth_id).
-- ============================================================
-- update usuarios u
-- set auth_id = a.id
-- from auth.users a
-- where lower(a.email) = u.usuario || '@inelpa.local'
--   and u.auth_id is distinct from a.id;
