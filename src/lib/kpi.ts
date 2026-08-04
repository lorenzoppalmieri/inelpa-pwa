import type { Tarea, Parada, CausaParada } from '../types'
import { minutosEntre } from './time'
import { calcularTiempoNetoProductivo } from './calendario'
import { causaLabel, esParadaNoProductiva, esReparacion, minutosRecupTarea } from '../types'

// ============================================================
// Calculo de KPIs de planta (OEE simplificado, desvios, Pareto).
// ============================================================

// ============================================================
// PAUSAS: fin efectivo y desglose UNIFICADO (v1.66)
//
// BUG CORREGIDO: antes las paradas SIN cerrar se descartaban (`filter(p => p.fin)`).
// Si el operario marcaba "rotura de herramienta" y nunca apretaba Reanudar, esa
// justificación DESAPARECÍA de los totales y la demora sin justificar se
// inflaba. Ahora una parada abierta se cierra en el fin de la tarea (si ya
// terminó) o en "ahora" (si sigue en curso), que es lo que realmente pasó.
// ============================================================

/** Fin efectivo de una parada: el registrado, o el cierre de la tarea, o ahora. */
export function finEfectivoParada(t: Tarea, p: Parada, ahoraISO?: string): string {
  return p.fin ?? t.finReal ?? ahoraISO ?? new Date().toISOString()
}

/** Un tramo de pausa ya medido. Es lo que consumen el Gantt y el dashboard. */
export interface TramoPausa {
  id: string
  causa: CausaParada
  label: string
  inicio: string
  fin: string
  /** Minutos en horario de planta (nunca cuenta noches ni fines de semana). */
  minutos: number
  /** true = demora justificada (cuenta como justificación). false = almuerzo/pausa programada. */
  productiva: boolean
  /** true = el operario no la cerró; se midió hasta el cierre de la tarea o hasta ahora. */
  abierta: boolean
}

/**
 * DESGLOSE ÚNICO de las pausas de una tarea. Fuente de verdad compartida: el
 * tooltip del Gantt y la tabla de totales leen de acá, así no pueden
 * contradecirse (era uno de los síntomas reportados).
 */
export function desglosePausas(t: Tarea, ahoraISO?: string): TramoPausa[] {
  const recupMin = minutosRecupTarea(t)
  return (t.paradas ?? []).map((p) => {
    const fin = finEfectivoParada(t, p, ahoraISO)
    return {
      id: p.id,
      causa: p.causa,
      label: causaLabel(p.causa),
      inicio: p.inicio,
      fin,
      minutos: calcularTiempoNetoProductivo(new Date(p.inicio), new Date(fin), { recupMin, sinAlmuerzo: true }),
      productiva: !esParadaNoProductiva(p.causa),
      abierta: !p.fin,
    }
  })
}

// DEMORA JUSTIFICADA = suma de las pausas PRODUCTIVAS (rotura, falta de
// material, espera de máquina...). Medida en minutos de planta abierta.
export function minutosParada(t: Tarea, ahoraISO?: string): number {
  return desglosePausas(t, ahoraISO)
    .filter((x) => x.productiva)
    .reduce((acc, x) => acc + x.minutos, 0)
}

// PAUSAS NO PRODUCTIVAS (almuerzo, reapertura). NO son demora: se descuentan del
// Tiempo Real como si esa franja no existiera, pero se muestran en el detalle
// (el operario las marca todos los días y tiene que poder verlas).
export function minutosNoProductivos(t: Tarea, ahoraISO?: string): number {
  return desglosePausas(t, ahoraISO)
    .filter((x) => !x.productiva)
    .reduce((acc, x) => acc + x.minutos, 0)
}

// Tiempo real de ejecucion BRUTO (resta cruda de timestamps). Solo informativo
// (incluye noches/finde si la tarea cruzo el cierre); NO usar para OEE.
export function tiempoRealBruto(t: Tarea): number {
  return minutosEntre(t.inicioReal, t.finReal)
}

// TIEMPO REAL (v1.16): tiempo laborable entre inicio y fin (descuenta noches,
// fines de semana, limpieza), SIN la franja fija de almuerzo; el almuerzo se
// descuenta por la PARADA real que marca el operario (minutosNoProductivos).
// Asi una parada de almuerzo NO suma ni a Real ni a Neto, y se respeta el
// horario real de cada operario. Se recalcula siempre desde los timestamps
// (no usa duracionEfectivaMin guardado, que seguia el criterio viejo).
export function tiempoDisponible(t: Tarea): number {
  if (!t.inicioReal || !t.finReal) return 0
  const wall = calcularTiempoNetoProductivo(new Date(t.inicioReal), new Date(t.finReal), {
    recupMin: minutosRecupTarea(t),
    sinAlmuerzo: true,
  })
  return Math.max(0, wall - minutosNoProductivos(t))
}

// Tiempo real neto (descontando paradas productivas) = trabajo efectivo.
export function tiempoRealNeto(t: Tarea): number {
  return Math.max(0, tiempoDisponible(t) - minutosParada(t))
}

// ============================================================
// METRICAS CANONICAS (v1.16) — definiciones EXACTAS acordadas con direccion.
// Son la unica fuente de verdad para Gantt, graficos y la tabla de detalle.
//   Tiempo Estimado     = matriz Maquina+Modelo+Material (hoy: tiempoEstandarMin).
//   Tiempo Real         = (Fin - Inicio) sin horarios de planta cerrada (ni almuerzo).
//   Total Demorado      = suma de paradas justificadas (productivas).
//   Tiempo Neto         = Tiempo Real - Total Demorado.
//   Demora Sin Justificar = Tiempo NETO - Tiempo Estimado  (0 si es <= 0).
//     (v1.18) Se usa Neto —trabajo efectivo, ya descontadas las demoras
//     justificadas— para NO penalizar por paradas justificadas (material, maquina).
// ============================================================
export function tiempoEstimadoMin(t: Tarea): number { return Math.max(0, t.tiempoEstandarMin) }
export function tiempoRealMin(t: Tarea): number { return tiempoDisponible(t) }
export function totalDemoradoMin(t: Tarea): number { return minutosParada(t) }
export function tiempoNetoMin(t: Tarea): number { return Math.max(0, tiempoRealMin(t) - totalDemoradoMin(t)) }
/**
 * Tiempo Real hasta un instante de corte. Para tareas EN CURSO el corte es
 * "ahora"; para finalizadas, su fin real. Antes el Gantt tenia su PROPIA copia
 * de esta cuenta (y podia contradecir al dashboard); ahora los dos llaman aca.
 */
export function tiempoRealHasta(t: Tarea, hastaISO?: string): number {
  const fin = hastaISO ?? t.finReal
  if (!t.inicioReal || !fin) return 0
  const wall = calcularTiempoNetoProductivo(new Date(t.inicioReal), new Date(fin), {
    recupMin: minutosRecupTarea(t), sinAlmuerzo: true,
  })
  return Math.max(0, wall - minutosNoProductivos(t, fin))
}

/**
 * DEMORA SIN JUSTIFICAR hasta un instante de corte. FUENTE DE VERDAD UNICA:
 * la usan el Gantt (para tareas en curso, con corte = ahora) y el dashboard.
 */
export function demoraSinJustificarHasta(t: Tarea, hastaISO?: string): number {
  if (esReparacion(t)) return 0
  const fin = hastaISO ?? t.finReal
  if (!t.inicioReal || !fin) return 0
  const exceso = tiempoRealHasta(t, fin) - tiempoEstimadoMin(t)
  return Math.max(0, Math.round(exceso - minutosParada(t, fin)))
}

/**
 * DEMORA SIN JUSTIFICAR = (Tiempo Real Neto - Tiempo Estimado) - Demora Justificada
 *
 * Escrita tal cual la definió dirección. Nota: es la MISMA cuenta que
 * (Neto - Estimado), porque Neto ya tiene la justificada descontada
 * — se deja en la forma explícita para que se lea igual que la regla de negocio.
 *
 * Si el operario justificó TODO su exceso con pausas válidas, da 0.
 */
export function demoraSinJustificarMin(t: Tarea): number {
  const exceso = tiempoRealMin(t) - tiempoEstimadoMin(t)
  return Math.max(0, exceso - totalDemoradoMin(t))
}

// Filtra tareas cuyo trabajo cae dentro de [desdeISO, hastaISO) segun su
// inicio real (o planificado). Base del filtro de periodo del Dashboard (v1.4).
export function filtrarPorRango(tareas: Tarea[], desdeISO: string, hastaISO: string): Tarea[] {
  return tareas.filter((t) => {
    const ref = t.inicioReal ?? t.inicioPlanificado
    return ref != null && ref >= desdeISO && ref < hastaISO
  })
}

export interface OEE {
  disponibilidad: number // 0..1
  rendimiento: number    // 0..1
  calidad: number        // 0..1
  oee: number            // 0..1
}

// OEE simplificado para planta sobre un conjunto de tareas finalizadas.
//  Disponibilidad = tiempo operativo / tiempo bruto (bruto - paradas) / bruto
//  Rendimiento    = tiempo estandar / tiempo neto (ideal vs real efectivo)
//  Calidad        = piezas OK / piezas totales
export function calcularOEE(tareas: Tarea[]): OEE {
  // v1.8: las reparaciones son tiempo no productivo -> NO entran al OEE.
  const fin = tareas.filter((t) => t.estado === 'finalizada' && t.inicioReal && t.finReal && !esReparacion(t))
  if (fin.length === 0) return { disponibilidad: 0, rendimiento: 0, calidad: 0, oee: 0 }

  let bruto = 0, paradas = 0, estandar = 0, neto = 0, ok = 0
  for (const t of fin) {
    // Base = tiempo disponible (sin almuerzo); las paradas son solo productivas.
    const base = Math.max(1, tiempoDisponible(t))
    const par = minutosParada(t)
    bruto += base
    paradas += par
    neto += Math.max(1, base - par)
    estandar += t.tiempoEstandarMin
    if (t.calidadOk !== false) ok++
  }
  const disponibilidad = bruto > 0 ? (bruto - paradas) / bruto : 0
  const rendimiento = neto > 0 ? Math.min(1, estandar / neto) : 0
  const calidad = ok / fin.length
  return { disponibilidad, rendimiento, calidad, oee: disponibilidad * rendimiento * calidad }
}

export interface DesvioModelo {
  modelo: string
  estandar: number
  realNeto: number
  desvioPct: number // (real-estandar)/estandar
  n: number
}

// Real vs estandar agrupado por modelo de transformador.
export function desviosPorModelo(tareas: Tarea[]): DesvioModelo[] {
  const fin = tareas.filter((t) => t.estado === 'finalizada' && t.inicioReal && t.finReal && !esReparacion(t))
  const map = new Map<string, { est: number; real: number; n: number }>()
  for (const t of fin) {
    const k = t.modelo
    const cur = map.get(k) ?? { est: 0, real: 0, n: 0 }
    cur.est += t.tiempoEstandarMin
    cur.real += tiempoRealMin(t) // v1.16: Tiempo Real (no Neto), segun definicion de direccion
    cur.n++
    map.set(k, cur)
  }
  return [...map.entries()].map(([modelo, v]) => ({
    modelo,
    estandar: v.est,
    realNeto: v.real,
    desvioPct: v.est > 0 ? (v.real - v.est) / v.est : 0,
    n: v.n,
  })).sort((a, b) => b.desvioPct - a.desvioPct)
}

export interface ParetoItem {
  causa: CausaParada
  label: string
  minutos: number
  eventos: number
  pct: number
  acum: number
}

// Pareto de demoras: causas ordenadas por minutos perdidos + % acumulado.
export function paretoDemoras(tareas: Tarea[]): ParetoItem[] {
  const map = new Map<CausaParada, { min: number; ev: number }>()
  // Se itera por tarea (no flatMap) para conservar su flag de hora de recuperacion:
  // una parada en la franja 16-17h / vie 15-16h solo cuenta si la tarea la recupera.
  for (const t of tareas.filter((t) => !esReparacion(t))) {
    for (const p of t.paradas) {
      if (esParadaNoProductiva(p.causa)) continue // el almuerzo no es una demora
      // v1.17: minutos LABORABLES (no crudos): no cuenta noches/finde/planta cerrada.
      const min = p.fin ? calcularTiempoNetoProductivo(new Date(p.inicio), new Date(p.fin), { recupMin: minutosRecupTarea(t), sinAlmuerzo: true }) : 0
      if (min <= 0) continue // ignora paradas en curso sin cierre
      const cur = map.get(p.causa) ?? { min: 0, ev: 0 }
      cur.min += min
      cur.ev++
      map.set(p.causa, cur)
    }
  }
  const total = [...map.values()].reduce((a, b) => a + b.min, 0) || 1
  let acum = 0
  return [...map.entries()]
    .map(([causa, v]) => ({ causa, label: causaLabel(causa), minutos: v.min, eventos: v.ev, pct: v.min / total }))
    .sort((a, b) => b.minutos - a.minutos)
    .map((it) => { acum += it.pct; return { ...it, acum } })
}

export interface EficienciaOperario {
  operarioId: string
  activos: number  // minutos efectivos
  parada: number   // minutos de parada
  eficiencia: number // activos / (activos+parada)
}

export function eficienciaPorOperario(tareas: Tarea[]): Map<string, EficienciaOperario> {
  const map = new Map<string, EficienciaOperario>()
  for (const t of tareas) {
    if (!t.inicioReal) continue
    if (esReparacion(t)) continue // v1.8: reparacion = no productivo, fuera del KPI
    // v1.2: operarioId es opcional (se estampa al iniciar). Sin operario no hay
    // a quien atribuir la eficiencia: se omite de este KPI.
    if (!t.operarioId) continue
    const par = minutosParada(t)
    const bruto = t.finReal ? tiempoDisponible(t) : 0
    const activos = Math.max(0, bruto - par)
    const cur = map.get(t.operarioId) ?? { operarioId: t.operarioId, activos: 0, parada: 0, eficiencia: 0 }
    cur.activos += activos
    cur.parada += par
    cur.eficiencia = cur.activos + cur.parada > 0 ? cur.activos / (cur.activos + cur.parada) : 0
    map.set(t.operarioId, cur)
  }
  return map
}

export function pct(n: number): string {
  return (n * 100).toFixed(0) + '%'
}
