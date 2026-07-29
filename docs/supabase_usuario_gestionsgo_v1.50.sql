-- ============================================================
-- v1.50 - PERFIL DEDICADO PARA SGO INTEGRAL
-- Requisito: ejecutar primero supabase_sgo_nucleo_v1.49.sql.
-- Esta migracion crea el PERFIL. La cuenta de Auth se crea con
-- scripts/crear_usuario_sgo.mjs (service_role; nunca desde el frontend).
-- ============================================================

insert into usuarios (nombre, usuario, rol, grupo_nomina, activo)
values ('Gestión SGO', 'GestionSGO', 'sgo', null, true)
on conflict (usuario) do update set
  nombre = excluded.nombre,
  rol = excluded.rol,
  grupo_nomina = null,
  activo = true;

select nombre, usuario, rol, activo, (auth_id is not null) as tiene_cuenta
from usuarios
where lower(usuario) = lower('GestionSGO');
