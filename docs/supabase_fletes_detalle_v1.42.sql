-- ============================================================
-- v1.42 — Detalle de fletes internos (auditoría para Melany)
--
-- El desglose de "Viajes del período" en Reportes de Despacho necesita saber a
-- qué cliente/destino fue el viaje y qué equipos se movieron. Hasta ahora el
-- flete solo guardaba concepto (texto libre), transportista y costo.
--
-- Ambas columnas son OPCIONALES: los fletes ya cargados quedan con NULL y el
-- desglose los muestra igual, con el concepto como destino.
--
-- Idempotente: se puede correr más de una vez.
-- ============================================================

alter table public.fletes_internos
  add column if not exists cliente text,
  add column if not exists series  text[];

comment on column public.fletes_internos.cliente is
  'Cliente o destino del viaje (opcional). Alimenta el desglose de viajes en Reportes de Despacho.';
comment on column public.fletes_internos.series is
  'N° de serie o modelo(s) trasladados en el viaje (opcional).';

-- Control: ver los fletes del mes con su detalle.
-- select fecha::date as dia, concepto, cliente, series, transportista, costo
-- from public.fletes_internos
-- where fecha >= date_trunc('month', now())
-- order by fecha desc;
