import type { SectorId, Tarea } from '../types'
import { esReparacion, sectorById } from '../types'
import { isoWeek } from './time'

// ============================================================
// CIERRE DE OBJETIVOS — "7 / 10 bobinas"   (v2.23)
//
// OJO CON EL NOMBRE: esto NO es `lib/andon.ts`. Ese otro archivo es el motor
// del tablero de premios (ANDON_AREAS, calcularAndon, tierDe) que usan
// AndonView y DireccionView, y es anterior. Son dos cosas distintas.
//
// LA REGLA, QUE ES LO IMPORTANTE DE TODO ESTE ARCHIVO:
// los dos números del "7 / 10" se cuentan con criterios DISTINTOS, y mezclarlos
// es lo que venía rompiendo el indicador.
//
//   TERMINADAS (el 7)  -> por `finReal`, la fecha en que la tarea quedó hecha.
//       Una bobina que se dejó por la mitad el viernes y se cerró el lunes suma
//       en la semana NUEVA. Es trabajo que se entregó esa semana.
//
//   PLANIFICADAS (el 10) -> por `semanaObjetivo`, que se congela al crear la
//       tarea y no se toca nunca más. NO por `semana`, que se reescribe cada vez
//       que alguien mueve la tarea.
//
// POR QUÉ IMPORTA TANTO LA SEGUNDA:
// el Gantt corre las tareas atrasadas hacia adelante. Si el objetivo se leyera
// de `semana`, esas tareas se irían de la semana vieja y el denominador se
// achicaría solo: el colaborador aparecería 7/7 (100%) cuando en realidad se le
// pidieron 10 y entregó 7. El objetivo se autocumplía por el solo hecho de
// atrasarse. Con `semanaObjetivo` el 10 queda clavado y el historial dice la
// verdad un año después.
//
// CONSECUENCIA BUSCADA: una tarea puede contar como planificada en la semana 38
// y como terminada en la 39. No es un error de doble conteo — es justamente la
// foto que pidieron: la 38 cierra 7/10 y la 39 arranca con ese remanente.
// ============================================================

/** Qué ventana se está mirando: una semana ISO o un mes calendario. */
export type VentanaCierre =
  | { tipo: 'semana'; semana: string }              // '2026-W38'
  | { tipo: 'mes'; anio: number; mes: number }      // mes 0-11, como Date

export interface CumplimientoColaborador {
  operarioId: string
  terminadas: number
  planificadas: number
  /** terminadas / planificadas. 0 si no había objetivo. */
  ratio: number
  /** Planificadas que todavía no se terminaron: lo que arrastra al período siguiente. */
  pendientes: number
  /**
   * Terminadas en esta ventana que venían de un objetivo ANTERIOR.
   * Explica por qué a veces se entrega más de lo que se había pedido.
   */
  terminadasDeArrastre: number
}

export interface CumplimientoSector {
  sectorId: SectorId
  sector: string
  terminadas: number
  planificadas: number
  ratio: number
  colaboradores: CumplimientoColaborador[]
}

// ------------------------------------------------------------
// Ventanas
// ------------------------------------------------------------

/** Semana ISO de un instante. undefined si la fecha no sirve. */
function semanaDe(iso?: string): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? isoWeek(d) : undefined
}

/** ¿El objetivo de esta tarea cae en la ventana? */
function objetivoEnVentana(t: Tarea, v: VentanaCierre): boolean {
  // Fallback a `semana` para las tareas anteriores a v2.23, que no tienen la
  // foto congelada. Para las que nunca se movieron es el mismo valor.
  const obj = t.semanaObjetivo ?? t.semana
  if (!obj) return false
  if (v.tipo === 'semana') return obj === v.semana
  // Para el cierre MENSUAL la semana no alcanza: una semana ISO puede caer a
  // caballo de dos meses. Se ubica por el lunes de esa semana, que es el
  // criterio con el que la planta arma su mes.
  const lunes = lunesDeSemanaISO(obj)
  return !!lunes && lunes.getFullYear() === v.anio && lunes.getMonth() === v.mes
}

/** ¿La tarea se TERMINÓ dentro de la ventana? */
function terminadaEnVentana(t: Tarea, v: VentanaCierre): boolean {
  if (t.estado !== 'finalizada' || !t.finReal) return false
  const d = new Date(t.finReal)
  if (!Number.isFinite(d.getTime())) return false
  if (v.tipo === 'semana') return semanaDe(t.finReal) === v.semana
  return d.getFullYear() === v.anio && d.getMonth() === v.mes
}

/**
 * Lunes de una semana ISO ('2026-W38'). Null si el texto no tiene ese formato.
 *
 * Se calcula desde el 4 de enero, que por definición de la norma ISO 8601 cae
 * siempre en la semana 1. Sumar `(n-1)` semanas desde su lunes da el lunes de la
 * semana n sin tener que tratar los casos de borde de fin de año a mano.
 */
export function lunesDeSemanaISO(semana: string): Date | null {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(semana)
  if (!m) return null
  const anio = Number(m[1]), n = Number(m[2])
  if (n < 1 || n > 53) return null
  const cuatroEnero = new Date(anio, 0, 4)
  const diaSemana = (cuatroEnero.getDay() + 6) % 7        // 0 = lunes
  const lunesSemana1 = new Date(anio, 0, 4 - diaSemana)
  const d = new Date(lunesSemana1)
  d.setDate(d.getDate() + (n - 1) * 7)
  return d
}

/** Etiqueta legible de la ventana, para el encabezado de la pantalla. */
export function etiquetaVentana(v: VentanaCierre): string {
  if (v.tipo === 'semana') {
    const lun = lunesDeSemanaISO(v.semana)
    if (!lun) return v.semana
    const vie = new Date(lun); vie.setDate(vie.getDate() + 4)
    const dm = (d: Date) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    return `Semana ${v.semana.split('-W')[1]} · ${dm(lun)} al ${dm(vie)}`
  }
  return new Date(v.anio, v.mes, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

/** Semanas ISO del mes, para poder ofrecerlas en el desplegable. */
export function semanasDelMes(anio: number, mes: number): string[] {
  const out: string[] = []
  const d = new Date(anio, mes, 1)
  while (d.getMonth() === mes) {
    const s = isoWeek(d)
    if (!out.includes(s)) out.push(s)
    d.setDate(d.getDate() + 1)
  }
  return out
}

// ------------------------------------------------------------
// Cálculo
// ------------------------------------------------------------

/**
 * Cumplimiento de un sector en la ventana, con el desglose por colaborador.
 *
 * Las reparaciones y los prototipos quedan afuera: no son objetivo de
 * producción y meterlos inflaría los dos números sin significar nada.
 *
 * @param tareas todas las tareas (el filtro por sector se hace acá adentro).
 */
export function cumplimientoDeSector(
  tareas: Tarea[],
  sectorId: SectorId,
  v: VentanaCierre,
): CumplimientoSector {
  const delSector = tareas.filter((t) =>
    t.sectorId === sectorId && !esReparacion(t) && !t.esPrototipo)

  interface Acum { terminadas: number; planificadas: number; pendientes: number; arrastre: number }
  const porOperario = new Map<string, Acum>()
  const dame = (id: string): Acum => {
    let a = porOperario.get(id)
    if (!a) { a = { terminadas: 0, planificadas: 0, pendientes: 0, arrastre: 0 }; porOperario.set(id, a) }
    return a
  }

  for (const t of delSector) {
    // Sin colaborador asignado no se le puede imputar a nadie; igual suma al
    // total del sector más abajo.
    const id = t.operarioId
    const esObjetivo = objetivoEnVentana(t, v)
    const esTerminada = terminadaEnVentana(t, v)
    if (!esObjetivo && !esTerminada) continue
    if (!id) continue

    const a = dame(id)
    if (esObjetivo) {
      a.planificadas++
      // Del objetivo de esta ventana, lo que quedó sin cerrar. Es lo que la
      // planificadora ve llegar ocupándole tiempo en el Gantt del período nuevo.
      if (t.estado !== 'finalizada') a.pendientes++
    }
    if (esTerminada) {
      a.terminadas++
      // Se entregó ahora pero se había pedido antes: explica un ratio > 100%.
      if (!esObjetivo) a.arrastre++
    }
  }

  const colaboradores: CumplimientoColaborador[] = [...porOperario.entries()]
    .map(([operarioId, a]) => ({
      operarioId,
      terminadas: a.terminadas,
      planificadas: a.planificadas,
      ratio: a.planificadas > 0 ? a.terminadas / a.planificadas : 0,
      pendientes: a.pendientes,
      terminadasDeArrastre: a.arrastre,
    }))
    // Peor cumplimiento primero: es lo que hay que mirar el lunes.
    .sort((x, y) => x.ratio - y.ratio)

  // Los totales del sector se cuentan sobre TODAS las tareas, tengan o no
  // colaborador: si no, el total del sector no cerraría con la suma de la planta.
  const terminadas = delSector.filter((t) => terminadaEnVentana(t, v)).length
  const planificadas = delSector.filter((t) => objetivoEnVentana(t, v)).length

  return {
    sectorId,
    sector: sectorById(sectorId).nombre,
    terminadas,
    planificadas,
    ratio: planificadas > 0 ? terminadas / planificadas : 0,
    colaboradores,
  }
}

/** Una fila por sector presente en las tareas. */
export function cumplimientoPorSector(tareas: Tarea[], v: VentanaCierre): CumplimientoSector[] {
  const sectores = [...new Set(tareas.map((t) => t.sectorId))]
  return sectores
    .map((s) => cumplimientoDeSector(tareas, s, v))
    // Sectores sin nada que mostrar en la ventana no ocupan lugar.
    .filter((c) => c.planificadas > 0 || c.terminadas > 0)
    .sort((a, b) => a.sector.localeCompare(b.sector))
}

// ============================================================
// CORTE DEL HISTORIAL
//
// Las tareas anteriores a esta fecha no tienen la foto real del objetivo: su
// `semana_objetivo` se rellenó por migración copiando `semana`, que para las que
// se movieron ya estaba pisada. El número de esas semanas es aproximado y la
// pantalla lo avisa en vez de presentarlo como exacto.
// ============================================================
export const FECHA_CORTE_OBJETIVOS = '2026-09-21'

export function ventanaEsAproximada(v: VentanaCierre): boolean {
  const corte = new Date(FECHA_CORTE_OBJETIVOS)
  if (v.tipo === 'mes') return new Date(v.anio, v.mes + 1, 0) < corte
  const lun = lunesDeSemanaISO(v.semana)
  return !!lun && lun < corte
}
