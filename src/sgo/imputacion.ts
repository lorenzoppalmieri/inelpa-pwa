import type { CausaParada, SectorId, Tarea } from '../types'
import { areaDemora, esSectorBobinado } from '../types'
import type { AreaSGOId } from './types'

// ============================================================
// IMPUTACIÓN DE ESPERAS (v1.96) — ¿quién hizo esperar a quién?
//
// Las paradas ya dicen POR QUÉ se detuvo una tarea. Este módulo agrega la otra
// mitad: QUIÉN provocó esa espera. Con eso el tablero puede decir
// "este mes Logística le hizo perder 63 h a Montaje" en vez de solo
// "Montaje estuvo 63 h parado".
//
// El mapeo lo validó Lorenzo el 20/08/2026 (ver docs/OEE_y_cuellos_plan.md).
// Corrigió cinco de mis suposiciones: el núcleo lo trae Logística (no Laminado),
// la aislación también, la cuba y la tapa también; subir/bajar bobina es interno
// de Bobinado AT; y la soldadora es un recurso compartido de Bobinado.
//
// TODA la logística de abastecimiento va a `logistica_operativa`: es quien
// abastece y hace todos los movimientos de la empresa. `logistica_despacho` solo
// prepara y entrega transformadores terminados, así que NUNCA hace esperar a
// producción.
// ============================================================

/** A quién se le imputa una espera. */
export type Imputacion =
  | { tipo: 'area'; area: AreaSGOId }
  /** Nadie: corte de luz, causas de fuerza mayor. */
  | { tipo: 'externo' }
  /**
   * Restricción del propio sector: no entra al ranking de "quién me hace
   * esperar" porque diría "Bobinado le hizo perder tiempo a Bobinado" y eso no
   * ayuda a decidir nada. Se mide aparte, como oportunidad de mejora.
   */
  | { tipo: 'interna'; motivo: string }

const ABASTECIMIENTO: AreaSGOId = 'logistica_operativa'

/**
 * Mapa fijo causa → responsable. Las causas que dependen de la LÍNEA de la
 * tarea (rural o distribución) no están acá: se resuelven en la función.
 */
const IMPUTACION: Record<string, Imputacion> = {
  // ---------- Esperas de MONTAJE ----------
  mon_espera_nucleo: { tipo: 'area', area: ABASTECIMIENTO },
  mon_espera_prensayugos: { tipo: 'area', area: 'herreria_pintura' },
  mon_espera_chapones: { tipo: 'area', area: 'herreria_pintura' },
  mon_espera_patas: { tipo: 'area', area: 'herreria_pintura' },
  mon_espera_chapa: { tipo: 'area', area: 'herreria_pintura' },
  mon_espera_tacos: { tipo: 'area', area: 'carpinteria' },
  mon_espera_cartones: { tipo: 'area', area: 'corte_aislacion' },
  mon_espera_aislador: { tipo: 'area', area: ABASTECIMIENTO },
  mon_espera_tubo_oxigeno: { tipo: 'area', area: ABASTECIMIENTO },
  mon_espera_consumibles: { tipo: 'area', area: ABASTECIMIENTO },
  mon_error_entrega_insumos: { tipo: 'area', area: ABASTECIMIENTO },
  mon_espera_aceite: { tipo: 'area', area: ABASTECIMIENTO },
  mon_espera_conmutador: { tipo: 'area', area: ABASTECIMIENTO },
  mon_espera_varillas_roscadas: { tipo: 'area', area: ABASTECIMIENTO },
  mon_obstruccion_sector: { tipo: 'area', area: ABASTECIMIENTO },
  mon_espera_ensayo_lab: { tipo: 'area', area: 'laboratorio' },
  mon_espera_prueba_tension: { tipo: 'area', area: 'laboratorio' },

  // ---------- Esperas de BOBINADO ----------
  espera_prod_aislacion: { tipo: 'area', area: 'corte_aislacion' },
  espera_alambre: { tipo: 'area', area: ABASTECIMIENTO },
  espera_canales: { tipo: 'area', area: ABASTECIMIENTO },
  espera_consumibles: { tipo: 'area', area: ABASTECIMIENTO },
  espera_gas_oxigeno: { tipo: 'area', area: ABASTECIMIENTO },
  bob_espera_planchuela: { tipo: 'area', area: ABASTECIMIENTO },
  bob_espera_folio: { tipo: 'area', area: ABASTECIMIENTO },
  bob_espera_aislacion: { tipo: 'area', area: ABASTECIMIENTO },
  espera_especificaciones: { tipo: 'area', area: 'diseno' },
  // Corregido por Lorenzo: NO es de Mantenimiento. Son 3 soldadoras que comparte
  // el propio sector. Con 3 máquinas no debería pasar nunca que estén las tres
  // ocupadas: si esta causa aparece seguido, algo más está mal (una máquina
  // fuera de servicio o la carga mal repartida). Es un buen detector de anomalía.
  espera_soldadora: { tipo: 'interna', motivo: '3 soldadoras compartidas en el sector' },
  // Fuera del ranking por decisión de Lorenzo: es una limitación de manipulación
  // (hace falta ayuda para bajar las bobinas). La salida es un aparejo o una
  // ayuda mecánica, no imputarle la demora a nadie.
  subir_bajar_bobina: { tipo: 'interna', motivo: 'manipulación de bobinas: hace falta ayuda mecánica' },

  // ---------- Esperas de HERRERÍA ----------
  her_espera_cuba: { tipo: 'area', area: ABASTECIMIENTO },
  her_falta_tapa: { tipo: 'area', area: ABASTECIMIENTO },
  her_espera_materia_prima: { tipo: 'area', area: ABASTECIMIENTO },
  her_espera_materiales: { tipo: 'area', area: ABASTECIMIENTO },
  her_espera_consumibles: { tipo: 'area', area: ABASTECIMIENTO },
  her_espera_gas: { tipo: 'area', area: ABASTECIMIENTO },

  // ---------- Esperas de PINTURA ----------
  pin_falta_cubas: { tipo: 'area', area: 'herreria_pintura' },
  pin_falta_material_logistico: { tipo: 'area', area: ABASTECIMIENTO },

  // ---------- Transversales ----------
  mant_correctivo: { tipo: 'area', area: 'mantenimiento' },
  mant_preventivo: { tipo: 'area', area: 'mantenimiento' },
  falta_herramienta: { tipo: 'area', area: ABASTECIMIENTO },
  pasillos_obstruidos: { tipo: 'area', area: ABASTECIMIENTO },
  corte_luz: { tipo: 'externo' },
  pin_corte_luz: { tipo: 'externo' },
  capacitacion: { tipo: 'area', area: 'rrhh' },
  reunion_charla: { tipo: 'area', area: 'rrhh' },
  retiro: { tipo: 'area', area: 'rrhh' },
  accidente_laboral: { tipo: 'area', area: 'rrhh' },
}

/**
 * Bobinado está partido por LÍNEA en SGO (rural / distribución), pero la causa
 * "Espera producción de BT" no dice cuál: el que provee es el bobinado BT de la
 * MISMA línea que la tarea que espera. Por eso se resuelve acá y no en el mapa.
 */
function bobinadoDeLaLinea(sectorId: SectorId): AreaSGOId {
  return sectorId.includes('rural') ? 'bobinado_rural' : 'bobinado_distribucion'
}

/**
 * A quién se le imputa la espera de esta parada. `undefined` = la causa no es
 * una espera (rotura propia, retrabajo, almuerzo): no corresponde imputar.
 */
export function imputacionDeEspera(causa: CausaParada, tarea: Tarea): Imputacion | undefined {
  // Espera de bobina en Montaje: la provee el bobinado de la misma línea.
  if (causa === 'mon_espera_bobina') {
    return { tipo: 'area', area: bobinadoDeLaLinea(tarea.sectorId) }
  }
  // "Espera producción de BT": la provee el bobinado BT de la misma línea. Si la
  // tarea que espera YA es de bobinado, es una espera interna del sector.
  if (causa === 'espera_prod_bt') {
    return esSectorBobinado(tarea.sectorId)
      ? { tipo: 'interna', motivo: 'espera entre AT y BT del mismo sector' }
      : { tipo: 'area', area: bobinadoDeLaLinea(tarea.sectorId) }
  }
  // "Espera peso kg": se pesan bobinas especiales o falta el dato de kg para
  // completar el catálogo. El responsable es Bobinado (lo confirmó Lorenzo) —
  // pero la causa se ofrece EN Bobinado, así que casi siempre es una espera
  // interna del propio sector y no entra al ranking. Si alguna vez la marca
  // Laboratorio, ahí sí se imputa al bobinado de la línea.
  if (causa === 'espera_peso_kg') {
    return esSectorBobinado(tarea.sectorId)
      ? { tipo: 'interna', motivo: 'pesaje de bobinas: falta el dato de kg' }
      : { tipo: 'area', area: bobinadoDeLaLinea(tarea.sectorId) }
  }
  return IMPUTACION[causa]
}

/** Área que sufre la espera (la que perdió el tiempo). */
export function areaQueEspera(tarea: Tarea): AreaSGOId {
  const rural = tarea.sectorId.includes('rural')
  switch (areaDemora(tarea.sectorId)) {
    case 'bobinado': return rural ? 'bobinado_rural' : 'bobinado_distribucion'
    case 'montaje': return rural ? 'montaje_rural' : 'montaje_distribucion'
    case 'herreria': return 'herreria_pintura'
    case 'pintura': return 'herreria_pintura'
    default: return 'laboratorio'
  }
}

/** true si esta causa entra al ranking de "quién me hace esperar". */
export function imputable(i: Imputacion | undefined): i is { tipo: 'area'; area: AreaSGOId } {
  return i?.tipo === 'area'
}
