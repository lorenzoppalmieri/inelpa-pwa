-- ============================================================
-- LOGISTICA v1.11 — rol 'logistica' (solo lectura) + esperas de abastecimiento
-- Correr en Supabase -> SQL Editor. Idempotente.
--
-- IMPORTANTE: el PASO 1 (extender el enum) debe ejecutarse SOLO y ANTES del
-- resto. Postgres no deja usar un valor de enum recien agregado en la misma
-- transaccion. Marcá la linea del PASO 1, dale Run, y luego corré el resto.
-- ============================================================

-- ---------- PASO 1 (correr SOLO esta linea primero) ----------
alter type rol_usuario add value if not exists 'logistica';


-- ---------- PASO 2 (correr el resto despues) ----------

-- 2.1) Lectura de tareas para logistica (ve toda la planta).
drop policy if exists sel_tareas on tareas;
create policy sel_tareas on tareas for select to authenticated using (
  app_rol() in ('planificador','encargado','logistica')
  or operario_id = app_uid()
  or sector_id in (select app_sectores())
);

-- 2.2) Nuevas causas de espera (abastecimiento). Disparan la alerta de logistica.
insert into causas_parada (id, label, categoria, codigo, activo) values
  ('mon_espera_consumibles',  'Espera de consumibles',                              'logistica', null, true),
  ('her_espera_consumibles',  'Espera de consumibles',                              'logistica', null, true),
  ('her_espera_materia_prima','Espera de materia prima',                            'material',  null, true),
  ('her_espera_gas',          'Espera de gas',                                      'logistica', null, true),
  ('bob_espera_planchuela',   'Espera de planchuela (cobre o aluminio)',            'material',  null, true),
  ('bob_espera_folio',        'Espera de folio (cobre o aluminio)',                 'material',  null, true),
  ('bob_espera_aislacion',    'Espera de aislacion (canales, pressphan, diamantado)','material', null, true)
on conflict (id) do nothing;

-- 2.3) Usuarios de logistica (rol logistica). Sin sectores: ven toda la planta.
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Giuliano (Logística)', 'giuliano_logistica', 'logistica', null, true),
  ('Equipo Logística',     'logistica_equipo',   'logistica', null, true)
on conflict (usuario) do nothing;

-- 2.4) Vincular cada cuenta de Auth con su perfil (por email). Correr DESPUES de
--      que existan las cuentas de Auth (via dashboard o crear_cuentas_auth.mjs).
--      Insensible a mayus/minus. Sin esto, el login dice "sin perfil de planta".
update usuarios u
set auth_id = a.id
from auth.users a
where lower(a.email) = lower(u.usuario) || '@inelpa.local'
  and u.auth_id is distinct from a.id;

-- Verificacion: las 2 filas deben tener auth_id no nulo.
select usuario, rol, activo, (auth_id is not null) as tiene_cuenta
from usuarios where rol = 'logistica';

-- ============================================================
-- >>> Crear las cuentas de acceso (PIN) con el script generico <<<
--   $env:CLAVE_INICIAL="123456"; node scripts/crear_cuentas_auth.mjs
--   -> crea giuliano_logistica@inelpa.local y logistica_equipo@inelpa.local
-- ============================================================
