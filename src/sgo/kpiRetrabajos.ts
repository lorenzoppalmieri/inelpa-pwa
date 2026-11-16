import { esReparacion, type Tarea } from '../types'
import { isoWeek, fechaLocalISO } from '../lib/time'
import { areaSGODeSector } from './kpiAutomaticos'
import { materialSinValorizar } from './costosRetrabajo'
import {
  CLASIFICACIONES_CAUSA_RETRABAJO, costoRetrabajoTotal, esEventoRetrabajo, tiempoRetrabajoDesdePlanta,
} from './retrabajos'
import { areaSGOLabel, type AccionSGO, type AreaSGOId, type EventoSGO, type OrigenRetrabajoSGO } from './types'

// ============================================================
// KPIs DE RETRABAJOS (v2.51) — una sola fuente para la pantalla de Retrabajos.
//
// Reglas de cálculo (no cambiar sin revisar los tests):
//  - Un caso cuenta en el período en que OCURRIÓ (`detectadoEn`), en hora local.
//    Los indicadores de cierre usan la fecha de CIERRE.
//  - Fechas comparadas como instantes (ms), nunca como texto: conviven '…Z',
//    '…+00:00' (Supabase) y '…-03:00' (locales).
//  - Horas perdidas = tiempo medido en planta (`tiempoRetrabajoDesdePlanta`, con
//    horario de planta). NO es una resta de fechas.
//  - Toma y cierre se miden contra los plazos del circuito (24 h y 72 h), que
//    están definidos en horas corridas (`crearDatosRetrabajo`); por eso ahí sí se
//    usa la diferencia de fechas, igual que el plazo que se evalúa.
//  - Solo cuentan los expedientes que son retrabajo (`esEventoRetrabajo`): las
//    paradas de calidad descartadas o sin clasificar no suman.
// ============================================================

// ---------------- Período ----------------

export type TipoPeriodoRetrabajo = 'semana' | 'mes' | 'todo'

export interface RangoPeriodo {
  tipo: TipoPeriodoRetrabajo
  /** Inicio inclusivo (ms). */
  desde: number
  /** Fin exclusivo (ms). */
  hasta: number
  etiqueta: string
  /** Etiqueta breve para gráficos ("S47", "nov"). */
  corta: string
}

const MS_DIA = 86400000
const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

/** Lunes 00:00 (hora local) de la semana de `d`. */
function lunesDe(d: Date): Date {
  const dia = (d.getDay() + 6) % 7 // lunes = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dia)
}

export function rangoPeriodo(tipo: TipoPeriodoRetrabajo, ref: Date): RangoPeriodo {
  if (tipo === 'semana') {
    const ini = lunesDe(ref)
    const fin = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 7)
    const ultimo = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() - 1)
    const n = Number(isoWeek(ini).split('-W')[1])
    return { tipo, desde: ini.getTime(), hasta: fin.getTime(), etiqueta: `Semana ${n} · ${ddmm(ini)} – ${ddmm(ultimo)}`, corta: `S${n}` }
  }
  if (tipo === 'mes') {
    const ini = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const fin = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
    const mes = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(ini)
    const mesCorto = new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(ini).replace('.', '')
    return { tipo, desde: ini.getTime(), hasta: fin.getTime(), etiqueta: `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${ini.getFullYear()}`, corta: mesCorto }
  }
  return { tipo, desde: -Infinity, hasta: Infinity, etiqueta: 'Todo el historial', corta: 'Todo' }
}

/** Fecha de referencia desplazada `delta` períodos (±1 = anterior/siguiente). */
export function moverPeriodo(tipo: TipoPeriodoRetrabajo, ref: Date, delta: number): Date {
  if (tipo === 'semana') return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + delta * 7)
  if (tipo === 'mes') return new Date(ref.getFullYear(), ref.getMonth() + delta, 1)
  return ref
}

export function periodoAnterior(r: RangoPeriodo): RangoPeriodo | undefined {
  if (r.tipo === 'todo') return undefined
  return rangoPeriodo(r.tipo, moverPeriodo(r.tipo, new Date(r.desde), -1))
}

export function enRango(iso: string | undefined, r: RangoPeriodo): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= r.desde && t < r.hasta
}

// ---------------- Helpers ----------------

const pct = (n: number, d: number): number | undefined => (d > 0 ? Math.round((n / d) * 1000) / 10 : undefined)

function mediana(valores: number[]): number | undefined {
  if (!valores.length) return undefined
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/** Área donde se ORIGINÓ el retrabajo (la que lo genera), con respaldo en la que lo detectó. */
export function areaOrigenRetrabajo(e: EventoSGO): AreaSGOId | undefined {
  return e.areaOrigenId ?? e.areaId
}

export function esReincidente(e: EventoSGO): boolean {
  return Boolean(e.retrabajo?.reincidente || e.retrabajo?.resultadoVerificacion === 'reincidencia')
}

/** Costo definido y completo: se eligió cómo costearlo y el material (si hubo) está valorizado. */
export function costoValorizado(e: EventoSGO): boolean {
  const r = e.retrabajo
  if (!r || !(r.modalidadCosto || r.costosRevisados)) return false
  return !(r.modalidadCosto === 'detallado' && materialSinValorizar(r.costeo))
}

/** Minutos de retrabajo medidos en planta (con la parada, si la tarea está a mano). */
export function minutosRetrabajo(e: EventoSGO, tareaPorId: Map<string, Tarea>): number {
  const tarea = e.tareaId ? tareaPorId.get(e.tareaId) : undefined
  const parada = tarea?.paradas?.find((p) => p.id === e.paradaId)
  return tiempoRetrabajoDesdePlanta(e, parada, tarea?.finReal)?.minutos ?? 0
}

// ---------------- KPIs ----------------

export interface DatosKpiRetrabajos {
  eventos: EventoSGO[]
  acciones: AccionSGO[]
  tareas: Tarea[]
}

export interface FpyArea {
  area: AreaSGOId
  label: string
  finalizadas: number
  conRetrabajo: number
  fpy?: number
}

export interface KpisRetrabajos {
  casos: number
  porOrigen: Record<OrigenRetrabajoSGO, number>
  /** Bien a la primera, global de producción (%). */
  fpy?: number
  fpyPorArea: FpyArea[]
  costo: { total: number; manoObra: number; material: number; maquina: number; otros: number; sinDesglose: number }
  casosValorizados: number
  costoValorizadoPct?: number
  horasPerdidas: number
  escapeLabPct?: number
  reincidentes: number
  reincidenciaPct?: number
  toma: { evaluables: number; cumplen: number; pct?: number; medianaHoras?: number }
  cierre: { cerrados: number; enPlazo: number; pct?: number; medianaDias?: number }
  acciones: { total: number; vencidas: number; verificadas: number; eficaces: number; vencidasPct?: number; eficaciaPct?: number }
}

export function retrabajosDe(eventos: EventoSGO[]): EventoSGO[] {
  return eventos.filter(esEventoRetrabajo)
}

export function calcularKpisRetrabajos(d: DatosKpiRetrabajos, r: RangoPeriodo, ahora = new Date()): KpisRetrabajos {
  const todos = retrabajosDe(d.eventos)
  const casos = todos.filter((e) => enRango(e.detectadoEn, r))
  const tareaPorId = new Map(d.tareas.map((t) => [t.id, t]))
  const ahoraMs = ahora.getTime()

  const porOrigen: Record<OrigenRetrabajoSGO, number> = { parada_calidad: 0, defecto_final: 0, laboratorio: 0 }
  for (const e of casos) porOrigen[e.retrabajo!.origen] += 1

  // FPY: de las tareas de fabricación TERMINADAS en el período, cuántas no
  // tuvieron ningún retrabajo. Laboratorio queda afuera: su "bien a la primera"
  // es la aprobación de ensayos, que ya mide la Matriz SGO.
  const tareasConRetrabajo = new Set(todos.map((e) => e.tareaId).filter((id): id is string => Boolean(id)))
  const porArea = new Map<AreaSGOId, FpyArea>()
  for (const t of d.tareas) {
    if (t.estado !== 'finalizada' || !enRango(t.finReal, r) || esReparacion(t) || t.esPrototipo) continue
    const area = areaSGODeSector(t.sectorId)
    if (!area || area === 'laboratorio') continue
    const g = porArea.get(area) ?? { area, label: areaSGOLabel(area), finalizadas: 0, conRetrabajo: 0 }
    g.finalizadas += 1
    if (tareasConRetrabajo.has(t.id)) g.conRetrabajo += 1
    porArea.set(area, g)
  }
  const fpyPorArea = [...porArea.values()]
    .map((g) => ({ ...g, fpy: pct(g.finalizadas - g.conRetrabajo, g.finalizadas) }))
    .sort((a, b) => (a.fpy ?? 101) - (b.fpy ?? 101))
  const finTot = fpyPorArea.reduce((s, g) => s + g.finalizadas, 0)
  const conTot = fpyPorArea.reduce((s, g) => s + g.conRetrabajo, 0)

  // Costo
  const costo = { total: 0, manoObra: 0, material: 0, maquina: 0, otros: 0, sinDesglose: 0 }
  let casosValorizados = 0
  let minutos = 0
  for (const e of casos) {
    const total = costoRetrabajoTotal(e)
    costo.total += total
    const det = e.costoDetalle
    if (e.retrabajo?.modalidadCosto === 'total_estimado' || !det) costo.sinDesglose += total
    else {
      costo.manoObra += det.manoObra ?? 0
      costo.material += det.material ?? 0
      costo.maquina += det.maquina ?? 0
      costo.otros += (det.ensayos ?? 0) + (det.logistica ?? 0) + (det.terceros ?? 0)
    }
    if (costoValorizado(e)) casosValorizados += 1
    minutos += minutosRetrabajo(e, tareaPorId)
  }

  // Toma en plazo (24 h): evaluable si ya se tomó o si el plazo ya venció.
  let tomaEval = 0, tomaOk = 0
  const horasToma: number[] = []
  for (const e of casos) {
    const datos = e.retrabajo!
    const limite = Date.parse(datos.fechaLimiteToma)
    if (datos.tomadoEn) {
      const tomado = Date.parse(datos.tomadoEn)
      tomaEval += 1
      if (tomado <= limite) tomaOk += 1
      const det = Date.parse(e.detectadoEn)
      if (Number.isFinite(det) && Number.isFinite(tomado)) horasToma.push(Math.max(0, (tomado - det) / 3600000))
    } else if (Number.isFinite(limite) && limite < ahoraMs) {
      tomaEval += 1
    }
  }

  // Cierre en plazo (72 h): casos CERRADOS en el período.
  const cerrados = todos.filter((e) => e.estado === 'cerrado' && enRango(e.cerradoEn, r))
  let enPlazo = 0
  const diasCierre: number[] = []
  for (const e of cerrados) {
    const cierre = Date.parse(e.cerradoEn!)
    if (cierre <= Date.parse(e.retrabajo!.fechaLimiteInvestigacion)) enPlazo += 1
    const det = Date.parse(e.detectadoEn)
    if (Number.isFinite(det)) diasCierre.push(Math.max(0, (cierre - det) / MS_DIA))
  }

  // Acciones de los casos del período.
  const idsCasos = new Set(casos.map((e) => e.id))
  const hoy = fechaLocalISO(ahora)
  const acc = d.acciones.filter((a) => idsCasos.has(a.eventoId) && a.estado !== 'cancelada')
  const vencidas = acc.filter((a) => a.estado !== 'verificada' && a.fechaCompromiso < hoy).length
  const verificadas = acc.filter((a) => a.estado === 'verificada')
  const eficaces = verificadas.filter((a) => a.eficaz === true).length

  const reincidentes = casos.filter(esReincidente).length
  const redondear = (n: number) => Math.round(n * 100) / 100
  const medH = mediana(horasToma)
  const medD = mediana(diasCierre)

  return {
    casos: casos.length,
    porOrigen,
    fpy: pct(finTot - conTot, finTot),
    fpyPorArea,
    costo: {
      total: redondear(costo.total), manoObra: redondear(costo.manoObra), material: redondear(costo.material),
      maquina: redondear(costo.maquina), otros: redondear(costo.otros), sinDesglose: redondear(costo.sinDesglose),
    },
    casosValorizados,
    costoValorizadoPct: pct(casosValorizados, casos.length),
    horasPerdidas: Math.round((minutos / 60) * 10) / 10,
    escapeLabPct: pct(porOrigen.laboratorio, casos.length),
    reincidentes,
    reincidenciaPct: pct(reincidentes, casos.length),
    toma: { evaluables: tomaEval, cumplen: tomaOk, pct: pct(tomaOk, tomaEval), medianaHoras: medH === undefined ? undefined : Math.round(medH * 10) / 10 },
    cierre: { cerrados: cerrados.length, enPlazo, pct: pct(enPlazo, cerrados.length), medianaDias: medD === undefined ? undefined : Math.round(medD * 10) / 10 },
    acciones: {
      total: acc.length, vencidas, verificadas: verificadas.length, eficaces,
      vencidasPct: pct(vencidas, acc.length), eficaciaPct: pct(eficaces, verificadas.length),
    },
  }
}

// ---------------- Antigüedad de los abiertos (siempre al día de hoy) ----------------

export interface TramoAntiguedad { id: 'hasta3' | 'hasta7' | 'mas7'; label: string; n: number }

/** Días corridos desde la detección: es antigüedad, no tiempo de trabajo. */
export function antiguedadAbiertos(eventos: EventoSGO[], ahora = new Date()): TramoAntiguedad[] {
  const tramos: TramoAntiguedad[] = [
    { id: 'hasta3', label: '0 a 3 días', n: 0 },
    { id: 'hasta7', label: '4 a 7 días', n: 0 },
    { id: 'mas7', label: 'Más de 7 días', n: 0 },
  ]
  for (const e of retrabajosDe(eventos)) {
    if (e.estado === 'cerrado') continue
    const det = Date.parse(e.detectadoEn)
    if (!Number.isFinite(det)) continue
    const dias = (ahora.getTime() - det) / MS_DIA
    tramos[dias <= 3 ? 0 : dias <= 7 ? 1 : 2].n += 1
  }
  return tramos
}

/** Casos abiertos que quedan FUERA del período elegido (para no olvidarlos al filtrar). */
export function abiertosFueraDelPeriodo(eventos: EventoSGO[], r: RangoPeriodo): number {
  if (r.tipo === 'todo') return 0
  return retrabajosDe(eventos).filter((e) => e.estado !== 'cerrado' && !enRango(e.detectadoEn, r)).length
}

// ---------------- Pareto ----------------

export type DimensionPareto = 'causa' | 'area' | 'modelo'

export interface FilaPareto { clave: string; label: string; n: number; pct: number; acumulado: number }

const LABEL_CAUSA = new Map(CLASIFICACIONES_CAUSA_RETRABAJO.map((c) => [c.id as string, c.label]))

export function paretoRetrabajos(casos: EventoSGO[], dim: DimensionPareto, top = 5): FilaPareto[] {
  const conteo = new Map<string, { label: string; n: number }>()
  for (const e of casos) {
    let clave: string, label: string
    if (dim === 'causa') {
      clave = e.retrabajo?.clasificacionCausa ?? '__sin__'
      label = LABEL_CAUSA.get(clave) ?? 'Sin clasificar'
    } else if (dim === 'area') {
      clave = areaOrigenRetrabajo(e) ?? '__sin__'
      label = clave === '__sin__' ? 'Sin área' : areaSGOLabel(clave)
    } else {
      clave = e.modelo?.trim() || '__sin__'
      label = clave === '__sin__' ? 'Sin modelo' : clave
    }
    const g = conteo.get(clave) ?? { label, n: 0 }
    g.n += 1
    conteo.set(clave, g)
  }
  const total = casos.length
  const orden = [...conteo.entries()].sort((a, b) => b[1].n - a[1].n || a[1].label.localeCompare(b[1].label))
  const visibles = orden.slice(0, top)
  const resto = orden.slice(top).reduce((s, [, g]) => s + g.n, 0)
  const filas: FilaPareto[] = []
  let acum = 0
  for (const [clave, g] of visibles) {
    acum += g.n
    filas.push({ clave, label: g.label, n: g.n, pct: pct(g.n, total) ?? 0, acumulado: pct(acum, total) ?? 0 })
  }
  if (resto > 0) filas.push({ clave: '__otros__', label: 'Otros', n: resto, pct: pct(resto, total) ?? 0, acumulado: 100 })
  return filas
}

// ---------------- Tendencia ----------------

export interface PuntoTendencia { etiqueta: string; casos: number; costo: number; horas: number; actual: boolean }

/** Últimos períodos (12 semanas o 6 meses). Con "Todo" se muestra por mes. */
export function tendenciaRetrabajos(d: DatosKpiRetrabajos, tipo: TipoPeriodoRetrabajo, ref: Date): PuntoTendencia[] {
  const t: TipoPeriodoRetrabajo = tipo === 'todo' ? 'mes' : tipo
  const n = t === 'semana' ? 12 : 6
  const todos = retrabajosDe(d.eventos)
  const tareaPorId = new Map(d.tareas.map((x) => [x.id, x]))
  const out: PuntoTendencia[] = []
  for (let i = n - 1; i >= 0; i--) {
    const r = rangoPeriodo(t, moverPeriodo(t, ref, -i))
    const casos = todos.filter((e) => enRango(e.detectadoEn, r))
    out.push({
      etiqueta: r.corta,
      casos: casos.length,
      costo: Math.round(casos.reduce((s, e) => s + costoRetrabajoTotal(e), 0)),
      horas: Math.round(casos.reduce((s, e) => s + minutosRetrabajo(e, tareaPorId), 0) / 6) / 10,
      actual: i === 0,
    })
  }
  return out
}

/** Variación contra el período anterior, en puntos o unidades. undefined si no hay con qué comparar. */
export function variacion(actual?: number, anterior?: number): number | undefined {
  if (actual === undefined || anterior === undefined) return undefined
  return Math.round((actual - anterior) * 10) / 10
}
