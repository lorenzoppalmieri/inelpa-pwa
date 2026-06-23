-- ============================================================
-- INELPA PWA — PASO 2 (prerequisito): catalogo compartido en Supabase
-- Siembra las ESTACIONES DE TRABAJO (maquinas) y las CAUSAS DE PARADA.
--
-- Por que: una tarea referencia (FK) maquina_id -> maquinas y una parada
-- referencia causa -> causas_parada. Si estas filas no existen en Supabase,
-- el INSERT de una tarea/parada falla. Estos datos son el catalogo fijo de
-- planta (los mismos que la app genera localmente).
--
-- ORDEN: correr DESPUES de supabase_schema.sql, supabase_auth_setup.sql y
--        supabase_realtime_rls.sql. Es re-ejecutable (on conflict do nothing).
-- ============================================================

-- ---------- 1) Causas de parada (catalogo de planta) ----------
insert into causas_parada (id, label, categoria, codigo, activo) values
  ('espera_prod_bt', 'Espera produccion de BT', 'material', 1, true),
  ('espera_prod_aislacion', 'Espera produccion de aislacion', 'material', 2, true),
  ('espera_alambre', 'Espera de alambre (cobre o aluminio)', 'material', 30, true),
  ('espera_especificaciones', 'Espera especificaciones tecnicas / diseno', 'material', 28, true),
  ('espera_canales', 'Espera de canales (logistica)', 'logistica', 31, true),
  ('espera_consumibles', 'Espera de consumibles (logistica)', 'logistica', 32, true),
  ('espera_gas_oxigeno', 'Espera gas y oxigeno (logistica)', 'logistica', 36, true),
  ('pasillos_obstruidos', 'Pasillos obstruidos', 'logistica', 17, true),
  ('subir_bajar_bobina', 'Espera para subir / bajar bobina', 'logistica', 21, true),
  ('mant_correctivo', 'Mantenimiento correctivo', 'maquina', 5, true),
  ('mant_preventivo', 'Mantenimiento preventivo', 'maquina', 6, true),
  ('replanif_cambio', 'Replanificacion cambio potencia / modelo', 'maquina', 16, true),
  ('falta_herramienta', 'Faltante / rotura de herramienta', 'maquina', 27, true),
  ('espera_soldadora', 'Espera soldadora', 'maquina', 35, true),
  ('corte_luz', 'Corte de luz', 'maquina', 37, true),
  ('capacitacion', 'Capacitacion laboral', 'personal', 8, true),
  ('reunion_charla', 'Reunion / charla', 'personal', 9, true),
  ('ayuda_sector', 'Ayuda en sector', 'personal', 19, true),
  ('ayuda_otro_sector', 'Ayuda en otro sector', 'personal', 39, true),
  ('retiro', 'Retiro', 'personal', 23, true),
  ('accidente_laboral', 'Accidente laboral', 'personal', 29, true),
  ('espera_encargado', 'Espera a encargado', 'personal', 4, true),
  ('taco_defectuoso', 'Taco defectuoso', 'calidad', 38, true),
  ('retrabajo', 'Retrabajo', 'calidad', 10, true),
  ('calidad_alambre', 'Problemas calidad del alambre o planchuela', 'calidad', 18, true),
  ('bobina_bt_defectuosa', 'Bobina de BT defectuosa', 'calidad', 40, true),
  -- v1.4: pausa programada (no penaliza el OEE)
  ('almuerzo', 'Almuerzo', 'no_productiva', 50, true),
  ('otra', 'Otra', 'otra', null, true)
on conflict (id) do nothing;

-- ---------- 2) Estaciones de trabajo (maquinas / box / lineas) ----------
insert into maquinas (id, nombre, sector_id, tipo, activo) values
  -- v1.14: pool unico de 30 bobinadoras (sirven cualquier formato de bobina).
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
  ('m_bob_30', 'Bobinadora 30', 'bob_dist_at', 'maquina', true),
  ('m_soldadura_dist_01', 'Box 01', 'soldadura_dist', 'box', true),
  ('m_soldadura_dist_02', 'Box 02', 'soldadura_dist', 'box', true),
  ('m_soldadura_dist_03', 'Box 03', 'soldadura_dist', 'box', true),
  ('m_soldadura_dist_04', 'Box 04', 'soldadura_dist', 'box', true),
  ('m_soldadura_dist_05', 'Box 05', 'soldadura_dist', 'box', true),
  ('m_soldadura_rural_01', 'Box', 'soldadura_rural', 'box', true),
  ('m_montaje_pa_dist_01', 'Linea Montaje PA', 'montaje_pa_dist', 'linea', true),
  ('m_montaje_po_dist_01', 'Linea Montaje PO', 'montaje_po_dist', 'linea', true),
  ('m_montaje_pa_rural_01', 'Linea Montaje PA', 'montaje_pa_rural', 'linea', true),
  ('m_montaje_po_rural_01', 'Linea Montaje PO', 'montaje_po_rural', 'linea', true),
  ('m_laboratorio_01', 'Laboratorio', 'laboratorio', 'estacion', true),
  ('m_corte_conformado_plegadora', 'Plegadora', 'corte_conformado', 'estacion', true),
  ('m_corte_conformado_corte_laser', 'Corte Laser', 'corte_conformado', 'estacion', true),
  ('m_corte_conformado_conf_accesorios', 'Conf. Accesorios', 'corte_conformado', 'estacion', true),
  ('m_lavado_pintura_01', 'Pintura', 'lavado_pintura', 'estacion', true)
on conflict (id) do nothing;

-- ---------- Verificacion ----------
select 'causas_parada' as tabla, count(*) from causas_parada
union all
select 'maquinas', count(*) from maquinas;
-- Esperado: maquinas = 45 (30 bobinadoras pool + 15 del resto de sectores)
