import { supabase } from '../lib/supabaseClient'

export const BUCKET_EVIDENCIAS_SGO = 'sgo-evidencias'
const MAX_FOTO_MB = 8

function extensionArchivo(file: File): string {
  const desdeNombre = file.name.split('.').pop()?.toLocaleLowerCase('es')
  if (desdeNombre && /^[a-z0-9]{2,5}$/.test(desdeNombre)) return desdeNombre
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

export async function subirEvidenciasCampo(files: FileList | File[], ejecucionId: string, itemId: string): Promise<string[]> {
  if (!supabase) throw new Error('El almacenamiento de evidencias no está disponible.')
  const lista = Array.from(files)
  if (!lista.length) return []
  const paths: string[] = []
  for (const file of lista) {
    if (!file.type.startsWith('image/')) throw new Error(`“${file.name}” no es una imagen.`)
    if (file.size > MAX_FOTO_MB * 1024 * 1024) throw new Error(`“${file.name}” supera ${MAX_FOTO_MB} MB.`)
    const path = `${new Date().getFullYear()}/${ejecucionId}/${itemId}/${crypto.randomUUID()}.${extensionArchivo(file)}`
    const { error } = await supabase.storage.from(BUCKET_EVIDENCIAS_SGO).upload(path, file, {
      upsert: false,
      contentType: file.type || 'image/jpeg',
    })
    if (error) throw new Error(`No se pudo subir “${file.name}”: ${error.message}`)
    paths.push(path)
  }
  return paths
}

export async function firmarEvidenciasCampo(paths: string[], segundos = 900): Promise<Record<string, string>> {
  if (!supabase || !paths.length) return {}
  const cliente = supabase
  const resultado: Record<string, string> = {}
  await Promise.all(paths.map(async (path) => {
    const { data } = await cliente.storage.from(BUCKET_EVIDENCIAS_SGO).createSignedUrl(path, segundos)
    if (data?.signedUrl) resultado[path] = data.signedUrl
  }))
  return resultado
}
