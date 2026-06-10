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
  ('m_bob_dist_at_01', 'Maquina 01', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_02', 'Maquina 02', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_03', 'Maquina 03', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_04', 'Maquina 04', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_05', 'Maquina 05', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_06', 'Maquina 06', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_07', 'Maquina 07', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_08', 'Maquina 08', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_09', 'Maquina 09', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_10', 'Maquina 10', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_11', 'Maquina 11', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_12', 'Maquina 12', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_13', 'Maquina 13', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_14', 'Maquina 14', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_15', 'Maquina 15', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_16', 'Maquina 16', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_17', 'Maquina 17', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_18', 'Maquina 18', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_19', 'Maquina 19', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_at_20', 'Maquina 20', 'bob_dist_at', 'maquina', true),
  ('m_bob_dist_bt_01', 'Maquina 01', 'bob_dist_bt', 'maquina', true),
  ('m_bob_dist_bt_02', 'Maquina 02', 'bob_dist_bt', 'maquina', true),
  ('m_bob_dist_bt_03', 'Maquina 03', 'bob_dist_bt', 'maquina', true),
  ('m_bob_dist_bt_04', 'Maquina 04', 'bob_dist_bt', 'maquina', true),
  ('m_bob_dist_bt_05', 'Maquina 05', 'bob_dist_bt', 'maquina', true),
  ('m_bob_dist_bt_06', 'Maquina 06', 'bob_dist_bt', 'maquina', true),
  ('m_bob_dist_bt_07', 'Maquina 07', 'bob_dist_bt', 'maquina', true),
  ('m_bob_dist_bt_08', 'Maquina 08', 'bob_dist_bt', 'maquina', true),
  ('m_bob_dist_bt_09', 'Maquina 09', 'bob_dist_bt', 'maquina', true),
  ('m_bob_dist_bt_10', 'Maquina 10', 'bob_dist_bt', 'maquina', true),
  ('m_bob_rural_at_01', 'Maquina 01', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_02', 'Maquina 02', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_03', 'Maquina 03', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_04', 'Maquina 04', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_05', 'Maquina 05', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_06', 'Maquina 06', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_07', 'Maquina 07', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_08', 'Maquina 08', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_09', 'Maquina 09', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_10', 'Maquina 10', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_11', 'Maquina 11', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_12', 'Maquina 12', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_13', 'Maquina 13', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_14', 'Maquina 14', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_15', 'Maquina 15', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_16', 'Maquina 16', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_17', 'Maquina 17', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_18', 'Maquina 18', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_19', 'Maquina 19', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_at_20', 'Maquina 20', 'bob_rural_at', 'maquina', true),
  ('m_bob_rural_bt_01', 'Maquina 01', 'bob_rural_bt', 'maquina', true),
  ('m_bob_rural_bt_02', 'Maquina 02', 'bob_rural_bt', 'maquina', true),
  ('m_bob_rural_bt_03', 'Maquina 03', 'bob_rural_bt', 'maquina', true),
  ('m_bob_rural_bt_04', 'Maquina 04', 'bob_rural_bt', 'maquina', true),
  ('m_bob_rural_bt_05', 'Maquina 05', 'bob_rural_bt', 'maquina', true),
  ('m_bob_rural_bt_06', 'Maquina 06', 'bob_rural_bt', 'maquina', true),
  ('m_bob_rural_bt_07', 'Maquina 07', 'bob_rural_bt', 'maquina', true),
  ('m_bob_rural_bt_08', 'Maquina 08', 'bob_rural_bt', 'maquina', true),
  ('m_bob_rural_bt_09', 'Maquina 09', 'bob_rural_bt', 'maquina', true),
  ('m_bob_rural_bt_10', 'Maquina 10', 'bob_rural_bt', 'maquina', true),
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
-- Esperado: causas_parada = 27, maquinas = 75
