-- ============================================================
-- v1.43 — Despacho hereda la descripción completa del modelo
--
-- Problema: al aprobar un ensayo, Laboratorio creaba la tarea de Despacho con
-- la serie y poco más. En Laboratorio se veía
--   "TTD 63/33 - Tanque Expansion - Plataforma - Aluminio · Serie N° 24.564"
-- y a Melany le llegaba solo "Serie N° 24.563", con Tipo y Potencia en "—".
--
-- Fix de cliente: al aprobar se copian modelo, tipo y potencia (tomando
-- tanque/montaje/potencia del catálogo de modelos, o parseando el nombre).
-- Fix de datos: esta migración agrega la columna y rellena los despachos que ya
-- estaban creados, cruzando contra la tabla laboratorio por N° de serie.
--
-- Idempotente: se puede correr más de una vez.
-- ============================================================

-- 1) Columna nueva ---------------------------------------------------------
alter table public.despachos
  add column if not exists modelo text;

comment on column public.despachos.modelo is
  'Descripción completa del modelo heredada de Laboratorio (ej. "TTD 63/33 - Tanque Expansion - Plataforma - Aluminio").';

-- 2) Backfill del modelo desde laboratorio, cruzando por N° de serie -------
-- Solo toca los despachos que hoy no tienen modelo. Si un mismo N° de serie
-- aparece más de una vez en laboratorio se toma el ensayo más reciente.
with lab as (
  select distinct on (nro_serie)
         nro_serie, modelo, cliente
  from public.laboratorio
  where nro_serie is not null and nro_serie <> '' and modelo is not null
  order by nro_serie, creada_en desc
)
update public.despachos d
set modelo = lab.modelo
from lab
where d.modelo is null
  and d.nro_serie is not null
  and d.nro_serie = lab.nro_serie;

-- 3) Backfill del cliente cuando quedó vacío o en 'Stock' por defecto ------
-- (el cliente real vive en la tarea de Montaje PO y viaja por laboratorio)
with lab as (
  select distinct on (nro_serie)
         nro_serie, cliente
  from public.laboratorio
  where nro_serie is not null and nro_serie <> ''
    and cliente is not null and cliente <> ''
  order by nro_serie, creada_en desc
)
update public.despachos d
set cliente = lab.cliente
from lab
where (d.cliente is null or d.cliente = '' or d.cliente = 'Stock')
  and d.nro_serie is not null
  and d.nro_serie = lab.nro_serie
  and lab.cliente <> 'Stock';

-- 4) Derivar TIPO y POTENCIA del nombre del modelo -------------------------
-- El nombre sigue la convención "CODIGO - Tanque - Montaje - Material":
--   · potencia y tensión salen del código  ("TTD 63/33" -> "63 kVA / 33 kV")
--   · tipo son las partes constructivas, sin el código ni el material
-- La app hace lo mismo en runtime (lib/modeloTrafo.ts); esto deja los datos ya
-- escritos para que no dependan del cliente.
update public.despachos
set potencia = coalesce(
  potencia,
  nullif(
    concat_ws(' / ',
      nullif((regexp_match(modelo, '(\d+(?:[.,]\d+)?)\s*/'))[1], '') || ' kVA',
      nullif((regexp_match(modelo, '\d+(?:[.,]\d+)?\s*/\s*(\d+(?:[.,]\d+)?)'))[1], '') || ' kV'
    ), '')
)
where modelo is not null and potencia is null;

update public.despachos d
set tipo = coalesce(d.tipo, sub.tipo)
from (
  select id,
         nullif(array_to_string(
           array(
             select trim(p)
             from unnest(string_to_array(modelo, ' - ')) with ordinality as x(p, i)
             where i > 1                                      -- saltea el código
               and lower(trim(p)) not in ('cobre','aluminio','cu','al')  -- saltea el material
           ), ' · '), '') as tipo
  from public.despachos
  where modelo is not null
) sub
where d.id = sub.id and d.tipo is null;

-- Control: ver cómo quedaron.
-- select nro_serie, modelo, tipo, potencia, cliente
-- from public.despachos
-- order by fecha_ingreso desc
-- limit 30;
