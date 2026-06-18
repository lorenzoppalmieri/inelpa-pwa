import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { db } from '../db/dexie'
import { supabase, SUPABASE_HABILITADO } from '../lib/supabaseClient'
import type { SyncOp, Tarea, OrdenProduccion, Semielaborado, SectorId, Objetivo } from '../types'
import {
  tareaFromRow, paradaFromRow, ordenFromRow, semiFromRow, maquinaFromRow, usuarioFromRow, objetivoFromRow,
  tareaToRow, paradaToRow, ordenToRow, semiToRow, objetivoToRow,
  type TareaRow, type ParadaRow, type OrdenRow, type SemiRow, type MaquinaRow, type UsuarioRow, type ObjetivoRow,
} from './mappers'

// ============================================================
// Motor de sincronizacion BIDIRECCIONAL (Supabase <-> Dexie).
//
//  LECTURA (nube -> local):
//    - fetchInicial(): al loguear, trae el estado actual de Supabase a Dexie.
//    - Realtime: se suscribe a postgres_changes y refleja Insert/Update/Delete
//      en Dexie, asi useLiveQuery actualiza la UI sin recargar.
//
//  ESCRITURA (local -> nube), offline-first:
//    - Cada cambio se escribe primero en Dexie y se encola en syncQueue.
//    - Cuando hay red, la cola se vacia contra Supabase (con mapeo a snake_case).
//
//  Supabase es la FUENTE DE VERDAD; Dexie es el espejo reactivo local.
//  Si no hay credenciales (.env), opera en modo demo local (sin salida de red).
// ============================================================

const BACKEND_ACTIVO = SUPABASE_HABILITADO

type Listener = (estado: EstadoSync) => void
export interface EstadoSync {
  online: boolean
  pendientes: number
  ultimaSync?: string
  backendActivo: boolean
  sincronizando: boolean
}

let listeners: Listener[] = []
let estado: EstadoSync = {
  online: navigator.onLine, pendientes: 0, backendActivo: BACKEND_ACTIVO, sincronizando: false,
}

function emit() { for (const l of listeners) l(estado) }
export function onSync(l: Listener): () => void {
  listeners.push(l)
  l(estado)
  return () => { listeners = listeners.filter((x) => x !== l) }
}

async function refreshPendientes() {
  const pendientes = await db.syncQueue.filter((op) => !op.sincronizado).count()
  estado = { ...estado, pendientes, online: navigator.onLine }
  emit()
}

// ============================================================
// LECTURA: fetch inicial (nube -> Dexie)
// ============================================================
export async function fetchInicial(): Promise<void> {
  if (!supabase) return
  estado = { ...estado, sincronizando: true }; emit()
  try {
    // Espejo limpio: borramos las tablas reflejadas (no la cola de sync) para que
    // no queden restos de datos demo (ids text) mezclados con los uuid de Supabase.
    await Promise.all([
      db.maquinas.clear(), db.usuarios.clear(), db.ordenes.clear(),
      db.semielaborados.clear(), db.tareas.clear(), db.objetivos.clear(),
    ])

    const [maqs, usrs, uss, ords, semis, tars, pars, objs] = await Promise.all([
      supabase.from('maquinas').select('*'),
      supabase.from('usuarios').select('id, nombre, usuario, rol, grupo_nomina, activo'),
      supabase.from('usuario_sectores').select('usuario_id, sector_id'),
      supabase.from('ordenes').select('*'),
      supabase.from('semielaborados').select('*'),
      supabase.from('tareas').select('*'),
      supabase.from('paradas').select('*'),
      supabase.from('objetivos').select('*'),
    ])

    // Maquinas
    if (maqs.data) await db.maquinas.bulkPut((maqs.data as MaquinaRow[]).map(maquinaFromRow))

    // Usuarios (+ sus sectores N:N)
    if (usrs.data) {
      const porUsuario = new Map<string, SectorId[]>()
      for (const r of (uss.data ?? []) as { usuario_id: string; sector_id: string }[]) {
        const arr = porUsuario.get(r.usuario_id) ?? []
        arr.push(r.sector_id as SectorId)
        porUsuario.set(r.usuario_id, arr)
      }
      await db.usuarios.bulkPut(
        (usrs.data as UsuarioRow[]).map((r) => usuarioFromRow(r, porUsuario.get(r.id) ?? [])),
      )
    }

    // Ordenes
    if (ords.data) await db.ordenes.bulkPut((ords.data as OrdenRow[]).map(ordenFromRow))

    // Semielaborados
    if (semis.data) await db.semielaborados.bulkPut((semis.data as SemiRow[]).map(semiFromRow))

    // Objetivos mensuales (ANDON)
    if (objs.data) await db.objetivos.bulkPut((objs.data as ObjetivoRow[]).map(objetivoFromRow))

    // Tareas (+ paradas anidadas)
    if (tars.data) {
      const porTarea = new Map<string, ReturnType<typeof paradaFromRow>[]>()
      for (const pr of (pars.data ?? []) as ParadaRow[]) {
        const p = paradaFromRow(pr)
        const arr = porTarea.get(p.tareaId) ?? []
        arr.push(p)
        porTarea.set(p.tareaId, arr)
      }
      await db.tareas.bulkPut(
        (tars.data as TareaRow[]).map((r) => tareaFromRow(r, porTarea.get(r.id) ?? [])),
      )
    }

    estado = { ...estado, ultimaSync: new Date().toISOString() }
  } catch (e) {
    console.warn('[sync] fetchInicial fallo:', e)
  } finally {
    estado = { ...estado, sincronizando: false }; emit()
  }
}

// ============================================================
// LECTURA: Realtime (nube -> Dexie). Respeta RLS por la sesion del usuario.
// ============================================================
let canal: RealtimeChannel | null = null

type Payload = RealtimePostgresChangesPayload<Record<string, unknown>>

async function onTareaChange(payload: Payload) {
  if (payload.eventType === 'DELETE') {
    await db.tareas.delete((payload.old as { id: string }).id)
    return
  }
  const row = payload.new as unknown as TareaRow
  const existente = await db.tareas.get(row.id)
  await db.tareas.put(tareaFromRow(row, existente?.paradas ?? []))
}

async function onParadaChange(payload: Payload) {
  if (payload.eventType === 'DELETE') {
    const old = payload.old as unknown as ParadaRow
    const t = await db.tareas.get(old.tarea_id)
    if (t) await db.tareas.put({ ...t, paradas: t.paradas.filter((p) => p.id !== old.id) })
    return
  }
  const p = paradaFromRow(payload.new as unknown as ParadaRow)
  const t = await db.tareas.get(p.tareaId)
  if (t) {
    const paradas = [...t.paradas.filter((x) => x.id !== p.id), p]
    await db.tareas.put({ ...t, paradas })
  }
}

async function onOrdenChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.ordenes.delete((payload.old as { id: string }).id); return }
  await db.ordenes.put(ordenFromRow(payload.new as unknown as OrdenRow))
}

async function onSemiChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.semielaborados.delete((payload.old as { id: string }).id); return }
  await db.semielaborados.put(semiFromRow(payload.new as unknown as SemiRow))
}

async function onMaquinaChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.maquinas.delete((payload.old as { id: string }).id); return }
  await db.maquinas.put(maquinaFromRow(payload.new as unknown as MaquinaRow))
}

async function onObjetivoChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.objetivos.delete((payload.old as { id: string }).id); return }
  await db.objetivos.put(objetivoFromRow(payload.new as unknown as ObjetivoRow))
}

function suscribirRealtime() {
  if (!supabase || canal) return
  canal = supabase
    .channel('inelpa-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, onTareaChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'paradas' }, onParadaChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, onOrdenChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'semielaborados' }, onSemiChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'maquinas' }, onMaquinaChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'objetivos' }, onObjetivoChange)
    .subscribe()
}

// Arranca la sincronizacion al haber sesion (lo llama AuthContext).
// Idempotente: ignora llamadas repetidas (ej. refresh de token) si ya esta activa.
let syncActiva = false
export async function iniciarSync(): Promise<void> {
  if (!BACKEND_ACTIVO || syncActiva) return
  syncActiva = true
  await fetchInicial()
  suscribirRealtime()
  void procesarCola() // vaciar cualquier cambio offline pendiente
}

// Corta la sincronizacion al cerrar sesion.
export async function detenerSync(): Promise<void> {
  if (canal && supabase) { await supabase.removeChannel(canal) }
  canal = null
  syncActiva = false
}

// ============================================================
// ESCRITURA: outbox offline-first (Dexie -> Supabase)
// ============================================================
export async function encolar(op: Omit<SyncOp, 'id' | 'ts' | 'sincronizado'>) {
  const full: SyncOp = { ...op, id: crypto.randomUUID(), ts: new Date().toISOString(), sincronizado: false }
  await db.syncQueue.add(full)
  await refreshPendientes()
  void procesarCola()
}

let procesando = false
export async function procesarCola(): Promise<void> {
  if (procesando || !navigator.onLine) return
  procesando = true
  try {
    const pend = await db.syncQueue.filter((op) => !op.sincronizado).toArray()
    for (const op of pend) {
      const ok = await empujar(op)
      if (ok) await db.syncQueue.update(op.id, { sincronizado: true })
      else break // si falla, reintenta en el proximo ciclo
    }
    estado = { ...estado, ultimaSync: new Date().toISOString() }
  } finally {
    procesando = false
    await refreshPendientes()
  }
}

// Empuja una operacion al backend (con mapeo camelCase -> snake_case).
// En modo demo (sin .env) confirma localmente.
async function empujar(op: SyncOp): Promise<boolean> {
  if (!BACKEND_ACTIVO || !supabase) return true // modo demo: nada que enviar
  try {
    // Borrado fisico (solo gestion, via RLS). La tabla de cada entidad.
    if (op.tipo === 'delete') {
      const tabla = op.entidad === 'tarea' ? 'tareas'
        : op.entidad === 'orden' ? 'ordenes'
        : op.entidad === 'semielaborado' ? 'semielaborados'
        : op.entidad === 'objetivo' ? 'objetivos'
        : 'paradas'
      const { error } = await supabase.from(tabla).delete().eq('id', op.entidadId)
      if (error) { console.warn(`[sync] delete ${op.entidad}:`, error.message); return false }
      return true
    }
    switch (op.entidad) {
      case 'tarea': {
        const t = op.payload as Tarea
        const row = tareaToRow(t)
        // Por RLS, el operario solo puede UPDATE (no INSERT). Intentamos update
        // primero; si no existia la fila (gestion creando), recien ahi insert.
        const upd = await supabase.from('tareas').update(row).eq('id', t.id).select('id')
        if (upd.error) { console.warn('[sync] update tarea:', upd.error.message); return false }
        if (!upd.data || upd.data.length === 0) {
          const ins = await supabase.from('tareas').insert(row)
          if (ins.error) { console.warn('[sync] insert tarea:', ins.error.message); return false }
        }
        // Las paradas de la tarea van a su propia tabla.
        if (t.paradas?.length) {
          const { error: ep } = await supabase
            .from('paradas')
            .upsert(t.paradas.map(paradaToRow), { onConflict: 'id' })
          if (ep) { console.warn('[sync] upsert paradas:', ep.message); return false }
        }
        return true
      }
      case 'orden': {
        const { error } = await supabase
          .from('ordenes')
          .upsert(ordenToRow(op.payload as OrdenProduccion), { onConflict: 'id' })
        if (error) { console.warn('[sync] upsert orden:', error.message); return false }
        return true
      }
      case 'semielaborado': {
        const { error } = await supabase
          .from('semielaborados')
          .upsert(semiToRow(op.payload as Semielaborado), { onConflict: 'id' })
        if (error) { console.warn('[sync] upsert semielaborado:', error.message); return false }
        return true
      }
      case 'parada': {
        const { error } = await supabase
          .from('paradas')
          .upsert(paradaToRow(op.payload as Parameters<typeof paradaToRow>[0]), { onConflict: 'id' })
        if (error) { console.warn('[sync] upsert parada:', error.message); return false }
        return true
      }
      case 'objetivo': {
        const { error } = await supabase
          .from('objetivos')
          .upsert(objetivoToRow(op.payload as Objetivo), { onConflict: 'id' })
        if (error) { console.warn('[sync] upsert objetivo:', error.message); return false }
        return true
      }
      default:
        return true
    }
  } catch (e) {
    console.warn('[sync] empujar excepcion:', e)
    return false // sin red: reintenta luego
  }
}

// ============================================================
// Helpers de alto nivel: persistir entidad en Dexie + encolar sync.
// ============================================================
export async function guardarTarea(t: Tarea): Promise<void> {
  await db.tareas.put(t)
  await encolar({ entidad: 'tarea', entidadId: t.id, tipo: 'upsert', payload: t })
}

// Borra una tarea planificada (aun NO iniciada). Quita de Dexie y encola el
// delete contra Supabase. La validacion de "no iniciada" la hace quien llama.
export async function eliminarTarea(t: Tarea): Promise<void> {
  await db.tareas.delete(t.id)
  await encolar({ entidad: 'tarea', entidadId: t.id, tipo: 'delete', payload: { id: t.id } })
}

export async function guardarOrden(o: OrdenProduccion): Promise<void> {
  await db.ordenes.put(o)
  await encolar({ entidad: 'orden', entidadId: o.id, tipo: 'upsert', payload: o })
}

export async function guardarSemielaborado(s: Semielaborado): Promise<void> {
  await db.semielaborados.put(s)
  await encolar({ entidad: 'semielaborado', entidadId: s.id, tipo: 'upsert', payload: s })
}

// v1.10: objetivo mensual de produccion por area (ANDON).
export async function guardarObjetivo(o: Objetivo): Promise<void> {
  await db.objetivos.put(o)
  await encolar({ entidad: 'objetivo', entidadId: o.id, tipo: 'upsert', payload: o })
}

// Auto-disparo al recuperar conexion.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { estado = { ...estado, online: true }; emit(); void procesarCola() })
  window.addEventListener('offline', () => { estado = { ...estado, online: false }; emit() })
  void refreshPendientes()
  setInterval(() => void procesarCola(), 30000) // reintento periodico
}
