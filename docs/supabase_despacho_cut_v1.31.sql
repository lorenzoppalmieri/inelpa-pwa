-- ============================================================
-- v1.31 — Despacho: campo CUT (opcional, solo trafos tipo EPE)
--
-- Número especial que EPE asigna a sus transformadores. Opcional: los que no son
-- EPE quedan sin CUT.
--
-- Idempotente.
-- ============================================================
alter table despachos add column if not exists cut text;
