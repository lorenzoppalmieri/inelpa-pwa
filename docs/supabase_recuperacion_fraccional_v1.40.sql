-- ============================================================
-- v1.40 — Recuperación de horas FRACCIONAL (Bobinado / planta)
--
-- Antes: activa_hora_recuperacion (boolean) = se quedaba la hora entera o nada.
-- Ahora: minutos_recuperacion (0/30/60) = la cantidad EXACTA que el operario
--   decide quedarse en ESA tarea. Extiende el cierre base (16:00 L-J, 15:00 Vie)
--   en esa cantidad, con tope de 60 min. El booleano se conserva por compatibilidad
--   (el front lo mantiene sincronizado: true si minutos_recuperacion > 0).
--
-- Idempotente. Backfill: las tareas viejas con el booleano en true pasan a 60 min.
-- ============================================================
alter table tareas add column if not exists minutos_recuperacion integer;

-- Backfill de datos históricos (una sola vez; el WHERE lo hace repetible sin daño).
update tareas
set minutos_recuperacion = 60
where minutos_recuperacion is null and activa_hora_recuperacion = true;
