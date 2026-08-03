-- ============================================================
-- v1.65 — Altas y cambios de usuarios
--
--   1) ALTA  Alexander Mazza      -> Bobinado Distribución Baja Tensión
--   2) PASE  Nicolás Retamoso     -> de Bobinado RURAL a Distribución BT
--   3) ALTA  Cuenta 'mantenimiento' (cuenta de área del sector)
--
-- OJO con el punto 2: Retamoso YA EXISTÍA en bobinado rural (alta de la v1.16).
-- No es un alta nueva: se le cambian los sectores y el grupo de nómina. Al
-- perder los sectores rurales deja de ver esas tareas en su tablet.
--
-- Después de correr esto: crear las cuentas de login con
--   node scripts/crear_cuentas_auth.mjs
-- (genera mazza.alexander@inelpa.local y mantenimiento@inelpa.local; Retamoso
--  ya tiene su cuenta y la conserva).
--
-- Idempotente: se puede volver a correr sin duplicar nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ALTA: Alexander Mazza (operario de bobinado distribución BT)
-- ------------------------------------------------------------
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Alexander Mazza', 'mazza.alexander', 'operario', 'bobinado_dist', true)
on conflict (usuario) do update set
  nombre = excluded.nombre,
  rol = excluded.rol,
  grupo_nomina = excluded.grupo_nomina,
  activo = true;

-- ------------------------------------------------------------
-- 2) PASE: Nicolás Retamoso, de bobinado RURAL a DISTRIBUCIÓN BT
--    Primero se limpian TODOS sus sectores actuales (los rurales) y recién
--    después se carga el nuevo, para que no le queden tareas de rural visibles.
-- ------------------------------------------------------------
update usuarios
set grupo_nomina = 'bobinado_dist', activo = true
where usuario = 'retamoso.nicolas';

delete from usuario_sectores
where usuario_id = (select id from usuarios where usuario = 'retamoso.nicolas');

-- ------------------------------------------------------------
-- 3) SECTORES de los dos operarios de bobinado distribución BT
-- ------------------------------------------------------------
insert into usuario_sectores (usuario_id, sector_id)
select u.id, s.sector_id
from usuarios u
join (values
  ('mazza.alexander',  'bob_dist_bt'),
  ('retamoso.nicolas', 'bob_dist_bt')
) as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;

-- ------------------------------------------------------------
-- 4) ALTA: cuenta de área del sector Mantenimiento
--    Mismo criterio que 'logistica_equipo' y 'despacho': una cuenta compartida
--    del sector, además de las personales que ya existen (eric, nicolas, david).
--    El rol 'mantenimiento' ya está en el enum (se agregó en la v1.62).
-- ------------------------------------------------------------
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Mantenimiento', 'mantenimiento', 'mantenimiento', null, true)
on conflict (usuario) do update set
  nombre = excluded.nombre,
  rol = excluded.rol,
  activo = true;

-- ============================================================
-- VERIFICACIÓN (correr después; debe mostrar los 3 con sus sectores)
-- ============================================================
-- select u.usuario, u.nombre, u.rol, u.grupo_nomina, u.activo,
--        coalesce(string_agg(us.sector_id, ', ' order by us.sector_id), '—') as sectores
-- from usuarios u
-- left join usuario_sectores us on us.usuario_id = u.id
-- where u.usuario in ('mazza.alexander', 'retamoso.nicolas', 'mantenimiento')
-- group by u.usuario, u.nombre, u.rol, u.grupo_nomina, u.activo
-- order by u.usuario;
--
-- Esperado:
--   mantenimiento     Mantenimiento      mantenimiento  (sin sectores)
--   mazza.alexander   Alexander Mazza    operario       bob_dist_bt
--   retamoso.nicolas  Nicolas Retamoso   operario       bob_dist_bt   <- ya sin los rurales

-- ============================================================
-- VINCULAR EL LOGIN (después de correr crear_cuentas_auth.mjs)
-- Sin esto el login falla con "La cuenta no tiene un perfil de planta".
-- ============================================================
-- update usuarios u
-- set auth_id = a.id
-- from auth.users a
-- where lower(a.email) = u.usuario || '@inelpa.local'
--   and u.auth_id is distinct from a.id;
