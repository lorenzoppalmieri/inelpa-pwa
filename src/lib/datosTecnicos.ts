import { supabase } from './supabaseClient'
import { traerTabla } from './supabaseFetch'
import { db } from '../db/dexie'

// ============================================================
// DATOS TÉCNICOS NORMATIVOS (v1.49) — parámetros garantizados por modelo.
//
// La planilla de parámetros se migró a la tabla `datos_tecnicos` de Supabase.
// Como es un MAESTRO chico (~255 modelos) y la tablet del laboratorio puede
// quedarse sin señal, se espeja en Dexie igual que el resto de las tablas y se
// lee de ahí; solo si no está localmente se va a la nube.
//
// TOLERANCIA A NOMBRES DE COLUMNA: la tabla salió de un Excel, así que los
// encabezados pueden venir como "MODELO", "Modelo", "Un1 (kV)", "Ucc(%)", "ucc",
// etc. En vez de atarnos a un nombre exacto (y mostrar la pantalla vacía si no
// coincide), se normaliza la clave y se prueban alias. Si aun así no encuentra
// un campo, el panel muestra qué columnas SÍ llegaron, para poder ajustarlo.
// ============================================================

// Una fila del maestro. Se guarda genérica a propósito: no conocemos de antemano
// el nombre exacto de cada columna del Excel migrado.
export type DatoTecnico = Record<string, unknown>

// "Ucc (%)" -> "ucc" | "Un1 (kV)" -> "un1" | "MODELO" -> "modelo"
export function normalizaClave(k: string): string {
  return k
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// Busca un valor probando varios alias de nombre de columna.
export function campo(row: DatoTecnico | undefined, ...alias: string[]): unknown {
  if (!row) return undefined
  const buscados = alias.map(normalizaClave)
  for (const [k, v] of Object.entries(row)) {
    if (buscados.includes(normalizaClave(k))) return v
  }
  return undefined
}

// Igual que `campo` pero devuelve número (tolera "1.234,5" y "1,234.5").
export function campoNum(row: DatoTecnico | undefined, ...alias: string[]): number | undefined {
  const v = campo(row, ...alias)
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const s = String(v).trim().replace(/\s/g, '')
  let norm: string
  if (s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) {
    // "1.234,5" (es-AR): el punto es separador de miles y la coma, decimal.
    norm = s.replace(/\./g, '').replace(',', '.')
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
    // "1.750" / "12.500.000": SOLO puntos, en grupos exactos de 3 -> son miles.
    // Se exige que no arranque en 0 para no romper "0.400", que sí es decimal.
    norm = s.replace(/\./g, '')
  } else {
    // "1,234.5" (en-US) o un número común: la coma es separador de miles.
    norm = s.replace(/,/g, '')
  }
  const n = Number(norm)
  return Number.isFinite(n) ? n : undefined
}

// ------------------------------------------------------------
// Definición de los valores nominales que muestra el panel. Cada uno lista los
// alias posibles de su columna en la planilla migrada.
// ------------------------------------------------------------
export interface CampoNominal { key: string; label: string; unidad: string; alias: string[] }

export const NOMINALES_TENSION: CampoNominal[] = [
  { key: 'un1', label: 'Un1', unidad: 'kV', alias: ['un1', 'Un1', 'Un1 (kV)', 'U1n'] },
  { key: 'un2', label: 'Un2', unidad: 'kV', alias: ['un2', 'Un2', 'Un2 (kV)', 'U2n'] },
  { key: 'i1n', label: 'I1n', unidad: 'A', alias: ['i1n', 'I1n', 'I1n (A)', 'In1'] },
  { key: 'i2n', label: 'I2n', unidad: 'A', alias: ['i2n', 'I2n', 'I2n (A)', 'In2'] },
]

export const NOMINALES_PERDIDAS: CampoNominal[] = [
  { key: 'po', label: 'Po', unidad: 'W', alias: ['po', 'Po', 'Po (W)', 'P0'] },
  { key: 'pcc', label: 'Pcc', unidad: 'W', alias: ['pcc', 'Pcc', 'Pcc (W)', 'Pk'] },
  { key: 'ucc', label: 'Ucc', unidad: '%', alias: ['ucc_pct', 'Ucc(%)', 'Ucc (%)', 'Ucc', 'uk'] },
  { key: 'io', label: 'Io', unidad: '%', alias: ['io_pct', 'Io(%)', 'Io (%)', 'Io', 'I0'] },
]

// Datos de contexto que muestra la cabecera (no son valores a medir).
export const NOMINALES_CONTEXTO: CampoNominal[] = [
  { key: 'sn', label: 'Potencia', unidad: 'kVA', alias: ['sn', 'Sn', 'potencia'] },
  { key: 'u1cc', label: 'U1cc (1f)', unidad: 'V', alias: ['u1cc_1f', 'U1cc(1f)', 'U1cc (1f)', 'U1cc'] },
  { key: 'i2o', label: 'I2o', unidad: 'A', alias: ['i2o', 'I2o'] },
  { key: 'relacion', label: 'Po/Pcc', unidad: '', alias: ['relacion_po_pcc', 'Relación P0/Pcc', 'Relacion P0/Pcc'] },
]

export const NOMINALES_TODOS = [...NOMINALES_TENSION, ...NOMINALES_PERDIDAS]
export const NOMINALES_FICHA = [...NOMINALES_TODOS, ...NOMINALES_CONTEXTO]

// ============================================================
// v1.103 — COLUMNAS QUE ANTES NO SE IMPORTABAN.
//
// Las trae `supabase_datos_tecnicos_v1.103.sql`. No se muestran como celdas de
// "valores nominales" porque no son valores a medir: son los CRITERIOS con los
// que se juzga lo medido y los parametros del banco de ensayo.
//
// Se leen por alias igual que el resto, asi que si la tabla todavia es la
// version vieja (v1.55, 15 columnas) devuelven undefined y la app cae a los
// valores por defecto del documento de calculo. Correr el SQL nuevo no es
// obligatorio para que la app siga funcionando.
// ============================================================

/** Tolerancias del modelo, en % sobre el nominal. */
export function toleranciasDe(fila?: DatoTecnico) {
  return {
    po: campoNum(fila, 'tol_po_pct', 'tolPo', 'Tol Po'),
    pcc: campoNum(fila, 'tol_pcc_pct', 'tolPcc', 'Tol Pcc'),
    io: campoNum(fila, 'tol_io_pct', 'tolIo', 'Tol Io(%)'),
    ucc: campoNum(fila, 'tol_ucc_pct', 'tolUcc', 'Tol Ucc(%)'),
    pt: campoNum(fila, 'tol_pt_pct', 'tolPt', 'Tol PT'),
  }
}

/**
 * Criterio del ensayo de sobreexcitacion (vacio a tension mayor que la nominal).
 * `usUn` es cuantas veces la nominal se aplica (1,05 o 1,10 segun familia) y
 * `isIo` cuantas veces la corriente de vacio puede subir como maximo.
 */
export function sobreexcitacionDe(fila?: DatoTecnico) {
  return {
    usUn: campoNum(fila, 'us_un', 'usUn', 'Us/Un'),
    isIo: campoNum(fila, 'is_io', 'isIo', 'Is/Io'),
  }
}

/** Potencia de los instrumentos de medicion del banco, en VA, por modelo. */
export function instrumentosDe(fila?: DatoTecnico) {
  return {
    pinsO: campoNum(fila, 'pins_po', 'pinsPo', 'P instrumentos en Po', 'en Po'),
    pinsCC: campoNum(fila, 'pins_pcc', 'pinsPcc', 'P instrumentos en Pcc', 'en Pcc'),
  }
}

// ------------------------------------------------------------
// Búsqueda del modelo.
// El ensayo trae el modelo tal cual viene de producción, que puede ser el nombre
// largo de SAP ("TBR 100/13 - Tanque Expansion - ..."), mientras que la planilla
// suele indexar por el código corto ("TBR 100/13"). Por eso: match exacto ->
// normalizado -> por código (primer tramo antes del guion).
// ------------------------------------------------------------
// Familias de transformadores de Inelpa (prefijo del código).
const RX_CODIGO = /\b(TTD|TTR|TMR|TBR|TTS)\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/i

/**
 * Extrae el CÓDIGO CORTO del nombre de un modelo.
 * Los datos técnicos se definen por código y valen para TODAS las variantes
 * constructivas (cobre/aluminio, llenado integral/tanque expansión,
 * monoposte/plataforma). Ejemplos:
 *   "TTD 160/13 - Tanque Expansion - Monoposte - Cobre" -> "TTD 160/13"
 *   "TTD 160/13 Al"                                      -> "TTD 160/13"
 *   "  ttd 160/13  "                                     -> "TTD 160/13"
 * Se usa una expresión regular en vez de cortar por guiones porque hay nombres
 * con el material pegado y sin guion ("TTD 100/13 Al").
 */
export function codigoCorto(modelo: string): string {
  const m = RX_CODIGO.exec(modelo ?? '')
  if (m) return `${m[1].toUpperCase()} ${m[2]}/${m[3]}`
  return (modelo ?? '').split(/\s+-\s+|\s-\s/)[0].trim()
}

export function coincideModelo(fila: DatoTecnico, modelo: string): boolean {
  const val = campo(fila, 'MODELO', 'modelo', 'model', 'codigo', 'item')
  if (val === undefined || val === null) return false
  const a = normalizaClave(String(val))
  return a === normalizaClave(modelo) || a === normalizaClave(codigoCorto(modelo))
}

export interface ResultadoDatos {
  fila?: DatoTecnico
  origen: 'local' | 'nube' | 'ninguno'
  error?: string
}

// Busca los parámetros del modelo: primero en el espejo local (funciona sin
// señal), y si no está, consulta Supabase.
export async function buscarDatosTecnicos(modelo: string): Promise<ResultadoDatos> {
  const m = (modelo ?? '').trim()
  if (!m) return { origen: 'ninguno', error: 'La tarea no trae modelo.' }

  // 1) Espejo local (Dexie).
  try {
    const locales = await db.datosTecnicos.toArray()
    const hit = locales.find((f) => coincideModelo(f, m))
    if (hit) return { fila: hit, origen: 'local' }
  } catch {
    // la tabla puede no existir todavía en bases viejas: se sigue por la nube
  }

  // 2) Nube.
  if (!supabase) return { origen: 'ninguno', error: 'Sin conexión configurada y el modelo no está en la base local.' }
  if (!navigator.onLine) {
    return { origen: 'ninguno', error: `Estás sin conexión y "${m}" todavía no está descargado en este equipo.` }
  }
  // Paginado: si el maestro crece por encima de 1000 filas no se corta.
  const filas = await traerTabla<DatoTecnico>('datos_tecnicos')
  const hit = filas.find((f) => coincideModelo(f, m))
  if (!hit) {
    return { origen: 'ninguno', error: `El modelo "${m}" no está cargado en la tabla de datos técnicos.` }
  }
  return { fila: hit, origen: 'nube' }
}
