-- ============================================================
-- v1.73 — ALTA: Matías Alderete (Bobinado Rural)
--
-- Operario nuevo. NO existía en el sistema (se verificó: el único "Matías"
-- cargado es Aguilar Matías, de Montaje Distribución — otra persona).
--
-- Sectores: bob_rural_at + bob_rural_bt. Se cargan los DOS siguiendo el criterio
-- vigente de la nómina: cada bobinador cubre AT y BT de su línea (igual que
-- Belis, Lozano, Mansilla y Sánchez). El sector solo afecta clasificación,
-- KPIs y ANDON; las 30 bobinadoras sirven cualquier formato.
--
-- Después de correr esto: crear el login con
--   node scripts/crear_cuentas_auth.mjs
-- (genera alderete.matias@inelpa.local Y vincula el auth_id en un solo paso).
--
-- Idempotente: se puede volver a correr sin duplicar nada.
-- ============================================================

-- ------------------------------------------------------------
-- 1) PERFIL
-- ------------------------------------------------------------
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Alderete Matías', 'alderete.matias', 'operario', 'bobinado_rural', true)
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
  ('alderete.matias', 'bob_rural_at'),
  ('alderete.matias', 'bob_rural_bt')
) as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;

-- ============================================================
-- 3) VERIFICACIÓN (debe devolver 1 fila con los 2 sectores)
-- ============================================================
-- select u.usuario, u.nombre, u.rol, u.grupo_nomina, u.activo,
--        (u.auth_id is not null) as tiene_login,
--        string_agg(us.sector_id, ', ' order by us.sector_id) as sectores
-- from usuarios u
-- left join usuario_sectores us on us.usuario_id = u.id
-- where u.usuario = 'alderete.matias'
-- group by u.usuario, u.nombre, u.rol, u.grupo_nomina, u.activo, u.auth_id;
--
-- Esperado:
--   alderete.matias | Alderete Matías | operario | bobinado_rural | true
--   sectores: bob_rural_at, bob_rural_bt
--   tiene_login: false ANTES de correr el script, true DESPUÉS.

-- ============================================================
-- 4) SOLO SI el login falla con "La cuenta no tiene un perfil de planta"
--    (pasa si la cuenta se creó a mano en Authentication en vez de con el
--     script: el panel NO completa el vínculo auth_id).
-- ============================================================
-- update usuarios u
-- set auth_id = a.id
-- from auth.users a
-- where lower(a.email) = u.usuario || '@inelpa.local'
--   and u.auth_id is distinct from a.id;
