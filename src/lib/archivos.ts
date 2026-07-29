import { supabase } from './supabaseClient'

// ============================================================
// ARCHIVOS ADJUNTOS (v1.47) — Protocolo de ensayo del laboratorio.
//
// ARQUITECTURA (importante):
// El PDF NO se guarda en la base de datos. Va a Supabase Storage (almacenamiento
// de objetos, tipo Drive con permisos) en un bucket PRIVADO, y en la tabla solo
// se guarda la RUTA del archivo (un texto corto).
//
// Por qué: la PWA es offline-first y espeja TODAS las filas de cada tabla en la
// base local (Dexie) de CADA tablet. Si el PDF viviera en una columna, cada
// tablet de planta se bajaría los miles de protocolos en cada sincronización.
// Guardando solo la ruta, la tablet sincroniza ~60 caracteres y el PDF se
// descarga únicamente cuando alguien lo abre, con un link firmado temporal.
//
// Convención de ruta:  <año>/<serie o id>_<id corto>.pdf
// ============================================================
export const BUCKET_PROTOCOLOS = 'protocolos'
export const MAX_PDF_MB = 10

export interface ResultadoSubida {
  ok: boolean
  path?: string       // ruta dentro del bucket (lo que se guarda en la tabla)
  nombre?: string     // nombre original del archivo (para mostrarlo)
  error?: string      // mensaje listo para mostrarle al usuario
}

// Limpia un texto para usarlo dentro del nombre de archivo (Storage es estricto).
function slug(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // saca acentos
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

// Valida que sea un PDF razonable ANTES de gastar red.
export function validarPdf(file: File): string | null {
  const esPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!esPdf) return 'El archivo debe ser un PDF.'
  if (file.size === 0) return 'El archivo está vacío.'
  if (file.size > MAX_PDF_MB * 1024 * 1024) {
    return `El PDF supera los ${MAX_PDF_MB} MB (pesa ${(file.size / 1024 / 1024).toFixed(1)} MB). Exportalo en menor calidad.`
  }
  return null
}

// Sube el protocolo y devuelve la ruta a guardar en la tabla.
// `referencia` = N° de serie (o el id de la tarea si todavía no tiene serie).
export async function subirProtocolo(file: File, referencia: string, id: string): Promise<ResultadoSubida> {
  const err = validarPdf(file)
  if (err) return { ok: false, error: err }
  if (!supabase) return { ok: false, error: 'Sin conexión a la nube: no se puede adjuntar el PDF ahora.' }
  if (!navigator.onLine) {
    return { ok: false, error: 'Estás sin conexión. El PDF necesita internet para subirse; guardá el resto y adjuntalo cuando vuelva la red.' }
  }

  const anio = new Date().getFullYear()
  const path = `${anio}/${slug(referencia) || 'sin-serie'}_${id.slice(0, 8)}.pdf`

  const { error } = await supabase.storage.from(BUCKET_PROTOCOLOS).upload(path, file, {
    contentType: 'application/pdf',
    upsert: true,   // permite reemplazar el protocolo si lo cargaron mal
  })
  if (error) return { ok: false, error: `No se pudo subir el PDF: ${error.message}` }
  return { ok: true, path, nombre: file.name }
}

// Link de descarga FIRMADO y temporal (el bucket es privado: no hay URL pública).
export async function urlProtocolo(path?: string, segundos = 300): Promise<string | null> {
  if (!path || !supabase) return null
  const { data, error } = await supabase.storage.from(BUCKET_PROTOCOLOS).createSignedUrl(path, segundos)
  if (error) return null
  return data?.signedUrl ?? null
}

// Abre el PDF en una pestaña nueva. Devuelve un mensaje de error si no se pudo.
export async function abrirProtocolo(path?: string): Promise<string | null> {
  if (!path) return 'Este registro no tiene protocolo adjunto.'
  if (!navigator.onLine) return 'Necesitás conexión para descargar el protocolo.'
  const url = await urlProtocolo(path)
  if (!url) return 'No se pudo generar el link de descarga. Reintentá en unos segundos.'
  window.open(url, '_blank', 'noopener')
  return null
}
