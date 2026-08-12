// ============================================================
// MOTOR DE CALCULO — ENSAYO DE PERDIDAS (v1.82)
//
// Implementa las formulas del documento "CÁLCULO PARA ENSAYO DE PÉRDIDAS"
// (INELPA, laboratorio). Modulo PURO: sin React, sin Dexie, sin Supabase, para
// poder testearlo con un script aparte. Toda la fisica vive aca; el panel solo
// dibuja.
//
// UNIDADES — el punto mas delicado. La tabla `datos_tecnicos` guarda:
//   Un1, Un2 en kV   -> las formulas piden V     => x1000
//   Sn      en kVA   -> las formulas piden VA    => x1000
//   Resistencias de BT en mOhm -> Ohm            => /1000 (ya va en las formulas)
// Mezclar esto da errores de x1000 que pasan desapercibidos porque el numero
// "parece" razonable. No tocar sin releer este bloque.
//
// NOTA sobre el documento: la formula de corriente de vacio porcentual figura
// como io% = Io/In, que da una FRACCION, no un porcentaje, aunque el texto diga
// "en %". Se agrega el x100 (confirmado con Lorenzo).
// ============================================================

/** Factor de conexion: 1 para monofasicos y bifasicos, 3 para trifasicos. */
export type Nf = 1 | 3
/** Constante del material del arrollamiento. */
export const K_COBRE = 235
export const K_ALUMINIO = 225
export type Material = 'cobre' | 'aluminio'
export function constanteMaterial(m: Material): number {
  return m === 'aluminio' ? K_ALUMINIO : K_COBRE
}

export type Arrollamiento = 'alta' | 'baja'
export type Conexion = 'Y' | 'D'

/** Parametros nominales de la maquina (vienen de `datos_tecnicos`). */
export interface Nominales {
  snKVA?: number      // potencia aparente nominal, en kVA
  u1nKV?: number      // tension nominal de AT, en kV
  u2nKV?: number      // tension nominal de BT, en kV
  i1n?: number        // corriente nominal de AT, en A
  i2n?: number        // corriente nominal de BT, en A
  p0n?: number        // perdidas en vacio nominales, en W
  ioPctN?: number     // corriente de vacio porcentual nominal, en %
  pccN?: number       // perdidas en cortocircuito nominales a T, en W
  uccPctN?: number    // tension de cortocircuito porcentual nominal, en %
}

/** Configuracion del ensayo (material, fases, temperatura de referencia y banco). */
export interface ConfigEnsayo {
  nf: Nf
  material: Material
  tRef: number        // temperatura de referencia T, en °C (editable por ensayo)
  pinsO: number       // potencia de los instrumentos en vacio, en VA
  pinsCC: number      // potencia de los instrumentos en cortocircuito, en VA
}

export interface EntradaVacio {
  arrollamiento: Arrollamiento   // default 'baja'
  conexion: Conexion             // default 'Y' (registro; no interviene en el calculo)
  p0m?: number   // potencia medida, en W
  i0m?: number   // corriente medida, en A
  um?: number    // tension medida (simple), en V
}

export interface EntradaCortocircuito {
  arrollamiento: Arrollamiento   // default 'alta'
  conexion: Conexion             // default 'D'
  pccm?: number  // potencia medida, en W
  im?: number    // corriente medida, en A
  um?: number    // tension medida, en V
  tcc?: number   // temperatura durante el ensayo de cortocircuito, en °C
  tR?: number    // temperatura cuando se midieron las resistencias, en °C
  // Resistencias de AT, en OHM.  Trifasico: las 3 entre bornes. Mono/bif: rUN.
  rUV?: number; rVW?: number; rWU?: number; rUN?: number
  // Resistencias de BT, en MILIOHM. Trifasico: las 3. Mono/bif: rUn.
  rUn?: number; rVn?: number; rWn?: number
}

// ---------- helpers ----------
const num = (v?: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
/** Raiz protegida: si el radicando queda negativo por error de medicion, 0. */
const raiz = (x: number): number => Math.sqrt(Math.max(0, x))

/** Tension nominal del arrollamiento ensayado, en V (la tabla la guarda en kV). */
export function unDeEnsayo(n: Nominales, a: Arrollamiento): number | undefined {
  const kv = a === 'alta' ? num(n.u1nKV) : num(n.u2nKV)
  return kv === undefined ? undefined : kv * 1000
}
/** Corriente nominal del arrollamiento ensayado, en A. */
export function inDeEnsayo(n: Nominales, a: Arrollamiento): number | undefined {
  return a === 'alta' ? num(n.i1n) : num(n.i2n)
}
/** Potencia aparente nominal en VA (la tabla la guarda en kVA). */
export function snVA(n: Nominales): number | undefined {
  const s = num(n.snKVA)
  return s === undefined ? undefined : s * 1000
}

// ============================================================
// ENSAYO DE PERDIDAS EN VACIO
// ============================================================
export interface ResultadoVacio {
  p0?: number       // perdidas en vacio corregidas a tension nominal, en W
  i0?: number       // corriente de vacio, en A
  ioPct?: number    // corriente de vacio porcentual, en %
}

export function calcularVacio(n: Nominales, c: ConfigEnsayo, e: EntradaVacio): ResultadoVacio {
  const Un = unDeEnsayo(n, e.arrollamiento)
  const In = inDeEnsayo(n, e.arrollamiento)
  const Um = num(e.um)
  const p0m = num(e.p0m)
  const i0m = num(e.i0m)
  // Sin tension medida no hay correccion posible (y dividiriamos por cero).
  if (Un === undefined || Um === undefined || Um === 0) return {}

  const factor = (Un / Um) * (1 / Math.sqrt(c.nf))
  const p0 = p0m === undefined ? undefined : (p0m - c.pinsO) * factor
  const i0 = i0m === undefined ? undefined : i0m * factor
  // El documento escribe io% = Io/In; se agrega el x100 para que sea un %.
  const ioPct = i0 !== undefined && In ? (i0 / In) * 100 : undefined
  return { p0, i0, ioPct }
}

// ============================================================
// ENSAYO DE PERDIDAS EN CORTOCIRCUITO
// ============================================================
export interface ResultadoCortocircuito {
  pcc?: number        // perdidas medidas corregidas a In, a temperatura de ensayo, en W
  pjAT?: number       // perdidas Joule de AT, a temperatura de ensayo, en W
  pjBT?: number       // perdidas Joule de BT, a temperatura de ensayo, en W
  pj?: number         // Joule totales, en W
  ps?: number         // perdidas Skin (adicionales), en W
  pjATRef?: number    // Joule de AT corregidas a T, en W
  pjBTRef?: number    // Joule de BT corregidas a T, en W
  psRef?: number      // Skin corregidas a T, en W
  pccRef?: number     // Pcc(T): perdidas en cortocircuito a In y a T, en W
  ucc?: number        // tension de cortocircuito, en V
  uccPct?: number     // ucc%(T), en %
  urccPct?: number    // componente resistiva uR%, en %
  uxccPct?: number    // componente reactiva uX%, en %
}

export function calcularCortocircuito(
  n: Nominales, c: ConfigEnsayo, e: EntradaCortocircuito,
): ResultadoCortocircuito {
  const out: ResultadoCortocircuito = {}
  const Un = unDeEnsayo(n, e.arrollamiento)
  const In = inDeEnsayo(n, e.arrollamiento)
  const Im = num(e.im)
  const Um = num(e.um)
  const pccm = num(e.pccm)
  const tcc = num(e.tcc)
  const tR = num(e.tR)
  const k = constanteMaterial(c.material)
  const T = c.tRef

  // --- Pcc corregida a corriente nominal ---
  if (pccm !== undefined && In !== undefined && Im !== undefined && Im !== 0) {
    out.pcc = (pccm - c.pinsCC) * Math.pow(In / Im, 2)
  }

  // --- Perdidas Joule a temperatura de ensayo ---
  // El factor termico lleva las resistencias medidas a tR hasta la temperatura
  // real del ensayo tcc.
  if (tcc !== undefined && tR !== undefined && k + tR !== 0) {
    const fTermico = (k + tcc) / (k + tR)
    const i1n = num(n.i1n)
    const i2n = num(n.i2n)
    if (c.nf === 3) {
      // Trifasico (Dyn). AT: media de las 3 resistencias entre bornes x 3/2.
      // BT: media de las 3 x 3, y /1000 porque se cargan en miliohm.
      const rAT = [e.rUV, e.rVW, e.rWU].map(num)
      const rBT = [e.rUn, e.rVn, e.rWn].map(num)
      if (i1n !== undefined && rAT.every((r) => r !== undefined)) {
        const media = (rAT[0]! + rAT[1]! + rAT[2]!) / 3
        out.pjAT = Math.pow(i1n, 2) * media * (3 / 2) * fTermico
      }
      if (i2n !== undefined && rBT.every((r) => r !== undefined)) {
        const media = (rBT[0]! + rBT[1]! + rBT[2]!) / 3
        out.pjBT = Math.pow(i2n, 2) * media * (3 / 1000) * fTermico
      }
    } else {
      // Monofasico / bifasico.
      const rUN = num(e.rUN)
      const rUn = num(e.rUn)
      if (i1n !== undefined && rUN !== undefined) {
        out.pjAT = Math.pow(i1n, 2) * rUN * fTermico
      }
      if (i2n !== undefined && rUn !== undefined) {
        out.pjBT = Math.pow(i2n, 2) * rUn * (1 / 1000) * fTermico
      }
    }
  }
  if (out.pjAT !== undefined && out.pjBT !== undefined) out.pj = out.pjAT + out.pjBT

  // --- Skin = lo que la medicion tiene de mas sobre el Joule calculado ---
  if (out.pcc !== undefined && out.pj !== undefined) out.ps = out.pcc - out.pj

  // --- Correccion a temperatura de referencia ---
  // Joule SUBE con la temperatura; Skin (corrientes parasitas) BAJA. Por eso el
  // cociente va invertido en psRef. No es un error de tipeo.
  if (tcc !== undefined && k + tcc !== 0) {
    const subir = (k + T) / (k + tcc)
    const bajar = (k + tcc) / (k + T)
    if (out.pjAT !== undefined) out.pjATRef = out.pjAT * subir
    if (out.pjBT !== undefined) out.pjBTRef = out.pjBT * subir
    if (out.ps !== undefined) out.psRef = out.ps * bajar
    if (out.pjATRef !== undefined && out.pjBTRef !== undefined && out.psRef !== undefined) {
      out.pccRef = out.pjATRef + out.pjBTRef + out.psRef
    }
  }

  // --- Tension de cortocircuito ---
  if (Um !== undefined && In !== undefined && Im !== undefined && Im !== 0) {
    out.ucc = Um * (In / Im) * Math.sqrt(c.nf)
  }
  const Sn = snVA(n)
  if (out.ucc !== undefined && Un !== undefined && Un !== 0 && Sn && Sn !== 0
      && out.pcc !== undefined && out.pccRef !== undefined) {
    const a = Math.pow((out.ucc / Un) * 100, 2)
    const b = Math.pow((out.pcc / Sn) * 100, 2)
    const d = Math.pow((out.pccRef / Sn) * 100, 2)
    out.uccPct = raiz(a - b + d)
  }
  if (out.pccRef !== undefined && Sn && Sn !== 0) {
    out.urccPct = (out.pccRef / Sn) * 100
  }
  if (out.uccPct !== undefined && out.urccPct !== undefined) {
    out.uxccPct = raiz(Math.pow(out.uccPct, 2) - Math.pow(out.urccPct, 2))
  }
  return out
}

// ============================================================
// PERDIDAS TOTALES
// ============================================================
export function perdidasTotales(v: ResultadoVacio, cc: ResultadoCortocircuito): number | undefined {
  if (v.p0 === undefined || cc.pccRef === undefined) return undefined
  return cc.pccRef + v.p0
}

// ============================================================
// TOLERANCIAS Y ESCALAS DE LAS AGUJAS
//
// Todas las magnitudes se evaluan como PORCENTAJE DEL NOMINAL. Cada indicador
// define su escala (min/max en % del nominal) y los cortes de color.
// ============================================================
export type ZonaTolerancia = 'dentro' | 'tolerancia' | 'fuera' | 'sin_dato'

export interface EscalaAguja {
  min: number          // inicio de la escala, en % del nominal
  max: number          // fin de la escala, en % del nominal
  verdeHasta: number   // dentro de norma hasta aca
  amarilloHasta: number// dentro de norma con tolerancia hasta aca
  /** Escala centrada (ucc%): el verde es una banda a ambos lados del 100%. */
  bilateral?: boolean
}

/** P0 y Pcc(T): 50–130% del nominal, verde a 100, amarillo a 115 (+15%). */
export const ESCALA_PERDIDAS: EscalaAguja = { min: 50, max: 130, verdeHasta: 100, amarilloHasta: 115 }
/** io%: 20–160% del nominal, verde a 100, amarillo a 130 (+30%). */
export const ESCALA_IO: EscalaAguja = { min: 20, max: 160, verdeHasta: 100, amarilloHasta: 130 }
/** ucc%: centrada en el nominal, ±20% de escala, verde ±10% (tolerancia). */
export const ESCALA_UCC: EscalaAguja = { min: 80, max: 120, verdeHasta: 110, amarilloHasta: 110, bilateral: true }
/** Perdidas totales: tolerancia +10%. No lleva aguja, solo semaforo. */
export const ESCALA_TOTALES: EscalaAguja = { min: 50, max: 130, verdeHasta: 100, amarilloHasta: 110 }

/** Valor medido como % del nominal. undefined si falta alguno de los dos. */
export function porcentajeDeNominal(valor?: number, nominal?: number): number | undefined {
  if (valor === undefined || nominal === undefined || nominal === 0) return undefined
  return (valor / nominal) * 100
}

/** En que zona cae un porcentaje segun la escala del indicador. */
export function zonaDe(pct: number | undefined, esc: EscalaAguja): ZonaTolerancia {
  if (pct === undefined || !Number.isFinite(pct)) return 'sin_dato'
  if (esc.bilateral) {
    // ucc%: se admite desviacion en los DOS sentidos (±10%).
    const desvio = Math.abs(pct - 100)
    return desvio <= (esc.verdeHasta - 100) ? 'tolerancia' : 'fuera'
  }
  if (pct <= esc.verdeHasta) return 'dentro'
  if (pct <= esc.amarilloHasta) return 'tolerancia'
  return 'fuera'
}

/** true si el ensayo pasa (dentro de norma, con o sin tolerancia). */
export function apruebaZona(z: ZonaTolerancia): boolean {
  return z === 'dentro' || z === 'tolerancia'
}

// ============================================================
// AUTODETECCION desde el nombre del modelo. Son SUGERENCIAS: el laboratorista
// siempre puede corregirlas en pantalla (un prototipo puede no seguir la
// convencion de SAP).
// ============================================================

/** Fases segun el prefijo SAP: TMR monofasico, TBR bifasico, TTD/TTR trifasico. */
export function nfDesdeModelo(modelo?: string): Nf | undefined {
  const p = (modelo ?? '').trim().slice(0, 3).toUpperCase()
  if (p === 'TTD' || p === 'TTR') return 3
  if (p === 'TMR' || p === 'TBR') return 1   // mono y bifasico comparten nf = 1
  return undefined
}

/** El material va al final del nombre: "... - Plataforma - Aluminio". */
export function materialDesdeModelo(modelo?: string): Material | undefined {
  const s = (modelo ?? '').toLowerCase()
  if (s.includes('aluminio')) return 'aluminio'
  if (s.includes('cobre')) return 'cobre'
  return undefined
}
