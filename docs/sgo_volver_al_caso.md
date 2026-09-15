# Volver al caso desde el expediente

El botón «Abrir expediente y acciones» de Mejora continua (incluidos los hallazgos 5S) y de la investigación de retrabajos ya no cierra el editor ni cambia al tablero general.

- El editor del caso permanece montado, temporalmente oculto. Conserva el borrador, la sección, la posición y los filtros.
- «Guardar expediente» guarda sin salir del expediente.
- «Guardar y volver al caso» guarda y vuelve al mismo editor solamente si el guardado fue exitoso.
- «Volver al caso» y la X regresan; si quedan cambios sin guardar en el expediente, solicitan confirmación antes de descartarlos.
- Al retornar, los campos del expediente guardados se incorporan al caso. Los campos modificados en el borrador del caso se conservan. No es un guardado automático: hay que guardar el caso para persistir su borrador.
- El cierre y la eliminación mantienen sus validaciones y permisos. Un registro eliminado no vuelve a mostrarse desde una copia vieja del editor.

No se cambiaron reglas de aprobación, cierre, producción ni sincronización.

Verificación: 134 pruebas SGO y compilación; recorrido de navegador con base simulada, conservación de borrador/filtro, dos idas al expediente y simulación de fallo al guardar. Sin acceso a registros reales. Los borradores son de la sesión abierta y no sobreviven a una recarga del navegador.
