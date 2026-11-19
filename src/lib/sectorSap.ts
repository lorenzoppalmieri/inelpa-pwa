import type { LineaProduccion, SectorId } from '../types'

// ============================================================
// SECTOR QUE FABRICA CADA ARTÍCULO DE SAP (v2.56)
//
// SAP manda una OF por semielaborado, pero no dice qué sector de la planta lo
// hace. Antes eso salía del catálogo de la PWA (`sectorId` de cada componente),
// que va a desaparecer y no tiene los artículos nuevos. La regla va por FAMILIA
// (las primeras letras del ItemCode) y la validó Lorenzo el 19/11/2026 sobre la
// receta nueva del TTD 400/13 (hoja "CARGA SAP"):
//
//   Transformador (TTD/TMR/TBR/TTR)        -> Montaje PO de su línea
//   Parte activa (PARDIS/PARRUR)            -> Montaje PA de su línea
//   Bobinas (BOBALT/BOBBAJ)                 -> Bobinado AT/BT de su línea
//   Cuba, tanque, tapa (CUB/TAN/TAP + DIS)  -> Soldadura de su línea
//   Prensayugos y patas de núcleo           -> Corte y conformado
//   Piezas chicas de herrería y el cáncamo  -> Corte y conformado
//
// Es una SUGERENCIA: la planificadora puede elegir otro sector (balanceo de
// carga entre líneas). Lo que no está en la tabla (identificación de fase,
// núcleo, tacos, malla masa...) vuelve `undefined` y se elige a mano.
//
// El orden importa: CUBDIS (cuba, soldadura) tiene que evaluarse antes que
// CUBRZ (refuerzo de cuba, corte y conformado).
// ============================================================

type Regla = { patron: RegExp; sector: SectorId | ((l: 'distribucion' | 'rural') => SectorId); requiereLinea?: boolean }

const REGLAS: Regla[] = [
  // Transformador terminado
  { patron: /^TTD/, sector: 'montaje_po_dist' },
  { patron: /^(TMR|TBR|TTR)/, sector: 'montaje_po_rural' },
  // Parte activa
  { patron: /^PARDIS/, sector: 'montaje_pa_dist' },
  { patron: /^PARRUR/, sector: 'montaje_pa_rural' },
  // Bobinas: la línea no está en el código, sale de la OF (el endpoint ya la dedujo del nombre)
  { patron: /^BOBALT/, sector: (l) => (l === 'rural' ? 'bob_rural_at' : 'bob_dist_at'), requiereLinea: true },
  { patron: /^BOBBAJ/, sector: (l) => (l === 'rural' ? 'bob_rural_bt' : 'bob_dist_bt'), requiereLinea: true },
  // Cuba, tanque y tapa
  { patron: /^(CUBDIS|TANDIS|TAPDIS)/, sector: 'soldadura_dist' },
  { patron: /^(CUBRUR|TANRUR|TAPRUR)/, sector: 'soldadura_rural' },
  // Corte y conformado (corte y plegado): prensayugos, patas de núcleo,
  // refuerzos de cuba, piezas de herrería, soportes, bridas, vainas, cáncamo.
  { patron: /^(PRESUP|PREINF|PAT|CUBRZ|HER|TANSO[DI]|TANDES|TANBVS|TANTBV|ACCBRI|TAPDES|TAPVAI|HIECHA)/, sector: 'corte_conformado' },
]

/**
 * Sector sugerido para la OF de un artículo de SAP.
 * @param linea la que guardó el endpoint en la OF (`general` si no la pudo deducir)
 */
export function sectorSugeridoSap(itemCode: string | undefined, linea?: LineaProduccion): SectorId | undefined {
  if (!itemCode) return undefined
  const codigo = itemCode.trim().toUpperCase()
  const regla = REGLAS.find((r) => r.patron.test(codigo))
  if (!regla) return undefined
  if (typeof regla.sector === 'string') return regla.sector
  // Bobina sin línea conocida: mejor que elija la planificadora que adivinar.
  if (regla.requiereLinea && linea !== 'distribucion' && linea !== 'rural') return undefined
  return regla.sector(linea === 'rural' ? 'rural' : 'distribucion')
}
