-- ============================================================
-- v1.22 — Orden de fabricación: fecha de alta para ordenar el desplegable
--
-- Se agrega 'creada_en' a la tabla ordenes. El desplegable de "Asignar tarea"
-- ahora muestra las OF de la MÁS RECIENTE a la más antigua y suma un buscador.
-- Las órdenes viejas sin fecha quedan al final (no se rompen).
--
-- Opcional: para darles una fecha aproximada a las órdenes ya cargadas, se
-- puede setear creada_en = now() en las que estén en null (ver línea comentada).
--
-- Idempotente.
-- ============================================================
alter table ordenes add column if not exists creada_en timestamptz;

-- (Opcional) darle una marca temporal a las órdenes existentes:
-- update ordenes set creada_en = now() where creada_en is null;
