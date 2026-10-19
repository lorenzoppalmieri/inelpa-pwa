import { supabase } from './supabaseClient'
import { traerTodoDe, type ConsultaPaginable } from './supabaseFetch'

// ============================================================
// PLANOS DE SEMIELABORADOS (v2.38)
//
// El PDF vive en Supabase Storage (bucket PRIVADO 'planos'); la tabla `planos`
// guarda solo la ruta y a qué semielaborado (componente_codigo) corresponde.
// Ver docs/supabase_planos_v2.38.sql para el porqué de cada decisión.
//
// IMPORTANTE: esta tabla NO se espeja en Dexie. Los planos se ven solo con
// conexión (decisión de Lorenzo, 15/10/2026), así que se consulta en línea al
// abrir la tarea. Si algún día se quiere offline, NO meter el PDF en Dexie:
// cachearlo en Cache Storage (ver la nota de archivos.ts).
// ============================================================
export const BUCKET_PLANOS = 'planos'
export const MAX_PLANO_MB = 25

export interface Plano {
  id: string
  componenteCodigo: string
  revision?: string
  ruta: string
  nombreArchivo?: string
  vigente: boolean
  subidoPor?: string
  subidoEn: string
  observacion?: string
}

interface PlanoRow {
  id: string
  componente_codigo: string
  revision: string | null
  ruta: string
  nombre_archivo: string | null
  vigente: boolean
  subido_por: string | null
  subido_en: string
  observacion: string | null
}

const COLUMNAS = 'id, componente_codigo, revision, ruta, nombre_archivo, vigente, subido_por, subido_en, observacion'

function desdeFila(r: PlanoRow): Plano {
  return {
    id: r.id,
    componenteCodigo: r.componente_codigo,
    revision: r.revision ?? undefined,
    ruta: r.ruta,
    nombreArchivo: r.nombre_archivo ?? undefined,
    vigente: r.vigente,
    subidoPor: r.subido_por ?? undefined,
    subidoEn: r.subido_en,
    observacion: r.observacion ?? undefined,
  }
}

// ------------------------------------------------------------
// Helpers PUROS (testeados en __tests__/planos.test.ts). El script de carga
// masiva (scripts/cargar_planos.mjs) usa la MISMA lógica; si se cambia acá,
// cambiarla allá también.
// ------------------------------------------------------------

/** minúsculas, sin acentos, todo lo que no es letra/número -> un espacio. */
export function normalizarTexto(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Nombre del archivo sin carpeta ni extensión. */
export function baseNombre(nombreArchivo: string): string {
  const sinCarpeta = nombreArchivo.split(/[\\/]/).pop() ?? nombreArchivo
  return sinCarpeta.replace(/\.pdf$/i, '')
}

/**
 * Revisión escrita en el nombre: "Rev B", "rev.02", "REV_C", "Revisión 3".
 * undefined si no dice nada (no se inventa una).
 */
export function extraerRevision(nombreArchivo: string): string | undefined {
  const m = baseNombre(nombreArchivo).match(/(?:^|[^a-z])rev(?:isi[oó]n)?[\s._-]*([a-z0-9]{1,3})(?![a-z0-9])/i)
  return m ? m[1].toUpperCase() : undefined
}

/**
 * Busca un código SAP de semielaborado dentro del nombre del archivo.
 * Se parte el nombre en "palabras" y se compara cada una contra los códigos
 * conocidos, así sirve "CUBDIS0000001.pdf", "CUBDIS0000001 Rev B.pdf" o
 * "Plano_CUBDIS0000001_v2.pdf". Nunca adivina por parecido: o el código está
 * entero, o no hay match.
 */
export function codigoEnNombre(nombreArchivo: string, codigos: ReadonlySet<string>): string | undefined {
  const palabras = baseNombre(nombreArchivo).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
  return palabras.find((p) => codigos.has(p))
}

/**
 * Busca un semielaborado cuya DESCRIPCIÓN coincida exacto con el nombre del
 * archivo (normalizados, sin la revisión). Ej. "Cuba Distribucion Trifasica
 * Plataforma 315-13 Cu Rev B.pdf". Solo si hay UNA coincidencia: si dos
 * descripciones normalizan igual, no se elige ninguna.
 */
export function codigoPorDescripcion(
  nombreArchivo: string,
  componentes: ReadonlyArray<{ codigo: string; descripcion: string }>,
): string | undefined {
  const base = baseNombre(nombreArchivo).replace(/(?:^|[^a-z])rev(?:isi[oó]n)?[\s._-]*[a-z0-9]{1,3}(?![a-z0-9])/gi, ' ')
  const n = normalizarTexto(base)
  if (!n) return undefined
  const hits = componentes.filter((c) => normalizarTexto(c.descripcion) === n)
  return hits.length === 1 ? hits[0].codigo : undefined
}

/** Ruta dentro del bucket. Única por subida; el nombre ayuda a reconocerlo. */
export function rutaPlano(nombreArchivo: string, id: string): string {
  const slug = normalizarTexto(baseNombre(nombreArchivo)).replace(/ /g, '-').slice(0, 60) || 'plano'
  return `subidos/${slug}_${id.replace(/-/g, '').slice(0, 10)}.pdf`
}

export function validarPlano(file: File): string | null {
  const esPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!esPdf) return 'El plano tiene que ser un PDF.'
  if (file.size === 0) return 'El archivo está vacío.'
  if (file.size > MAX_PLANO_MB * 1024 * 1024) {
    return `El PDF supera los ${MAX_PLANO_MB} MB (pesa ${(file.size / 1024 / 1024).toFixed(1)} MB).`
  }
  return null
}

// ------------------------------------------------------------
// Lectura
// ------------------------------------------------------------

/** Plano VIGENTE de un semielaborado. `plano: null` = no tiene. */
export async function planoVigente(componenteCodigo: string): Promise<{ plano: Plano | null; error?: string }> {
  const sb = supabase
  if (!sb) return { plano: null, error: 'Sin conexión a la nube.' }
  const { data, error } = await sb.from('planos').select(COLUMNAS)
    .eq('componente_codigo', componenteCodigo).eq('vigente', true).maybeSingle()
  if (error) return { plano: null, error: `No se pudo consultar el plano: ${error.message}` }
  return { plano: data ? desdeFila(data as PlanoRow) : null }
}

/** Todos los planos (vigentes y viejos). Paginado: no se corta en 1000 filas. */
export async function listarPlanos(): Promise<Plano[]> {
  const sb = supabase
  if (!sb) return []
  const filas = await traerTodoDe<PlanoRow>('planos', () =>
    sb.from('planos').select(COLUMNAS).order('id', { ascending: true }) as unknown as ConsultaPaginable<PlanoRow>)
  return filas.map(desdeFila)
}

// Memoria de la sesión: si dos tarjetas muestran el mismo plano, se baja una
// sola vez. Chica a propósito (los planos pesan); no persiste entre recargas.
const MEMORIA_MAX = 6
const memoria = new Map<string, Promise<ArrayBuffer>>()

/**
 * Baja el PDF como bytes, con la sesión del usuario (bucket privado: sin URL
 * pública). Se usa para dibujarlo adentro de la app; NUNCA dispara una descarga
 * del navegador.
 */
export function descargarPlano(ruta: string): Promise<ArrayBuffer> {
  const ya = memoria.get(ruta)
  if (ya) return ya
  const p = (async () => {
    const sb = supabase
    if (!sb) throw new Error('Sin conexión a la nube.')
    const { data, error } = await sb.storage.from(BUCKET_PLANOS).download(ruta)
    if (error || !data) throw new Error(`No se pudo bajar el plano: ${error?.message ?? 'sin datos'}`)
    return data.arrayBuffer()
  })()
  // Si falla, que no quede envenenada la memoria: el reintento vuelve a pedirlo.
  p.catch(() => memoria.delete(ruta))
  memoria.set(ruta, p)
  if (memoria.size > MEMORIA_MAX) memoria.delete(memoria.keys().next().value as string)
  return p
}

// ------------------------------------------------------------
// Escritura (solo Super Admin; la RLS lo vuelve a controlar en la base)
// ------------------------------------------------------------

/**
 * Deja `ruta` como el plano VIGENTE de `componenteCodigo`. El anterior queda en
 * el historial (vigente = false). Tres pasos porque el índice único no permite
 * dos vigentes a la vez:
 *   1) se crea el nuevo NO vigente, 2) se baja el anterior, 3) se sube el nuevo.
 * Si se corta en el medio, el semielaborado queda sin vigente un momento y
 * volver a publicar lo arregla; nunca quedan dos.
 */
export async function vincularPlano(
  componenteCodigo: string,
  ruta: string,
  opts: { nombreArchivo?: string; revision?: string; usuario?: string; observacion?: string } = {},
): Promise<{ ok: boolean; error?: string }> {
  const sb = supabase
  if (!sb) return { ok: false, error: 'Sin conexión a la nube.' }

  const { data: nuevo, error: e1 } = await sb.from('planos').insert({
    componente_codigo: componenteCodigo,
    revision: opts.revision?.trim() || null,
    ruta,
    nombre_archivo: opts.nombreArchivo ?? null,
    vigente: false,
    subido_por: opts.usuario ?? null,
    observacion: opts.observacion?.trim() || null,
  }).select('id').single()
  if (e1 || !nuevo) return { ok: false, error: `No se pudo registrar el plano de ${componenteCodigo}: ${e1?.message ?? 'sin respuesta'}` }
  const nuevoId = (nuevo as { id: string }).id

  const { error: e2 } = await sb.from('planos').update({ vigente: false })
    .eq('componente_codigo', componenteCodigo).eq('vigente', true).neq('id', nuevoId)
  if (e2) return { ok: false, error: `No se pudo pasar a historial el plano anterior de ${componenteCodigo}: ${e2.message}` }

  const { error: e3 } = await sb.from('planos').update({ vigente: true }).eq('id', nuevoId)
  if (e3) return { ok: false, error: `No se pudo activar el plano nuevo de ${componenteCodigo}: ${e3.message}` }
  return { ok: true }
}

/**
 * Sube UN PDF y lo deja vigente para uno o varios semielaborados (ej. la
 * variante cobre y la de aluminio comparten plano: se guarda una sola vez).
 */
export async function publicarPlano(
  file: File,
  codigos: string[],
  opts: { revision?: string; usuario?: string; observacion?: string } = {},
): Promise<{ ok: boolean; error?: string; vinculados: string[] }> {
  const err = validarPlano(file)
  if (err) return { ok: false, error: err, vinculados: [] }
  const lista = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))]
  if (lista.length === 0) return { ok: false, error: 'Elegí al menos un semielaborado.', vinculados: [] }
  const sb = supabase
  if (!sb) return { ok: false, error: 'Sin conexión a la nube.', vinculados: [] }
  if (!navigator.onLine) return { ok: false, error: 'Estás sin conexión: subir un plano necesita internet.', vinculados: [] }

  const ruta = rutaPlano(file.name, crypto.randomUUID())
  const { error } = await sb.storage.from(BUCKET_PLANOS).upload(ruta, file, { contentType: 'application/pdf', upsert: false })
  if (error) return { ok: false, error: `No se pudo subir el PDF: ${error.message}`, vinculados: [] }

  const revision = opts.revision?.trim() || extraerRevision(file.name)
  const vinculados: string[] = []
  for (const c of lista) {
    const r = await vincularPlano(c, ruta, { nombreArchivo: file.name, revision, usuario: opts.usuario, observacion: opts.observacion })
    if (!r.ok) return { ok: false, error: r.error, vinculados }
    vinculados.push(c)
  }
  return { ok: true, vinculados }
}
