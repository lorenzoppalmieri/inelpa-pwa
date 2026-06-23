-- ============================================================
-- MAQUINAS BOBINADO v1.14 — pool unico de 30 (correr en Supabase -> SQL Editor)
-- Antes habia 60 maquinas (20+10+20+10) en 4 sectores. Ahora son 30 fisicas que
-- sirven CUALQUIER formato de bobina (rural/distribucion, AT/BT). La app trata a
-- las 30 como intercambiables para los 4 sectores de bobinado.
-- Idempotente. NO borra las viejas (pueden tener tareas en el historial): las
-- desactiva para que no aparezcan.
-- ============================================================

-- 1) Crear/actualizar las 30 bobinadoras del pool.
insert into maquinas (id, nombre, sector_id, tipo, activo) values
  ('m_bob_01', 'Bobinadora 01', 'bob_dist_at', 'maquina', true),
  ('m_bob_02', 'Bobinadora 02', 'bob_dist_at', 'maquina', true),
  ('m_bob_03', 'Bobinadora 03', 'bob_dist_at', 'maquina', true),
  ('m_bob_04', 'Bobinadora 04', 'bob_dist_at', 'maquina', true),
  ('m_bob_05', 'Bobinadora 05', 'bob_dist_at', 'maquina', true),
  ('m_bob_06', 'Bobinadora 06', 'bob_dist_at', 'maquina', true),
  ('m_bob_07', 'Bobinadora 07', 'bob_dist_at', 'maquina', true),
  ('m_bob_08', 'Bobinadora 08', 'bob_dist_at', 'maquina', true),
  ('m_bob_09', 'Bobinadora 09', 'bob_dist_at', 'maquina', true),
  ('m_bob_10', 'Bobinadora 10', 'bob_dist_at', 'maquina', true),
  ('m_bob_11', 'Bobinadora 11', 'bob_dist_at', 'maquina', true),
  ('m_bob_12', 'Bobinadora 12', 'bob_dist_at', 'maquina', true),
  ('m_bob_13', 'Bobinadora 13', 'bob_dist_at', 'maquina', true),
  ('m_bob_14', 'Bobinadora 14', 'bob_dist_at', 'maquina', true),
  ('m_bob_15', 'Bobinadora 15', 'bob_dist_at', 'maquina', true),
  ('m_bob_16', 'Bobinadora 16', 'bob_dist_at', 'maquina', true),
  ('m_bob_17', 'Bobinadora 17', 'bob_dist_at', 'maquina', true),
  ('m_bob_18', 'Bobinadora 18', 'bob_dist_at', 'maquina', true),
  ('m_bob_19', 'Bobinadora 19', 'bob_dist_at', 'maquina', true),
  ('m_bob_20', 'Bobinadora 20', 'bob_dist_at', 'maquina', true),
  ('m_bob_21', 'Bobinadora 21', 'bob_dist_at', 'maquina', true),
  ('m_bob_22', 'Bobinadora 22', 'bob_dist_at', 'maquina', true),
  ('m_bob_23', 'Bobinadora 23', 'bob_dist_at', 'maquina', true),
  ('m_bob_24', 'Bobinadora 24', 'bob_dist_at', 'maquina', true),
  ('m_bob_25', 'Bobinadora 25', 'bob_dist_at', 'maquina', true),
  ('m_bob_26', 'Bobinadora 26', 'bob_dist_at', 'maquina', true),
  ('m_bob_27', 'Bobinadora 27', 'bob_dist_at', 'maquina', true),
  ('m_bob_28', 'Bobinadora 28', 'bob_dist_at', 'maquina', true),
  ('m_bob_29', 'Bobinadora 29', 'bob_dist_at', 'maquina', true),
  ('m_bob_30', 'Bobinadora 30', 'bob_dist_at', 'maquina', true)
on conflict (id) do update set nombre = excluded.nombre, sector_id = excluded.sector_id, tipo = excluded.tipo, activo = true;

-- 2) Desactivar las 60 bobinadoras viejas (no se borran: conservan historial).
update maquinas set activo = false
where id like 'm_bob_dist_%' or id like 'm_bob_rural_%';

-- Verificacion: deberian quedar 30 bobinadoras activas (m_bob_01..30).
select count(*) as bobinadoras_activas from maquinas
where activo = true and id like 'm_bob_%' and id not like 'm_bob_dist_%' and id not like 'm_bob_rural_%';
