-- ============================================================
-- v1.45 — Lorenzatti = planta: se unifican en un solo depósito
--
-- "Lorenzatti" e "INELPA (planta)" son el MISMO lugar físico. En v1.44 habían
-- quedado como dos ubicaciones distintas, así que un trafo embalado sin salir
-- aparecía en "INELPA (planta)" y otro marcado a mano aparecía en "Lorenzatti",
-- partiendo el stock del mismo depósito en dos columnas.
--
-- Criterio a partir de acá:
--   · Lorenzatti (la planta) es la ubicación POR DEFECTO -> deposito = NULL.
--   · Solo se marcan explícitamente los depósitos externos: 'Cerdán' y '25 de Mayo'.
--   · El estado 'en_deposito' queda reservado para los externos; lo que está en
--     Lorenzatti vuelve a 'embalado' (listo para despachar, sin salir de planta).
--
-- Idempotente: se puede correr más de una vez.
-- ============================================================

-- 1) Los que estaban marcados en Lorenzatti vuelven a ser "embalado en planta" --
update public.despachos
set estado         = 'embalado',
    deposito       = null,
    fecha_deposito = null
where estado = 'en_deposito'
  and deposito in ('Lorenzatti', 'INELPA (planta)', 'INELPA');

-- 2) Si quedó el nombre viejo en un embalado, se limpia -----------------------
update public.despachos
set deposito = null, fecha_deposito = null
where estado = 'embalado'
  and deposito in ('Lorenzatti', 'INELPA (planta)', 'INELPA');

-- 3) Historial de movimientos: renombrar 'INELPA (planta)' -> 'Lorenzatti' ----
-- El historial es informativo, pero conviene que use el nombre nuevo.
update public.despachos
set movimientos = replace(movimientos::text, '"INELPA (planta)"', '"Lorenzatti"')::jsonb
where movimientos is not null
  and movimientos::text like '%INELPA (planta)%';

-- Control: cómo queda el stock por ubicación.
-- select coalesce(deposito, 'Lorenzatti') as ubicacion, estado, count(*)
-- from public.despachos
-- where estado in ('embalado', 'en_deposito')
-- group by 1, 2
-- order by 1;
