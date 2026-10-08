-- ============================================================
-- v2.36 — ALTA: Emiliano Funes (Herrería)
--
-- Operario nuevo. No figura en ninguno de los .sql de nómina del repo. El único
-- "Emiliano" cargado es Alegre Hugo Emiliano (alegre.hugo), que es otra persona.
-- Igual, ANTES de correr el alta, mirá el paso 0 por si alguien lo cargó a mano.
--
-- Sectores: los 4 de Herrería (corte_conformado, soldadura_dist,
-- soldadura_rural, lavado_pintura), con el mismo criterio que el resto de los
-- herreros de la nómina (Alegre, Alvarez, Chaves, Espíndola, Martínez, etc.).
-- grupo_nomina = 'herreria', igual que ellos.
--
-- Después de correr esto: crear el login con
--   node scripts/crear_cuentas_auth.mjs
-- (genera funes.emiliano@inelpa.local Y vincula el auth_id en un solo paso).
-- NO crearlo a mano en Authentication: el panel no completa el auth_id y el
-- login falla con "La cuenta no tiene un perfil de planta asignado".
--
-- Idempotente: se puede volver a correr sin duplicar nada.
-- ============================================================

-- ------------------------------------------------------------
-- 0) DIAGNÓSTICO (correr primero, solo lectura). Tiene que devolver 0 filas.
--    Si aparece alguien con el apellido Funes, avisá antes de seguir: puede
--    ser la misma persona con otro usuario o en otro sector (sería un pase).
-- ------------------------------------------------------------
-- select u.usuario, u.nombre, u.rol, u.grupo_nomina, u.activo,
--        string_agg(us.sector_id, ', ' order by us.sector_id) as sectores
-- from usuarios u
-- left join usuario_sectores us on us.usuario_id = u.id
-- where u.usuario ilike '%funes%' or u.nombre ilike '%funes%'
-- group by u.usuario, u.nombre, u.rol, u.grupo_nomina, u.activo;

-- ------------------------------------------------------------
-- 1) PERFIL
-- ------------------------------------------------------------
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Funes Emiliano', 'funes.emiliano', 'operario', 'herreria', true)
on conflict (usuario) do update set
  nombre       = excluded.nombre,
  rol          = excluded.rol,
  grupo_nomina = excluded.grupo_nomina,
  activo       = true;

-- ------------------------------------------------------------
-- 2) SECTORES (es lo que lo hace aparecer en la grilla de asignación)
-- ------------------------------------------------------------
insert into usuario_sectores (usuario_id, sector_id)
select u.id, s.sector_id
from usuarios u
join (values
  ('funes.emiliano', 'corte_conformado'),
  ('funes.emiliano', 'soldadura_dist'),
  ('funes.emiliano', 'soldadura_rural'),
  ('funes.emiliano', 'lavado_pintura')
) as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;

-- ============================================================
-- 3) VERIFICACIÓN (debe devolver 1 fila con los 4 sectores)
-- ============================================================
-- select u.usuario, u.nombre, u.rol, u.grupo_nomina, u.activo,
--        (u.auth_id is not null) as tiene_login,
--        string_agg(us.sector_id, ', ' order by us.sector_id) as sectores
-- from usuarios u
-- left join usuario_sectores us on us.usuario_id = u.id
-- where u.usuario = 'funes.emiliano'
-- group by u.usuario, u.nombre, u.rol, u.grupo_nomina, u.activo, u.auth_id;
--
-- Esperado:
--   funes.emiliano | Funes Emiliano | operario | herreria | true
--   sectores: corte_conformado, lavado_pintura, soldadura_dist, soldadura_rural
--   tiene_login: false ANTES de correr el script, true DESPUÉS.

-- ============================================================
-- 4) SOLO SI el login falla con "La cuenta no tiene un perfil de planta"
--    (pasa si la cuenta se creó a mano en Authentication).
-- ============================================================
-- update usuarios u
-- set auth_id = a.id
-- from auth.users a
-- where lower(a.email) = u.usuario || '@inelpa.local'
--   and u.auth_id is distinct from a.id;
