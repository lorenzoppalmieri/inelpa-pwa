# Programación semanal 5S — lunes a viernes

## Uso

- Cada lunes a las 00:00 de Argentina se crean 11 controles nuevos, uno por área. No hace falta abrir la PWA para generarlos.
- Lara: Bobinado Rural, Bobinado Distribución, Montaje Distribución, Montaje Rural, Herrería y Pintura, Laminado, Carpintería, Corte Aislación y Laboratorio.
- Nicolás: Abastecimiento y Despacho.
- Pueden realizarse cualquier día desde el lunes. Preferencia operativa: jueves o viernes.
- El viernes es la fecha límite, inclusive hasta las 23:59:59 de Argentina. Desde el sábado figura vencido.
- Al finalizar y sincronizar el informe se completa sólo ese control semanal. Los hallazgos permanecen en su propio circuito de mejora.
- El lunes siguiente aparece una nueva programación aunque la anterior esté pendiente.
- Lorenzo puede usar **Eliminar de agenda** para autorizar la omisión de una semana. No acredita una auditoría realizada, no borra evidencias y no cancela las semanas siguientes.
- Las auditorías especiales se mantienen aparte. No se programó Administración/Azul en este cambio.

## Implementación y despliegue

- Migración aplicada: `sgo_5s_ocurrencias_lunes_viernes` (copia SQL en esta carpeta).
- Campo `semana_5s`: lunes; `proxima_fecha`: viernes; tolerancia 0. Cada fila representa una ocurrencia única, aunque la agenda general se repite semanalmente.
- Índice único por área/semana y generación idempotente. Las filas retiradas no se recrean al reintentar la misma semana.
- Cron `sgo-5s-lunes`: lunes 03:00 UTC, equivalente a 00:00 Argentina con la configuración GMT verificada.
- Función generadora interna, no accesible a sesiones de la PWA. El trigger de finalización sólo completa la ocurrencia vinculada a un informe 5S del área correcta, bajo una sesión SGO activa.
- Los auditores mantienen el permiso de registrar informes, sin obtener permiso de editar o retirar programaciones. El servidor registra la finalización y su actor.
- Preservación de la identidad semanal frente a escrituras de versiones anteriores de la PWA.
- Se generó inicialmente sólo la semana 14–18/09/2026. No se reactivaron programaciones antiguas, no se reescribieron informes ni se generaron controles de semanas pasadas.
- Falta publicar el frontend mediante el push/despliegue habitual para mostrar los rótulos y usar el nuevo cierre sin encolar cambios de programación desde las cuentas auditoras.

## Verificación

Pruebas de lunes/viernes/sábado, horario argentino, distinción de especiales y mapeo de sincronización. En base se verifica el trabajo cron y el reintento sin duplicados. Pruebas transaccionales con rollback comprueban generación de dos semanas, permisos de Lara/Nicolás y finalización automática sin tocar auditorías reales.

## Operación

Consultar el estado y errores del trabajo en Supabase → Cron. La definición de las 11 áreas está versionada en la función interna. Cambios permanentes de áreas/asignaciones requieren actualizar esa configuración, no retirar una ocurrencia individual. Si la base estuviera suspendida el lunes, revisar la ejecución del trabajo y generar la semana faltante explícitamente; no se inventa cumplimiento histórico.
