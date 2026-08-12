-- ============================================================
-- v1.84 — AGENDA ISO COMO MATRIZ AÑO x SEMANA (R.I.T 6.2/05)
--
-- La planilla real marca la semana con el CASILLERO PINTADO: el texto de la
-- celda no significa nada (verificado con Lorenzo). Y una actividad ocupa
-- VARIAS semanas —una auditoria se hace en dias distintos— y se reprograma
-- seguido, sobre todo Azul. Por eso `fecha_objetivo` (una sola fecha) no
-- alcanzaba: se agrega `semanas` jsonb.
--
-- ⚠ CORRER ANTES DEL `git push`. Idempotente: se puede correr dos veces.
--
-- NOTA sobre la forma del INSERT: se usa `insert ... values` DIRECTO y no
-- `insert ... select from (values ...)`. Con la segunda forma Postgres resuelve
-- cada literal a `text` antes de llegar a la tabla y falla contra columnas que
-- no son text (`normas` es text[], y estado/criticidad pueden ser enums):
--     ERROR 42804: column "normas" is of type text[] but expression is of type jsonb
-- Con el insert directo, cada literal se convierte al tipo de SU columna.
-- ============================================================

-- ------------------------------------------------------------
-- 1) COLUMNAS NUEVAS
-- ------------------------------------------------------------
alter table sgo_agenda_iso add column if not exists semanas jsonb;
alter table sgo_agenda_iso add column if not exists bloque  text;
alter table sgo_agenda_iso add column if not exists orden   integer;

comment on column sgo_agenda_iso.semanas is
  'v1.84: [{anio,mes,semana,hecha}] — semana DEL MES (1-5), como en el papel.';
comment on column sgo_agenda_iso.bloque is
  'Bloque del R.I.T 6.2/05: generales | legal_hys | mediciones.';

-- ------------------------------------------------------------
-- 2) DIAGNOSTICO PREVIO (solo lectura) — ¿que hay cargado hoy?
--    Mirá esto ANTES del paso 3 para no duplicar lo que ya exista.
-- ------------------------------------------------------------
-- select id, titulo, categoria, fecha_objetivo, estado from sgo_agenda_iso order by titulo;

-- ------------------------------------------------------------
-- 3) IMPORTACION del R.I.T 6.2/05 (hojas 2025 y 2026).
--    36 actividades, 122 semanas marcadas, leidas del COLOR de celda.
--    `on conflict` actualiza las semanas pero NO pisa estado ni evidencia:
--    si alguien ya trabajo sobre una actividad, eso se respeta.
-- ------------------------------------------------------------
insert into sgo_agenda_iso (
  id, titulo, categoria, bloque, orden, normas, responsable, frecuencia, semanas,
  aviso_dias, estado, criticidad, fuente,
  creado_en, creado_por, actualizado_en, actualizado_por
) values
  ('ag_auditoria_iso_9001_iso_14001', 'AUDITORÍA ISO 9001-ISO 14001', 'auditoria_externa', 'generales', 1,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2025, "mes": 4, "semana": 1, "hecha": false}]',
   0, 'planificada', 'critica', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_5s', 'AUDITORÍA 5S', 'auditoria_interna', 'generales', 2,
   '{iso_9001}', 'azul', 'mensual', '[{"anio": 2025, "mes": 1, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 2, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 3, "semana": 5, "hecha": false}, {"anio": 2025, "mes": 4, "semana": 5, "hecha": false}, {"anio": 2025, "mes": 5, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 6, "semana": 5, "hecha": false}, {"anio": 2025, "mes": 7, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 8, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 9, "semana": 5, "hecha": false}, {"anio": 2025, "mes": 10, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 11, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 12, "semana": 5, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_informe_auditoria_5s', 'INFORME AUDITORÍA 5S', 'informe', 'generales', 3,
   '{iso_9001}', 'azul', 'mensual', '[{"anio": 2025, "mes": 1, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 2, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 3, "semana": 5, "hecha": false}, {"anio": 2025, "mes": 4, "semana": 5, "hecha": false}, {"anio": 2025, "mes": 5, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 6, "semana": 5, "hecha": false}, {"anio": 2025, "mes": 7, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 8, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 9, "semana": 5, "hecha": false}, {"anio": 2025, "mes": 10, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 11, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 12, "semana": 5, "hecha": false}]',
   0, 'planificada', 'media', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_sgi', 'AUDITORÍA INTERNA  SGI', 'auditoria_interna', 'generales', 4,
   '{sgi}', 'azul', 'unica', '[{"anio": 2025, "mes": 3, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 2, "semana": 1, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_informe_revision_por_la_direccion', 'INFORME REVISIÓN POR LA DIRECCIÓN', 'informe', 'generales', 5,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2025, "mes": 3, "semana": 5, "hecha": false}, {"anio": 2026, "mes": 3, "semana": 1, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_informe_mejora_continua_y_no_conformidades', 'INFORME MEJORA CONTINUA Y NO CONFORMIDADES', 'informe', 'generales', 6,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2025, "mes": 1, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 2, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 3, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 4, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 5, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 6, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 7, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 8, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 9, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 10, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 11, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 12, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 1, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 2, "semana": 3, "hecha": false}, {"anio": 2026, "mes": 3, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 4, "semana": 3, "hecha": false}, {"anio": 2026, "mes": 5, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 6, "semana": 3, "hecha": false}, {"anio": 2026, "mes": 7, "semana": 3, "hecha": false}, {"anio": 2026, "mes": 8, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 9, "semana": 3, "hecha": false}, {"anio": 2026, "mes": 10, "semana": 3, "hecha": false}, {"anio": 2026, "mes": 11, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 12, "semana": 3, "hecha": false}]',
   0, 'planificada', 'media', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_informe_transformadores_en_garantia', 'INFORME TRANSFORMADORES EN GARANTÍA', 'informe', 'generales', 7,
   '{iso_9001}', 'azul', 'semestral', '[{"anio": 2025, "mes": 2, "semana": 1, "hecha": false}, {"anio": 2025, "mes": 8, "semana": 1, "hecha": false}, {"anio": 2025, "mes": 12, "semana": 2, "hecha": false}, {"anio": 2026, "mes": 7, "semana": 1, "hecha": false}, {"anio": 2026, "mes": 12, "semana": 2, "hecha": false}, {"anio": 2026, "mes": 12, "semana": 4, "hecha": false}]',
   0, 'planificada', 'media', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_reunion_comite_mixto', 'REUNIÓN COMITÉ MIXTO', 'reunion', 'generales', 8,
   '{iso_9001}', 'azul', 'trimestral', '[{"anio": 2025, "mes": 2, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 3, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 5, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 6, "semana": 2, "hecha": false}, {"anio": 2025, "mes": 8, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 9, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 11, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 12, "semana": 2, "hecha": false}, {"anio": 2026, "mes": 3, "semana": 3, "hecha": false}, {"anio": 2026, "mes": 6, "semana": 2, "hecha": false}, {"anio": 2026, "mes": 9, "semana": 2, "hecha": false}, {"anio": 2026, "mes": 12, "semana": 2, "hecha": false}]',
   0, 'planificada', 'media', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_svcc', 'SVCC*', 'legal_hys', 'legal_hys', 1,
   '{iso_45001}', 'azul', 'unica', '[{"anio": 2025, "mes": 3, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 3, "semana": 4, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_rgl', 'RGL', 'legal_hys', 'legal_hys', 2,
   '{iso_45001}', 'azul', 'unica', '[{"anio": 2025, "mes": 3, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 3, "semana": 4, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_ntear', 'NTEAR', 'legal_hys', 'legal_hys', 3,
   '{iso_45001}', 'azul', 'unica', '[{"anio": 2025, "mes": 3, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 3, "semana": 4, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_ruido', 'Ruido', 'medicion', 'mediciones', 1,
   '{iso_45001,iso_14001}', 'azul', 'anual', '[{"anio": 2025, "mes": 4, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 4, "semana": 5, "hecha": false}, {"anio": 2026, "mes": 4, "semana": 4, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_iluminacion', 'Iluminación', 'medicion', 'mediciones', 2,
   '{iso_45001,iso_14001}', 'azul', 'anual', '[{"anio": 2025, "mes": 10, "semana": 1, "hecha": false}, {"anio": 2025, "mes": 11, "semana": 3, "hecha": false}, {"anio": 2026, "mes": 11, "semana": 4, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_puesta_a_tierra', 'Puesta a Tierra', 'medicion', 'mediciones', 3,
   '{iso_45001,iso_14001}', 'azul', 'anual', '[{"anio": 2025, "mes": 9, "semana": 3, "hecha": false}, {"anio": 2025, "mes": 12, "semana": 1, "hecha": false}, {"anio": 2026, "mes": 4, "semana": 2, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_calidad_de_aire_ambiental', 'Calidad de aire ambiental', 'medicion', 'mediciones', 4,
   '{iso_45001,iso_14001}', 'azul', 'anual', '[{"anio": 2025, "mes": 3, "semana": 3, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_mediciones_en_puesto_laboral', 'Mediciones en puesto laboral', 'medicion', 'mediciones', 5,
   '{iso_45001,iso_14001}', 'azul', 'anual', '[{"anio": 2025, "mes": 3, "semana": 3, "hecha": false}, {"anio": 2026, "mes": 4, "semana": 1, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_agua_para_consumo_humano_bacteriologico', 'Agua para consumo humano bacteriologico', 'medicion', 'mediciones', 6,
   '{iso_45001,iso_14001}', 'azul', 'semestral', '[{"anio": 2025, "mes": 5, "semana": 2, "hecha": false}, {"anio": 2025, "mes": 8, "semana": 4, "hecha": false}, {"anio": 2025, "mes": 11, "semana": 2, "hecha": false}, {"anio": 2026, "mes": 2, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 6, "semana": 2, "hecha": false}, {"anio": 2026, "mes": 12, "semana": 2, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_agua_para_consumo_humano_fisico_quimico', 'Agua para consumo humano fisico quimico', 'medicion', 'mediciones', 7,
   '{iso_45001,iso_14001}', 'azul', 'anual', '[{"anio": 2025, "mes": 11, "semana": 2, "hecha": false}, {"anio": 2026, "mes": 2, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 12, "semana": 2, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_efluentes', 'Efluentes', 'medicion', 'mediciones', 8,
   '{iso_45001,iso_14001}', 'azul', 'anual', '[{"anio": 2025, "mes": 11, "semana": 2, "hecha": false}, {"anio": 2026, "mes": 2, "semana": 4, "hecha": false}, {"anio": 2026, "mes": 12, "semana": 2, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_aparatos_sometidos_a_presion', 'Aparatos sometidos a presión', 'medicion', 'mediciones', 9,
   '{iso_45001,iso_14001}', 'azul', 'anual', '[{"anio": 2025, "mes": 7, "semana": 2, "hecha": false}, {"anio": 2025, "mes": 8, "semana": 3, "hecha": false}, {"anio": 2026, "mes": 8, "semana": 4, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_iso', 'AUDITORÍA ISO', 'auditoria_externa', 'generales', 9,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2026, "mes": 3, "semana": 2, "hecha": false}]',
   0, 'planificada', 'critica', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_compras', 'AUDITORÍA INTERNA COMPRAS', 'auditoria_interna', 'generales', 10,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2026, "mes": 10, "semana": 1, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_ventas', 'AUDITORÍA INTERNA VENTAS', 'auditoria_interna', 'generales', 11,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2026, "mes": 10, "semana": 2, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_diseno', 'AUDITORÍA INTERNA DISEÑO', 'auditoria_interna', 'generales', 12,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2026, "mes": 10, "semana": 3, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_recursos_humanos', 'AUDITORÍA INTERNA RECURSOS HUMANOS', 'auditoria_interna', 'generales', 13,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2026, "mes": 10, "semana": 4, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_produccion_laboratorio', 'AUDITORÍA INTERNA PRODUCCIÓN/LABORATORIO', 'auditoria_interna', 'generales', 14,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2026, "mes": 11, "semana": 1, "hecha": false}, {"anio": 2026, "mes": 11, "semana": 2, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_mantenimiento_automatismo', 'AUDITORÍA INTERNA MANTENIMIENTO/AUTOMATISMO', 'auditoria_interna', 'generales', 15,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2026, "mes": 11, "semana": 3, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_contabilidad', 'AUDITORÍA INTERNA CONTABILIDAD', 'auditoria_interna', 'generales', 16,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2026, "mes": 11, "semana": 4, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_its', 'AUDITORÍA INTERNA ITS', 'auditoria_interna', 'generales', 17,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2026, "mes": 11, "semana": 5, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_direccion', 'AUDITORÍA INTERNA DIRECCIÓN', 'auditoria_interna', 'generales', 18,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2026, "mes": 12, "semana": 1, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_logistica', 'AUDITORÍA INTERNA LOGÍSTICA', 'auditoria_interna', 'generales', 19,
   '{iso_9001}', 'azul', 'unica', '[{"anio": 2026, "mes": 12, "semana": 2, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_sst', 'AUDITORÍA INTERNA SST', 'auditoria_interna', 'generales', 20,
   '{iso_45001}', 'azul', 'unica', '[{"anio": 2026, "mes": 12, "semana": 2, "hecha": false}, {"anio": 2026, "mes": 12, "semana": 3, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_auditoria_interna_sga', 'AUDITORÍA INTERNA SGA', 'auditoria_interna', 'generales', 21,
   '{iso_14001}', 'azul', 'unica', '[{"anio": 2026, "mes": 12, "semana": 4, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_vibraciones_de_cuerpo_entero_mano_brazo', 'Vibraciones de cuerpo entero/mano-brazo', 'medicion', 'mediciones', 10,
   '{iso_45001,iso_14001}', 'azul', 'unica', '[{"anio": 2026, "mes": 7, "semana": 3, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_calidad_de_aire_ambiental_emisiones', 'Calidad de aire ambiental/ emisiones', 'medicion', 'mediciones', 11,
   '{iso_45001,iso_14001}', 'azul', 'anual', '[{"anio": 2026, "mes": 4, "semana": 1, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit'),
  ('ag_carga_termica', 'Carga térmica', 'medicion', 'mediciones', 12,
   '{iso_45001,iso_14001}', 'azul', 'unica', '[{"anio": 2026, "mes": 2, "semana": 3, "hecha": false}]',
   0, 'planificada', 'alta', 'R.I.T 6.2/05',
   now(), 'import_rit', now(), 'import_rit')
on conflict (id) do update set
  semanas    = excluded.semanas,
  bloque     = excluded.bloque,
  orden      = excluded.orden,
  frecuencia = excluded.frecuencia,
  actualizado_en  = now(),
  actualizado_por = 'import_rit';

-- ============================================================
-- 4) VERIFICACION
-- ============================================================
-- select bloque, count(*) as actividades,
--        sum(jsonb_array_length(coalesce(semanas,'[]'::jsonb))) as semanas_marcadas
-- from sgo_agenda_iso group by bloque order by bloque;
--   Esperado: generales 21 · legal_hys 3 · mediciones 12   (36 / 122 semanas)
--
-- Carga por mes de 2026 (tiene que coincidir con el grafico de la pantalla):
-- select (s->>'mes')::int as mes, count(*)
-- from sgo_agenda_iso, jsonb_array_elements(semanas) s
-- where (s->>'anio')::int = 2026 group by 1 order by 1;
--   Esperado: el grueso en oct/nov/dic.
