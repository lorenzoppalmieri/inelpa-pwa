-- ============================================================
-- INELPA PWA — v2.36: nombre neutro para la parada automática de reapertura
--
-- PROBLEMA: al reabrir una tarea finalizada, la app registra una parada
-- automática (causa 'reapertura') que cubre el lapso cerrada -> reabierta. Se
-- llamaba "Reapertura / retrabajo (no productivo)", y en el Gantt una tarea de
-- FABRICACIÓN cerrada por falta de material parecía haberse convertido en
-- retrabajo. La reapertura nunca cambió el tipo de la tarea; esto es solo el
-- nombre.
--
-- La app toma el nombre de su propio catálogo (types/index.ts), así que este
-- SQL NO es necesario para que funcione: solo deja la tabla de Supabase igual
-- que la app, para que cualquier consulta o reporte hecho directo sobre la
-- base muestre lo mismo. El id 'reapertura' no cambia (lo referencian las
-- paradas existentes por FK).
--
-- Re-ejecutable. Se puede correr antes o después del push.
-- ============================================================
update causas_parada
set label = 'Tarea cerrada temporalmente'
where id = 'reapertura'
  and label is distinct from 'Tarea cerrada temporalmente';

-- Verificación:
-- select id, label, categoria from causas_parada where id = 'reapertura';
