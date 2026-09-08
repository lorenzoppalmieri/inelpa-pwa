// ============================================================
// EVALUACIÓN CONTRA NORMA DE LOS ENSAYOS NO-ENERGÉTICOS (v1.100)
//
// Los ensayos de pérdidas ya tienen su motor en `ensayoPerdidas.ts`. Acá viven
// los otros tres que pide el documento de Laboratorio: relación de
// transformación, resistencia de aislamiento y los dieléctricos.
//
// CRITERIO: ninguna función de acá REPRUEBA un ensayo sola. Devuelven el número
// y una lectura ("dentro/fuera de tolerancia"), y el laboratorista decide con
// los toggles de la ficha. Es la misma regla que ya usa el panel de pérdidas:
// la app sugiere, la persona firma.
// ============================================================

/**
 * Posiciones del conmutador, como factor sobre la tensión nominal.
 * Corresponden a la conmutación habitual de estos transformadores:
 * ±2 × 2,5 %. La posición 3 es la nominal (por eso va marcada con *).
 */
export const FACTORES_CONMUTACION = [1.05, 1.025, 1, 0.975, 0.95]
export const POSICIONES = ['1', '2', '3*', '4', '5']

/**
 * Tolerancia de la relación de transformación, en %.
 * IRAM 2250 / IEC 60076-1: ±0,5 % de la relación declarada.
 */
export const TOL_RELACION_PCT = 0.5

/** Tensión teórica de AT en una posición del conmutador, en las unidades que entre. */
export function tensionTeorica(tensionNominal?: number, i = 2): number | undefined {
  const f = FACTORES_CONMUTACION[i]
  if (tensionNominal === undefined || f === undefined) return undefined
  return tensionNominal * f
}

/**
 * Relación de transformación teórica en una posición.
 * `divisor` es la tensión de BT por fase (231 V para un secundario de 400 V en
 * estrella: 400/√3). Es el mismo cálculo que ya hace la planilla del protocolo.
 */
export function relacionTeorica(
  tensionNominal?: number, divisor?: number, i = 2,
): number | undefined {
  const u = tensionTeorica(tensionNominal, i)
  if (u === undefined || !divisor) return undefined
  return u / divisor
}

/** Desvío porcentual de un valor medido respecto del teórico. */
export function desvioPct(medido?: number, teorico?: number): number | undefined {
  if (medido === undefined || teorico === undefined || teorico === 0) return undefined
  return ((medido - teorico) / teorico) * 100
}

/** ¿El desvío entra en la tolerancia de la relación? `undefined` = sin dato. */
export function relacionEnNorma(desvio?: number): boolean | undefined {
  if (desvio === undefined || !Number.isFinite(desvio)) return undefined
  return Math.abs(desvio) <= TOL_RELACION_PCT
}

// ------------------------------------------------------------
// Resistencia de aislamiento
// ------------------------------------------------------------
//
// RAD (relación de absorción dieléctrica) = R60 / R30
// IP  (índice de polarización)            = R600 / R60
//
// El documento los pide como carga OPCIONAL. Acá se calculan solos cuando están
// los tiempos, pero lo tipeado a mano gana: si el megóhmetro ya los muestra en
// pantalla, el laboratorista copia ese número y no se discute con la app.

export function radDe(r30?: number, r60?: number): number | undefined {
  if (!r30 || r60 === undefined || !Number.isFinite(r60)) return undefined
  return r60 / r30
}
export function ipDe(r60?: number, r600?: number): number | undefined {
  if (!r60 || r600 === undefined || !Number.isFinite(r600)) return undefined
  return r600 / r60
}

export type LecturaAislamiento = 'sin_dato' | 'pobre' | 'dudoso' | 'bueno' | 'excelente'

/**
 * Lectura del índice de polarización según los rangos clásicos de la IEEE 43.
 *
 * OJO: esto es una REFERENCIA de diagnóstico del estado del aislamiento, no un
 * criterio de aceptación de IRAM 2250. Por eso la UI lo muestra como una
 * orientación y no pre-marca el ensayo como rechazado.
 */
export function lecturaIP(ip?: number): LecturaAislamiento {
  if (ip === undefined || !Number.isFinite(ip)) return 'sin_dato'
  if (ip < 1) return 'pobre'
  if (ip < 2) return 'dudoso'
  if (ip < 4) return 'bueno'
  return 'excelente'
}

export const LABEL_AISLAMIENTO: Record<LecturaAislamiento, string> = {
  sin_dato: '—',
  pobre: 'Pobre (IP < 1)',
  dudoso: 'Dudoso (1 a 2)',
  bueno: 'Bueno (2 a 4)',
  excelente: 'Excelente (> 4)',
}

/** Color de la lectura, usando las variables de tema del proyecto. */
export function colorAislamiento(l: LecturaAislamiento): string | undefined {
  if (l === 'pobre') return 'var(--rojo)'
  if (l === 'dudoso') return 'var(--naranja)'
  if (l === 'bueno' || l === 'excelente') return 'var(--estado-fin)'
  return undefined
}
