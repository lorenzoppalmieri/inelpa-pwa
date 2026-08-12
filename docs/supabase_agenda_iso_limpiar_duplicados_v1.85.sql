-- ============================================================
-- v1.85 — LIMPIAR LA AGENDA ISO: filas viejas con la codificacion rota
--
-- En pantalla conviven dos versiones de la misma actividad:
--     AUDITORÍA INTERNA COMPRAS      <- importada del R.I.T (v1.84), correcta
--     AuditorÃ­a interna Compras     <- fila vieja, con el texto mal codificado
--
-- La segunda no la genero el import: ya estaba en la tabla. El texto se guardo
-- en UTF-8 pero se leyo como Latin-1 ("í" -> "Ã­", "ó" -> "Ã³", "ñ" -> "Ã±").
-- Como tienen otro `id`, el `on conflict` del import no las pudo pisar y
-- quedaron DUPLICADAS.
--
-- ⚠ MIRAR EL PASO 1 ANTES DE BORRAR NADA. El paso 3 elimina filas.
-- ============================================================


-- ------------------------------------------------------------
-- 1) DIAGNOSTICO (solo lectura) — cuales son y si tienen trabajo encima.
--    Si `tiene_trabajo` = true, esa fila NO se borra: hay que repararla
--    (paso 2) en vez de eliminarla.
-- ------------------------------------------------------------
select
  id,
  titulo,
  -- Como se veria el titulo bien decodificado:
  convert_from(convert_to(titulo, 'LATIN1'), 'UTF8') as titulo_reparado,
  estado,
  fecha_objetivo,
  (semanas is not null and jsonb_array_length(semanas) > 0) as tiene_semanas,
  (coalesce(evidencia, '') <> ''
   or coalesce(resultado, '') <> ''
   or coalesce(verificacion, '') <> ''
   or completada_en is not null
   or estado not in ('planificada', 'sin_programar'))       as tiene_trabajo
from sgo_agenda_iso
where titulo like '%Ã%' or titulo like '%Â%'
order by titulo;


-- ------------------------------------------------------------
-- 2) REPARAR EL TEXTO (no borra nada).
--    Corrige la codificacion de TODAS las filas afectadas. Si alguna tenia
--    trabajo cargado, con esto queda legible y se conserva.
--    Es idempotente: sobre un texto ya correcto no hace nada porque el WHERE
--    solo alcanza a los que tienen 'Ã' o 'Â'.
-- ------------------------------------------------------------
-- update sgo_agenda_iso
-- set titulo = convert_from(convert_to(titulo, 'LATIN1'), 'UTF8'),
--     actualizado_en = now(), actualizado_por = 'fix_encoding'
-- where titulo like '%Ã%' or titulo like '%Â%';


-- ------------------------------------------------------------
-- 3) ELIMINAR LAS DUPLICADAS VACIAS.
--    Borra SOLO las filas mal codificadas que:
--      - no tienen ninguna semana marcada,
--      - no tienen evidencia, resultado ni verificacion,
--      - siguen en estado inicial,
--      - y ya existe la version buena importada del R.I.T (id 'ag_%').
--    Cualquier fila con trabajo encima sobrevive: se repara con el paso 2.
--
--    Correr DESPUES de revisar el paso 1.
-- ------------------------------------------------------------
-- delete from sgo_agenda_iso v
-- where (v.titulo like '%Ã%' or v.titulo like '%Â%')
--   and v.id not like 'ag\_%'
--   and coalesce(jsonb_array_length(v.semanas), 0) = 0
--   and coalesce(v.evidencia, '') = ''
--   and coalesce(v.resultado, '') = ''
--   and coalesce(v.verificacion, '') = ''
--   and v.completada_en is null
--   and v.estado in ('planificada', 'sin_programar')
--   and exists (
--     select 1 from sgo_agenda_iso b
--     where b.id like 'ag\_%'
--       and upper(b.titulo) = upper(convert_from(convert_to(v.titulo, 'LATIN1'), 'UTF8'))
--   );


-- ------------------------------------------------------------
-- 4) SI QUEDAN HUERFANAS — filas viejas sin equivalente importado.
--    Estas NO se borran automaticamente: puede que sean actividades que el
--    R.I.T no tiene y que igual haga falta conservar. Revisalas a mano.
-- ------------------------------------------------------------
select id, titulo, estado
from sgo_agenda_iso v
where v.id not like 'ag\_%'
order by titulo;


-- ============================================================
-- 5) VERIFICACION FINAL
-- ============================================================
-- select count(*) filter (where titulo like '%Ã%' or titulo like '%Â%') as mal_codificadas,
--        count(*) filter (where id like 'ag\_%')                        as importadas_rit,
--        count(*)                                                       as total
-- from sgo_agenda_iso;
--   Esperado: mal_codificadas = 0 · importadas_rit = 36
