-- ============================================================
-- v1.85 - PERFILES INDIVIDUALES DEL EQUIPO SGO
-- Lara, Nicolás y Azul. Idempotente.
-- NOTA: `nicolas` ya pertenece a Mantenimiento. El auditor de Logística usa
-- `nicolas.sgo` para no modificar ni desactivar aquella cuenta.
--
-- OPCIÓN RECOMENDADA:
--   node scripts/crear_equipo_sgo.mjs
-- Ese script crea Auth + perfil + vínculo en un solo proceso.
--
-- OPCIÓN MANUAL:
--   1. Ejecutar este archivo una vez para crear los perfiles.
--   2. Authentication -> Users -> Add user:
--        lara@inelpa.local
--        nicolas.sgo@inelpa.local
--        azul@inelpa.local
--      Definir contraseñas distintas y activar Auto Confirm User.
--   3. Volver a ejecutar este archivo para vincular auth_id.
-- ============================================================

begin;

insert into public.usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Lara', 'lara', 'sgo', null, true),
  ('Nicolas - Auditor de Logistica', 'nicolas.sgo', 'sgo', null, true),
  ('Azul', 'azul', 'sgo', null, true)
on conflict (usuario) do update set
  nombre = excluded.nombre,
  rol = excluded.rol,
  grupo_nomina = null,
  activo = true;

-- Vincula las cuentas que ya existan en Supabase Auth. Si todavía no fueron
-- creadas, no falla: se vuelve a ejecutar después de darlas de alta.
update public.usuarios u
set auth_id = a.id,
    activo = true
from auth.users a
where lower(a.email) = lower(u.usuario || '@inelpa.local')
  and u.usuario in ('lara', 'nicolas.sgo', 'azul')
  and u.auth_id is distinct from a.id;

commit;

-- Las tres filas deben terminar con estado LISTO.
select
  u.nombre,
  u.usuario,
  u.rol,
  u.activo,
  a.email,
  case
    when a.id is null then 'FALTA CREAR AUTH'
    when u.auth_id is null then 'FALTA VINCULAR'
    when u.auth_id <> a.id then 'VINCULO INCORRECTO'
    else 'LISTO'
  end as estado
from public.usuarios u
left join auth.users a on lower(a.email) = lower(u.usuario || '@inelpa.local')
where u.usuario in ('lara', 'nicolas.sgo', 'azul')
order by u.usuario;
