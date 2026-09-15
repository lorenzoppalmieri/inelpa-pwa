# SGO: cierre desde la ficha y controles vencidos

## Diagnóstico (15/09/2026)

En el video se guarda un expediente abierto de mejora desde la ficha de gestión. Guardar los campos generales no cambia el estado a cerrado. El formulario general no permite completar la decisión, resultado y seguimiento que valida el circuito de mejora; faltaba un acceso directo que guardara lo cargado y abriera el mismo caso.

El contador de controles vencidos abría un filtro de todos los controles activos, incluyendo futuros. Son pendientes distintos: registrar un hallazgo o cerrar una mejora no equivale a ejecutar una auditoría semanal.

## Cambios

- Expedientes de mejora/investigación: botón **Guardar y continuar a evaluación y cierre**. Guarda primero y abre el editor específico del mismo registro. Si falla el guardado no navega y conserva el texto.
- Si el expediente se abrió desde un caso ya en edición, mantiene **Guardar y volver al caso**, preservando su borrador.
- Eventos sin circuito específico: botón explícito **Verificar y cerrar expediente**. Conserva las validaciones; los errores se muestran en la pantalla.
- Retorno a la ficha de gestión desde Mejora continua, conservando sus filtros.
- El contador **Controles vencidos** ahora selecciona exclusivamente vencidos. Sigue disponible la consulta de todos los controles activos.
- Se explica la diferencia entre ejecución de controles y resolución de hallazgos y se identifica el acceso al programa.

## Sin cambios de negocio ni datos

No se eliminaron requisitos de cierre ni se cambiaron permisos. No se cerraron eventos, ejecutaron auditorías ni reprogramaron fechas reales. La recurrencia existente avanza cuando se finaliza el control; no se ocultan atrasos válidos. Si un control realizado sigue vencido, verificar la ejecución y su `controlId` antes de repararlo, sin duplicar auditorías.

## Verificación

Pruebas unitarias, compilación y prueba de interfaz aislada con registros ficticios: ficha → expediente → error de guardado → guardar y continuar al mismo caso → volver a ficha. También se comprueba el filtro vencidos frente a un control futuro y la conservación del borrador en el recorrido caso/expediente.
