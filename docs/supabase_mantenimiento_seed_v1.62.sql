-- ============================================================
-- SEED v1.62 - MODULO DE MANTENIMIENTO
-- Plantas + sectores + 49 activos de Cerdan Nave 1 (catalogo maestro v0.1)
-- Correr en Supabase -> SQL Editor DESPUES de supabase_mantenimiento_v1.62.sql
-- Idempotente (on conflict do update / do nothing).
-- ============================================================

-- ---------- Plantas ----------
insert into public.mant_plantas (id, nombre, superficie_m2, plano_ancho_px, plano_alto_px, orden, activa) values
  ('lorenzatti', 'Lorenzatti (planta actual)', 2000, null, null, 1, true),
  ('cerdan_n1',  'Cerdan - Nave 1',            8000, 3668, 1350, 2, true),
  ('cerdan_n2',  'Cerdan - Nave 2',            8000, null, null, 3, false)
on conflict (id) do update set
  nombre = excluded.nombre,
  superficie_m2 = excluded.superficie_m2,
  plano_ancho_px = excluded.plano_ancho_px,
  plano_alto_px = excluded.plano_alto_px,
  orden = excluded.orden,
  activa = excluded.activa;

-- ---------- Sectores ----------
insert into public.mant_sectores (id, nombre, prefijo, color, orden) values
  ('her', 'Herreria / Tanques',       'HER', '#1f2430', 1),
  ('pin', 'Pintura',                  'PIN', '#d97706', 2),
  ('lam', 'Laminado / Corte nucleo',  'LAM', '#0066cc', 3),
  ('srv', 'Servicios auxiliares',     'SRV', '#16803c', 4),
  ('bob', 'Bobinado AT/BT',           'BOB', '#7c3aed', 5),
  ('arm', 'Armado parte activa',      'ARM', '#0e7490', 6),
  ('hor', 'Hornos y secado',          'HOR', '#b91c1c', 7),
  ('vac', 'Vacio / Impregnacion',     'VAC', '#4d7c0f', 8),
  ('ens', 'Ensayos / Laboratorio',    'ENS', '#a16207', 9)
on conflict (id) do update set
  nombre = excluded.nombre, prefijo = excluded.prefijo,
  color = excluded.color, orden = excluded.orden;

-- ---------- Activos · Cerdan Nave 1 (49) ----------
-- Posiciones (x_pct, y_pct): NULL a proposito — se cargan desde el
-- editor de mapa de la PWA arrastrando los simbolos sobre el plano.
insert into public.mant_activos
  (id, nombre, sector_id, planta_id, subarea, tipo, simbolo, criticidad, iit_ref, depende_de, notas) values
  -- LAMINADO
  ('LAM-CORT-01','Maquina corte Step Lap','lam','cerdan_n1','Laminado','Corte de nucleo','corte','A','IIT 7.1.3 18 Cortadora de nucleos (verificar)','{}','Unica linea Step Lap — alimenta bobinado. Fichar motores/variadores.'),
  ('LAM-FLEJ-01','Maquina Flejadora','lam','cerdan_n1','Laminado','Flejado / atado','flejadora','B',null,'{}',null),
  ('LAM-CORT-02','Maquina corte Unicor','lam','cerdan_n1','Laminado','Corte de nucleo','corte','B','IIT 7.1.3 18 Cortadora de nucleos (verificar)','{}','Redundancia parcial con Step Lap.'),
  -- PINTURA · linea automatizada
  ('PIN-ROBO-01','Robot de pintura P1','pin','cerdan_n1','Linea Pintura','Robot','robot','A','IIT 7.1.3 9 Cabina de pintura (parcial)','{"PIN-ROBO-02"}','Trabaja en pareja con P2 (enfrentados, riel 4 m): deben funcionar los 2. Sin redundancia.'),
  ('PIN-ROBO-02','Robot de pintura P2','pin','cerdan_n1','Linea Pintura','Robot','robot','A','IIT 7.1.3 9 Cabina de pintura (parcial)','{"PIN-ROBO-01"}','Trabaja en pareja con P1 (enfrentados, riel 4 m): deben funcionar los 2. Sin redundancia.'),
  ('PIN-FILT-01','Filtros laberinticos','pin','cerdan_n1','Linea Pintura','Filtrado','filtro','B',null,'{}','Cambio de filtros por consumo.'),
  ('PIN-EXTR-1A','Extractor 1A','pin','cerdan_n1','Linea Pintura','Extraccion','extractor','B',null,'{"PIN-EXTR-1B"}','Redundante con 1B.'),
  ('PIN-EXTR-1B','Extractor 1B','pin','cerdan_n1','Linea Pintura','Extraccion','extractor','B',null,'{"PIN-EXTR-1A"}','Redundante con 1A.'),
  ('PIN-BOMB-P1','Bomba baja presion P1','pin','cerdan_n1','Linea Pintura','Bombeo','bomba','B','IIT 7.1.3 Bombas y pistolas de pintura','{}',null),
  ('PIN-BOMB-P2','Bomba baja presion P2','pin','cerdan_n1','Linea Pintura','Bombeo','bomba','B','IIT 7.1.3 Bombas y pistolas de pintura','{}',null),
  -- PINTURA · lavado y enjuague
  ('PIN-CALE-L1','Calentador L1 (lavado)','pin','cerdan_n1','Lavado y Enjuague','Calentamiento','calentador','B',null,'{}',null),
  ('PIN-CALE-E2','Calentador E2 (enjuague)','pin','cerdan_n1','Lavado y Enjuague','Calentamiento','calentador','B',null,'{}',null),
  ('PIN-ASPR-L1','Aspersores L1 (lavado)','pin','cerdan_n1','Lavado y Enjuague','Aspersion','aspersor','C',null,'{}','Limpieza de boquillas — preventivo frecuente.'),
  ('PIN-ASPR-E2','Aspersores E2 (enjuague)','pin','cerdan_n1','Lavado y Enjuague','Aspersion','aspersor','C',null,'{}',null),
  ('PIN-CILN-01','Cilindros neumaticos (conjunto)','pin','cerdan_n1','Lavado y Enjuague','Neumatica','neumatico','C',null,'{}','Definir cantidad y ubicacion.'),
  -- PINTURA · secado y transporte
  ('PIN-EXTR-2A','Extractor 2A (secado)','pin','cerdan_n1','Secado','Extraccion','extractor','B',null,'{"PIN-EXTR-2B"}','Redundante con 2B.'),
  ('PIN-EXTR-2B','Extractor 2B (secado)','pin','cerdan_n1','Secado','Extraccion','extractor','B',null,'{"PIN-EXTR-2A"}','Redundante con 2A.'),
  ('PIN-RIEL-01','Motor Riel linea automatica','pin','cerdan_n1','Transporte','Accionamiento','motor','A',null,'{}','Punto unico de falla: si se detiene, para TODA la linea.'),
  -- HERRERIA · BOX5 Hermeticidad
  ('HER-APAR-01','Aparejo electrico 1','her','cerdan_n1','BOX5 Hermeticidad','Elevacion','aparejo','B','IIT 7.1.3 29 Equipos de elevacion','{}',null),
  ('HER-CILN-02','Cilindro neumatico 2','her','cerdan_n1','BOX5 Hermeticidad','Neumatica','neumatico','C',null,'{}',null),
  ('HER-SOLD-01','Soldadora MIG 1','her','cerdan_n1','BOX5 Hermeticidad','Soldadura','soldadora','C','IIT 7.1.3 30 Soldadoras','{}',null),
  -- HERRERIA · BOX4 Tapas Distribucion
  ('HER-APAR-02','Aparejo electrico 2','her','cerdan_n1','BOX4 Tapas Distribucion','Elevacion','aparejo','B','IIT 7.1.3 29 Equipos de elevacion','{}',null),
  ('HER-SOLD-02','Soldadora MIG 2','her','cerdan_n1','BOX4 Tapas Distribucion','Soldadura','soldadora','C','IIT 7.1.3 30 Soldadoras','{}',null),
  -- HERRERIA · BOX3 Soldadura Robot
  ('HER-ROBS-01','Robot de soldadura S1','her','cerdan_n1','BOX3 Soldadura Robot','Robot de soldadura','robot','A',null,'{"HER-ROBS-02"}','Trabaja en pareja con S2 (enfrentados, riel 4 m): deben funcionar los 2. Sin redundancia.'),
  ('HER-ROBS-02','Robot de soldadura S2','her','cerdan_n1','BOX3 Soldadura Robot','Robot de soldadura','robot','A',null,'{"HER-ROBS-01"}','Trabaja en pareja con S1 (enfrentados, riel 4 m): deben funcionar los 2. Sin redundancia.'),
  ('HER-APAR-03','Aparejo electrico 3','her','cerdan_n1','BOX3 Soldadura Robot','Elevacion','aparejo','B','IIT 7.1.3 29 Equipos de elevacion','{}',null),
  ('HER-SOLD-03','Soldadora MIG 3','her','cerdan_n1','BOX3 Soldadura Robot','Soldadura','soldadora','C','IIT 7.1.3 30 Soldadoras','{}','Respaldo manual del robot.'),
  ('HER-SOLD-04','Soldadora MIG 4','her','cerdan_n1','BOX3 Soldadura Robot','Soldadura','soldadora','C','IIT 7.1.3 30 Soldadoras','{}','Respaldo manual del robot.'),
  ('HER-MESB-S1','Mesa Basculante S1','her','cerdan_n1','BOX3 Soldadura Robot','Posicionador','mesa','C',null,'{"HER-ROBS-01"}','Vinculada a Robot S1.'),
  ('HER-MESB-S2','Mesa Basculante S2','her','cerdan_n1','BOX3 Soldadura Robot','Posicionador','mesa','C',null,'{"HER-ROBS-02"}','Vinculada a Robot S2.'),
  -- HERRERIA · BOX2 Soldadura Manual
  ('HER-MESB-M1','Mesa Basculante M1','her','cerdan_n1','BOX2 Soldadura Manual','Posicionador','mesa','C',null,'{}',null),
  ('HER-MESB-M2','Mesa Basculante M2','her','cerdan_n1','BOX2 Soldadura Manual','Posicionador','mesa','C',null,'{}',null),
  ('HER-APAR-04','Aparejo electrico 4','her','cerdan_n1','BOX2 Soldadura Manual','Elevacion','aparejo','B','IIT 7.1.3 29 Equipos de elevacion','{}',null),
  ('HER-APAR-05','Aparejo electrico 5','her','cerdan_n1','BOX2 Soldadura Manual','Elevacion','aparejo','B','IIT 7.1.3 29 Equipos de elevacion','{}',null),
  ('HER-SOLD-05','Soldadora MIG 5','her','cerdan_n1','BOX2 Soldadura Manual','Soldadura','soldadora','C','IIT 7.1.3 30 Soldadoras','{}',null),
  ('HER-SOLD-06','Soldadora MIG 6','her','cerdan_n1','BOX2 Soldadura Manual','Soldadura','soldadora','C','IIT 7.1.3 30 Soldadoras','{}',null),
  -- HERRERIA · BOX1 Soldadura Potencia
  ('HER-SOLD-07','Soldadora MIG 7','her','cerdan_n1','BOX1 Soldadura Potencia','Soldadura','soldadora','B','IIT 7.1.3 30 Soldadoras','{}','Unica de potencia — sin redundancia en su BOX.'),
  -- HERRERIA · BOX6 Linea Rural
  ('HER-PREN-R1','Prensa Tapas Rural','her','cerdan_n1','BOX6 Rural','Prensa','prensa','B',null,'{}','Hidraulica a fichar.'),
  ('HER-REBA-R1','Corte Rebarba Rural','her','cerdan_n1','BOX6 Rural','Corte / rebarbado','corte','C',null,'{}',null),
  ('HER-SOLD-08','Soldadora MIG 8','her','cerdan_n1','BOX6 Rural','Soldadura','soldadora','C','IIT 7.1.3 30 Soldadoras','{}',null),
  ('HER-SOLD-09','Soldadora MIG 9','her','cerdan_n1','BOX6 Rural','Soldadura','soldadora','C','IIT 7.1.3 30 Soldadoras','{}',null),
  ('HER-AUTO-R1','Maquina automatica Rural','her','cerdan_n1','BOX6 Rural','Automatica','automatica','B',null,'{}','Definir funcion exacta con Eric.'),
  ('HER-ROLA-01','Roladora','her','cerdan_n1','BOX6 Rural','Rolado / curvado','roladora','B',null,'{}',null),
  -- HERRERIA · maquinas generales
  ('HER-PLEG-01','Plegadora','her','cerdan_n1','Herreria general','Plegado','plegadora','A','IIT 7.1.3 32 Plegadora CNC V03 / IIT 7.1.3 27 Plegadora Agujereadora','{}','Equipo existente — se traslada desde Lorenzatti. Verificar si es la CNC.'),
  ('HER-GUIL-01','Guillotina','her','cerdan_n1','Herreria general','Corte chapa','guillotina','B','IIT 7.1.3 01 Guillotinas','{}','Equipo existente — se traslada desde Lorenzatti. Trae historial.'),
  ('HER-SIER-01','Sierra Circular','her','cerdan_n1','Herreria general','Corte','sierra','C',null,'{}',null),
  ('HER-RACK-01','Rack electrico estiba chapas','her','cerdan_n1','Herreria general','Almacenamiento automatizado','rack','B',null,'{}','6 motores a fichar individualmente.'),
  ('HER-LASE-01','Corte Laser','her','cerdan_n1','Herreria general','Corte laser','laser','A',null,'{}','Equipo unico y cuello de botella — preventivo intensivo.'),
  -- SERVICIOS
  ('SRV-GRUA-01','Puente Grua 10T','srv','cerdan_n1','Toda la nave','Elevacion (puente)','grua','A','IIT 7.1.3 29 Equipos de elevacion','{}','6 motores. Placas: elevacion ZD1 51-4 13kW N 3395 (04/2025); traslacion YSE90L-4D-B 1,5kW N 0590 (06/2025). Faltan fichar el resto. Anual habilitante.')
on conflict (id) do update set
  nombre = excluded.nombre,
  sector_id = excluded.sector_id,
  planta_id = excluded.planta_id,
  subarea = excluded.subarea,
  tipo = excluded.tipo,
  simbolo = excluded.simbolo,
  criticidad = excluded.criticidad,
  iit_ref = excluded.iit_ref,
  depende_de = excluded.depende_de,
  notas = excluded.notas,
  actualizado_en = now();

-- ---------- Usuarios del equipo de mantenimiento ----------
-- IMPORTANTE: esto crea solo el PERFIL (rol). Las cuentas de login se
-- crean despues con scripts/crear_cuentas_auth.mjs (mismo flujo que el
-- resto de los usuarios de la PWA).
insert into usuarios (nombre, usuario, rol, grupo_nomina, activo) values
  ('Eric Chiarelli', 'eric',    'mantenimiento', null, true),
  ('Nicolas (Mant.)','nicolas', 'mant_tecnico',  null, true),
  ('David (Mant.)',  'david',   'mant_tecnico',  null, true)
on conflict (usuario) do update set
  nombre = excluded.nombre, rol = excluded.rol, activo = excluded.activo;

-- Verificacion:
-- select criticidad, count(*) from mant_activos group by 1 order by 1;  -- A:9 B:22 C:18
-- select sector_id, count(*) from mant_activos group by 1 order by 1;   -- her:30 lam:3 pin:15 srv:1
-- select usuario, rol from usuarios where rol::text like 'mant%';
