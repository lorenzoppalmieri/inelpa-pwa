import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { db } from '../db/dexie'
import { supabase, SUPABASE_HABILITADO } from '../lib/supabaseClient'
import type { SyncOp, Tarea, OrdenProduccion, Semielaborado, SectorId, Objetivo, TareaLogistica, SolicitudLogistica, Feriado, Mensaje, MensajeLectura, TiempoEstandar, DespachoTrafo, FleteInterno, TareaLaboratorio } from '../types'
import { setFeriados } from '../lib/calendario'
import {
  tareaFromRow, paradaFromRow, ordenFromRow, semiFromRow, maquinaFromRow, usuarioFromRow, objetivoFromRow, tareaLogFromRow, solicitudLogFromRow, feriadoFromRow, mensajeFromRow, lecturaFromRow, estandarFromRow, despachoFromRow, fleteFromRow, laboratorioFromRow,
  tareaToRow, paradaToRow, ordenToRow, semiToRow, objetivoToRow, tareaLogToRow, solicitudLogToRow, feriadoToRow, mensajeToRow, lecturaToRow, estandarToRow, despachoToRow, fleteToRow, laboratorioToRow,
  type TareaRow, type ParadaRow, type OrdenRow, type SemiRow, type MaquinaRow, type UsuarioRow, type ObjetivoRow, type TareaLogisticaRow, type SolicitudLogisticaRow, type FeriadoRow, type MensajeRow, type MensajeLecturaRow, type TiempoEstandarRow, type DespachoRow, type FleteRow, type LaboratorioRow,
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
  errores?: number         // v1.18: ops descartadas por error (no bloquean la cola)
  sesionInvalida?: boolean // v1.18: sesion vencida sin poder renovar -> re-login
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
  // Pendientes REALES = sin sincronizar y sin error definitivo (esas quedan parkeadas).
  const ops = await db.syncQueue.toArray()
  const pendientes = ops.filter((op) => !op.sincronizado && !op.errorSync).length
  const errores = ops.filter((op) => !!op.errorSync).length
  estado = { ...estado, pendientes, errores, online: navigator.onLine }
  emit()
}

// v1.18: clasifica un error de sync. 'retry' = transitorio (red, sesion, 5xx/429)
// -> conviene reintentar mas tarde. 'fatal' = definitivo (400/403/RLS/constraint)
// -> reintentar el MISMO payload nunca va a funcionar; se descarta para no trabar.
function clasificarErrorSync(msg: string): 'retry' | 'fatal' {
  return /jwt|token|expired|refresh|failed to fetch|networkerror|network request failed|load failed|fetch|timeout|temporarily|503|502|500|429/i.test(msg)
    ? 'retry' : 'fatal'
}

// ¿El error es por falta de red (transitorio)?
function esErrorDeRed(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = e instanceof Error ? e.message : String(e)
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg)
}

// v1.18: asegura sesion de Supabase valida antes de vaciar la cola. Renueva el
// token si esta por vencer. Devuelve false si no hay sesion o no se pudo renovar.
async function asegurarSesion(): Promise<boolean> {
  if (!supabase) return true // modo demo (sin backend)
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return false
    const expMs = (data.session.expires_at ?? 0) * 1000
    if (expMs && expMs - Date.now() < 120000) { // vence en < 2 min -> renovar ya
      const { error } = await supabase.auth.refreshSession()
      if (error) return false
    }
    return true
  } catch {
    return false
  }
}

// v1.17: vuelca los feriados de Dexie al motor de calendario (afecta Gantt,
// auto-shift, tiempo neto y KPIs en toda la app). Se llama al cargar y al cambiar.
export async function recargarFeriadosCalendario(): Promise<void> {
  const fs = await db.feriados.toArray()
  setFeriados(fs.map((f) => f.fecha))
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
      db.tareasLogistica.clear(), db.solicitudesLogistica.clear(), db.feriados.clear(),
      db.mensajes.clear(), db.mensajesLectura.clear(), db.estandares.clear(), db.despachos.clear(), db.fletes.clear(), db.laboratorio.clear(),
    ])

    const [maqs, usrs, uss, ords, semis, tars, pars, objs, tlog, slog, fers, msgs, lects, ests, desp, flts, labs] = await Promise.all([
      supabase.from('maquinas').select('*'),
      supabase.from('usuarios').select('id, nombre, usuario, rol, grupo_nomina, activo'),
      supabase.from('usuario_sectores').select('usuario_id, sector_id'),
      supabase.from('ordenes').select('*'),
      supabase.from('semielaborados').select('*'),
      supabase.from('tareas').select('*'),
      supabase.from('paradas').select('*'),
      supabase.from('objetivos').select('*'),
      supabase.from('tareas_logistica').select('*'),
      supabase.from('solicitudes_logistica').select('*'),
      supabase.from('feriados').select('*'),
      supabase.from('mensajes').select('*'),
      supabase.from('mensajes_lectura').select('*'),
      supabase.from('tiempos_estandar').select('*'),
      supabase.from('despachos').select('*'),
      supabase.from('fletes_internos').select('*'),
      supabase.from('laboratorio').select('*'),
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

    // Tiempos estandar dinamicos
    if (ests.data) await db.estandares.bulkPut((ests.data as TiempoEstandarRow[]).map(estandarFromRow))

    // Despacho y embalaje
    if (desp.data) await db.despachos.bulkPut((desp.data as DespachoRow[]).map(despachoFromRow))

    // Fletes / viajes internos
    if (flts.data) await db.fletes.bulkPut((flts.data as FleteRow[]).map(fleteFromRow))

    // Laboratorio (cola de ensayos)
    if (labs.data) await db.laboratorio.bulkPut((labs.data as LaboratorioRow[]).map(laboratorioFromRow))

    // Tareas logisticas
    if (tlog.data) await db.tareasLogistica.bulkPut((tlog.data as TareaLogisticaRow[]).map(tareaLogFromRow))

    // Solicitudes logisticas (cola de material)
    if (slog.data) await db.solicitudesLogistica.bulkPut((slog.data as SolicitudLogisticaRow[]).map(solicitudLogFromRow))

    // Feriados (dias no laborables) -> Dexie + motor de calendario
    if (fers.data) await db.feriados.bulkPut((fers.data as FeriadoRow[]).map(feriadoFromRow))
    await recargarFeriadosCalendario()

    // Mensajes + acuses de lectura
    if (msgs.data) await db.mensajes.bulkPut((msgs.data as MensajeRow[]).map(mensajeFromRow))
    if (lects.data) await db.mensajesLectura.bulkPut((lects.data as MensajeLecturaRow[]).map(lecturaFromRow))

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

async function onTareaLogChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.tareasLogistica.delete((payload.old as { id: string }).id); return }
  await db.tareasLogistica.put(tareaLogFromRow(payload.new as unknown as TareaLogisticaRow))
}

async function onSolicitudLogChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.solicitudesLogistica.delete((payload.old as { id: string }).id); return }
  await db.solicitudesLogistica.put(solicitudLogFromRow(payload.new as unknown as SolicitudLogisticaRow))
}

async function onFeriadoChange(payload: Payload) {
  if (payload.eventType === 'DELETE') await db.feriados.delete((payload.old as { id: string }).id)
  else await db.feriados.put(feriadoFromRow(payload.new as unknown as FeriadoRow))
  await recargarFeriadosCalendario() // refresca el calendario en vivo
}

async function onMensajeChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.mensajes.delete((payload.old as { id: string }).id); return }
  await db.mensajes.put(mensajeFromRow(payload.new as unknown as MensajeRow))
}
async function onLecturaChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.mensajesLectura.delete((payload.old as { id: string }).id); return }
  await db.mensajesLectura.put(lecturaFromRow(payload.new as unknown as MensajeLecturaRow))
}
async function onEstandarChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.estandares.delete((payload.old as { id: string }).id); return }
  await db.estandares.put(estandarFromRow(payload.new as unknown as TiempoEstandarRow))
}
async function onDespachoChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.despachos.delete((payload.old as { id: string }).id); return }
  await db.despachos.put(despachoFromRow(payload.new as unknown as DespachoRow))
}
async function onFleteChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.fletes.delete((payload.old as { id: string }).id); return }
  await db.fletes.put(fleteFromRow(payload.new as unknown as FleteRow))
}
async function onLaboratorioChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.laboratorio.delete((payload.old as { id: string }).id); return }
  await db.laboratorio.put(laboratorioFromRow(payload.new as unknown as LaboratorioRow))
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas_logistica' }, onTareaLogChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes_logistica' }, onSolicitudLogChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feriados' }, onFeriadoChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes' }, onMensajeChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes_lectura' }, onLecturaChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tiempos_estandar' }, onEstandarChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'despachos' }, onDespachoChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fletes_internos' }, onFleteChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'laboratorio' }, onLaboratorioChange)
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

const MAX_INTENTOS = 5 // reintentos por op antes de descartarla (evita loop infinito)

let procesando = false
export async function procesarCola(): Promise<void> {
  if (procesando || !navigator.onLine) return
  procesando = true
  try {
    // v1.18: renovar/validar la sesion ANTES de vaciar la cola. Si esta vencida y
    // no se puede renovar, se pausa (no se loopea) y se pide re-login via estado.
    if (!(await asegurarSesion())) {
      estado = { ...estado, sesionInvalida: true }; emit()
      return
    }
    if (estado.sesionInvalida) { estado = { ...estado, sesionInvalida: false }; emit() }

    // Solo ops sin sincronizar y sin error definitivo (las parkeadas se saltean).
    const pend = await db.syncQueue.filter((op) => !op.sincronizado && !op.errorSync).toArray()
    for (const op of pend) {
      const r = await empujar(op)
      if (r.estado === 'ok') { await db.syncQueue.update(op.id, { sincronizado: true }); continue }

      const intentos = (op.intentos ?? 0) + 1
      if (r.estado === 'fatal') {
        // Error DEFINITIVO (400/403/RLS/constraint): descartar y SEGUIR con el resto.
        console.error(`[sync] ⛔ DESCARTADA ${op.entidad}/${op.entidadId} (${op.tipo}) — error definitivo: ${r.msg}`, op.payload)
        await db.syncQueue.update(op.id, { errorSync: r.msg ?? 'error definitivo', intentos })
        continue
      }
      // Transitorio (red/sesion/5xx): reintentar. Si se agotan los intentos, descartar.
      if (intentos >= MAX_INTENTOS) {
        console.error(`[sync] ⛔ DESCARTADA ${op.entidad}/${op.entidadId} — ${intentos} reintentos fallidos: ${r.msg}`, op.payload)
        await db.syncQueue.update(op.id, { errorSync: `reintentos agotados: ${r.msg ?? ''}`, intentos })
        continue
      }
      await db.syncQueue.update(op.id, { intentos })
      break // probablemente sin red; cortar el ciclo y reintentar en el proximo
    }
    estado = { ...estado, ultimaSync: new Date().toISOString() }
  } finally {
    procesando = false
    await refreshPendientes()
  }
}

type EmpujeResultado = { estado: 'ok' | 'retry' | 'fatal'; msg?: string }
const OK_EMPUJE: EmpujeResultado = { estado: 'ok' }
// Traduce un error de Supabase a resultado clasificado (retry vs fatal).
function fallo(contexto: string, msg: string): EmpujeResultado {
  return { estado: clasificarErrorSync(msg), msg: `${contexto}: ${msg}` }
}

// Empuja una operacion al backend (con mapeo camelCase -> snake_case).
// v1.18: devuelve 'ok' | 'retry' (transitorio) | 'fatal' (definitivo). NUNCA
// bloquea la cola: quien llama decide descartar la op fatal y seguir.
// En modo demo (sin .env) confirma localmente.
async function empujar(op: SyncOp): Promise<EmpujeResultado> {
  if (!BACKEND_ACTIVO || !supabase) return OK_EMPUJE // modo demo: nada que enviar
  try {
    // Borrado fisico (solo gestion, via RLS). La tabla de cada entidad.
    if (op.tipo === 'delete') {
      const tabla = op.entidad === 'tarea' ? 'tareas'
        : op.entidad === 'orden' ? 'ordenes'
        : op.entidad === 'semielaborado' ? 'semielaborados'
        : op.entidad === 'objetivo' ? 'objetivos'
        : op.entidad === 'tarea_logistica' ? 'tareas_logistica'
        : op.entidad === 'solicitud_logistica' ? 'solicitudes_logistica'
        : op.entidad === 'feriado' ? 'feriados'
        : op.entidad === 'mensaje' ? 'mensajes'
        : op.entidad === 'mensaje_lectura' ? 'mensajes_lectura'
        : op.entidad === 'estandar' ? 'tiempos_estandar'
        : op.entidad === 'despacho' ? 'despachos'
        : op.entidad === 'flete' ? 'fletes_internos'
        : op.entidad === 'laboratorio' ? 'laboratorio'
        : 'paradas'
      const { error } = await supabase.from(tabla).delete().eq('id', op.entidadId)
      if (error) return fallo(`delete ${op.entidad}`, error.message)
      return OK_EMPUJE
    }
    switch (op.entidad) {
      case 'tarea': {
        const t = op.payload as Tarea
        const row = tareaToRow(t)
        // Por RLS, el operario solo puede UPDATE (no INSERT). Intentamos update
        // primero; si no existia la fila (gestion creando), recien ahi insert.
        const upd = await supabase.from('tareas').update(row).eq('id', t.id).select('id')
        if (upd.error) return fallo('update tarea', upd.error.message)
        if (!upd.data || upd.data.length === 0) {
          const ins = await supabase.from('tareas').insert(row)
          if (ins.error) return fallo('insert tarea', ins.error.message)
        }
        // Las paradas de la tarea van a su propia tabla.
        if (t.paradas?.length) {
          const { error: ep } = await supabase
            .from('paradas')
            .upsert(t.paradas.map(paradaToRow), { onConflict: 'id' })
          if (ep) return fallo('upsert paradas', ep.message)
        }
        return OK_EMPUJE
      }
      case 'orden': {
        const { error } = await supabase.from('ordenes').upsert(ordenToRow(op.payload as OrdenProduccion), { onConflict: 'id' })
        return error ? fallo('upsert orden', error.message) : OK_EMPUJE
      }
      case 'semielaborado': {
        const { error } = await supabase.from('semielaborados').upsert(semiToRow(op.payload as Semielaborado), { onConflict: 'id' })
        return error ? fallo('upsert semielaborado', error.message) : OK_EMPUJE
      }
      case 'parada': {
        const { error } = await supabase.from('paradas').upsert(paradaToRow(op.payload as Parameters<typeof paradaToRow>[0]), { onConflict: 'id' })
        return error ? fallo('upsert parada', error.message) : OK_EMPUJE
      }
      case 'objetivo': {
        const { error } = await supabase.from('objetivos').upsert(objetivoToRow(op.payload as Objetivo), { onConflict: 'id' })
        return error ? fallo('upsert objetivo', error.message) : OK_EMPUJE
      }
      case 'estandar': {
        const { error } = await supabase.from('tiempos_estandar').upsert(estandarToRow(op.payload as TiempoEstandar), { onConflict: 'id' })
        return error ? fallo('upsert estandar', error.message) : OK_EMPUJE
      }
      case 'despacho': {
        const { error } = await supabase.from('despachos').upsert(despachoToRow(op.payload as DespachoTrafo), { onConflict: 'id' })
        return error ? fallo('upsert despacho', error.message) : OK_EMPUJE
      }
      case 'flete': {
        const { error } = await supabase.from('fletes_internos').upsert(fleteToRow(op.payload as FleteInterno), { onConflict: 'id' })
        return error ? fallo('upsert flete', error.message) : OK_EMPUJE
      }
      case 'laboratorio': {
        const { error } = await supabase.from('laboratorio').upsert(laboratorioToRow(op.payload as TareaLaboratorio), { onConflict: 'id' })
        return error ? fallo('upsert laboratorio', error.message) : OK_EMPUJE
      }
      case 'tarea_logistica': {
        const { error } = await supabase.from('tareas_logistica').upsert(tareaLogToRow(op.payload as TareaLogistica), { onConflict: 'id' })
        return error ? fallo('upsert tarea_logistica', error.message) : OK_EMPUJE
      }
      case 'feriado': {
        const { error } = await supabase.from('feriados').upsert(feriadoToRow(op.payload as Feriado), { onConflict: 'id' })
        return error ? fallo('upsert feriado', error.message) : OK_EMPUJE
      }
      case 'mensaje': {
        const { error } = await supabase.from('mensajes').upsert(mensajeToRow(op.payload as Mensaje), { onConflict: 'id' })
        return error ? fallo('upsert mensaje', error.message) : OK_EMPUJE
      }
      case 'mensaje_lectura': {
        const { error } = await supabase.from('mensajes_lectura').upsert(lecturaToRow(op.payload as MensajeLectura), { onConflict: 'id' })
        return error ? fallo('upsert mensaje_lectura', error.message) : OK_EMPUJE
      }
      default:
        return OK_EMPUJE
    }
  } catch (e) {
    // Excepcion (tipicamente red): transitorio -> reintentar luego.
    const msg = e instanceof Error ? e.message : String(e)
    return { estado: esErrorDeRed(e) ? 'retry' : 'fatal', msg: `excepcion: ${msg}` }
  }
}

// ============================================================
// v1.18: ESCAPE HATCH — purgar / reintentar la cola de sync (para PC trabada).
// ============================================================
// Borra TODA la cola local pendiente (descarta cambios no subidos). Uso de
// emergencia cuando la cola quedo trabada; devuelve cuantas ops se purgaron.
export async function purgarColaSync(): Promise<number> {
  const ops = await db.syncQueue.filter((op) => !op.sincronizado).toArray()
  await db.syncQueue.clear()
  await refreshPendientes()
  return ops.length
}
// Reintenta las ops descartadas por error (limpia el flag para reprocesarlas).
export async function reintentarErroresSync(): Promise<number> {
  const errs = await db.syncQueue.filter((op) => !!op.errorSync).toArray()
  for (const op of errs) await db.syncQueue.update(op.id, { errorSync: undefined, intentos: 0 })
  await refreshPendientes()
  void procesarCola()
  return errs.length
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

// Borra una orden (error de carga). Quien llama valida que NO tenga tareas.
export async function eliminarOrden(o: OrdenProduccion): Promise<void> {
  await db.ordenes.delete(o.id)
  await encolar({ entidad: 'orden', entidadId: o.id, tipo: 'delete', payload: { id: o.id } })
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

// v1.24: tiempo estandar dinamico (asistente de mejora continua).
export async function guardarEstandar(e: TiempoEstandar): Promise<void> {
  await db.estandares.put(e)
  await encolar({ entidad: 'estandar', entidadId: e.id, tipo: 'upsert', payload: e })
}

// v1.27: despacho y embalaje (sector Melany).
export async function guardarDespacho(d: DespachoTrafo): Promise<void> {
  await db.despachos.put(d)
  await encolar({ entidad: 'despacho', entidadId: d.id, tipo: 'upsert', payload: d })
}
export async function eliminarDespacho(d: DespachoTrafo): Promise<void> {
  await db.despachos.delete(d.id)
  await encolar({ entidad: 'despacho', entidadId: d.id, tipo: 'delete', payload: d })
}

// v1.28: fletes / viajes internos (costos de flete).
export async function guardarFlete(f: FleteInterno): Promise<void> {
  await db.fletes.put(f)
  await encolar({ entidad: 'flete', entidadId: f.id, tipo: 'upsert', payload: f })
}
export async function eliminarFlete(f: FleteInterno): Promise<void> {
  await db.fletes.delete(f.id)
  await encolar({ entidad: 'flete', entidadId: f.id, tipo: 'delete', payload: f })
}

// v1.37: laboratorio (cola de ensayos).
export async function guardarLaboratorio(t: TareaLaboratorio): Promise<void> {
  await db.laboratorio.put(t)
  await encolar({ entidad: 'laboratorio', entidadId: t.id, tipo: 'upsert', payload: t })
}
export async function eliminarLaboratorio(t: TareaLaboratorio): Promise<void> {
  await db.laboratorio.delete(t.id)
  await encolar({ entidad: 'laboratorio', entidadId: t.id, tipo: 'delete', payload: t })
}

// v1.17: feriados / dias no laborables (los carga el planificador).
export async function guardarFeriado(f: Feriado): Promise<void> {
  await db.feriados.put(f)
  await recargarFeriadosCalendario()
  await encolar({ entidad: 'feriado', entidadId: f.id, tipo: 'upsert', payload: f })
}
export async function eliminarFeriado(id: string): Promise<void> {
  await db.feriados.delete(id)
  await recargarFeriadosCalendario()
  await encolar({ entidad: 'feriado', entidadId: id, tipo: 'delete', payload: { id } })
}

// v1.12: tareas logisticas (organizador de abastecimiento).
export async function guardarTareaLogistica(t: TareaLogistica): Promise<void> {
  await db.tareasLogistica.put(t)
  await encolar({ entidad: 'tarea_logistica', entidadId: t.id, tipo: 'upsert', payload: t })
}
export async function eliminarTareaLogistica(t: TareaLogistica): Promise<void> {
  await db.tareasLogistica.delete(t.id)
  await encolar({ entidad: 'tarea_logistica', entidadId: t.id, tipo: 'delete', payload: { id: t.id } })
}

// v1.13: solicitud logistica (cola de material). id = parada.id.
export async function guardarSolicitudLogistica(s: SolicitudLogistica): Promise<void> {
  await db.solicitudesLogistica.put(s)
  await encolar({ entidad: 'solicitud_logistica', entidadId: s.id, tipo: 'upsert', payload: s })
}

// v1.18: mensajes (planificador -> colaborador) + acuse de lectura.
export async function guardarMensaje(m: Mensaje): Promise<void> {
  await db.mensajes.put(m)
  await encolar({ entidad: 'mensaje', entidadId: m.id, tipo: 'upsert', payload: m })
}
export async function eliminarMensaje(id: string): Promise<void> {
  await db.mensajes.delete(id)
  await encolar({ entidad: 'mensaje', entidadId: id, tipo: 'delete', payload: { id } })
}
// Marca un mensaje como leido por un usuario (idempotente por id = mensaje_usuario).
export async function marcarMensajeLeido(mensajeId: string, usuarioId: string): Promise<void> {
  const id = `${mensajeId}_${usuarioId}`
  if (await db.mensajesLectura.get(id)) return // ya estaba leido
  const l: MensajeLectura = { id, mensajeId, usuarioId, leidoEn: new Date().toISOString() }
  await db.mensajesLectura.put(l)
  await encolar({ entidad: 'mensaje_lectura', entidadId: id, tipo: 'upsert', payload: l })
}

// Auto-disparo al recuperar conexion.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { estado = { ...estado, online: true }; emit(); void procesarCola() })
  window.addEventListener('offline', () => { estado = { ...estado, online: false }; emit() })
  void refreshPendientes()
  setInterval(() => void procesarCola(), 30000) // reintento periodico
}
