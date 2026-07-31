-- ============================================================
-- v1.64 - MANTENIMIENTO · GAMAS PREVENTIVAS (Cronograma RIT 7.1.3/51)
-- 60 gamas extraidas del cronograma preventivo real. La frecuencia se
-- toma del propio texto de la tarea (mensual/semestral/anual/...).
-- 55 vinculadas a un activo (mant_gamas.activo_id) y 5 por familia.
-- Correr DESPUES de seed v1.62 y registros v1.63. Idempotente.
-- ============================================================

-- Recarga limpia del cronograma (las OT ya generadas quedan con gama_id = null
-- por el "on delete set null" de la FK; no se toca OT ni historial):
delete from public.mant_gamas;

insert into public.mant_gamas (activo_id, familia, tarea, frecuencia, responsable, orden) values
  ('HER-BALA-01', null, 'Lubricar con grasa los alemites (Mensual)', 'mensual', 'mantenimiento', 0),
  ('BOB-BOBI-01', null, 'Controlar el estado general de la transmisión. (Anual)', 'anual', 'mantenimiento', 1),
  ('BOB-BOBI-02', null, 'Controlar el estado general de la transmisión. (Anual)', 'anual', 'mantenimiento', 2),
  ('BOB-BOBI-07', null, 'Controlar el estado general de la transmisión. (Anual)', 'anual', 'mantenimiento', 3),
  ('BOB-BOBI-05', null, 'Revisión del nivel de aceite de los reductores del motor del usillo y del motor del carro. (Anual)', 'anual', 'mantenimiento', 4),
  ('BOB-BOBI-06', null, 'Revisión del nivel de aceite de los reductores del motor del usillo y del motor del carro. (Anual)', 'anual', 'mantenimiento', 5),
  ('BOB-BOBI-03', null, 'Revisión de nivel de aceite de los reductores del motor del usillo y del motor del carro. (Anual)', 'anual', 'mantenimiento', 6),
  ('BOB-BOBI-10', null, 'Revisión de nivel de aceite de los reductores del motor del usillo y del motor del carro. (Anual)', 'anual', 'mantenimiento', 7),
  ('BOB-BOBI-11', null, 'Revisión de nivel de aceite de los reductores del motor del usillo y del motor del carro. (Anual)', 'anual', 'mantenimiento', 8),
  ('BOB-BOBI-12', null, 'Controlar el estado general de la transmisión. (Anual)', 'anual', 'mantenimiento', 9),
  ('BOB-BOBI-16', null, 'Controlar el estado general de la transmisión. (Anual)', 'anual', 'mantenimiento', 10),
  ('BOB-BOBI-13', null, 'Controlar el estado general de la transmisión. (Anual)', 'anual', 'mantenimiento', 11),
  ('BOB-BOBI-14', null, 'Controlar el estado general de la transmisión. (Anual)', 'anual', 'mantenimiento', 12),
  ('BOB-BOBI-15', null, 'Controlar el estado general de la transmisión (Anual)', 'anual', 'mantenimiento', 13),
  ('PIN-CABI-01', null, 'Cambio de filtros de cartón laberíntico (mensual)', 'mensual', 'mantenimiento', 14),
  ('PIN-CABI-01', null, 'Cambio de filtros de fibra (mensual, junto al filtro laberintico)', 'mensual', 'mantenimiento', 15),
  ('PIN-CABI-01', null, 'Inspección de aspas de ventilación (anual)', 'anual', 'mantenimiento', 16),
  ('PIN-CABI-01', null, 'Control de conexiones eléctricas, conductores a motores eléctricos y elementos de arranque (semestral)', 'semestral', 'mantenimiento', 17),
  ('HER-GUIL-01', null, 'Engrasado de alemites (Mensual)', 'mensual', 'mantenimiento', 18),
  ('HER-GUIL-01', null, 'Revision de cuchillas (semestral)', 'semestral', 'mantenimiento', 19),
  ('SRV-HIDR-01', null, 'Cambio de aceite de bomba (cada 200 hs.) (Trimestral)', 'trimestral', 'mantenimiento', 20),
  ('HER-PLEG-01', null, 'Cambio de aceite de la bomba hidráulica (Trimestral)', 'trimestral', 'mantenimiento', 21),
  ('HER-PREN-01', null, 'Cambio de filtros de aceite (semestral)', 'semestral', 'mantenimiento', 22),
  ('HER-PREN-01', null, 'Cambio de aceite (semestral)', 'semestral', 'mantenimiento', 23),
  ('VAC-BOMB-01', null, 'Verificar el nivel de aceite.(mensual)', 'mensual', 'mantenimiento', 24),
  ('VAC-BOMB-01', null, 'Inspeccionar las superficies de los rotores y la carcasa. (Mensual)', 'mensual', 'mantenimiento', 25),
  ('VAC-BOMB-01', null, 'Detectar posibles fugas de presión. Revisar la válvula de alivio y su resorte. (Mensual)', 'mensual', 'mantenimiento', 26),
  ('HOR-HORN-01', null, 'Control del nivel de aceite, de agua y filtros de aire (mensual)', 'mensual', 'mantenimiento', 27),
  ('HOR-HORN-01', null, 'limpieza pre-filtro ( mensual)', 'mensual', 'mantenimiento', 28),
  ('HOR-HORN-01', null, 'Cambiar el filtro de aire (Bimestral)', 'mensual', 'mantenimiento', 29),
  ('HER-PLEG-01', null, 'Revisión del nivel de aceite (mensual)', 'mensual', 'mantenimiento', 30),
  ('HER-PLEG-01', null, 'Limpiar los componentes hidráulicos (Mensual)', 'mensual', 'mantenimiento', 31),
  ('HER-PLEG-01', null, 'Verificar tuberías de aceite, estado de matrices y comprobar el funcionamiento de los dispositivos de seguridad (Mensual)', 'mensual', 'mantenimiento', 32),
  ('HER-PLEG-01', null, 'Cambiar el aceite hidráulico. Limpiar el depósito de aceite. Reemplazar o limpiar completamente el filtro (cada 200 horas de funcionamiento). (Trimestral).', 'trimestral', 'mantenimiento', 33),
  (null, 'Soldadoras', 'Limpieza interna (mensual)', 'mensual', 'mantenimiento', 34),
  ('HER-TALA-01', null, 'Lubricación de las partes móviles (mensual)', 'mensual', 'mantenimiento', 35),
  ('HER-TALA-01', null, 'Verificación parte eléctrica (Mensual)', 'mensual', 'mantenimiento', 36),
  ('HER-TALA-01', null, 'Verificación correa y polea (Anual)', 'anual', 'mantenimiento', 37),
  ('SRV-APAR-01', null, 'Revisar la instalación eléctrica (estado de conectores, cables). (Trimestral)', 'trimestral', 'mantenimiento', 38),
  ('SRV-APAR-01', null, 'Controlar el estado del cable de izaje. Controlar fin de carrera, límites de izaje, poleas, frenos y controles eléctricos y de mando, y el estado de botoneras. (Trimestral)', 'trimestral', 'mantenimiento', 39),
  ('SRV-APAR-01', null, 'Realizar un examen visual del gancho y verificar la presencia de pestillo de seguridad. (Trimestral)', 'trimestral', 'mantenimiento', 40),
  ('VAC-FILT-01', null, 'Filtro magnético: limpiar varilla magnética. (mensual)', 'mensual', 'mantenimiento', 41),
  ('VAC-FILT-01', null, 'Filtro rugoso: limpiar filtro. (mensual)', 'mensual', 'mantenimiento', 42),
  ('VAC-FILT-01', null, 'Controlador de temperatura: comprobar punto de ruptura (punto de conexión) (Trimestral)', 'trimestral', 'mantenimiento', 43),
  ('VAC-FILT-01', null, 'Sensor de temperatura: comprobar función (Trimestral)', 'trimestral', 'mantenimiento', 44),
  ('VAC-FILT-01', null, 'Válvula electromagnética de entrada de aire: comprobar función (Trimestral)', 'trimestral', 'mantenimiento', 45),
  ('VAC-FILT-01', null, 'Controlador de nivel de líquido: comprobar funcionamiento (Trimestral)', 'trimestral', 'mantenimiento', 46),
  ('VAC-FILT-01', null, 'Interruptor fotoeléctrico: comprobar funcionamiento (Trimestral)', 'trimestral', 'mantenimiento', 47),
  ('VAC-FILT-01', null, 'Medidor de vacío: comprobar funcionamiento (Trimestral)', 'trimestral', 'mantenimiento', 48),
  ('VAC-FILT-01', null, 'Bomba de extracción de aceite: comprobar capacidad de funcionamiento (Trimestral)', 'trimestral', 'mantenimiento', 49),
  ('VAC-FILT-01', null, 'Mecanismo: comprobar conexión (Trimestral)', 'trimestral', 'mantenimiento', 50),
  ('VAC-FILT-01', null, 'Grado de vacío: comprobar fugas (Trimestral)', 'trimestral', 'mantenimiento', 51),
  ('SRV-COMP-01', null, 'cambio aceite y filtros ( cada 500 hs, aviso auto)', 'mensual', 'mantenimiento', 52),
  ('HER-PANT-01', null, 'limpieza guias, cremallera, patines, engrase ( mensual)', 'mensual', 'mantenimiento', 53),
  ('HER-PANT-01', null, 'limpieza de filtro araña ( quincenal )', 'quincenal', 'mantenimiento', 54),
  (null, 'Iluminación', 'control y cambio de luminarias (quincenal)', 'quincenal', 'mantenimiento', 55),
  (null, 'Iluminación', 'control de luces de emergencia (mensual)', 'mensual', 'mantenimiento', 56),
  (null, 'Tanques Pulmon', 'Realizar purgas de fondo (mensual)', 'mensual', 'mantenimiento', 57),
  (null, 'Tanques Pulmon', 'Accionamiento de la valvula de seguridad (mensual)', 'mensual', 'mantenimiento', 58),
  ('HOR-HORN-01', null, 'revisar nivel de aceite y purgar cada 15 dias', 'trimestral', 'mantenimiento', 59);

-- Verificacion:
-- select frecuencia, count(*) from mant_gamas group by 1 order by 2 desc;
-- select coalesce(activo_id, '[familia] '||familia) k, count(*) from mant_gamas group by 1 order by 1;
