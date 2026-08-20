import { supabase } from '../lib/supabaseClient'
import { db } from '../db/dexie'
import { agregarEvidenciasAuditoriaCampo } from './controlesCampo'
import type { EjecucionControlSGO } from './controles'

export const BUCKET_EVIDENCIAS_SGO = 'sgo-evidencias'
const MAX_FOTO_MB = 8
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

function validarFoto(file: File) {
  if (!file.type.startsWith('image/')) throw new Error(`“${file.name}” no es una imagen.`)
  if (file.size > MAX_FOTO_MB * 1024 * 1024) throw new Error(`“${file.name}” supera ${MAX_FOTO_MB} MB.`)
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
  for (const file of lista) {
    validarFoto(file)
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
  for (const file of lista) {
    validarFoto(file)
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
  lista.forEach(validarFoto)
  const paths: string[] = []
  let pendientes = 0
  for (const file of lista) {
    if (typeof navigator !== 'undefined' && navigator.onLine && supabase) {
      try {
        paths.push(...await subirEvidenciasCampo([file], ejecucionId, itemId))
        continue
      } catch {
        // Una caída de señal durante la carga no debe hacer perder esta foto.
      }
    }
    await encolarEvidenciasCampo([file], ejecucionId, itemId)
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
