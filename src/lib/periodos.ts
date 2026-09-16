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
    const a = new Date(`${desdeISO}T00:00:00`)
    const b = new Date(`${hastaISO}T00:00:00`)
    // BUG CORREGIDO (venía del filtro de KPIs de v1.22): antes se le sumaba el
    // día al `hasta` ANTES de ordenar los extremos. Con las fechas invertidas
    // (12 al 10) el +1 caía del lado equivocado y el resultado era una ventana
    // de UN día —el 11— en vez del rango 10 al 12. No avisaba nada: el tablero
    // simplemente mostraba casi ningún dato.
    // Ahora se ordenan primero y el día se le suma al extremo MAYOR.
    const ini = a <= b ? a : b
    const fin = new Date(a <= b ? b : a)
    fin.setDate(fin.getDate() + 1) // fin inclusivo
    return { desde: ini.toISOString(), hasta: fin.toISOString() }
  }
  if (periodo === 'anual') {
    return { desde: new Date(y, 0, 1).toISOString(), hasta: new Date(y + 1, 0, 1).toISOString() }
  }
  const mm = periodo === 'mes_anterior' ? m - 1 : m
  return { desde: new Date(y, mm, 1).toISOString(), hasta: new Date(y, mm + 1, 1).toISOString() }
}

/**
 * Fecha con la que una tarea se ubica en el tiempo.
 *
 * v2.22 — LAS FINALIZADAS SE ANCLAN AL FIN, NO AL ARRANQUE.
 *
 * Antes la referencia era siempre el inicio, y eso dejaba un punto ciego: una
 * bobina que arrancó el 28 de agosto y se terminó el 3 de septiembre no aparecía
 * al filtrar septiembre. Quedaba contada en agosto, el mes en el que casi no se
 * trabajó en ella. En bobinado, donde las tareas cruzan días y fines de semana
 * todo el tiempo, esto escondía trabajo terminado.
 *
 * La regla ahora:
 *   - FINALIZADA  -> `finReal`. Una pieza pertenece al período en que quedó
 *                    hecha. Es también lo correcto para los KPIs: la producción
 *                    de septiembre es lo que se terminó en septiembre.
 *   - el resto    -> `inicioReal`, y si todavía no arrancó, `inicioPlanificado`,
 *                    para que una pendiente aparezca en el mes en que está
 *                    agendada y no desaparezca del listado.
 *
 * Fallback: una finalizada sin `finReal` (dato mal cerrado) cae al inicio en vez
 * de desaparecer del tablero. El Auditor de Tiempos ya la reclama por su lado.
 */
export function fechaDeReferencia(t: Tarea): string | undefined {
  if (t.estado === 'finalizada') return t.finReal ?? t.inicioReal ?? t.inicioPlanificado
  return t.inicioReal ?? t.inicioPlanificado
}

/** Instante de un ISO en ms. NaN si no es una fecha válida. */
const ms = (iso?: string): number => (iso ? new Date(iso).getTime() : NaN)

/**
 * ¿La tarea cae en el período?
 *
 * OJO CON LA COMPARACIÓN: se compara por INSTANTE, nunca como texto. `rangoPeriodo`
 * devuelve `toISOString()` (siempre `...Z`) y las tareas vienen de Supabase con
 * `...+00:00`. Como texto, el mismo instante compara distinto —'+' es menor que
 * '.' en ASCII— y tareas del borde del período entraban o quedaban afuera sin
 * motivo. Es el mismo error que ya rompió `huecos.ts`, `fusionarIntervalos`
 * (v2.12) y el auto-shift del Gantt (v2.17); acá estaba desde v2.07.
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
  const ref = ms(fechaDeReferencia(t))
  if (!Number.isFinite(ref)) return false
  const { desde, hasta } = rangoPeriodo(periodo, now, diaISO, desdeISO, hastaISO)
  return ref >= ms(desde) && ref < ms(hasta)
}
