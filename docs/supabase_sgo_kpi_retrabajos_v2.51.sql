-- SGO v2.51 - Renombra el indicador automático de retrabajos de la Matriz.
-- OPCIONAL y solo cosmético: el código ya calcula el indicador con la nueva
-- definición (expedientes de retrabajo por área de origen, los mismos de
-- SGO › Retrabajos). Este script solo cambia el NOMBRE guardado para que no siga
-- diciendo "o desvío de calidad", que ya no cuenta.
-- Idempotente. Se puede correr antes o después del push.

-- Diagnóstico (mirar antes): qué indicadores se van a renombrar.
-- select id, area_id, nombre from public.sgo_indicadores
-- where clave_calculo = 'produccion_retrabajos';

update public.sgo_indicadores
set nombre = 'Retrabajos originados en el área'
where clave_calculo = 'produccion_retrabajos'
  and nombre = 'Tareas con retrabajo o desvío de calidad';

-- Verificación esperada: todas las filas con el nombre nuevo.
select id, area_id, nombre from public.sgo_indicadores
where clave_calculo = 'produccion_retrabajos'
order by area_id;
