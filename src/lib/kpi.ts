import type { Tarea, Parada, CausaParada } from '../types'
import { minutosEntre } from './time'
import { causaLabel } from '../types'

// ============================================================
// Calculo de KPIs de planta (OEE simplificado, desvios, Pareto).
// ============================================================

// Minutos totales de parada de una tarea (suma de paradas cerradas).
export function minutosParada(t: Tarea): number {
  return t.paradas.reduce((acc, p) => acc + minutosEntre(p.inicio, p.fin), 0)
}

// Tiempo real de ejecucion de una tarea finalizada (incluye paradas).
export function tiempoRealBruto(t: Tarea): number {
  return minutosEntre(t.inicioReal, t.finReal)
}

// Tiempo real neto (descontando paradas) = tiempo efectivo de trabajo.
export function tiempoRealNeto(t: Tarea): number {
  return Math.max(0, tiempoRealBruto(t) - minutosParada(t))
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
  const fin = tareas.filter((t) => t.estado === 'finalizada' && t.inicioReal && t.finReal)
  if (fin.length === 0) return { disponibilidad: 0, rendimiento: 0, calidad: 0, oee: 0 }

  let bruto = 0, paradas = 0, estandar = 0, neto = 0, ok = 0
  for (const t of fin) {
    const b = tiempoRealBruto(t)
    const par = minutosParada(t)
    bruto += b
    paradas += par
    neto += Math.max(1, b - par)
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
  const fin = tareas.filter((t) => t.estado === 'finalizada' && t.inicioReal && t.finReal)
  const map = new Map<string, { est: number; real: number; n: number }>()
  for (const t of fin) {
    const k = t.modelo
    const cur = map.get(k) ?? { est: 0, real: 0, n: 0 }
    cur.est += t.tiempoEstandarMin
    cur.real += tiempoRealNeto(t)
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
  const all: Parada[] = tareas.flatMap((t) => t.paradas)
  const map = new Map<CausaParada, { min: number; ev: number }>()
  for (const p of all) {
    const min = minutosEntre(p.inicio, p.fin)
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
    // v1.2: operarioId es opcional (se estampa al iniciar). Sin operario no hay
    // a quien atribuir la eficiencia: se omite de este KPI.
    if (!t.operarioId) continue
    const par = minutosParada(t)
    const bruto = t.finReal ? tiempoRealBruto(t) : 0
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
