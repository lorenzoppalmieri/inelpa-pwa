import type { DespachoTrafo } from '../types'
import { despachoSigueEnPlanta, normalizarNumeroSerie, seriesDespacho } from '../types'

// ============================================================
// CONFLICTOS DE N° DE SERIE (v1.73)
//
// Regla del negocio: DOS transformadores no pueden compartir número de serie.
// La serie es la identidad del equipo: si se duplica, se rompe la trazabilidad
// y ante un reclamo del cliente no hay forma de saber cuál unidad es cuál.
//
// Qué SÍ es conflicto: dos o más unidades **todavía en manos de INELPA**
// (esperando embalaje, embalando, demorada, embalada o guardada en un depósito)
// que comparten serie. Típicamente pasa cuando el laboratorio libera un trafo
// con una serie que alguien ya había cargado a mano, o por un error de tipeo.
//
// Qué NO es conflicto:
//   · una unidad ya despachada o entregada + una nueva con la misma serie. Eso
//     es una SEGUNDA VUELTA legítima (reparación de servicio, trafo fuera de
//     garantía que vuelve). Ver `despachoSigueEnPlanta`.
//   · un viaje con varias unidades: son series distintas dentro de una fila.
//
// La app NO bloquea el trabajo por un conflicto: avisa, y Logística decide cuál
// de las dos fichas borrar. Frenar el embalaje por un error de carga sería peor
// que el error.
// ============================================================

export interface ConflictoSerie {
  serie: string                 // la serie tal como se ve (la de la primera unidad)
  unidades: DespachoTrafo[]     // 2 o más, de la más vieja a la más nueva
}

/**
 * Agrupa las unidades EN PLANTA que comparten número de serie.
 * La comparación es normalizada: "24.563", "24563" y "24-563" son la misma.
 */
export function conflictosDeSerie(despachos: DespachoTrafo[]): ConflictoSerie[] {
  const porSerie = new Map<string, { visible: string; unidades: DespachoTrafo[] }>()

  for (const d of despachos) {
    if (!despachoSigueEnPlanta(d)) continue
    for (const s of seriesDespacho(d)) {
      const clave = normalizarNumeroSerie(s)
      if (!clave) continue
      const g = porSerie.get(clave)
      if (g) {
        // Una misma fila puede repetir la serie en `nroSerie` y `numerosSerie`:
        // eso no es un conflicto, es la misma unidad.
        if (!g.unidades.some((u) => u.id === d.id)) g.unidades.push(d)
      } else {
        porSerie.set(clave, { visible: s, unidades: [d] })
      }
    }
  }

  return [...porSerie.values()]
    .filter((g) => g.unidades.length > 1)
    .map((g) => ({
      serie: g.visible,
      // De la más vieja a la más nueva: la primera es la que ya estaba.
      unidades: [...g.unidades].sort((a, b) => (a.fechaIngreso < b.fechaIngreso ? -1 : 1)),
    }))
    .sort((a, b) => a.serie.localeCompare(b.serie))
}

/** ¿Esta unidad está metida en algún conflicto de serie? (para marcar la tarjeta) */
export function tieneConflictoDeSerie(d: DespachoTrafo, conflictos: ConflictoSerie[]): boolean {
  return conflictos.some((c) => c.unidades.some((u) => u.id === d.id))
}

/** Series en conflicto, para mostrar en un aviso corto. */
export function seriesEnConflicto(conflictos: ConflictoSerie[]): string[] {
  return conflictos.map((c) => c.serie)
}
