import { supabase } from './supabaseClient'
import { VERSION_APP } from '../version'

// ============================================================
// REGISTRO AUTOMÁTICO DE ERRORES (v2.67)
//
// Hasta ahora los errores los descubríamos cuando alguien de planta avisaba
// ("no le llegan las tareas a Alexander"), y para entender qué pasó había que
// pedir capturas. Este módulo anota cada falla en la tabla `errores_app` con
// usuario, rol, versión, pantalla y equipo, para verlos ANTES de que alguien
// reclame (ver docs/supabase_errores_app_v2.67.sql para las consultas).
//
// Reglas, porque esto corre en todas las tablets:
//  - NUNCA lanza ni rompe la pantalla: si no puede anotar, se calla.
//  - Sin red (o sin la tabla todavía), guarda hasta 50 errores en el equipo y
//    los sube después.
//  - No inunda: el mismo error del mismo origen se anota una vez cada 15
//    minutos (las repeticiones se cuentan), y como mucho 40 por sesión.
//  - No pasa por la cola de sincronización: un error del registro no puede
//    trabar el trabajo de producción.
// ============================================================

export type OrigenError = 'pantalla' | 'promesa' | 'sync' | 'descarga' | 'puesta_al_dia' | 'tiempo_real'

interface ErrorPendiente {
  ocurrido_en: string
  usuario_id: string | null
  usuario: string | null
  rol: string | null
  version: string
  origen: OrigenError
  mensaje: string
  detalle: string | null
  pantalla: string | null
  dispositivo: string | null
  repeticiones: number
}

const CLAVE_PENDIENTES = 'inelpa_errores_pendientes_v1'
const MAX_PENDIENTES = 50
const MAX_POR_SESION = 40
const VENTANA_REPETIDO_MS = 15 * 60 * 1000

let contexto: { usuarioId?: string; usuario?: string; rol?: string } = {}
let enviadosEnSesion = 0
const ultimaVez = new Map<string, { en: number; repeticiones: number }>()
let subiendo = false

/** Quién está usando el equipo. Lo llama AuthContext al iniciar/cerrar sesión. */
export function setContextoErrores(u: { id: string; usuario: string; rol: string } | null): void {
  contexto = u ? { usuarioId: u.id, usuario: u.usuario, rol: u.rol } : {}
}

const recortar = (s: string | undefined | null, n: number) => (s ? String(s).slice(0, n) : null)

function leerPendientes(): ErrorPendiente[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) ?? '[]') as ErrorPendiente[] } catch { return [] }
}
function guardarPendientes(xs: ErrorPendiente[]): void {
  try { localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(xs.slice(-MAX_PENDIENTES))) } catch { /* storage lleno: se pierde, no importa */ }
}

/**
 * Decide si un error se anota ahora (pura, testeable): el mismo origen+mensaje
 * dentro de la ventana solo suma una repetición.
 */
export function debeAnotar(clave: string, ahoraMs: number, registro: Map<string, { en: number; repeticiones: number }>): boolean {
  const prev = registro.get(clave)
  if (prev && ahoraMs - prev.en < VENTANA_REPETIDO_MS) { prev.repeticiones += 1; return false }
  registro.set(clave, { en: ahoraMs, repeticiones: 1 })
  return true
}

/** Anota un error. Nunca lanza. */
export function registrarError(origen: OrigenError, mensaje: string, detalle?: unknown): void {
  try {
    const msg = recortar(mensaje, 500) ?? 'sin mensaje'
    if (!debeAnotar(`${origen}|${msg}`, Date.now(), ultimaVez)) return
    if (enviadosEnSesion >= MAX_POR_SESION) return
    enviadosEnSesion += 1
    const det = detalle instanceof Error ? `${detalle.message}\n${detalle.stack ?? ''}`
      : typeof detalle === 'string' ? detalle
        : detalle === undefined ? null : (() => { try { return JSON.stringify(detalle) } catch { return String(detalle) } })()
    const e: ErrorPendiente = {
      ocurrido_en: new Date().toISOString(),
      usuario_id: contexto.usuarioId ?? null,
      usuario: contexto.usuario ?? null,
      rol: contexto.rol ?? null,
      version: VERSION_APP,
      origen,
      mensaje: msg,
      detalle: recortar(det, 4000),
      pantalla: typeof location !== 'undefined' ? recortar(location.pathname + location.hash, 200) : null,
      dispositivo: typeof navigator !== 'undefined' ? recortar(navigator.userAgent, 300) : null,
      repeticiones: 1,
    }
    guardarPendientes([...leerPendientes(), e])
    void subirPendientes()
  } catch { /* el registro de errores nunca puede romper nada */ }
}

/** Sube lo que quedó guardado en el equipo. Nunca lanza. */
export async function subirPendientes(): Promise<void> {
  if (subiendo || !supabase) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  const pendientes = leerPendientes()
  if (!pendientes.length) return
  subiendo = true
  try {
    const { error } = await supabase.from('errores_app').insert(pendientes)
    if (!error) guardarPendientes(leerPendientes().slice(pendientes.length))
  } catch { /* queda guardado para la próxima */ } finally {
    subiendo = false
  }
}

/** Errores no atrapados de toda la app. Se llama una vez en main.tsx. */
export function instalarRegistroGlobal(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('error', (ev) => {
    registrarError('pantalla', ev.message || 'error de pantalla', ev.error ?? `${ev.filename}:${ev.lineno}`)
  })
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason
    registrarError('promesa', r instanceof Error ? r.message : String(r ?? 'promesa rechazada'), r)
  })
  window.addEventListener('online', () => { void subirPendientes() })
  setInterval(() => { void subirPendientes() }, 2 * 60 * 1000)
}
