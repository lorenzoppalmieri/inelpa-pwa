import type { Tarea, SectorId } from '../types'
import { esReparacion, sectorById } from '../types'
import { calcularTiempoNetoProductivo } from './calendario'
import { desglosePausas, metricasTarea } from './kpi'
import { imputacionDeEspera, areaQueEspera, imputable } from '../sgo/imputacion'
import type { AreaSGOId } from '../sgo/types'

// ============================================================
// OEE POR ESTACIÓN Y PERÍODO (v1.96)
//
// POR QUÉ SE REESCRIBIÓ. El OEE anterior (`calcularOEE` en kpi.ts) sumaba el
// tiempo de cada TAREA: todo el tiempo hábil entre su inicio y su fin. Un
// montaje que arranca el lunes y termina el viernes esperando bobinas aportaba
// 35 horas de "tiempo bruto" aunque nadie lo hubiera tocado en tres días, y el
// OEE se desplomaba.
//
// Eso no medía el rendimiento de Montaje: medía cuánto tardó el transformador
// en atravesar la planta. Son dos cosas distintas. Acá se calcula el OEE como
// manda la norma —sobre el TIEMPO DE LA ESTACIÓN en un período— y el otro
// número sobrevive con su nombre real: lead time.
//
//   Disponibilidad = Operativo / Turno        (Operativo = Turno − paradas)
//   Rendimiento    = Σ tiempo estándar / Operativo
//   Calidad        = piezas OK / piezas
//   OEE            = D × R × C
//
// ⚠ QUÉ ESTACIONES ENTRAN AL DENOMINADOR. Solo las que tuvieron actividad en el
// período. Hay 30 bobinadoras y ~16 bobinadores: contar las 30 daría 50% de
// disponibilidad desde el día uno y el indicador nacería roto. Una bobinadora
// apagada toda la semana no es disponibilidad perdida, es capacidad ociosa — y
// eso se mide aparte, en la cola.
// ============================================================

export interface Ventana { desdeISO: string; hastaISO: string }

/** Los componentes crudos. Se suman entre estaciones; los ratios se calculan al final. */
export interface ComponentesOEE {
  turnoMin: number
  paradasMin: number
  operativoMin: number
  estandarMin: number
  piezas: number
  piezasOk: number
}

export interface ResultadoOEE extends ComponentesOEE {
  disponibilidad: number  // 0..1
  rendimiento: number     // 0..1
  calidad: number         // 0..1
  oee: number             // 0..1
}

export interface OEEEstacion extends ResultadoOEE {
  maquinaId: string
  sectorId: SectorId
}

const div = (a: number, b: number): number => (b > 0 ? a / b : 0)

/** Minutos de planta abierta del período (turno de UNA estación). */
export function minutosDeTurno(v: Ventana): number {
  return calcularTiempoNetoProductivo(new Date(v.desdeISO), new Date(v.hastaISO), { sinAlmuerzo: true })
}

/** Cierra los ratios a partir de los componentes. Nunca promedia OEEs. */
export function cerrarOEE(c: ComponentesOEE): ResultadoOEE {
  const disponibilidad = Math.min(1, div(c.operativoMin, c.turnoMin))
  const rendimiento = Math.min(1, div(c.estandarMin, c.operativoMin))
  const calidad = c.piezas > 0 ? div(c.piezasOk, c.piezas) : 1
  return { ...c, disponibilidad, rendimiento, calidad, oee: disponibilidad * rendimiento * calidad }
}

const vacio = (): ComponentesOEE => ({
  turnoMin: 0, paradasMin: 0, operativoMin: 0, estandarMin: 0, piezas: 0, piezasOk: 0,
})

/** ¿La tarea trabajó dentro de la ventana? Se mira por su inicio real. */
function dentro(t: Tarea, v: Ventana): boolean {
  return !!t.inicioReal && t.inicioReal >= v.desdeISO && t.inicioReal < v.hastaISO
}

/**
 * OEE de cada estación con actividad en el período.
 *
 * Las REPARACIONES se excluyen: son tiempo no productivo por definición y no
 * deben penalizar el rendimiento de la estación (criterio de v1.8).
 */
export function oeePorEstacion(tareas: Tarea[], v: Ventana): OEEEstacion[] {
  const turno = minutosDeTurno(v)
  const porMaquina = new Map<string, { sectorId: SectorId; c: ComponentesOEE }>()

  for (const t of tareas) {
    if (!t.maquinaId || !dentro(t, v) || esReparacion(t)) continue
    const reg = porMaquina.get(t.maquinaId) ?? { sectorId: t.sectorId, c: vacio() }
    // Paradas PRODUCTIVAS (demoras justificadas). El almuerzo no resta al
    // operativo porque tampoco está dentro del turno productivo.
    reg.c.paradasMin += metricasTarea(t).justificada
    if (t.estado === 'finalizada') {
      reg.c.estandarMin += Math.max(0, t.tiempoEstandarMin)
      reg.c.piezas += 1
      if (t.calidadOk !== false) reg.c.piezasOk += 1
    }
    porMaquina.set(t.maquinaId, reg)
  }

  return [...porMaquina.entries()].map(([maquinaId, { sectorId, c }]) => {
    c.turnoMin = turno
    c.operativoMin = Math.max(0, turno - c.paradasMin)
    return { maquinaId, sectorId, ...cerrarOEE(c) }
  }).sort((a, b) => a.maquinaId.localeCompare(b.maquinaId))
}

/**
 * Agrega estaciones a un nivel superior. SUMA LOS COMPONENTES y recalcula los
 * ratios — NO promedia los OEE de cada estación, que es el error clásico: una
 * estación que trabajó 20 minutos pesaría lo mismo que una que trabajó 40 horas.
 */
export function agregarOEE(estaciones: OEEEstacion[]): ResultadoOEE {
  const c = vacio()
  for (const e of estaciones) {
    c.turnoMin += e.turnoMin
    c.paradasMin += e.paradasMin
    c.operativoMin += e.operativoMin
    c.estandarMin += e.estandarMin
    c.piezas += e.piezas
    c.piezasOk += e.piezasOk
  }
  return cerrarOEE(c)
}

export interface OEESector { sectorId: SectorId; label: string; estaciones: number; datos: ResultadoOEE }

export function oeePorSector(estaciones: OEEEstacion[]): OEESector[] {
  const m = new Map<SectorId, OEEEstacion[]>()
  for (const e of estaciones) m.set(e.sectorId, [...(m.get(e.sectorId) ?? []), e])
  return [...m.entries()]
    .map(([sectorId, list]) => ({
      sectorId, label: sectorById(sectorId).nombre,
      estaciones: list.length, datos: agregarOEE(list),
    }))
    .sort((a, b) => a.datos.oee - b.datos.oee) // el peor primero: es el que hay que mirar
}

// ============================================================
// SEÑAL 1 — ESPERA CAUSADA, CRUZADA POR ÁREA
//
// "Este mes Logística le hizo perder 63 h a Montaje." Sale de las paradas ya
// registradas + el mapeo de sgo/imputacion.ts (validado con Lorenzo).
// Las restricciones internas y las causas externas quedan afuera del ranking.
// ============================================================
export interface EsperaCruzada {
  responsable: AreaSGOId
  afectada: AreaSGOId
  minutos: number
  eventos: number
}

export function esperaPorArea(tareas: Tarea[], v: Ventana): EsperaCruzada[] {
  const acc = new Map<string, EsperaCruzada>()
  for (const t of tareas) {
    if (!dentro(t, v)) continue
    const afectada = areaQueEspera(t)
    for (const tramo of desglosePausas(t)) {
      if (!tramo.productiva) continue // el almuerzo no es espera
      const imp = imputacionDeEspera(tramo.causa, t)
      if (!imputable(imp)) continue   // interna o externa: fuera del ranking
      const k = `${imp.area}|${afectada}`
      const reg = acc.get(k) ?? { responsable: imp.area, afectada, minutos: 0, eventos: 0 }
      reg.minutos += tramo.minutos
      reg.eventos += 1
      acc.set(k, reg)
    }
  }
  return [...acc.values()].sort((a, b) => b.minutos - a.minutos)
}

/** Restricciones internas: se miden igual, pero no se le imputan a nadie. */
export interface RestriccionInterna { motivo: string; minutos: number; eventos: number }

export function restriccionesInternas(tareas: Tarea[], v: Ventana): RestriccionInterna[] {
  const acc = new Map<string, RestriccionInterna>()
  for (const t of tareas) {
    if (!dentro(t, v)) continue
    for (const tramo of desglosePausas(t)) {
      if (!tramo.productiva) continue
      const imp = imputacionDeEspera(tramo.causa, t)
      if (imp?.tipo !== 'interna') continue
      const reg = acc.get(imp.motivo) ?? { motivo: imp.motivo, minutos: 0, eventos: 0 }
      reg.minutos += tramo.minutos
      reg.eventos += 1
      acc.set(imp.motivo, reg)
    }
  }
  return [...acc.values()].sort((a, b) => b.minutos - a.minutos)
}

// ============================================================
// SEÑAL 2 — COLA ACUMULADA POR ESTACIÓN
//
// Horas de trabajo pendiente delante de cada estación. Muestra el cuello ANTES
// de que explote: es donde se apila la fila, no donde ya se rompió algo.
// ============================================================
export interface ColaEstacion {
  maquinaId: string
  sectorId: SectorId
  tareas: number
  minutosPendientes: number
  /** Jornadas de 525 min que representa esa cola. */
  jornadas: number
}

const JORNADA_MIN = 525

export function colaPorEstacion(tareas: Tarea[]): ColaEstacion[] {
  const m = new Map<string, ColaEstacion>()
  for (const t of tareas) {
    if (t.estado !== 'pendiente' || !t.maquinaId || esReparacion(t)) continue
    const reg = m.get(t.maquinaId) ?? {
      maquinaId: t.maquinaId, sectorId: t.sectorId, tareas: 0, minutosPendientes: 0, jornadas: 0,
    }
    reg.tareas += 1
    reg.minutosPendientes += Math.max(0, t.tiempoEstandarMin)
    m.set(t.maquinaId, reg)
  }
  return [...m.values()]
    .map((c) => ({ ...c, jornadas: Math.round((c.minutosPendientes / JORNADA_MIN) * 10) / 10 }))
    .sort((a, b) => b.minutosPendientes - a.minutosPendientes)
}
