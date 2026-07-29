import { supabase } from './supabaseClient'
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
  { key: 'un1', label: 'Un1', unidad: 'kV', alias: ['Un1', 'Un1 (kV)', 'U1n', 'tension_primaria', 'un1kv'] },
  { key: 'un2', label: 'Un2', unidad: 'kV', alias: ['Un2', 'Un2 (kV)', 'U2n', 'tension_secundaria', 'un2kv'] },
  { key: 'i1n', label: 'I1n', unidad: 'A', alias: ['I1n', 'I1n (A)', 'In1', 'corriente_primaria', 'i1na'] },
  { key: 'i2n', label: 'I2n', unidad: 'A', alias: ['I2n', 'I2n (A)', 'In2', 'corriente_secundaria', 'i2na'] },
]

export const NOMINALES_PERDIDAS: CampoNominal[] = [
  { key: 'po', label: 'Po', unidad: 'W', alias: ['Po', 'Po (W)', 'P0', 'perdidas_vacio', 'pvacio', 'pow'] },
  { key: 'pcc', label: 'Pcc', unidad: 'W', alias: ['Pcc', 'Pcc (W)', 'Pk', 'perdidas_cortocircuito', 'pccw'] },
  { key: 'ucc', label: 'Ucc', unidad: '%', alias: ['Ucc', 'Ucc(%)', 'Ucc (%)', 'ucc_pct', 'uk', 'tension_cortocircuito'] },
  { key: 'io', label: 'Io', unidad: '%', alias: ['Io', 'Io(%)', 'Io (%)', 'I0', 'io_pct', 'corriente_vacio'] },
]

export const NOMINALES_TODOS = [...NOMINALES_TENSION, ...NOMINALES_PERDIDAS]

// ------------------------------------------------------------
// Búsqueda del modelo.
// El ensayo trae el modelo tal cual viene de producción, que puede ser el nombre
// largo de SAP ("TBR 100/13 - Tanque Expansion - ..."), mientras que la planilla
// suele indexar por el código corto ("TBR 100/13"). Por eso: match exacto ->
// normalizado -> por código (primer tramo antes del guion).
// ------------------------------------------------------------
export function codigoCorto(modelo: string): string {
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
  const { data, error } = await supabase.from('datos_tecnicos').select('*')
  if (error) return { origen: 'ninguno', error: `No se pudieron leer los datos técnicos: ${error.message}` }
  const filas = (data ?? []) as DatoTecnico[]
  const hit = filas.find((f) => coincideModelo(f, m))
  if (!hit) {
    return { origen: 'ninguno', error: `El modelo "${m}" no está cargado en la tabla de datos técnicos.` }
  }
  return { fila: hit, origen: 'nube' }
}
