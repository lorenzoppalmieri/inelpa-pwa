-- ============================================================
-- v1.87 — LIMPIEZA DEFINITIVA DE LA AGENDA ISO
--
-- Reemplaza a v1.85 y v1.86. Aquellos borraban solo las filas con el texto
-- roto ("AuditorÃ­a interna...") y por eso quedaron vivas las legacy SIN
-- acentos —"Mediciones en puesto laboral", "Calidad de aire ambiental /
-- emisiones"— que se ven duplicadas igual.
--
-- CRITERIO CORRECTO: la agenda ahora sale del R.I.T 6.2/05. Todas las filas
-- importadas tienen id 'ag_%'. Cualquier otra es de una carga anterior y sobra,
-- tenga o no acentos rotos.
--
-- SE CORRE ENTERO, DE UNA VEZ. Nada con trabajo cargado se pierde: el paso 2
-- repara y preserva esas filas antes de que el paso 3 borre.
-- ============================================================


-- ------------------------------------------------------------
-- 1) ANTES (solo lectura) — qué se va a tocar.
-- ------------------------------------------------------------
select
  case
    when id like 'ag\_%' and titulo ilike '%5S%'  then 'se borra · auditoría 5S'
    when id not like 'ag\_%'                      then 'se borra · carga anterior'
    else 'queda · del R.I.T'
  end                                             as grupo,
  count(*)                                        as filas
from sgo_agenda_iso
group by 1 order by 1;


-- ------------------------------------------------------------
-- 2) PRESERVAR lo que tenga trabajo cargado.
--    Se le repara el texto y se le pone un id 'keep_' para que el borrado del
--    paso 3 no la alcance. Si no hay ninguna, no hace nada.
-- ------------------------------------------------------------
update sgo_agenda_iso
set titulo = convert_from(convert_to(titulo, 'LATIN1'), 'UTF8'),
    id = 'keep_' || id,
    actualizado_en = now(), actualizado_por = 'limpieza_v187'
where id not like 'ag\_%'
  and id not like 'keep\_%'
  and (coalesce(evidencia, '') <> ''
       or coalesce(resultado, '') <> ''
       or coalesce(verificacion, '') <> ''
       or completada_en is not null
       or coalesce(jsonb_array_length(semanas), 0) > 0);


-- ------------------------------------------------------------
-- 3) BORRAR todo lo que no vino del R.I.T y quedó vacío.
--    Acá caen las duplicadas con y sin acentos rotos.
-- ------------------------------------------------------------
delete from sgo_agenda_iso
where id not like 'ag\_%'
  and id not like 'keep\_%';


-- ------------------------------------------------------------
-- 4) BORRAR las auditorías 5S — "es una sola agenda de auditoría ISO".
-- ------------------------------------------------------------
delete from sgo_agenda_iso
where id in ('ag_auditoria_5s', 'ag_informe_auditoria_5s')
   or (id like 'ag\_%' and titulo ilike '%5S%');


-- ------------------------------------------------------------
-- 5) UNIFICAR "Calidad de aire ambiental".
--    Duplicado de MI importación: la hoja 2025 la llama "Calidad de aire
--    ambiental" y la de 2026 "Calidad de aire ambiental/ emisiones". Son la
--    misma medición anual. Se conserva el nombre de 2026 y se le suma la
--    semana de 2025.
-- ------------------------------------------------------------
update sgo_agenda_iso dst
set semanas = coalesce(dst.semanas, '[]'::jsonb) || coalesce(src.semanas, '[]'::jsonb),
    actualizado_en = now(), actualizado_por = 'limpieza_v187'
from sgo_agenda_iso src
where dst.id = 'ag_calidad_de_aire_ambiental_emisiones'
  and src.id = 'ag_calidad_de_aire_ambiental';

delete from sgo_agenda_iso where id = 'ag_calidad_de_aire_ambiental';


-- ============================================================
-- 6) DESPUÉS — cómo quedó
-- ============================================================
select
  count(*)                                                        as total,
  count(*) filter (where titulo like '%Ã%' or titulo like '%Â%')  as texto_roto,
  count(*) filter (where titulo ilike '%5S%')                     as auditorias_5s,
  count(*) filter (where id like 'keep\_%')                       as preservadas
from sgo_agenda_iso;
--   Esperado: total = 33 · texto_roto = 0 · auditorias_5s = 0
--   (36 del R.I.T − 2 de 5S − 1 unificada. Si preservadas > 0, el total sube
--    en esa cantidad: son filas viejas que tenían trabajo cargado.)

-- Y el listado final, para revisarlo de un vistazo:
select bloque, titulo, coalesce(jsonb_array_length(semanas), 0) as semanas
from sgo_agenda_iso
order by bloque, orden nulls last, titulo;
