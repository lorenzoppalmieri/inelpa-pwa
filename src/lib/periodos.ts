import type { Tarea } from '../types'

// ============================================================
// FILTRO DE PERÍODO — FUENTE ÚNICA (v2.07)
//
// Antes había DOS filtros de fecha distintos y con distinto criterio:
//   - KPIs (DashboardView): día / mes actual / mes anterior / anual / rango.
//   - Asignar tareas (PlanificacionView): mes actual / mes anterior / anual /
//     todas, MÁS un input de fecha suelto al costado que hacía de "día
//     específico" pero sin decirlo, y que se combinaba con el período de forma
//     confusa (podías elegir "mes anterior" y un día de este mes, y no salía
//     nada sin explicación).
//
// Ahora los dos usan esta misma lógica. Si mañana se agrega "última semana",
// aparece en las dos pantallas sin tener que acordarse de la otra.
//
// Convención de rango: [desde, hasta) — `hasta` es EXCLUSIVO. Por eso al elegir
// un día o un rango se lleva el extremo final al día siguiente a las 00:00; si
// no, el último día quedaría afuera y nadie entendería por qué.
// ============================================================

export type Periodo = 'dia' | 'mes_actual' | 'mes_anterior' | 'anual' | 'rango' | 'todas'

export interface OpcionPeriodo { id: Periodo; label: string }

const TODOS: OpcionPeriodo[] = [
  { id: 'dia', label: 'Día específico' },
  { id: 'mes_actual', label: 'Mes actual' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'anual', label: 'Acumulado anual' },
  { id: 'rango', label: 'Rango personalizado' },
  { id: 'todas', label: 'Todas' },
]

/**
 * Opciones del desplegable.
 * @param conTodas 'Todas' tiene sentido en un listado de trabajo (ver qué quedó
 *   pendiente de cualquier fecha), no en un tablero de KPIs, donde comparar
 *   contra "toda la historia" no dice nada.
 */
export function opcionesPeriodo(conTodas = false): OpcionPeriodo[] {
  return conTodas ? TODOS : TODOS.filter((p) => p.id !== 'todas')
}

export function labelPeriodo(p: Periodo): string {
  return TODOS.find((x) => x.id === p)?.label ?? p
}

/** true = ese período necesita que el usuario elija fecha(s). */
export function pidefechas(p: Periodo): { dia: boolean; rango: boolean } {
  return { dia: p === 'dia', rango: p === 'rango' }
}

/** Hoy en 'YYYY-MM-DD' local — en-CA da exactamente ese formato. */
export function hoyLocalISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

/** Primer día del mes en curso, en 'YYYY-MM-DD' local. */
export function primerDiaDelMesISO(): string {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), 1).toLocaleDateString('en-CA')
}

export interface Rango { desde: string; hasta: string }

/** Rango que no matchea nada: se usa cuando falta un extremo. */
const VACIO: Rango = {
  desde: new Date(2000, 0, 1).toISOString(),
  hasta: new Date(2000, 0, 1).toISOString(),
}

/**
 * Ventana [desde, hasta) del período elegido.
 *
 * @param diaISO   'YYYY-MM-DD' cuando el período es 'dia'.
 * @param desdeISO 'YYYY-MM-DD' cuando el período es 'rango'.
 * @param hastaISO 'YYYY-MM-DD' inclusive cuando el período es 'rango'.
 */
export function rangoPeriodo(
  periodo: Periodo,
  now: Date,
  diaISO?: string,
  desdeISO?: string,
  hastaISO?: string,
): Rango {
  const y = now.getFullYear(), m = now.getMonth()

  if (periodo === 'todas') {
    return { desde: new Date(2000, 0, 1).toISOString(), hasta: new Date(y + 50, 0, 1).toISOString() }
  }
  if (periodo === 'dia') {
    if (!diaISO) return VACIO
    const d = new Date(`${diaISO}T00:00:00`)
    const fin = new Date(d); fin.setDate(fin.getDate() + 1)
    return { desde: d.toISOString(), hasta: fin.toISOString() }
  }
  if (periodo === 'rango') {
    // Falta un extremo -> rango vacío, para no traer toda la base sin querer.
    if (!desdeISO || !hastaISO) return VACIO
    const d = new Date(`${desdeISO}T00:00:00`)
    const h = new Date(`${hastaISO}T00:00:00`); h.setDate(h.getDate() + 1) // fin inclusivo
    // Si invirtió las fechas, se normaliza en vez de no mostrar nada.
    return d <= h ? { desde: d.toISOString(), hasta: h.toISOString() } : { desde: h.toISOString(), hasta: d.toISOString() }
  }
  if (periodo === 'anual') {
    return { desde: new Date(y, 0, 1).toISOString(), hasta: new Date(y + 1, 0, 1).toISOString() }
  }
  const mm = periodo === 'mes_anterior' ? m - 1 : m
  return { desde: new Date(y, mm, 1).toISOString(), hasta: new Date(y, mm + 1, 1).toISOString() }
}

/**
 * ¿La tarea cae en el período? La referencia es el arranque REAL, y si todavía
 * no arrancó, el planificado: así una tarea pendiente aparece en el mes en que
 * está agendada y no desaparece del listado hasta que alguien la inicie.
 */
export function tareaEnPeriodo(
  t: Tarea,
  periodo: Periodo,
  now: Date,
  diaISO?: string,
  desdeISO?: string,
  hastaISO?: string,
): boolean {
  if (periodo === 'todas') return true
  const ref = t.inicioReal ?? t.inicioPlanificado
  if (!ref) return false
  const { desde, hasta } = rangoPeriodo(periodo, now, diaISO, desdeISO, hastaISO)
  return ref >= desde && ref < hasta
}
