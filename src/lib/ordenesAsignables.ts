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
//
// v2.53 — UN SOLO ORDEN PARA TODAS LAS LISTAS DE OF
// La pestaña "Órdenes de fabricación" listaba las OF en el orden de Dexie (por
// id, que es un UUID aleatorio). Una OF recién llegada de SAP quedaba en
// cualquier lugar entre 600+ órdenes: estaba, pero nadie la encontraba
// ("la OF de SAP es invisible"). Ahora la pestaña, el desplegable de Asignar
// tarea y el de "Consumir en orden" usan la MISMA función de orden.
// ============================================================

/** Todas las OF, de la más reciente a la más antigua. Las viejas sin fecha de alta van al final. No muta el arreglo. */
export function ordenesRecientesPrimero(ordenes: OrdenProduccion[]): OrdenProduccion[] {
  return [...ordenes].sort((a, b) =>
    (b.creada ?? '').localeCompare(a.creada ?? '')
    || b.nroOrden.localeCompare(a.nroOrden, 'es', { numeric: true }))
}

/** Texto de la OF en los desplegables. Marca las que vienen de SAP. */
export function etiquetaOrden(o: OrdenProduccion): string {
  return `${o.nroOrden} · ${o.modelo}${o.origen === 'sap' ? ' [SAP]' : ''}`
}

/** OF para el desplegable: todas, de la más reciente a la más antigua, filtradas por el buscador. */
export function ordenesAsignables(ordenes: OrdenProduccion[], buscar = ''): OrdenProduccion[] {
  const q = buscar.trim().toLowerCase()
  return ordenesRecientesPrimero(ordenes)
    .filter((o) => !q || [o.nroOrden, o.modelo, o.nroContrato, o.sapDocNum, o.itemCode]
      .filter(Boolean).join(' ').toLowerCase().includes(q))
}
