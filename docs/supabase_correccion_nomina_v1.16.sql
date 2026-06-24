-- ============================================================
-- INELPA PWA — v1.16: correccion de nomina segun plantilla usuarios.xlsx
--
-- Que hace:
--   1) ALTA: 1 usuario nuevo (Nicolas Retamoso, bobinado rural).
--   2) CORRECCION de 3 "cruzados" de linea:
--        - lescano.aldana    : Bobinado Distribucion -> Bobinado Rural
--        - garcia.maximiliano : Montaje Rural        -> Montaje Distribucion
--        - rodriguez.juan     : Montaje Distribucion -> Bobinado Distribucion
--   NO se toca a nadie mas. Matias Aguilar queda SOLO en Montaje (la fila
--   "MATIAS / BOB AT RUR" de la plantilla era un error). Se mantiene AT+BT por linea.
--
-- Convencion: login = apellido.nombre, minuscula sin acentos. Cada bobinador
--   ve AT+BT de SU linea.
--
-- Correr en Supabase: SQL Editor -> pegar TODO -> Run. Re-ejecutable.
-- DESPUES: correr scripts/crear_cuentas_auth.mjs para dar login al usuario nuevo
--   (crea retamoso.nicolas@inelpa.local). rodriguez.juan ya tiene cuenta.
-- ============================================================

-- ------------------------------------------------------------
-- 1) ALTA del unico operario realmente nuevo.
-- ------------------------------------------------------------
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Nicolas Retamoso', 'retamoso.nicolas', 'operario', 'bobinado_rural', true)
on conflict (usuario) do nothing;

insert into usuario_sectores (usuario_id, sector_id)
select u.id, s.sector_id
from usuarios u
join (values
  ('retamoso.nicolas','bob_rural_at'), ('retamoso.nicolas','bob_rural_bt')
) as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;

-- ------------------------------------------------------------
-- 2) CORRECCION de cruzados (borra sectores viejos, carga los correctos y
--    actualiza grupo_nomina).
-- ------------------------------------------------------------

-- 2.1 lescano.aldana: Bobinado DISTRIBUCION -> Bobinado RURAL.
update usuarios set grupo_nomina = 'bobinado_rural' where usuario = 'lescano.aldana';
delete from usuario_sectores
  where usuario_id = (select id from usuarios where usuario = 'lescano.aldana');
insert into usuario_sectores (usuario_id, sector_id)
select u.id, s.sector_id from usuarios u
join (values ('lescano.aldana','bob_rural_at'), ('lescano.aldana','bob_rural_bt'))
  as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;

-- 2.2 garcia.maximiliano: Montaje RURAL -> Montaje DISTRIBUCION.
update usuarios set grupo_nomina = 'montaje_dist' where usuario = 'garcia.maximiliano';
delete from usuario_sectores
  where usuario_id = (select id from usuarios where usuario = 'garcia.maximiliano');
insert into usuario_sectores (usuario_id, sector_id)
select u.id, s.sector_id from usuarios u
join (values ('garcia.maximiliano','montaje_pa_dist'), ('garcia.maximiliano','montaje_po_dist'))
  as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;

-- 2.3 rodriguez.juan: Montaje DISTRIBUCION -> Bobinado DISTRIBUCION (BOB BT DIST).
update usuarios set grupo_nomina = 'bobinado_dist' where usuario = 'rodriguez.juan';
delete from usuario_sectores
  where usuario_id = (select id from usuarios where usuario = 'rodriguez.juan');
insert into usuario_sectores (usuario_id, sector_id)
select u.id, s.sector_id from usuarios u
join (values ('rodriguez.juan','bob_dist_at'), ('rodriguez.juan','bob_dist_bt'))
  as s(usuario, sector_id) on s.usuario = u.usuario
on conflict do nothing;

-- ------------------------------------------------------------
-- Verificacion: confirma los afectados.
-- ------------------------------------------------------------
select u.usuario, u.nombre, u.grupo_nomina,
       array_agg(us.sector_id order by us.sector_id) as sectores
from usuarios u
left join usuario_sectores us on us.usuario_id = u.id
where u.usuario in ('retamoso.nicolas','lescano.aldana','garcia.maximiliano','rodriguez.juan')
group by u.usuario, u.nombre, u.grupo_nomina
order by u.usuario;
-- Esperado:
--   garcia.maximiliano -> montaje_dist   -> {montaje_pa_dist, montaje_po_dist}
--   lescano.aldana     -> bobinado_rural -> {bob_rural_at, bob_rural_bt}
--   retamoso.nicolas   -> bobinado_rural -> {bob_rural_at, bob_rural_bt}
--   rodriguez.juan     -> bobinado_dist  -> {bob_dist_at, bob_dist_bt}
