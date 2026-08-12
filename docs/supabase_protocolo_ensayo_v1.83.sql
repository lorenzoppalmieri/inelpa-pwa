-- ============================================================
-- v1.83 — PROTOCOLO DE ENSAYO EN LA APP (RPH 8.6/03 V03)
--
-- El panel de laboratorio NO guardaba nada: `guardar()` hacia un console.log
-- con un "pendiente: persistir el ensayo". Ahora la planilla completa (las 9
-- secciones) se guarda en la ficha.
--
-- Todo el protocolo va en UNA columna jsonb en vez de ~60 columnas sueltas:
--   * la planilla cambia de version cada tanto (hoy es la V03) y agregar/quitar
--     un casillero no puede implicar una migracion cada vez;
--   * son datos que se leen SIEMPRE completos, junto con la ficha, nunca de a
--     un campo, asi que no se gana nada normalizando;
--   * es texto corto, no binarios: no rompe el espejo Dexie de las tablets
--     (los PDF siguen yendo a Storage, ver v1.47).
--
-- ⚠ CORRER **ANTES** DEL `git push`: el front nuevo escribe en esta columna.
-- Idempotente: se puede correr dos veces.
-- ============================================================


-- ------------------------------------------------------------
-- 1) LA COLUMNA
-- ------------------------------------------------------------
alter table laboratorio add column if not exists mediciones jsonb;

comment on column laboratorio.mediciones is
  'v1.83: protocolo de ensayo completo (RPH 8.6/03): cabecera, relacion de '
  'transformacion, resistencias, aislamiento, perdidas en carga y vacio, '
  'tension aplicada/inducida, estanqueidad, pintura y conclusion. Incluye las '
  'MEDICIONES cargadas y los RESULTADOS congelados al momento de guardar.';


-- ------------------------------------------------------------
-- 2) INDICE PARA BUSCAR POR N° DE FABRICACION
--    Es el numero con el que el cliente reclama un protocolo. Sin indice, cada
--    busqueda recorre toda la tabla.
-- ------------------------------------------------------------
create index if not exists laboratorio_nro_fabricacion_idx
  on laboratorio ((mediciones -> 'cabecera' ->> 'nroFabricacion'))
  where mediciones is not null;


-- ============================================================
-- 3) VERIFICACION (correr DESPUES del push, con un protocolo ya guardado)
-- ============================================================
-- select id, modelo, nro_serie,
--        mediciones -> 'cabecera' ->> 'nroFabricacion' as nro_fabricacion,
--        mediciones -> 'resultados' ->> 'p0'      as p0_w,
--        mediciones -> 'resultados' ->> 'pccRef'  as pcc75_w,
--        mediciones -> 'resultados' ->> 'uccPct'  as ucc_pct,
--        mediciones -> 'resultados' ->> 'pTotal'  as p_total_w,
--        mediciones ->> 'guardadoPor'             as guardado_por,
--        mediciones ->> 'guardadoEn'              as guardado_en
-- from laboratorio
-- where mediciones is not null
-- order by mediciones ->> 'guardadoEn' desc nulls last;


-- ============================================================
-- 4) CONTROL DE CALIDAD DEL DATO — protocolos fuera de tolerancia.
--    Sirve para revisar de un vistazo si el criterio automatico coincide con
--    lo que despues marco el laboratorista en los toggles de la ficha.
-- ============================================================
-- select l.nro_serie, l.modelo,
--        round((l.mediciones -> 'resultados' ->> 'p0')::numeric, 1)     as p0,
--        round((l.mediciones -> 'resultados' ->> 'pccRef')::numeric, 1) as pcc75,
--        round((l.mediciones -> 'resultados' ->> 'uccPct')::numeric, 2) as ucc_pct,
--        l.ensayos ->> 'perdidas_vacio' as marca_vacio,
--        l.ensayos ->> 'perdida_cc'     as marca_cc
-- from laboratorio l
-- where l.mediciones -> 'resultados' is not null
-- order by l.creada_en desc;
