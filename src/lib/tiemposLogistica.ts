import type { TareaLogistica } from '../types'
import { minutosLaboralesLogistica } from './calendario'

// ============================================================
// TIEMPOS DE UNA TAREA LOGÍSTICA (v1.73) — UNA sola definición.
//
// Antes esta cuenta vivía duplicada: `minsActivos()` dentro de la tarjeta
// (LogisticaTareas) y `resolucion()` dentro del tablero (LogisticaReportes).
// Daban lo mismo por casualidad —al finalizar se limpia `pausadaEn`, así que la
// pausa vigente valía cero— pero eran dos copias con reglas distintas sobre la
// pausa abierta. Es exactamente la trampa que ya hizo que el Gantt mostrara una
// demora distinta a la del tablero para la misma tarea.
//
// Todo se mide en minutos del PAÑOL (Lun-Jue 08-17, Vie 08-16). Nunca restar
// fechas crudas: una tarea que queda abierta de un día para el otro contaría la
// noche y el fin de semana.
// ============================================================

/**
 * Minutos de pausa/bloqueo acumulados.
 * Incluye la pausa VIGENTE (medida hasta `ahoraISO`) si la tarea está detenida.
 */
export function minutosPausaLog(t: TareaLogistica, ahoraISO: string): number {
  return (t.minutosPausada ?? 0) + (t.pausadaEn ? minutosLaboralesLogistica(t.pausadaEn, ahoraISO) : 0)
}

/**
 * Tiempo ACTIVO de la tarea: desde que se inició (o se pidió, si nunca se
 * inició) hasta que se finalizó, descontando pausas y bloqueos.
 *
 * Para una tarea abierta el corte es `ahoraISO`, así la tarjeta puede mostrar
 * "activa 1h 20m" en vivo con la misma fórmula que usa el reporte al cerrarla.
 */
export function minutosActivosLog(t: TareaLogistica, ahoraISO: string): number {
  const fin = t.finalizada ?? ahoraISO
  return Math.max(0, minutosLaboralesLogistica(t.iniciada ?? t.creada, fin) - minutosPausaLog(t, ahoraISO))
}

/** Cuánto lleva esperando una tarea que todavía nadie tomó. */
export function minutosEsperaLog(t: TareaLogistica, ahoraISO: string): number {
  return minutosLaboralesLogistica(t.creada, ahoraISO)
}
