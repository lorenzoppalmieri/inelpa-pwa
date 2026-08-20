import { supabase } from '../lib/supabaseClient'
import { db } from '../db/dexie'
import { agregarEvidenciasAuditoriaCampo } from './controlesCampo'
import type { EjecucionControlSGO } from './controles'

export const BUCKET_EVIDENCIAS_SGO = 'sgo-evidencias'
const MAX_FOTO_MB = 8
const MAX_FOTO_ORIGINAL_MB = 30
const MAX_LADO_FOTO = 1920
const TIPOS_STORAGE = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DB_PENDIENTES = 'inelpa_sgo_evidencias_offline'
const STORE_PENDIENTES = 'pendientes'

export interface EvidenciaPendienteCampo {
  id: string
  ejecucionId: string
  itemId: string
  path: string
  nombre: string
  tipo: string
  creadaEn: string
  blob: Blob
  subida: boolean
}

function extensionArchivo(file: File): string {
  const desdeNombre = file.name.split('.').pop()?.toLocaleLowerCase('es')
  if (desdeNombre && /^[a-z0-9]{2,5}$/.test(desdeNombre)) return desdeNombre
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

export function tipoFotoDesdeArchivo(file: File): string | undefined {
  if (file.type.startsWith('image/')) return file.type.toLocaleLowerCase('es')
  const extension = file.name.split('.').pop()?.toLocaleLowerCase('es')
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'heic') return 'image/heic'
  if (extension === 'heif') return 'image/heif'
  return undefined
}

function validarFotoOriginal(file: File): string {
  const tipo = tipoFotoDesdeArchivo(file)
  if (!tipo) throw new Error(`“${file.name}” no fue reconocido como fotografía.`)
  if (file.size > MAX_FOTO_ORIGINAL_MB * 1024 * 1024) {
    throw new Error(`“${file.name}” es demasiado pesada. El máximo admitido desde cámara es ${MAX_FOTO_ORIGINAL_MB} MB.`)
  }
  return tipo
}

async function fotoComoJpeg(file: File): Promise<File> {
  let fuente: CanvasImageSource | undefined
  let ancho = 0
  let alto = 0
  let liberar: () => void = () => undefined
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
        fuente = bitmap; ancho = bitmap.width; alto = bitmap.height; liberar = () => bitmap.close()
      } catch {
        // Safari puede reconocer una foto de cámara aunque createImageBitmap no la decodifique.
      }
    }
    if (!fuente) {
      const url = URL.createObjectURL(file)
      const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('El navegador no pudo leer el formato de la foto.'))
        img.src = url
      })
      fuente = imagen; ancho = imagen.naturalWidth; alto = imagen.naturalHeight; liberar = () => URL.revokeObjectURL(url)
    }
    const escala = Math.min(1, MAX_LADO_FOTO / Math.max(ancho, alto))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(ancho * escala))
    canvas.height = Math.max(1, Math.round(alto * escala))
    const contexto = canvas.getContext('2d')
    if (!contexto) throw new Error('La tablet no pudo preparar la fotografía.')
    contexto.fillStyle = '#ffffff'
    contexto.fillRect(0, 0, canvas.width, canvas.height)
    contexto.drawImage(fuente, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (resultado) => resultado ? resolve(resultado) : reject(new Error('La tablet no pudo convertir la fotografía.')),
      'image/jpeg', 0.82,
    ))
    const nombre = `${file.name.replace(/\.[^.]+$/, '') || 'foto'}.jpg`
    return new File([blob], nombre, { type: 'image/jpeg', lastModified: file.lastModified })
  } finally { liberar() }
}

async function prepararFoto(file: File): Promise<File> {
  const tipo = validarFotoOriginal(file)
  if (TIPOS_STORAGE.has(tipo) && file.size <= 4 * 1024 * 1024) {
    return file.type === tipo ? file : new File([file], file.name, { type: tipo, lastModified: file.lastModified })
  }
  try {
    const preparada = await fotoComoJpeg(file)
    if (preparada.size > MAX_FOTO_MB * 1024 * 1024) throw new Error('La fotografía continúa siendo demasiado pesada luego de optimizarla.')
    return preparada
  } catch (error) {
    const detalle = error instanceof Error ? error.message : 'Formato no compatible.'
    throw new Error(`No se pudo preparar “${file.name}”. ${detalle} Probá tomarla desde el botón “Tomar foto”.`)
  }
}

function pathEvidencia(file: File, ejecucionId: string, itemId: string): string {
  return `${new Date().getFullYear()}/${ejecucionId}/${itemId}/${crypto.randomUUID()}.${extensionArchivo(file)}`
}

function abrirBasePendientes(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('Este dispositivo no permite guardar fotos sin conexión.')
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_PENDIENTES, 1)
    request.onupgradeneeded = () => {
      const base = request.result
      if (!base.objectStoreNames.contains(STORE_PENDIENTES)) {
        const store = base.createObjectStore(STORE_PENDIENTES, { keyPath: 'id' })
        store.createIndex('ejecucionId', 'ejecucionId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el guardado local de fotografías.'))
  })
}

async function operarPendientes<T>(modo: IDBTransactionMode, operacion: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const base = await abrirBasePendientes()
  return new Promise((resolve, reject) => {
    const tx = base.transaction(STORE_PENDIENTES, modo)
    const request = operacion(tx.objectStore(STORE_PENDIENTES))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo guardar la fotografía en la tablet.'))
    tx.oncomplete = () => base.close()
    tx.onerror = () => { base.close(); reject(tx.error ?? new Error('No se pudo guardar la fotografía en la tablet.')) }
  })
}

async function guardarPendiente(registro: EvidenciaPendienteCampo): Promise<void> {
  await operarPendientes('readwrite', (store) => store.put(registro))
}

async function eliminarPendiente(id: string): Promise<void> {
  await operarPendientes('readwrite', (store) => store.delete(id))
}

export async function listarEvidenciasPendientesCampo(ejecucionId: string): Promise<EvidenciaPendienteCampo[]> {
  const base = await abrirBasePendientes()
  return new Promise((resolve, reject) => {
    const tx = base.transaction(STORE_PENDIENTES, 'readonly')
    const request = tx.objectStore(STORE_PENDIENTES).index('ejecucionId').getAll(ejecucionId)
    request.onsuccess = () => resolve(request.result as EvidenciaPendienteCampo[])
    request.onerror = () => reject(request.error ?? new Error('No se pudieron leer las fotografías pendientes.'))
    tx.oncomplete = () => base.close()
    tx.onerror = () => { base.close(); reject(tx.error ?? new Error('No se pudieron leer las fotografías pendientes.')) }
  })
}

export async function encolarEvidenciasCampo(files: FileList | File[], ejecucionId: string, itemId: string): Promise<number> {
  const lista = Array.from(files)
  for (const original of lista) {
    const file = await prepararFoto(original)
    const registro: EvidenciaPendienteCampo = {
      id: crypto.randomUUID(), ejecucionId, itemId, path: pathEvidencia(file, ejecucionId, itemId),
      nombre: file.name, tipo: file.type || 'image/jpeg', creadaEn: new Date().toISOString(), blob: file, subida: false,
    }
    await guardarPendiente(registro)
  }
  return lista.length
}

async function subirArchivo(path: string, file: Blob, contentType: string, nombre: string): Promise<void> {
  if (!supabase) throw new Error('El almacenamiento de evidencias no está disponible.')
  const { error } = await supabase.storage.from(BUCKET_EVIDENCIAS_SGO).upload(path, file, {
    upsert: false,
    contentType,
  })
  if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`No se pudo subir “${nombre}”: ${error.message}`)
}

export async function subirEvidenciasCampo(files: FileList | File[], ejecucionId: string, itemId: string): Promise<string[]> {
  if (!supabase) throw new Error('El almacenamiento de evidencias no está disponible.')
  const lista = Array.from(files)
  if (!lista.length) return []
  const paths: string[] = []
  for (const original of lista) {
    const file = await prepararFoto(original)
    const path = pathEvidencia(file, ejecucionId, itemId)
    await subirArchivo(path, file, file.type || 'image/jpeg', file.name)
    paths.push(path)
  }
  return paths
}

export async function capturarEvidenciasCampo(
  files: FileList | File[], ejecucionId: string, itemId: string,
): Promise<{ paths: string[]; pendientes: number }> {
  const lista = Array.from(files)
  const paths: string[] = []
  let pendientes = 0
  for (const original of lista) {
    const file = await prepararFoto(original)
    if (typeof navigator !== 'undefined' && navigator.onLine && supabase) {
      try {
        const path = pathEvidencia(file, ejecucionId, itemId)
        await subirArchivo(path, file, file.type || 'image/jpeg', file.name)
        paths.push(path)
        continue
      } catch {
        // Una caída de señal durante la carga no debe hacer perder esta foto.
      }
    }
    const registro: EvidenciaPendienteCampo = {
      id: crypto.randomUUID(), ejecucionId, itemId, path: pathEvidencia(file, ejecucionId, itemId),
      nombre: file.name, tipo: file.type || 'image/jpeg', creadaEn: new Date().toISOString(), blob: file, subida: false,
    }
    await guardarPendiente(registro)
    pendientes += 1
  }
  return { paths, pendientes }
}

async function actualizarEvidenciasAuditoriaCerrada(
  ejecucion: EjecucionControlSGO, nuevasPorItem: Record<string, string[]>, usuario: string,
): Promise<EjecucionControlSGO> {
  if (!supabase || !ejecucion.auditoriaCampo) throw new Error('No hay conexión para completar la sincronización.')
  const auditoriaCampo = agregarEvidenciasAuditoriaCampo(ejecucion.auditoriaCampo, nuevasPorItem, usuario)
  const evidencia = auditoriaCampo.respuestas
    .flatMap((r) => [r.evidenciaReferencia, ...(r.evidenciaPaths ?? [])])
    .filter(Boolean).join(' · ') || undefined
  const actualizado = { ...ejecucion, auditoriaCampo, evidencia }
  const { data, error } = await supabase.from('sgo_control_ejecuciones')
    .update({ auditoria_campo: auditoriaCampo, evidencia })
    .eq('id', ejecucion.id).select('id').maybeSingle()
  if (error) throw new Error(`Las fotos quedaron guardadas en la tablet, pero no se pudo actualizar el informe: ${error.message}`)
  if (!data) throw new Error('Las fotos quedaron guardadas en la tablet. El informe todavía no está disponible en línea; volvé a sincronizar en unos minutos.')
  await db.ejecucionesControlesSGO.put(actualizado)
  return actualizado
}

export async function sincronizarEvidenciasPendientesCampo(
  ejecucion: EjecucionControlSGO, usuario: string,
): Promise<{ ejecucion: EjecucionControlSGO; sincronizadas: number; pendientes: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const pendientes = await listarEvidenciasPendientesCampo(ejecucion.id)
    return { ejecucion, sincronizadas: 0, pendientes: pendientes.length }
  }
  const registros = await listarEvidenciasPendientesCampo(ejecucion.id)
  if (!registros.length) return { ejecucion, sincronizadas: 0, pendientes: 0 }
  for (const registro of registros) {
    if (!registro.subida) {
      await subirArchivo(registro.path, registro.blob, registro.tipo, registro.nombre)
      await guardarPendiente({ ...registro, subida: true })
    }
  }
  const nuevasPorItem = registros.reduce<Record<string, string[]>>((porItem, registro) => {
    ;(porItem[registro.itemId] ??= []).push(registro.path)
    return porItem
  }, {})
  const actualizada = await actualizarEvidenciasAuditoriaCerrada(ejecucion, nuevasPorItem, usuario)
  await Promise.all(registros.map((registro) => eliminarPendiente(registro.id)))
  return { ejecucion: actualizada, sincronizadas: registros.length, pendientes: 0 }
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
