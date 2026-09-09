import type { Tarea } from '../types'
import { esBobinado, esReparacion, minutosRecupTarea } from '../types'
import { aperturaDelDia, minutosLaborablesEntre } from './calendario'

// ============================================================
// v2.03 — HUECOS DE TIEMPO MUERTO (solo Bobinado)
//
// EL PROBLEMA. Un bobinador cierra la Tarea A a las 10:00 y recién marca el
// inicio de la Tarea B a las 10:30. Esos 30 minutos no estaban en ningún lado:
// no eran tiempo real de A (ya había cerrado) ni de B (todavía no había
// arrancado). En el Gantt se veían como un espacio en blanco entre dos barras y
// nadie los medía.
//
// LA REGLA. Ese hueco se le suma al Tiempo Real de la tarea SIGUIENTE, como si
// hubiera empezado apenas terminó la anterior. Al no tener ninguna pausa
// justificada asociada, cae solo en Demora sin justificar.
//
// DECISIONES DE LORENZO (9/9/2026), las tres en su versión más exigente:
//   - SIN TOPE: un día entero sin planificación se carga completo.
//   - SIN FECHA DE CORTE: aplica a todo el histórico.
//   - INCLUYE EL ARRANQUE: desde que abre la planta hasta la primera tarea.
// En conjunto esto convierte el indicador en contabilidad por jornada: casi todo
// el turno del bobinador queda imputado a alguna tarea.
//
// ------------------------------------------------------------
// LAS DOS TRAMPAS QUE HAY QUE RESPETAR (documentadas porque son contraintuitivas)
// ------------------------------------------------------------
//
// 1) EL ALMUERZO VA AL REVÉS QUE EN EL TIEMPO REAL.
//    El Tiempo Real de una tarea se mide con `sinAlmuerzo: true`: la franja fija
//    de 12-13 NO se descuenta, porque el almuerzo se descuenta por la PARADA que
//    marca el operario (criterio de dirección, v1.16).
//    En un hueco eso no sirve: NO HAY TAREA QUE PAUSAR. La bobinadora está sin
//    trabajo asignado, así que el operario no tiene dónde marcar el almuerzo.
//    Si midiéramos el hueco igual que el Tiempo Real, una tarea que cierra 11:50
//    y otra que abre 13:00 le cobrarían 70 minutos de demora sin justificar al
//    operario por haber almorzado. Por eso acá va `sinAlmuerzo: false`.
//
// 2) SE ORDENA SOBRE **TODAS** LAS TAREAS DEL OPERARIO, NO SOLO LAS DE BOBINADO.
//    El filtro de Bobinado decide QUIÉN RECIBE el hueco, no cómo se calcula.
//    Si Rodríguez cierra una bobina 10:00, se va a ayudar a herrería hasta las
//    11:30 y vuelve a bobinar, mirando solo bobinado se le cobrarían 90 minutos
//    de tiempo muerto por un trabajo que sí hizo.
// ============================================================

export type TipoHueco = 'entre_tareas' | 'arranque_turno'

export interface Hueco {
  /** Tarea que RECIBE el hueco (la que arrancó tarde). */
  tareaId: string
  /** Fin de la tarea anterior, o apertura de planta si es la primera del día. */
  desde: string
  /** Inicio real de la tarea que lo recibe. */
  hasta: string
  /** Minutos en horario de planta, con el almuerzo ya descontado. */
  minutos: number
  tipo: TipoHueco
}

/**
 * Instante en milisegundos.
 *
 * NUNCA comparar estos timestamps como texto: `aperturaDelDia` devuelve UTC
 * ('...Z') y los que llegan de las tablets traen offset ('...-03:00'). El MISMO
 * instante se ordena distinto según el formato, y el hueco saldría negativo o
 * gigante sin que nada avise.
 */
function ms(iso: string): number {
  return new Date(iso).getTime()
}

/** Orden cronológico estable por arranque real; desempata por id. */
function porArranque(a: Tarea, b: Tarea): number {
  const x = ms(a.inicioReal!)
  const y = ms(b.inicioReal!)
  return x === y ? a.id.localeCompare(b.id) : x - y
}

/**
 * Huecos de tiempo muerto de un conjunto de tareas, indexados por id de la
 * tarea que los recibe. Las tareas que no reciben hueco simplemente no están en
 * el Map (el consumidor usa 0 por default).
 *
 * @param tareas TODAS las tareas del período, de todos los sectores. Filtrar
 *               antes por sector rompería la trampa 2 de arriba.
 */
export function huecosPorTarea(tareas: Tarea[]): Map<string, Hueco> {
  const out = new Map<string, Hueco>()

  // Agrupa por colaborador. Sin operarioId no hay a quién atribuirle el hueco.
  const porOperario = new Map<string, Tarea[]>()
  for (const t of tareas) {
    if (!t.operarioId || !t.inicioReal) continue
    const arr = porOperario.get(t.operarioId) ?? []
    arr.push(t)
    porOperario.set(t.operarioId, arr)
  }

  for (const lista of porOperario.values()) {
    const orden = [...lista].sort(porArranque)

    // Fin más tardío entre las tareas YA vistas. Se usa el máximo y no el fin de
    // la inmediata anterior porque dos tareas pueden solaparse: si A cierra
    // 11:00 y A' cierra 12:00, el operario estuvo ocupado hasta las 12:00.
    let finAnterior: string | null = null
    // Si alguna tarea previa quedó SIN cerrar, el operario seguía ocupado en
    // algo: no hay hueco que cobrar hasta que eso se resuelva.
    let hayPreviaAbierta = false

    for (const t of orden) {
      const inicio = t.inicioReal!

      const recibe = esBobinado(t.sectorId) && !esReparacion(t)
      if (recibe && !hayPreviaAbierta) {
        const esPrimera = finAnterior === null
        const desde = esPrimera ? aperturaDelDia(inicio) : finAnterior!

        // Comparación por instante, no por texto (ver `ms`). Si la tarea arrancó
        // antes que el corte —tareas solapadas— el hueco es 0, nunca negativo.
        if (ms(desde) < ms(inicio)) {
          const minutos = Math.round(minutosLaborablesEntre(
            desde,
            inicio,
            undefined,              // grupo de almuerzo: el default de planta
            minutosRecupTarea(t),   // el cierre del día lo define la tarea que recibe
            false,                  // ← franja FIJA de almuerzo. Ver trampa 1.
          ))
          if (minutos > 0) {
            out.set(t.id, {
              tareaId: t.id, desde, hasta: inicio, minutos,
              tipo: esPrimera ? 'arranque_turno' : 'entre_tareas',
            })
          }
        }
      }

      // Estado para la siguiente vuelta: esta tarea pasa a ser "previa".
      if (!t.finReal) {
        hayPreviaAbierta = true
      } else if (finAnterior === null || ms(t.finReal) > ms(finAnterior)) {
        finAnterior = t.finReal
      }
    }
  }

  return out
}

/** Atajo: solo los minutos, que es lo que consume `metricasDeLista`. */
export function minutosHuecoPorTarea(tareas: Tarea[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const [id, h] of huecosPorTarea(tareas)) m.set(id, h.minutos)
  return m
}
