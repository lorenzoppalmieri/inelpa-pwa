import type { Tarea, Parada, CausaParada } from '../types'
import { minutosEntre } from './time'
import { calcularTiempoNetoProductivo } from './calendario'
import { causaLabel, esParadaNoProductiva, esReparacion } from '../types'

// ============================================================
// Calculo de KPIs de planta (OEE simplificado, desvios, Pareto).
// ============================================================

// Minutos de parada PRODUCTIVA (demoras reales). Excluye pausas programadas
// como el almuerzo, que no deben penalizar el OEE (v1.4).
// v1.17: se miden en minutos LABORABLES (no crudos): una demora que cruza la noche
// o el fin de semana NO suma esas horas de planta cerrada. Solo cuenta si tiene fin.
export function minutosParada(t: Tarea): number {
  return t.paradas
    .filter((p) => !esParadaNoProductiva(p.causa) && p.fin)
    .reduce((acc, p) => acc + calcularTiempoNetoProductivo(new Date(p.inicio), new Date(p.fin as string), { sinAlmuerzo: true }), 0)
}

// Minutos de paradas NO productivas (almuerzo, pausas programadas, lapso de
// reapertura). Se restan del tiempo disponible: es como si esa franja no existiera.
// v1.17: se miden en minutos LABORABLES (no crudos), para que un lapso que cruza
// noches/fines de semana —ej. una reapertura al día siguiente— descuente solo las
// horas de planta y no de más.
export function minutosNoProductivos(t: Tarea): number {
  return t.paradas
    .filter((p) => esParadaNoProductiva(p.causa) && p.fin)
    .reduce((acc, p) => acc + calcularTiempoNetoProductivo(new Date(p.inicio), new Date(p.fin as string), { sinAlmuerzo: true }), 0)
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
    horaRecuperacion: t.activaHoraRecuperacion,
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
//   Demora Sin Justificar = Tiempo Real - Tiempo Estimado  (0 si es <= 0).
// ============================================================
export function tiempoEstimadoMin(t: Tarea): number { return Math.max(0, t.tiempoEstandarMin) }
export function tiempoRealMin(t: Tarea): number { return tiempoDisponible(t) }
export function totalDemoradoMin(t: Tarea): number { return minutosParada(t) }
export function tiempoNetoMin(t: Tarea): number { return Math.max(0, tiempoRealMin(t) - totalDemoradoMin(t)) }
export function demoraSinJustificarMin(t: Tarea): number { return Math.max(0, tiempoRealMin(t) - tiempoEstimadoMin(t)) }

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
  const all: Parada[] = tareas.filter((t) => !esReparacion(t)).flatMap((t) => t.paradas)
  const map = new Map<CausaParada, { min: number; ev: number }>()
  for (const p of all) {
    if (esParadaNoProductiva(p.causa)) continue // el almuerzo no es una demora
    // v1.17: minutos LABORABLES (no crudos): no cuenta noches/finde/planta cerrada.
    const min = p.fin ? calcularTiempoNetoProductivo(new Date(p.inicio), new Date(p.fin), { sinAlmuerzo: true }) : 0
    if (min <= 0) continue // ignora paradas en curso sin cierre
    const cur = map.get(p.causa) ?? { min: 0, ev: 0 }
    cur.min += min
    cur.ev++
    map.set(p.causa, cur)
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
