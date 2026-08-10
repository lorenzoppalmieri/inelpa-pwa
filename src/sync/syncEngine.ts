import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { db } from '../db/dexie'
import { supabase, SUPABASE_HABILITADO } from '../lib/supabaseClient'
import { traerTabla, traerTodoDe, type ConsultaPaginable } from '../lib/supabaseFetch'
import type { Rol, SyncOp, Tarea, Parada, OrdenProduccion, Semielaborado, SectorId, Objetivo, TareaLogistica, SolicitudLogistica, Feriado, Mensaje, MensajeLectura, TiempoEstandar, DespachoTrafo, FleteInterno, TareaLaboratorio, PlantillaRecurrente } from '../types'
import type { EventoSGO, AccionSGO, AuditoriaSGO } from '../sgo/types'
import type { IndicadorSGO, MedicionIndicadorSGO } from '../sgo/indicadores'
import type { GarantiaISO } from '../sgo/garantias'
import type { ControlProgramadoSGO, EjecucionControlSGO } from '../sgo/controles'
import { setFeriados } from '../lib/calendario'
import { procesarColaAvisosMant } from '../mantenimiento/avisos'
import { exigirPermisoBorradoSGO } from '../sgo/permisos'
import {
  tareaFromRow, paradaFromRow, ordenFromRow, semiFromRow, maquinaFromRow, usuarioFromRow, objetivoFromRow, tareaLogFromRow, solicitudLogFromRow, feriadoFromRow, mensajeFromRow, lecturaFromRow, estandarFromRow, despachoFromRow, fleteFromRow, laboratorioFromRow, plantillaFromRow, eventoSGOFromRow, accionSGOFromRow, indicadorSGOFromRow, medicionIndicadorSGOFromRow, auditoriaSGOFromRow, garantiaISOFromRow, controlProgramadoSGOFromRow, ejecucionControlSGOFromRow,
  tareaToRow, paradaToRow, ordenToRow, semiToRow, objetivoToRow, tareaLogToRow, solicitudLogToRow, feriadoToRow, mensajeToRow, lecturaToRow, estandarToRow, despachoToRow, fleteToRow, laboratorioToRow, plantillaToRow, eventoSGOToRow, accionSGOToRow, indicadorSGOToRow, medicionIndicadorSGOToRow, garantiaISOToRow, controlProgramadoSGOToRow, ejecucionControlSGOToRow,
  type TareaRow, type ParadaRow, type OrdenRow, type SemiRow, type MaquinaRow, type UsuarioRow, type ObjetivoRow, type TareaLogisticaRow, type SolicitudLogisticaRow, type FeriadoRow, type MensajeRow, type MensajeLecturaRow, type TiempoEstandarRow, type DespachoRow, type FleteRow, type LaboratorioRow, type PlantillaRecurrenteRow, type EventoSGORow, type AccionSGORow, type IndicadorSGORow, type MedicionIndicadorSGORow, type AuditoriaSGORow, type GarantiaISORow, type ControlProgramadoSGORow, type EjecucionControlSGORow,
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

// Clasifica un error de sync (v1.71).
//   'red'   -> no se llegó al servidor. NO cuenta como intento: el trabajo del
//              operario NUNCA se descarta por falta de señal.
//   'retry' -> se llegó al servidor pero falló algo transitorio (sesión, 5xx,
//              429) o una clave foránea: el "padre" puede llegar después, así
//              que se reintenta.
//   'fatal' -> definitivo (RLS, columna inexistente, dato inválido). Reintentar
//              el mismo payload nunca va a funcionar.
export type ClaseError = 'red' | 'retry' | 'fatal'

const RX_RED = /failed to fetch|networkerror|network request failed|load failed|err_internet|err_network|err_connection|timeout|aborted|socket/i
const RX_TRANSITORIO = /jwt|token|expired|refresh|temporarily|503|502|504|500|429|rate limit|conflict|deadlock/i
// Clave foránea: la fila padre todavía no llegó (ej. la parada antes que su
// tarea). Es transitorio por definición: hay que esperar y reintentar.
const RX_FK = /foreign key|violates foreign key constraint|23503/i

function clasificarErrorSync(msg: string): ClaseError {
  if (RX_RED.test(msg)) return 'red'
  if (RX_FK.test(msg) || RX_TRANSITORIO.test(msg)) return 'retry'
  return 'fatal'
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
// La paginación vive en lib/supabaseFetch.ts para que TODOS los módulos usen la
// misma (mantenimiento, SGO, laboratorio...). Ver el porqué en ese archivo.
async function traerTodo<T>(tabla: string): Promise<{ data: T[] | null }> {
  return { data: await traerTabla<T>(tabla) }
}

// ============================================================
// VENTANA DE SINCRONIZACIÓN (v1.72)
//
// PROBLEMA A FUTURO: cada tablet espeja TODAS las tareas y paradas de la
// historia. Con 2000 transformadores/año eso crece sin techo y un día la tablet
// tarda demasiado en abrir.
//
// SOLUCIÓN: la TABLET del operario solo necesita su trabajo reciente. Se le
// traen las tareas de los últimos 90 días MÁS todas las que sigan abiertas sin
// importar la antigüedad (una tarea pendiente de hace 6 meses tiene que
// aparecer igual). El resto de los roles —planificación, gerencia, logística,
// despacho, laboratorio— siguen bajando TODO, porque sus tableros comparan
// contra el mes anterior y el acumulado anual.
//
// Si `ventanaDias` es null el comportamiento es EXACTAMENTE el de antes.
// ============================================================
const VENTANA_OPERARIO_DIAS = 90

export function ventanaDiasPara(rol?: Rol): number | null {
  return rol === 'operario' ? VENTANA_OPERARIO_DIAS : null
}

/** Paradas de un conjunto de tareas, pedidas de a tandas para no armar una URL
 *  gigante. Se traen POR ID (no por fecha) para no perder nunca la parada de una
 *  tarea vieja que sigue abierta. */
async function traerParadasDe(ids: string[]): Promise<ParadaRow[]> {
  if (!supabase || ids.length === 0) return []
  const sb = supabase
  const TANDA = 200
  const out: ParadaRow[] = []
  for (let i = 0; i < ids.length; i += TANDA) {
    const lote = ids.slice(i, i + TANDA)
    const filas = await traerTodoDe<ParadaRow>('paradas', () =>
      sb.from('paradas').select('*').in('tarea_id', lote).order('id') as unknown as ConsultaPaginable<ParadaRow>)
    out.push(...filas)
  }
  return out
}

export async function fetchInicial(rol?: Rol): Promise<void> {
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
      db.plantillasRecurrentes.clear(), db.datosTecnicos.clear(),
    ])

    // ---- TAREAS + PARADAS (las únicas que se acotan por ventana) ----
    // Se piden aparte porque las paradas dependen de qué tareas se trajeron.
    const dias = ventanaDiasPara(rol)
    const sb = supabase
    let tareasRows: TareaRow[]
    if (dias == null) {
      tareasRows = await traerTabla<TareaRow>('tareas')          // igual que siempre
    } else {
      // Tablet: últimos N días + TODO lo que siga abierto (sin importar antigüedad).
      const corte = new Date(Date.now() - dias * 86400000).toISOString()
      tareasRows = await traerTodoDe<TareaRow>('tareas', () =>
        sb.from('tareas').select('*')
          .or(`estado.neq.finalizada,inicio_real.gte.${corte},inicio_planificado.gte.${corte}`)
          .order('id') as unknown as ConsultaPaginable<TareaRow>)
    }
    // Las paradas se traen POR ID DE TAREA: así nunca se pierde la parada de una
    // tarea vieja que sigue abierta (fue la causa del bug de "justificada = 0").
    const paradasRows = dias == null
      ? await traerTabla<ParadaRow>('paradas')
      : await traerParadasDe(tareasRows.map((t) => t.id))

    const [maqs, usrs, uss, ords, semis, objs, tlog, slog, fers, msgs, lects, ests, desp, flts, labs, plts, eventosSgo, accionesSgo, indicadoresSgo, medicionesSgo, auditoriaSgo, garantiasIso, controlesSgo, ejecucionesSgo, dtec] = await Promise.all([
      traerTodo('maquinas'),
      supabase.from('usuarios').select('id, nombre, usuario, rol, grupo_nomina, activo'),
      supabase.from('usuario_sectores').select('usuario_id, sector_id'),
      traerTodo('ordenes'),
      traerTodo('semielaborados'),
      traerTodo('objetivos'),
      traerTodo('tareas_logistica'),
      traerTodo('solicitudes_logistica'),
      traerTodo('feriados'),
      traerTodo('mensajes'),
      traerTodo('mensajes_lectura'),
      traerTodo('tiempos_estandar'),
      traerTodo('despachos'),
      traerTodo('fletes_internos'),
      traerTodo('laboratorio'),
      traerTodo('plantillas_recurrentes'),
      traerTodo('sgo_eventos'),
      traerTodo('sgo_acciones'),
      traerTodo('sgo_indicadores'),
      traerTodo('sgo_indicador_mediciones'),
      supabase.from('sgo_auditoria').select('*').order('creado_en', { ascending: false }).limit(1000),
      traerTodo('sgo_garantias_iso'),
      traerTodo('sgo_controles_programados'),
      supabase.from('sgo_control_ejecuciones').select('*').order('ejecutado_en', { ascending: false }).limit(2000),
      traerTodo('datos_tecnicos'),
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

    // Plantillas de tareas recurrentes
    if (plts.data) await db.plantillasRecurrentes.bulkPut((plts.data as PlantillaRecurrenteRow[]).map(plantillaFromRow))

    // v1.49: maestro de datos técnicos (solo lectura; la app nunca lo escribe).
    // Se guarda tal cual viene: los encabezados los define la planilla migrada.
    // Si la tabla todavía no existe en Supabase, `error` viene seteado y se ignora.
    if (dtec.data) {
      const filas = (dtec.data as Record<string, unknown>[]).map((f, i) => ({
        ...f,
        id: String(f.id ?? f.ID ?? f.modelo ?? f.MODELO ?? i),
      }))
      await db.datosTecnicos.bulkPut(filas)
    }

    // Las tablas SGO se reemplazan solamente cuando su consulta respondió bien.
    // Así una migración faltante o un error de RLS no borra el espejo offline.
    if (eventosSgo.data) { await db.eventosSGO.clear(); await db.eventosSGO.bulkPut((eventosSgo.data as EventoSGORow[]).map(eventoSGOFromRow)) }
    if (accionesSgo.data) { await db.accionesSGO.clear(); await db.accionesSGO.bulkPut((accionesSgo.data as AccionSGORow[]).map(accionSGOFromRow)) }
    if (indicadoresSgo.data) { await db.indicadoresSGO.clear(); await db.indicadoresSGO.bulkPut((indicadoresSgo.data as IndicadorSGORow[]).map(indicadorSGOFromRow)) }
    if (medicionesSgo.data) { await db.medicionesIndicadoresSGO.clear(); await db.medicionesIndicadoresSGO.bulkPut((medicionesSgo.data as MedicionIndicadorSGORow[]).map(medicionIndicadorSGOFromRow)) }
    if (auditoriaSgo.data) { await db.auditoriaSGO.clear(); await db.auditoriaSGO.bulkPut((auditoriaSgo.data as AuditoriaSGORow[]).map(auditoriaSGOFromRow)) }
    if (garantiasIso.data) { await db.garantiasISO.clear(); await db.garantiasISO.bulkPut((garantiasIso.data as GarantiaISORow[]).map(garantiaISOFromRow)) }
    if (controlesSgo.data) { await db.controlesProgramadosSGO.clear(); await db.controlesProgramadosSGO.bulkPut((controlesSgo.data as ControlProgramadoSGORow[]).map(controlProgramadoSGOFromRow)) }
    if (ejecucionesSgo.data) { await db.ejecucionesControlesSGO.clear(); await db.ejecucionesControlesSGO.bulkPut((ejecucionesSgo.data as EjecucionControlSGORow[]).map(ejecucionControlSGOFromRow)) }

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
    {
      const porTarea = new Map<string, ReturnType<typeof paradaFromRow>[]>()
      for (const pr of paradasRows) {
        const p = paradaFromRow(pr)
        const arr = porTarea.get(p.tareaId) ?? []
        arr.push(p)
        porTarea.set(p.tareaId, arr)
      }
      await db.tareas.bulkPut(
        tareasRows.map((r) => tareaFromRow(r, porTarea.get(r.id) ?? [])),
      )
      console.info(`[sync] ${tareasRows.length} tarea(s) y ${paradasRows.length} parada(s)` +
        (dias == null ? ' (histórico completo)' : ` (últimos ${dias} días + abiertas)`))
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

/** ¿Hay operaciones NUESTRAS todavía sin subir para esta tarea? Si las hay, el
 *  espejo local va ADELANTE de la nube y no hay que repescar nada: pisaríamos
 *  trabajo del operario que aún no viajó. (entidadId no está indexado, pero la
 *  cola se purga a las 24h y es chica.) */
async function tienePendientesDe(tareaId: string): Promise<boolean> {
  const ops = await db.syncQueue.filter((o) => !o.sincronizado && o.entidadId === tareaId).count()
  return ops > 0
}

/** Paradas frescas de UNA tarea, directo de Supabase. Devuelve null si no se
 *  pudo (sin red / error): en ese caso conservamos lo local y no rompemos nada. */
async function repescarParadas(tareaId: string): Promise<Parada[] | null> {
  if (!supabase || !navigator.onLine) return null
  const { data, error } = await supabase.from('paradas').select('*').eq('tarea_id', tareaId)
  if (error || !data) return null
  return (data as unknown as ParadaRow[]).map(paradaFromRow)
}

async function onTareaChange(payload: Payload) {
  if (payload.eventType === 'DELETE') {
    await db.tareas.delete((payload.old as { id: string }).id)
    return
  }
  const row = payload.new as unknown as TareaRow
  const existente = await db.tareas.get(row.id)
  let paradas = existente?.paradas ?? []

  // v1.77 — RECONCILIACION. Esta función mezcla dos fuentes: el ESTADO viene de
  // la nube (row) y las PARADAS del espejo local. Mientras lleguen todos los
  // eventos realtime de `paradas` coinciden, pero si se pierde uno (pestaña en
  // segundo plano, corte de Wi-Fi, o la tabla `paradas` sin publicar en
  // realtime) las dos fuentes quedan contradiciéndose PARA SIEMPRE: la tarea
  // figura 'pausada' y localmente no hay ninguna parada abierta que cerrar.
  // Eso dejaba el botón "Reanudar" muerto en la tablet del operario.
  //
  // Detectamos la contradicción y pedimos las paradas de ESA tarea (una query
  // por id, no un re-sync). Si no hay red, se conserva lo local: offline sigue
  // funcionando igual que antes.
  const hayAbiertaLocal = paradas.some((p) => !p.fin)
  const deberiaHaberAbierta = row.estado === 'pausada'
  if (hayAbiertaLocal !== deberiaHaberAbierta && !(await tienePendientesDe(row.id))) {
    const frescas = await repescarParadas(row.id)
    if (frescas) paradas = frescas
  }

  await db.tareas.put(tareaFromRow(row, paradas))
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
async function onPlantillaChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.plantillasRecurrentes.delete((payload.old as { id: string }).id); return }
  await db.plantillasRecurrentes.put(plantillaFromRow(payload.new as unknown as PlantillaRecurrenteRow))
}
async function onEventoSGOChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.eventosSGO.delete((payload.old as { id: string }).id); return }
  await db.eventosSGO.put(eventoSGOFromRow(payload.new as unknown as EventoSGORow))
}
async function onAccionSGOChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.accionesSGO.delete((payload.old as { id: string }).id); return }
  await db.accionesSGO.put(accionSGOFromRow(payload.new as unknown as AccionSGORow))
}
async function onIndicadorSGOChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.indicadoresSGO.delete((payload.old as { id: string }).id); return }
  await db.indicadoresSGO.put(indicadorSGOFromRow(payload.new as unknown as IndicadorSGORow))
}
async function onMedicionIndicadorSGOChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.medicionesIndicadoresSGO.delete((payload.old as { id: string }).id); return }
  await db.medicionesIndicadoresSGO.put(medicionIndicadorSGOFromRow(payload.new as unknown as MedicionIndicadorSGORow))
}
async function onAuditoriaSGOChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.auditoriaSGO.delete((payload.old as { id: string }).id); return }
  await db.auditoriaSGO.put(auditoriaSGOFromRow(payload.new as unknown as AuditoriaSGORow))
}
async function onGarantiaISOChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.garantiasISO.delete((payload.old as { id: string }).id); return }
  await db.garantiasISO.put(garantiaISOFromRow(payload.new as unknown as GarantiaISORow))
}
async function onControlProgramadoSGOChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.controlesProgramadosSGO.delete((payload.old as { id: string }).id); return }
  await db.controlesProgramadosSGO.put(controlProgramadoSGOFromRow(payload.new as unknown as ControlProgramadoSGORow))
}
async function onEjecucionControlSGOChange(payload: Payload) {
  if (payload.eventType === 'DELETE') { await db.ejecucionesControlesSGO.delete((payload.old as { id: string }).id); return }
  await db.ejecucionesControlesSGO.put(ejecucionControlSGOFromRow(payload.new as unknown as EjecucionControlSGORow))
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'plantillas_recurrentes' }, onPlantillaChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sgo_eventos' }, onEventoSGOChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sgo_acciones' }, onAccionSGOChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sgo_indicadores' }, onIndicadorSGOChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sgo_indicador_mediciones' }, onMedicionIndicadorSGOChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sgo_auditoria' }, onAuditoriaSGOChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sgo_garantias_iso' }, onGarantiaISOChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sgo_controles_programados' }, onControlProgramadoSGOChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sgo_control_ejecuciones' }, onEjecucionControlSGOChange)
    .subscribe()
}

// Arranca la sincronizacion al haber sesion (lo llama AuthContext).
// Idempotente: ignora llamadas repetidas (ej. refresh de token) si ya esta activa.
let syncActiva = false
export async function iniciarSync(rol?: Rol): Promise<void> {
  if (!BACKEND_ACTIVO || syncActiva) return
  syncActiva = true
  await fetchInicial(rol)
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

// v1.71: los reintentos SOLO cuentan cuando se llegó al servidor. Un corte de
// Wi-Fi puede durar horas y no debe costar ni una operación.
const MAX_INTENTOS = 25
// Cada cuánto se limpian las operaciones ya subidas (la cola crecía sin fin).
const RETENCION_OK_MS = 24 * 3600 * 1000

let procesando = false

/** Ordena la cola CRONOLÓGICAMENTE. Es imprescindible: el id es un UUID
 *  aleatorio, así que sin esto las operaciones se subían en orden arbitrario y
 *  una parada podía llegar antes que su tarea (violación de clave foránea). */
function porFecha(a: SyncOp, b: SyncOp): number {
  return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0
}

export async function procesarCola(): Promise<void> {
  if (procesando) return
  procesando = true
  try {
    if (!navigator.onLine) return          // sin red: se reintenta solo más tarde

    // v1.18: renovar/validar la sesion ANTES de vaciar la cola. Si esta vencida y
    // no se puede renovar, se pausa (no se loopea) y se pide re-login via estado.
    if (!(await asegurarSesion())) {
      estado = { ...estado, sesionInvalida: true }; emit()
      return
    }
    if (estado.sesionInvalida) { estado = { ...estado, sesionInvalida: false }; emit() }

    // Solo ops sin sincronizar y sin error definitivo, EN ORDEN DE CREACIÓN.
    const pend = (await db.syncQueue.filter((op) => !op.sincronizado && !op.errorSync).toArray())
      .sort(porFecha)

    for (const op of pend) {
      const r = await empujar(op)
      if (r.estado === 'ok') {
        await db.syncQueue.update(op.id, { sincronizado: true })
        continue
      }

      if (r.estado === 'red') {
        // No se llegó al servidor. NO se incrementa el contador: cortamos y
        // reintentamos entero en el próximo ciclo, cuando vuelva la señal.
        console.warn(`[sync] sin conexión al subir ${op.entidad}/${op.entidadId}. Queda en cola.`)
        break
      }

      const intentos = (op.intentos ?? 0) + 1
      if (r.estado === 'fatal') {
        console.error(`[sync] ⛔ DESCARTADA ${op.entidad}/${op.entidadId} (${op.tipo}) — error definitivo: ${r.msg}`, op.payload)
        await db.syncQueue.update(op.id, { errorSync: r.msg ?? 'error definitivo', intentos })
        continue
      }
      // Transitorio (sesión, 5xx, clave foránea): se reintenta muchas veces antes
      // de rendirse. La clave foránea se resuelve sola cuando sube la fila padre.
      if (intentos >= MAX_INTENTOS) {
        console.error(`[sync] ⛔ DESCARTADA ${op.entidad}/${op.entidadId} — ${intentos} intentos: ${r.msg}`, op.payload)
        await db.syncQueue.update(op.id, { errorSync: `reintentos agotados: ${r.msg ?? ''}`, intentos })
        continue
      }
      await db.syncQueue.update(op.id, { intentos })
      // Se sigue con las demás: una op trabada no debe frenar a las que sí pueden subir.
    }

    // v1.66: misma pasada para la cola offline de avisos de mantenimiento
    // (online garantizado aqui; la funcion tiene su propio guard y nunca lanza).
    await procesarColaAvisosMant()
    await limpiarColaVieja()
    estado = { ...estado, ultimaSync: new Date().toISOString() }
  } finally {
    procesando = false
    await refreshPendientes()
  }
}

/** Borra las operaciones ya subidas hace más de un día. Antes la cola crecía
 *  para siempre y cada ciclo tenía que recorrerla entera. */
async function limpiarColaVieja(): Promise<void> {
  const limite = new Date(Date.now() - RETENCION_OK_MS).toISOString()
  const viejas = await db.syncQueue.filter((op) => !!op.sincronizado && op.ts < limite).toArray()
  if (viejas.length) await db.syncQueue.bulkDelete(viejas.map((o) => o.id))
}

type EmpujeResultado = { estado: 'ok' | 'red' | 'retry' | 'fatal'; msg?: string }
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
      if (op.entidad === 'indicador_sgo') {
        const { data, error } = await supabase.from('sgo_indicadores').delete().eq('id', op.entidadId).select('id')
        if (error) return fallo('delete indicador_sgo', error.message)
        if (!data?.length) return fallo('delete indicador_sgo', 'Supabase no eliminó el KPI. Verificar permiso exclusivo de Lorenzo y migración SGO v1.69.')
        return OK_EMPUJE
      }
      if (op.entidad === 'evento_sgo') {
        const { data, error } = await supabase.from('sgo_eventos').delete().eq('id', op.entidadId).select('id')
        if (error) return fallo('delete evento_sgo', error.message)
        if (!data?.length) return fallo('delete evento_sgo', 'Supabase no eliminó el evento. Verificar permiso exclusivo de Lorenzo y migración SGO v1.69.')
        return OK_EMPUJE
      }
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
        : op.entidad === 'plantilla_recurrente' ? 'plantillas_recurrentes'
        : op.entidad === 'accion_sgo' ? 'sgo_acciones'
        : op.entidad === 'medicion_indicador_sgo' ? 'sgo_indicador_mediciones'
        : op.entidad === 'garantia_iso' ? 'sgo_garantias_iso'
        : op.entidad === 'control_programado_sgo' ? 'sgo_controles_programados'
        : op.entidad === 'ejecucion_control_sgo' ? 'sgo_control_ejecuciones'
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
      case 'plantilla_recurrente': {
        const { error } = await supabase.from('plantillas_recurrentes').upsert(plantillaToRow(op.payload as PlantillaRecurrente), { onConflict: 'id' })
        return error ? fallo('upsert plantilla', error.message) : OK_EMPUJE
      }
      case 'evento_sgo': {
        const { error } = await supabase.from('sgo_eventos').upsert(eventoSGOToRow(op.payload as EventoSGO), { onConflict: 'id' })
        return error ? fallo('upsert evento_sgo', error.message) : OK_EMPUJE
      }
      case 'accion_sgo': {
        const { error } = await supabase.from('sgo_acciones').upsert(accionSGOToRow(op.payload as AccionSGO), { onConflict: 'id' })
        return error ? fallo('upsert accion_sgo', error.message) : OK_EMPUJE
      }
      case 'indicador_sgo': {
        const { error } = await supabase.from('sgo_indicadores').upsert(indicadorSGOToRow(op.payload as IndicadorSGO), { onConflict: 'id' })
        return error ? fallo('upsert indicador_sgo', error.message) : OK_EMPUJE
      }
      case 'medicion_indicador_sgo': {
        const { error } = await supabase.from('sgo_indicador_mediciones').upsert(medicionIndicadorSGOToRow(op.payload as MedicionIndicadorSGO), { onConflict: 'id' })
        return error ? fallo('upsert medicion_indicador_sgo', error.message) : OK_EMPUJE
      }
      case 'garantia_iso': {
        const { error } = await supabase.from('sgo_garantias_iso').upsert(garantiaISOToRow(op.payload as GarantiaISO), { onConflict: 'id' })
        return error ? fallo('upsert garantia_iso', error.message) : OK_EMPUJE
      }
      case 'control_programado_sgo': {
        const { error } = await supabase.from('sgo_controles_programados').upsert(controlProgramadoSGOToRow(op.payload as ControlProgramadoSGO), { onConflict: 'id' })
        return error ? fallo('upsert control_programado_sgo', error.message) : OK_EMPUJE
      }
      case 'ejecucion_control_sgo': {
        const { error } = await supabase.from('sgo_control_ejecuciones').upsert(ejecucionControlSGOToRow(op.payload as EjecucionControlSGO), { onConflict: 'id', ignoreDuplicates: true })
        return error ? fallo('upsert ejecucion_control_sgo', error.message) : OK_EMPUJE
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
    // Excepción (típicamente red). v1.71: si fue de red se marca como 'red' para
    // que NO consuma un intento — un corte largo no puede costar trabajo cargado.
    const msg = e instanceof Error ? e.message : String(e)
    return { estado: esErrorDeRed(e) ? 'red' : clasificarErrorSync(msg), msg: `excepcion: ${msg}` }
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

export async function guardarEventoSGO(e: EventoSGO): Promise<void> {
  await db.eventosSGO.put(e)
  await encolar({ entidad: 'evento_sgo', entidadId: e.id, tipo: 'upsert', payload: e })
}

export async function eliminarEventoSGO(e: EventoSGO, usuario: string): Promise<void> {
  exigirPermisoBorradoSGO(usuario)
  await db.transaction('rw', db.eventosSGO, db.accionesSGO, db.garantiasISO, db.ejecucionesControlesSGO, async () => {
    await db.accionesSGO.where('eventoId').equals(e.id).delete()
    await db.garantiasISO.where('eventoId').equals(e.id).modify((garantia) => { delete garantia.eventoId })
    await db.ejecucionesControlesSGO.where('eventoId').equals(e.id).modify((ejecucion) => { delete ejecucion.eventoId })
    await db.eventosSGO.delete(e.id)
  })
  await encolar({ entidad: 'evento_sgo', entidadId: e.id, tipo: 'delete', payload: { id: e.id } })
}

export async function guardarAccionSGO(a: AccionSGO): Promise<void> {
  await db.accionesSGO.put(a)
  await encolar({ entidad: 'accion_sgo', entidadId: a.id, tipo: 'upsert', payload: a })
}

export async function guardarIndicadorSGO(i: IndicadorSGO): Promise<void> {
  await db.indicadoresSGO.put(i)
  await encolar({ entidad: 'indicador_sgo', entidadId: i.id, tipo: 'upsert', payload: i })
}
export async function eliminarIndicadorSGO(i: IndicadorSGO, usuario: string): Promise<void> {
  exigirPermisoBorradoSGO(usuario)
  await db.medicionesIndicadoresSGO.where('indicadorId').equals(i.id).delete()
  await db.indicadoresSGO.delete(i.id)
  await encolar({ entidad: 'indicador_sgo', entidadId: i.id, tipo: 'delete', payload: { id: i.id } })
}
export async function guardarMedicionIndicadorSGO(m: MedicionIndicadorSGO): Promise<void> {
  await db.medicionesIndicadoresSGO.put(m)
  await encolar({ entidad: 'medicion_indicador_sgo', entidadId: m.id, tipo: 'upsert', payload: m })
}
export async function guardarGarantiaISO(g: GarantiaISO): Promise<void> {
  await db.garantiasISO.put(g)
  await encolar({ entidad: 'garantia_iso', entidadId: g.id, tipo: 'upsert', payload: g })
}
export async function eliminarGarantiaISO(g: GarantiaISO): Promise<void> {
  await db.garantiasISO.delete(g.id)
  await encolar({ entidad: 'garantia_iso', entidadId: g.id, tipo: 'delete', payload: { id: g.id } })
}
export async function guardarControlProgramadoSGO(c: ControlProgramadoSGO): Promise<void> {
  await db.controlesProgramadosSGO.put(c)
  await encolar({ entidad: 'control_programado_sgo', entidadId: c.id, tipo: 'upsert', payload: c })
}
export async function guardarEjecucionControlSGO(e: EjecucionControlSGO): Promise<void> {
  await db.ejecucionesControlesSGO.put(e)
  await encolar({ entidad: 'ejecucion_control_sgo', entidadId: e.id, tipo: 'upsert', payload: e })
}

// v1.39: plantillas de tareas recurrentes (las administra Giuliano).
export async function guardarPlantilla(p: PlantillaRecurrente): Promise<void> {
  await db.plantillasRecurrentes.put(p)
  await encolar({ entidad: 'plantilla_recurrente', entidadId: p.id, tipo: 'upsert', payload: p })
}
export async function eliminarPlantilla(p: PlantillaRecurrente): Promise<void> {
  await db.plantillasRecurrentes.delete(p.id)
  await encolar({ entidad: 'plantilla_recurrente', entidadId: p.id, tipo: 'delete', payload: p })
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

// ============================================================
// DISPARADORES DE SINCRONIZACIÓN (v1.71)
//
// El Wi-Fi de la planta (7.000 m²) se cae y vuelve seguido, y `navigator.onLine`
// miente: da `true` con solo estar asociado a un AP, aunque ese AP no tenga
// salida. Por eso no alcanza con escuchar el evento 'online': se reintenta
// también de forma periódica y en los momentos en que el operario vuelve a la
// app, que es cuando más importa que su trabajo suba.
// ============================================================
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    estado = { ...estado, online: true }; emit()
    void procesarCola()
  })
  window.addEventListener('offline', () => {
    estado = { ...estado, online: false }; emit()
  })

  // La tablet vuelve del bloqueo de pantalla o el operario cambia de app:
  // momento ideal para intentar subir lo pendiente.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void procesarCola()
  })
  window.addEventListener('focus', () => void procesarCola())

  // Último intento antes de que se cierre la app. `keepalive` no aplica acá,
  // pero dispara la cola si el navegador todavía da tiempo.
  window.addEventListener('pagehide', () => { void procesarCola() })

  void refreshPendientes()
  setInterval(() => void procesarCola(), 20000)   // reintento periódico
}
