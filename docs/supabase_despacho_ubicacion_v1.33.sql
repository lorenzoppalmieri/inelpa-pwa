-- ============================================================
-- v1.33 — Despacho: ubicación de trabajo del embalaje (obligatoria)
--
-- Dónde se realizó el embalaje: 'INELPA' | 'Depósito 25 de Mayo' | 'CERDAN'.
-- Solo aplica al sector Despacho (no afecta a Montaje/Bobinado, que son otra
-- tabla/entidad). El front la exige antes de marcar embalado.
--
-- Idempotente.
-- ============================================================
alter table despachos add column if not exists ubicacion_deposito text;
