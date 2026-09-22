// ============================================================
// POTENCIA (kVA) A PARTIR DEL NOMBRE DEL MODELO   (v2.24)
//
// La potencia no está guardada como número en la tarea: vive adentro del texto
// del modelo ("TTD 315/13"). Este archivo la saca de ahí y nada más.
//
// EL FORMATO: <prefijo> <potencia>/<tension> [ - resto ]
//     TTD 315/13 - Tanque Expansion - Plataforma - Cobre   -> 315
//     TTR 16/13                                            ->  16
//     TMR 5/19                                             ->   5
//     TTD 1000/13                                          -> 1000
//
// LA EXCEPCIÓN que hay que contemplar: las familias de subtransmisión y las de
// medición ponen la potencia SUELTA, antes del par de tensiones:
//     TTS 200 33/13,86    -> 200   (no 33)
//     TAM 400 13,2/13,8   -> 400   (no 13,2)
// Por eso primero se busca un número suelto ANTES del par; si lo hay, ese es la
// potencia. Si no, es el primer número del par.
//
// DEVUELVE null cuando no puede leerlo con certeza (una reparación con
// descripción libre, un prototipo, un texto raro). Es a propósito: un promedio
// con un número inventado adentro es peor que un promedio con menos muestras.
// ============================================================

/** Número con coma o punto decimal -> Number. */
const num = (s: string): number => Number(s.replace(',', '.'))

/** Par de tensiones "a/b" en cualquier parte del texto. */
const RE_PAR = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/

/**
 * Potencia en kVA leída del nombre del modelo. null si no se puede determinar.
 *
 * @param modelo texto del modelo ("TTD 315/13 - Tanque Expansion - ...").
 */
export function potenciaKVA(modelo?: string): number | null {
  if (!modelo) return null
  const texto = modelo.trim()
  const par = RE_PAR.exec(texto)
  if (!par) return null

  // ¿Hay un número suelto antes del par? (caso TTS / TAM)
  const antes = texto.slice(0, par.index)
  // El último número del tramo previo es el candidato; se admite "MVA" detrás.
  const sueltos = [...antes.matchAll(/(\d+(?:[.,]\d+)?)\s*(MVA)?/gi)].filter((m) => m[1])
  const ultimo = sueltos[sueltos.length - 1]
  if (ultimo) {
    const v = num(ultimo[1])
    // MVA -> kVA. "TTS 10 MVA 33/13,86" son 10.000 kVA, no 10.
    const kva = /mva/i.test(ultimo[2] ?? '') ? v * 1000 : v
    return Number.isFinite(kva) && kva > 0 ? kva : null
  }

  const v = num(par[1])
  return Number.isFinite(v) && v > 0 ? v : null
}

/**
 * Promedio de potencia de una lista de modelos, ignorando los que no se pueden
 * leer. Devuelve null si no quedó ninguno legible.
 */
export function promedioKVA(modelos: (string | undefined)[]): number | null {
  const vals = modelos.map(potenciaKVA).filter((v): v is number => v != null)
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}
