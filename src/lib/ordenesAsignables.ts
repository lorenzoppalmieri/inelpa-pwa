import type { OrdenProduccion } from '../types'

// ============================================================
// OF ELEGIBLES EN "ASIGNAR TAREA" (v2.49)
//
// Antes el desplegable ocultaba una OF cuando TODAS sus tareas estaban
// finalizadas. Pero una OF NO se consume con una tarea: abarca Bobinado,
// Herrería, Montaje PA, Montaje PO... Caso real (10/11/2026): la OF ya tenía la
// Cuba terminada en Herrería, desapareció de la lista y la planificadora tuvo
// que DUPLICAR la OF para asignar la Parte Activa.
//
// Ahora la lista trae TODAS las OF, sin mirar sus tareas. La tabla `ordenes`
// no tiene hoy un estado global (abierta/cerrada); el día que lo tenga, ese es
// el único criterio válido para ocultar una OF, y va acá.
//
// Lo que SÍ sigue limitando es el cupo por semielaborado (cantidad de la OF),
// que se calcula aparte en PlanificacionView: eso evita planificar dos veces la
// misma bobina o la misma cuba, sin esconder la OF entera.
// ============================================================

/** OF para el desplegable: todas, de la más reciente a la más antigua, filtradas por el buscador. */
export function ordenesAsignables(ordenes: OrdenProduccion[], buscar = ''): OrdenProduccion[] {
  const q = buscar.trim().toLowerCase()
  return [...ordenes]
    .sort((a, b) => (b.creada ?? '').localeCompare(a.creada ?? ''))
    .filter((o) => !q || `${o.nroOrden} ${o.modelo} ${o.nroContrato ?? ''}`.toLowerCase().includes(q))
}
