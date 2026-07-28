import type { ModeloTransformador } from '../types'

// ============================================================
// DATOS DESCRIPTIVOS DEL MODELO DE TRANSFORMADOR (v1.43).
//
// El nombre del modelo (= ItemName de SAP) viene armado así:
//
//   "TTD 63/33 - Tanque Expansion - Plataforma - Aluminio"
//     └ código      └ tanque          └ montaje    └ material
//
// Laboratorio muestra ese nombre completo, pero al pasar el trafo a Despacho se
// perdía todo salvo la serie. Este helper extrae las tres piezas que necesita
// Despacho: descripción constructiva, tipo y potencia.
//
// Fuente preferida: el CATÁLOGO (ModeloTransformador tiene potencia, tensión,
// tanque y montaje ya normalizados desde SAP). Si el modelo no está en el
// catálogo — prototipos, modelos nuevos, base sin sincronizar — se cae a parsear
// el nombre, que respeta la misma convención.
// ============================================================

// Última parte del nombre cuando es el material, no una característica constructiva.
const MATERIALES = ['cobre', 'aluminio', 'cu', 'al']

export interface DatosModelo {
  /** Nombre completo tal cual lo muestra Laboratorio. */
  nombre: string
  /** Solo la parte constructiva, sin el código ni el material. Ej: "Tanque Expansion · Plataforma" */
  tipo?: string
  /** Ej: "63 kVA / 33 kV" o "63 kVA". */
  potencia?: string
}

// Separa el nombre en [código, ...características]. Tolera guiones con y sin
// espacios alrededor, que es como vienen algunos ItemName de SAP.
function partes(nombre: string): string[] {
  return nombre.split(/\s+-\s+|\s-\s/).map((s) => s.trim()).filter(Boolean)
}

// "TTD 63/33" -> { kva: 63, kv: 33 }. También soporta "TTD 63" (sin tensión).
function potenciaDelCodigo(codigo: string): { kva?: number; kv?: number } {
  const m = codigo.match(/(\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+(?:[.,]\d+)?))?/)
  if (!m) return {}
  const num = (s?: string) => (s === undefined ? undefined : Number(s.replace(',', '.')))
  return { kva: num(m[1]), kv: num(m[2]) }
}

function fmtPotencia(kva?: number | null, kv?: number | null): string | undefined {
  if (kva == null && kv == null) return undefined
  const a = kva != null ? `${kva} kVA` : ''
  const b = kv != null ? `${kv} kV` : ''
  return [a, b].filter(Boolean).join(' / ')
}

/**
 * Extrae los datos descriptivos de un modelo.
 * @param nombre nombre del modelo (ej. el campo `modelo` de la tarea / del ensayo)
 * @param cat entrada del catálogo, si se encontró. Tiene prioridad sobre el parseo.
 */
export function datosModelo(nombre: string | undefined, cat?: ModeloTransformador): DatosModelo {
  const n = (nombre ?? '').trim()
  if (!n) return { nombre: '' }

  const ps = partes(n)
  // El primer segmento es el código (TTD 63/33). El resto describe la construcción.
  const resto = ps.slice(1)
  // El material va al final y no es una característica constructiva.
  const soloConstructivas = resto.filter((p) => !MATERIALES.includes(p.toLowerCase()))

  // Tipo: preferimos tanque + montaje del catálogo, ya normalizados.
  const delCatalogo = cat ? [cat.tanque, cat.montaje].filter(Boolean).join(' · ') : ''
  const tipo = delCatalogo || (soloConstructivas.length ? soloConstructivas.join(' · ') : undefined)

  // Potencia: catálogo primero; si no, se lee del código.
  const potCat = fmtPotencia(cat?.potencia, cat?.tension)
  const { kva, kv } = potenciaDelCodigo(ps[0] ?? '')
  const potencia = potCat ?? fmtPotencia(kva, kv)

  return { nombre: n, tipo, potencia }
}

/**
 * Busca el modelo en el catálogo. Los ItemName pueden diferir en espacios o
 * mayúsculas, así que se compara normalizado. También acepta el código.
 */
export function buscarModelo(nombre: string | undefined, catalogo: ModeloTransformador[]): ModeloTransformador | undefined {
  const n = (nombre ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!n) return undefined
  return catalogo.find((m) => m.nombre?.trim().toLowerCase().replace(/\s+/g, ' ') === n)
    ?? catalogo.find((m) => m.codigo?.trim().toLowerCase() === n)
}

/**
 * Título de un trafo para listas y tarjetas: descripción del modelo + serie.
 * Es el mismo formato que usa Laboratorio, para que Melany vea lo mismo.
 */
export function tituloTrafo(modelo: string | undefined, serie: string | undefined): string {
  const m = (modelo ?? '').trim()
  const s = (serie ?? '').trim()
  if (m && s) return `${m} · Serie ${s}`
  if (m) return `${m} · (sin serie)`
  return s ? `Serie ${s}` : '—'
}
