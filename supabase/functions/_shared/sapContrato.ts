// ============================================================
// CONTRATO SAP -> PWA (Fase 1, entrada de datos)            v2.40
//
// Validacion y normalizacion de los dos endpoints acordados con ALAMO:
//   POST /functions/v1/sap-articulos   { "articulos": [...] }
//   POST /functions/v1/sap-ordenes     { "ordenes":   [...] }
//
// Codigo puro: sin Deno, sin red, sin base. Lo importan las Edge Functions
// y los tests (vitest corre este mismo archivo).
//
// Criterio: estricto con el VALOR, flexible con la REPRESENTACION.
//   * Un numero puede llegar como 7 o como "7".
//   * Un booleano puede llegar como true, "Y" o "tYES" (formato del Service Layer).
//   * Una fecha puede llegar como "2026-11-06" o "2026-11-06T00:00:00Z";
//     se toma la parte de fecha tal cual, sin convertir zona horaria.
// Pero una cantidad 2.5 en una orden, una fecha 2026-02-30 o un estado que
// no sea "liberada" se rechazan con un motivo claro.
//
// Ver docs/ALAMO_plan_endpoints_fase1.md (rev. 2) y
//     docs/supabase_integracion_sap_v2.40.sql.
// ============================================================

export const MAX_ITEMS_POR_ENVIO = 500
export const MAX_LINEAS_RECETA = 500
const MAX_CODIGO = 50 // largo maximo de ItemCode en SAP B1
const MAX_TEXTO = 200

export type TipoArticulo = 'PT' | 'SE' | 'MP'

export interface LineaReceta {
  itemCode: string
  quantity: number
  uom: string | null
}

export interface ArticuloSap {
  itemCode: string
  itemName: string
  itemType: TipoArticulo
  uom: string | null
  active: boolean
  defaultWarehouse: string | null
  hasBatch: boolean
  /** Ausente = no tocar la receta. [] = vaciarla. [..] = reemplazarla completa. */
  bom?: LineaReceta[]
}

export interface OrdenSap {
  docEntry: number
  docNum: string | null
  parentDocEntry: number | null
  itemCode: string
  plannedQty: number
  uom: string | null
  dueDate: string // YYYY-MM-DD
  startDate: string | null // YYYY-MM-DD
  warehouse: string | null
  batchNumber: string | null
  status: 'R'
}

export type Validacion<T> =
  | { ok: true; valor: T }
  | { ok: false; id: string | number | null; errores: string[] }

// ---------- helpers de lectura ----------

function esObjeto(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
}

function texto(
  x: unknown, campo: string, errores: string[],
  opts: { requerido?: boolean; max?: number } = {},
): string | null {
  const max = opts.max ?? MAX_TEXTO
  if (x === undefined || x === null || (typeof x === 'string' && x.trim() === '')) {
    if (opts.requerido) errores.push(`${campo}: es obligatorio`)
    return null
  }
  if (typeof x === 'number' && Number.isFinite(x)) x = String(x)
  if (typeof x !== 'string') {
    errores.push(`${campo}: tiene que ser texto`)
    return null
  }
  const v = x.trim()
  if (v.length > max) {
    errores.push(`${campo}: supera los ${max} caracteres`)
    return null
  }
  return v
}

function enteroPositivo(x: unknown, campo: string, errores: string[], requerido: boolean): number | null {
  if (x === undefined || x === null || x === '') {
    if (requerido) errores.push(`${campo}: es obligatorio`)
    return null
  }
  const n = typeof x === 'string' && /^\s*\d+\s*$/.test(x) ? Number(x) : x
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > 2147483647) {
    errores.push(`${campo}: tiene que ser un entero mayor a 0 (llegó ${JSON.stringify(x)})`)
    return null
  }
  return n
}

function numeroPositivo(x: unknown, campo: string, errores: string[]): number | null {
  const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    errores.push(`${campo}: tiene que ser un número mayor a 0 (llegó ${JSON.stringify(x)})`)
    return null
  }
  return n
}

const VERDADEROS = new Set(['true', 'y', 'tyes', 'yes', 's', 'si', 'sí', '1'])
const FALSOS = new Set(['false', 'n', 'tno', 'no', '0'])

function booleano(x: unknown, campo: string, errores: string[]): boolean | null {
  if (typeof x === 'boolean') return x
  if (typeof x === 'string') {
    const v = x.trim().toLowerCase()
    if (VERDADEROS.has(v)) return true
    if (FALSOS.has(v)) return false
  }
  if (x === undefined || x === null) errores.push(`${campo}: es obligatorio (true/false)`)
  else errores.push(`${campo}: tiene que ser true/false (llegó ${JSON.stringify(x)})`)
  return null
}

/** Acepta "YYYY-MM-DD" o "YYYY-MM-DDThh:mm:ss[Z]". Devuelve "YYYY-MM-DD". */
export function normalizarFecha(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.exec(x.trim())
  if (!m) return null
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const f = new Date(Date.UTC(a, mes - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function fecha(x: unknown, campo: string, errores: string[], requerido: boolean): string | null {
  if (x === undefined || x === null || x === '') {
    if (requerido) errores.push(`${campo}: es obligatorio (YYYY-MM-DD)`)
    return null
  }
  const f = normalizarFecha(x)
  if (!f) errores.push(`${campo}: fecha inválida, se espera YYYY-MM-DD (llegó ${JSON.stringify(x)})`)
  return f
}

/** Estado de la OF. Solo se aceptan liberadas: 'R' (tabla OWOR) o 'boposReleased' (Service Layer). */
export function esLiberada(x: unknown): boolean {
  return typeof x === 'string' && ['r', 'boposreleased'].includes(x.trim().toLowerCase())
}

// ---------- articulos ----------

export function validarArticulo(raw: unknown): Validacion<ArticuloSap> {
  const errores: string[] = []
  if (!esObjeto(raw)) return { ok: false, id: null, errores: ['el artículo tiene que ser un objeto JSON'] }

  const itemCode = texto(raw.itemCode, 'itemCode', errores, { requerido: true, max: MAX_CODIGO })
  const itemName = texto(raw.itemName, 'itemName', errores, { requerido: true })
  const tipoTxt = texto(raw.itemType, 'itemType', errores, { requerido: true, max: 2 })
  const itemType = tipoTxt ? (tipoTxt.toUpperCase() as TipoArticulo) : null
  if (tipoTxt && !['PT', 'SE', 'MP'].includes(itemType as string)) {
    errores.push(`itemType: tiene que ser PT, SE o MP (llegó ${JSON.stringify(raw.itemType)})`)
  }
  const uom = texto(raw.uom, 'uom', errores, { max: 20 })
  const active = booleano(raw.active, 'active', errores)
  const defaultWarehouse = texto(raw.defaultWarehouse, 'defaultWarehouse', errores, { max: 20 })
  const hasBatch = booleano(raw.hasBatch, 'hasBatch', errores)

  let bom: LineaReceta[] | undefined
  if (raw.bom !== undefined && raw.bom !== null) {
    if (!Array.isArray(raw.bom)) {
      errores.push('bom: tiene que ser una lista (o no enviarse para no tocar la receta)')
    } else if (raw.bom.length > MAX_LINEAS_RECETA) {
      errores.push(`bom: supera las ${MAX_LINEAS_RECETA} líneas`)
    } else {
      bom = []
      raw.bom.forEach((l, i) => {
        const p = `bom[${i}]`
        if (!esObjeto(l)) { errores.push(`${p}: tiene que ser un objeto`); return }
        const code = texto(l.itemCode, `${p}.itemCode`, errores, { requerido: true, max: MAX_CODIGO })
        const qty = numeroPositivo(l.quantity, `${p}.quantity`, errores)
        const lUom = texto(l.uom, `${p}.uom`, errores, { max: 20 })
        if (code && itemCode && code === itemCode) errores.push(`${p}: un artículo no puede ser componente de sí mismo`)
        if (code && qty !== null) bom!.push({ itemCode: code, quantity: qty, uom: lUom })
      })
    }
  }

  if (errores.length || !itemCode || !itemName || !itemType || active === null || hasBatch === null) {
    return { ok: false, id: itemCode ?? (typeof raw.itemCode === 'string' ? raw.itemCode : null), errores }
  }
  const valor: ArticuloSap = { itemCode, itemName, itemType, uom, active, defaultWarehouse, hasBatch }
  if (bom) valor.bom = bom
  return { ok: true, valor }
}

// ---------- ordenes ----------

export function validarOrden(raw: unknown): Validacion<OrdenSap> {
  const errores: string[] = []
  if (!esObjeto(raw)) return { ok: false, id: null, errores: ['la orden tiene que ser un objeto JSON'] }

  const docEntry = enteroPositivo(raw.docEntry, 'docEntry', errores, true)
  const docNum = texto(raw.docNum, 'docNum', errores, { max: 50 })
  const parentDocEntry = enteroPositivo(raw.parentDocEntry, 'parentDocEntry', errores, false)
  const itemCode = texto(raw.itemCode, 'itemCode', errores, { requerido: true, max: MAX_CODIGO })
  const plannedQty = enteroPositivo(raw.plannedQty, 'plannedQty', errores, true)
  const uom = texto(raw.uom, 'uom', errores, { max: 20 })
  const dueDate = fecha(raw.dueDate, 'dueDate', errores, true)
  const startDate = fecha(raw.startDate, 'startDate', errores, false)
  const warehouse = texto(raw.warehouse, 'warehouse', errores, { max: 20 })
  const batchNumber = texto(raw.batchNumber, 'batchNumber', errores, { max: 50 })

  if (raw.status === undefined || raw.status === null || raw.status === '') {
    errores.push('status: es obligatorio (solo se aceptan órdenes liberadas: "R")')
  } else if (!esLiberada(raw.status)) {
    errores.push(`status: solo se aceptan órdenes liberadas ("R" o "boposReleased"); llegó ${JSON.stringify(raw.status)}`)
  }
  if (docEntry !== null && parentDocEntry !== null && docEntry === parentDocEntry) {
    errores.push('parentDocEntry: una orden no puede ser su propio padre')
  }

  if (errores.length || docEntry === null || !itemCode || plannedQty === null || !dueDate) {
    const id = docEntry ?? (typeof raw.docEntry === 'number' || typeof raw.docEntry === 'string' ? raw.docEntry : null)
    return { ok: false, id, errores }
  }
  return {
    ok: true,
    valor: { docEntry, docNum, parentDocEntry, itemCode, plannedQty, uom, dueDate, startDate, warehouse, batchNumber, status: 'R' },
  }
}

// ---------- lote ----------

/**
 * Valida un lote completo. Ademas de cada item, marca como rechazados los
 * repetidos DENTRO del mismo envio (el segundo en adelante): mandar dos veces
 * el mismo codigo en un POST es casi seguro un error de armado del lote.
 */
export function validarLote<T>(
  items: unknown[],
  validar: (raw: unknown) => Validacion<T>,
  clave: (v: T) => string | number,
): Validacion<T>[] {
  const vistos = new Map<string | number, number>()
  return items.map((raw, i) => {
    const r = validar(raw)
    if (!r.ok) return r
    const k = clave(r.valor)
    const previo = vistos.get(k)
    if (previo !== undefined) {
      return { ok: false, id: k, errores: [`repetido en el mismo envío (ya viene en la posición ${previo})`] }
    }
    vistos.set(k, i)
    return r
  })
}
