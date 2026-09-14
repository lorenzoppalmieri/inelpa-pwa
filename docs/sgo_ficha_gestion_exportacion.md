# Ficha de gestión SGO: lectura y exportación

## Uso

- Abrir una celda de la matriz. La alerta superior y los contadores corresponden a pendientes actuales acumulados, no solamente al mes consultado.
- Resumen: acciones priorizadas por riesgo del expediente y fecha, indicadores y comparación con el período anterior según la frecuencia de cada KPI.
- Pendientes: tocar un contador o usar el filtro y buscador. Abrir expediente permite consultar/gestionar el caso; al cerrarlo se conserva la ficha y sus filtros.
- Controles: abrir el programa y usar «Volver a la ficha de gestión» para regresar.
- Historial y evidencias: expedientes cerrados, acciones verificadas/canceladas y fuentes de los indicadores consultados.
- Consultar mes es solo lectura: no cambia la configuración del indicador. Un mes sin medición manual no hereda el valor de otro mes. Las metas son las configuradas actualmente; no se reconstruyen metas históricas.
- La carga manual continúa identificada como manual. No se convierte automáticamente a un KPI de auditorías por el nombre del indicador.

## PDF

Exportar PDF abre un documento independiente:

1. Resumen para reunión: hasta 6 indicadores, 8 acciones priorizadas y 6 controles. Si hay más, el informe declara el recorte; la extensión depende del contenido.
2. Informe detallado con referencias: incluye todos los indicadores y pendientes de la celda, expedientes, acciones verificadas/canceladas y registros fuente disponibles.
3. En el documento, tocar «Imprimir / Guardar como PDF» y elegir el destino PDF del navegador. Se requiere permitir la ventana emergente.

No copia la página principal ni utiliza sus estilos de impresión. Evidencias como referencias de texto: no incrusta archivos/fotos originales. No cambia datos, permisos ni reglas de cierre.

## Verificación

Pruebas: `npm test -- --run src/sgo/__tests__` y `npm run build`.

Se verificaron muestras ficticias en Chrome: resumen de una página e informe de 80 acciones de siete páginas, sin páginas vacías, además de diseño de tablet, navegación, persistencia de filtros al volver, consulta de mes sin datos y apertura aislada del informe. Los tamaños/números de páginas no son límites para registros reales.

La matriz mantiene el semáforo de atención pero muestra el estado del KPI por separado. La cobertura cuenta celdas con KPI medido, no celdas que solo contienen alertas. Incluye Carpintería, Corte Aislación, Despacho y RRHH.
