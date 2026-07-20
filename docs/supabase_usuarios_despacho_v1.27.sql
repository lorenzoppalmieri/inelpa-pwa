-- ============================================================
-- INELPA PWA — v1.27: usuarios del sector DESPACHO (Melany + equipo)
--
-- Crea dos perfiles con rol 'logistica' (el que da acceso a LogisticaView, donde
-- vive la pestaña 🚚 Despacho):
--   * melany   → Melany, supervisora de despacho (cuenta propia).
--   * despacho → cuenta compartida del equipo (Eugenia Suarez / Maribel Oggero).
--     (Al iniciar un embalaje se elige quién embala: Eugenia o Maribel.)
--
-- Rol 'logistica' ve toda la planta por su rol, así que NO necesitan filas en
-- usuario_sectores (igual que los planificadores).
--
-- Re-ejecutable (on conflict do nothing). Login = usuario + clave inicial.
--
-- DESPUÉS de correr este SQL: crear las cuentas de login con
--   node scripts/crear_cuentas_auth.mjs
-- (crea melany@inelpa.local y despacho@inelpa.local, ya confirmadas, y vincula
--  usuarios.auth_id). Ver instrucciones al pie.
-- ============================================================

insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Melany (Supervisora Despacho)',        'melany',   'logistica', null, true),
  ('Despacho — Eugenia / Maribel',         'despacho', 'logistica', null, true)
on conflict (usuario) do nothing;

-- Verificación.
select usuario, nombre, rol, activo,
       (auth_id is not null) as tiene_login
from usuarios
where usuario in ('melany', 'despacho')
order by usuario;
