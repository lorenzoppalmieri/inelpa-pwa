-- ============================================================
-- v1.86 — LIMPIAR LA AGENDA ISO (reemplaza al v1.85, que quedó en pasos)
--
-- Deja SOLO la agenda de auditoría ISO importada del R.I.T 6.2/05. Resuelve:
--
--   1. DUPLICADAS CON TEXTO ROTO — "AuditorÃ­a interna Compras" es
--      "Auditoría interna Compras" guardado en UTF-8 y leído como Latin-1.
--      Son filas ANTERIORES al import; como tienen otro id, el `on conflict`
--      del v1.84 no las alcanzó y quedaron duplicadas en pantalla.
--
--   2. AUDITORÍA 5S — Lorenzo: "las auditorías 5S eliminalas, es una sola
--      agenda de auditoría ISO". Estaban solo en la hoja 2025.
--
-- SE PUEDE CORRER ENTERO DE UNA VEZ. Los borrados están acotados: nada que
-- tenga trabajo cargado encima se elimina.
-- ============================================================


-- ------------------------------------------------------------
-- 1) ANTES: qué hay y qué se va a tocar (solo lectura).
--    Mirá el resultado; si algo te llama la atención, frená acá.
-- ------------------------------------------------------------
select
  case
    when id like 'ag\_%' and titulo ilike '%5S%'                 then '2 · se borra (5S)'
    when titulo like '%Ã%' or titulo like '%Â%'                  then '1 · texto roto'
    when id not like 'ag\_%'                                     then '3 · no vino del R.I.T'
    else '0 · queda'
  end                                                            as grupo,
  count(*)                                                       as filas,
  string_agg(distinct left(titulo, 38), ' | ' order by left(titulo, 38)) as ejemplos
from sgo_agenda_iso
group by 1
order by 1;


-- ------------------------------------------------------------
-- 2) REPARAR el texto de las que tengan trabajo cargado.
--    Se hace ANTES de borrar: así, si una fila rota tiene evidencia o
--    resultado, sobrevive y queda legible en vez de perderse.
-- ------------------------------------------------------------
update sgo_agenda_iso
set titulo = convert_from(convert_to(titulo, 'LATIN1'), 'UTF8'),
    actualizado_en = now(), actualizado_por = 'fix_encoding'
where (titulo like '%Ã%' or titulo like '%Â%')
  and (coalesce(evidencia, '') <> ''
       or coalesce(resultado, '') <> ''
       or coalesce(verificacion, '') <> ''
       or completada_en is not null
       or coalesce(jsonb_array_length(semanas), 0) > 0);


-- ------------------------------------------------------------
-- 3) BORRAR las duplicadas rotas que quedaron VACÍAS.
--    Sobreviven las reparadas en el paso 2: el WHERE exige que no tengan
--    semanas, ni evidencia, ni resultado, ni verificación, ni fecha de
--    completada, y que sigan en estado inicial.
-- ------------------------------------------------------------
delete from sgo_agenda_iso
where (titulo like '%Ã%' or titulo like '%Â%')
  and id not like 'ag\_%'
  and coalesce(jsonb_array_length(semanas), 0) = 0
  and coalesce(evidencia, '') = ''
  and coalesce(resultado, '') = ''
  and coalesce(verificacion, '') = ''
  and completada_en is null
  and estado in ('planificada', 'sin_programar');


-- ------------------------------------------------------------
-- 4) BORRAR las auditorías 5S.
--    Son las dos filas del R.I.T 2025: la auditoría y su informe mensual.
-- ------------------------------------------------------------
delete from sgo_agenda_iso
where id in ('ag_auditoria_5s', 'ag_informe_auditoria_5s')
   or (titulo ilike '%5S%' and id like 'ag\_%');


-- ============================================================
-- 5) DESPUÉS: cómo quedó
-- ============================================================
select
  count(*)                                                          as total,
  count(*) filter (where titulo like '%Ã%' or titulo like '%Â%')    as texto_roto,
  count(*) filter (where titulo ilike '%5S%')                       as auditorias_5s,
  count(*) filter (where id like 'ag\_%')                           as del_rit
from sgo_agenda_iso;
--   Esperado: texto_roto = 0 · auditorias_5s = 0 · del_rit = 34


-- ------------------------------------------------------------
-- 6) LO QUE QUEDÓ FUERA DEL R.I.T — revisalo a mano.
--    Estas NO se borran solas: puede haber alguna actividad legítima que la
--    planilla no contempla y que convenga conservar.
-- ------------------------------------------------------------
select id, titulo, estado, fecha_objetivo,
       coalesce(jsonb_array_length(semanas), 0) as semanas
from sgo_agenda_iso
where id not like 'ag\_%'
order by titulo;
