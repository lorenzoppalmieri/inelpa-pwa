-- ============================================================
-- DEMORAS POR SECCION v1.7  (correr en Supabase -> SQL Editor)
-- Causas de parada especificas de Herreria, Montaje y Pintura.
-- Necesarias como destino de FK para paradas.causa. Idempotente.
-- El filtrado por seccion (que operario ve que causas) lo hace la app por area.
-- ============================================================

-- ----- HERRERIA (Corte + Soldaduras) -----
insert into causas_parada (id, label, categoria, codigo, activo) values
  ('her_espera_cuba', 'Espera cuba', 'material', null, true),
  ('her_espera_materiales', 'Espera materiales / herramientas / etc.', 'material', null, true),
  ('her_falta_tapa', 'Falta de tapa', 'material', null, true),
  ('her_retrabajo_tercero', 'Retrabajo de un 3° del sector', 'calidad', null, true),
  ('her_retrabajo_propio', 'Retrabajo propio', 'calidad', null, true),
  ('her_retrabajo_cuba_tapa_tanque', 'Retrabajo en su cuba / tapa / tanque', 'calidad', null, true),
  ('her_retrabajo', 'Retrabajo', 'calidad', null, true),
  ('her_retrabajo_otro_sector', 'Retrabajo (de otro sector)', 'calidad', null, true),
  ('her_retrabajo_proveedor', 'Retrabajo (problemas proveedor)', 'calidad', null, true),
  ('her_perdidas_hermetizado', 'Perdidas en hermetizado', 'calidad', null, true),
  ('her_hermetizado', 'Hermetizado', 'otra', null, true),
  ('her_capacitacion', 'Capacitacion', 'personal', null, true),
  ('her_reunion_charla', 'Reunion informativa / charla', 'personal', null, true),
  ('her_ayuda_sector', 'Ayuda en sector u otro sector', 'personal', null, true),
  ('her_finaliza_companero', 'Finaliza trabajo de companero', 'personal', null, true),
  ('her_trabajos_no_planificados', 'Realizacion de trabajos no planificados', 'personal', null, true),
  ('her_orden_limpieza', 'Orden y limpieza', 'personal', null, true),
  ('her_retiro', 'Retiro', 'personal', null, true),
  ('her_accidente_laboral', 'Accidente laboral', 'personal', null, true),
  ('her_suspension', 'Suspension', 'personal', null, true),
  ('her_licencia_ausencia', 'Licencia / ausencia no programada', 'personal', null, true)
on conflict (id) do nothing;

-- ----- MONTAJE (PA/PO Dist y Rural) -----
insert into causas_parada (id, label, categoria, codigo, activo) values
  ('mon_espera_prensayugos', 'Espera / faltan prensayugos', 'material', null, true),
  ('mon_espera_nucleo', 'Espera / falta nucleo', 'material', null, true),
  ('mon_espera_bobina', 'Espera bobina', 'material', null, true),
  ('mon_espera_chapones', 'Espera / faltan chapones', 'material', null, true),
  ('mon_espera_tacos', 'Espera / faltan tacos', 'material', null, true),
  ('mon_espera_cartones', 'Espera cartones', 'material', null, true),
  ('mon_espera_patas', 'Espera patas', 'material', null, true),
  ('mon_espera_chapa', 'Espera chapa', 'material', null, true),
  ('mon_espera_aislador', 'Espera / falta aislador', 'material', null, true),
  ('mon_espera_tubo_oxigeno', 'Espera tubo oxigeno', 'logistica', null, true),
  ('mon_error_entrega_insumos', 'Error en entrega de insumos', 'logistica', null, true),
  ('mon_obstruccion_sector', 'Sin lugar / obstruccion en el sector', 'logistica', null, true),
  ('mon_espera_relaciometro', 'Espera relaciometro', 'maquina', null, true),
  ('mon_espera_secado_pintura', 'Espera secado pintura o barnizado', 'maquina', null, true),
  ('mon_sin_luz', 'Sin luz', 'maquina', null, true),
  ('mon_espera_soldador', 'Espera / falta soldador', 'personal', null, true),
  ('mon_capacitacion', 'Capacitacion', 'personal', null, true),
  ('mon_reunion_charla', 'Reunion informativa / charla', 'personal', null, true),
  ('mon_ayuda_sector', 'Ayuda en el sector', 'personal', null, true),
  ('mon_ayuda_otro_sector', 'Ayuda en otro sector', 'personal', null, true),
  ('mon_retiro', 'Retiro', 'personal', null, true),
  ('mon_retrabajo_bobina', 'Retrabajo bobina', 'calidad', null, true),
  ('mon_no_da_relacion', 'No da relacion la/s bobina/s', 'calidad', null, true),
  ('mon_insumos_defectuosos', 'Materiales o insumos defectuosos (chapa, prensayugos, llave, angulos)', 'calidad', null, true),
  ('mon_modif_materiales', 'Modificacion de materiales / insumos recibidos', 'calidad', null, true),
  ('mon_solucionando_retrabajo', 'Solucionando retrabajo', 'calidad', null, true),
  ('mon_pintaron_prensayugo', 'Pintaron prensayugo en el sector', 'otra', null, true)
on conflict (id) do nothing;

-- ----- PINTURA (Lavado y Pintura) -----
insert into causas_parada (id, label, categoria, codigo, activo) values
  ('pin_falta_cubas', 'Falta de cubas', 'material', null, true),
  ('pin_falta_material_logistico', 'Falta de material logistico', 'logistica', null, true),
  ('pin_corte_luz', 'Corte de luz', 'maquina', null, true)
on conflict (id) do nothing;

select 'causas_parada' tabla, count(*) from causas_parada;
