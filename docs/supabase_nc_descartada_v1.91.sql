-- ============================================================
-- v1.91 — DESCARTAR UNA NO CONFORMIDAD (Detalle por tarea)
--
-- El planificador ve la parada de calidad —causa, fecha, duracion y la
-- observacion del operario— y decide si amerita abrir una NC en SGO. Hasta
-- ahora solo podia crearla; si no correspondia, el boton "+ NC" quedaba
-- reclamando para siempre y no habia forma de distinguir "todavia no lo mire"
-- de "lo mire y decidi que no".
--
-- La parada NO se borra ni cambia: sigue contando como demora justificada y
-- sigue apareciendo en el Pareto. Lo unico que se guarda es la DECISION, con
-- motivo y autor, porque ante una auditoria hay que poder explicarla.
--
-- ⚠ CORRER ANTES DEL `git push`. Idempotente.
-- ============================================================


-- ------------------------------------------------------------
-- 1) COLUMNAS
-- ------------------------------------------------------------
alter table paradas add column if not exists nc_descartada      boolean;
alter table paradas add column if not exists nc_descartada_por  text;
alter table paradas add column if not exists nc_descartada_en   timestamptz;
alter table paradas add column if not exists nc_motivo_descarte text;

comment on column paradas.nc_descartada is
  'v1.91: el planificador decidio que esta parada de calidad NO amerita abrir '
  'una no conformidad en SGO. No afecta el calculo de demoras ni el Pareto: '
  'solo deja de reclamarla en "Detalle por tarea". Reversible.';


-- ------------------------------------------------------------
-- 2) INDICE PARCIAL — para listar rapido las decisiones tomadas.
--    Parcial porque la enorme mayoria de las paradas nunca se descarta.
-- ------------------------------------------------------------
create index if not exists paradas_nc_descartada_idx
  on paradas (nc_descartada_en desc)
  where nc_descartada is true;


-- ============================================================
-- 3) VERIFICACION (correr despues del push, con alguna ya descartada)
-- ============================================================
-- select p.id, p.causa, p.inicio, p.observacion,
--        p.nc_descartada_por, p.nc_descartada_en, p.nc_motivo_descarte,
--        t.modelo, t.nro_transformador
-- from paradas p
-- join tareas t on t.id = p.tarea_id
-- where p.nc_descartada is true
-- order by p.nc_descartada_en desc;


-- ============================================================
-- 4) CONTROL DE GESTION — paradas de calidad sin resolver.
--    Ni convertidas en NC ni descartadas: son las que siguen esperando una
--    decision del planificador. Sirve para que no se acumulen.
-- ============================================================
-- select t.modelo, t.nro_transformador, p.causa, p.inicio, p.observacion
-- from paradas p
-- join tareas t on t.id = p.tarea_id
-- where p.causa in (
--   -- bobinado
--   'taco_defectuoso','retrabajo','calidad_alambre','bobina_bt_defectuosa',
--   -- herreria
--   'her_retrabajo_tercero','her_retrabajo_propio','her_retrabajo_cuba_tapa_tanque',
--   'her_retrabajo','her_retrabajo_otro_sector','her_retrabajo_proveedor','her_perdidas_hermetizado',
--   -- montaje
--   'mon_retrabajo_bobina','mon_no_da_relacion','mon_insumos_defectuosos',
--   'mon_modif_materiales','mon_solucionando_retrabajo'
-- )
--   and coalesce(p.nc_descartada, false) = false
--   and not exists (select 1 from sgo_eventos e where e.parada_id = p.id)
-- order by p.inicio desc;
