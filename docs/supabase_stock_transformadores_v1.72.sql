-- ============================================================
-- v1.72 — Stock histórico + identidad por número de serie
--
-- `nro_interno` conserva la identificación de las unidades antiguas que todavía
-- no tenían N° de serie oficial. Los transformadores nuevos deben salir de
-- Laboratorio siempre con N° de serie.
-- ============================================================

alter table public.despachos
  add column if not exists nro_interno text;

create index if not exists idx_despachos_nro_interno
  on public.despachos (nro_interno)
  where nro_interno is not null and btrim(nro_interno) <> '';

comment on column public.despachos.nro_interno is
  'Identificación interna histórica. No reemplaza al N° de serie oficial exigido al liberar desde Laboratorio.';

-- Control de duplicados actuales por N° de serie normalizado. Esta consulta no
-- borra nada: permite revisar los casos viejos antes o después de importar.
select
  regexp_replace(upper(nro_serie), '[^A-Z0-9]', '', 'g') as serie_normalizada,
  count(*) as cantidad,
  array_agg(id order by creada_en) as despachos
from public.despachos
where btrim(nro_serie) <> ''
group by 1
having count(*) > 1
order by cantidad desc, serie_normalizada;
