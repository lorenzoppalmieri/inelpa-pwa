-- ============================================================
-- INELPA PWA — v1.17: causa de parada 'reapertura' (no productiva)
--
-- Cuando se REABRE una tarea finalizada (por error de carga o retrabajo), la app
-- registra automaticamente una parada NO productiva que cubre el lapso entre la
-- finalizacion y la reapertura, para que ese tiempo muerto NO cuente en Real/Neto.
-- Esa parada referencia (FK) causas_parada.id = 'reapertura', por eso hay que
-- crear la fila en Supabase. Sin esto, el sync de la parada fallaria por la FK.
--
-- Correr en Supabase: SQL Editor -> pegar -> Run. Re-ejecutable.
-- ============================================================
insert into causas_parada (id, label, categoria, codigo, activo) values
  ('reapertura', 'Reapertura / retrabajo (no productivo)', 'no_productiva', 51, true)
on conflict (id) do update set
  label = excluded.label, categoria = excluded.categoria, activo = excluded.activo;
