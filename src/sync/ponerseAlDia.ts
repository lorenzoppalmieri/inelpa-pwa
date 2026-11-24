import { db } from '../db/dexie'
import { supabase } from '../lib/supabaseClient'
import { PAGINA } from '../lib/supabaseFetch'
import { paradaFromRow, tareaFromRow, type ParadaRow, type TareaRow } from './mappers'
import type { Parada, Tarea } from '../types'

// ============================================================
// PONERSE AL DÍA CON LAS TAREAS (v2.59)
//
// BUG REPORTADO (24/11/2026, mazza.alexander): la planificadora asigna tareas y
// al colaborador no le llegan a "Mi trabajo".
//
// La causa de fondo: la tablet trae las tareas UNA sola vez, al iniciar sesión
// (`fetchInicial`), y de ahí en más depende 100 % del tiempo real de Supabase.
// Pero el tiempo real NO repite lo que pasó mientras la tablet estaba
// desconectada: si la tarea se asignó durante un corte de Wi-Fi (frecuentes en
// los 7.000 m²) o con la pantalla bloqueada (el navegador duerme el socket), ese
// aviso se pierde para siempre. La tarea existe en la base, pero esa tablet no
// se entera hasta que alguien cierra sesión o recarga la página.
//
// La solución: cada tanto, y siempre que la tablet "vuelve" (reconecta el tiempo
// real, vuelve el Wi-Fi o se desbloquea la pantalla), se piden las tareas
// ABIERTAS y se ponen al día en el espejo local. Es una consulta liviana: solo
// abiertas, y para un operario la RLS ya la acota a lo suyo.
//
// Reglas de seguridad (este código NO puede borrar trabajo):
//  - Lo que tiene cambios sin subir en la cola de la tablet NO se toca: lo local
//    es más nuevo que el servidor.
//  - Si cualquier consulta falla (sin red, error), se aborta SIN tocar nada. Por
//    eso no se usa `traerTodoDe`, que ante un error devuelve lo que alcanzó a
//    traer: una lista parcial haría creer que faltan tareas y las borraría.
//  - Una tarea solo se borra del espejo si el servidor confirma, preguntando por
//    su id, que ya no existe (o que ya no le corresponde a este usuario).
// ============================================================

const CADA_MS = 3 * 60 * 1000          // red de seguridad periódica
const MINIMO_ENTRE_CORRIDAS_MS = 15000 // evita ráfagas (foco + visible + reconexión juntos)
const TANDA_IDS = 200

let activo = false
let enCurso = false
let ultimaCorrida = 0
let timer: ReturnType<typeof setInterval> | undefined

/** v2.63: lo que pasó en la última puesta al día (para el panel de diagnóstico). */
export interface EstadoPuestaAlDia {
  en?: string
  motivo?: string
  /** Tareas abiertas que devolvió el servidor (ya filtradas por la RLS de este usuario). */
  delServidor?: number
  nuevas?: number
  borradas?: number
  error?: string
}
let ultimoEstado: EstadoPuestaAlDia = {}
let ultimoError = ''
export function estadoPuestaAlDia(): EstadoPuestaAlDia { return { ...ultimoEstado } }

export interface PlanPonerseAlDia {
  /** Filas del servidor que se escriben en el espejo. */
  escribir: TareaRow[]
  /** Tareas cuyas paradas hay que pedir: nuevas, con otro estado, o inconsistentes. */
  pedirParadas: string[]
  /** Abiertas en el espejo que el servidor ya no lista como abiertas: se pregunta por ellas. */
  revisar: string[]
}

/**
 * Decide qué hacer, sin tocar nada (función pura, testeable).
 * @param servidor   tareas ABIERTAS que devolvió el servidor
 * @param locales    espejo local (todas las tareas)
 * @param pendientes ids con cambios todavía sin subir desde esta tablet
 */
export function planificarPonerseAlDia(servidor: TareaRow[], locales: Tarea[], pendientes: Set<string>): PlanPonerseAlDia {
  const porId = new Map(locales.map((t) => [t.id, t]))
  const enServidor = new Set(servidor.map((r) => r.id))
  const escribir: TareaRow[] = []
  const pedirParadas: string[] = []
  for (const row of servidor) {
    if (pendientes.has(row.id)) continue
    escribir.push(row)
    const local = porId.get(row.id)
    const abiertaLocal = (local?.paradas ?? []).some((p) => !p.fin)
    const inconsistente = abiertaLocal !== (row.estado === 'pausada')
    if (!local || local.estado !== row.estado || inconsistente) pedirParadas.push(row.id)
  }
  const revisar = locales
    .filter((t) => t.estado !== 'finalizada' && !enServidor.has(t.id) && !pendientes.has(t.id))
    .map((t) => t.id)
  return { escribir, pedirParadas, revisar }
}

interface Paginable { range(a: number, b: number): PromiseLike<{ data: unknown[] | null; error: unknown }> }

/** Pagina una consulta. Devuelve null ante CUALQUIER error (nunca una lista parcial). */
async function traerCompleto<T>(construir: () => unknown): Promise<T[] | null> {
  const filas: T[] = []
  for (let desde = 0; desde < 200000; desde += PAGINA) {
    const { data, error } = await (construir() as Paginable).range(desde, desde + PAGINA - 1)
    if (error || !data) {
      ultimoError = error ? String((error as { message?: string }).message ?? error) : 'respuesta vacía'
      return null
    }
    filas.push(...(data as T[]))
    if (data.length < PAGINA) return filas
  }
  return filas
}

async function idsPendientes(): Promise<Set<string>> {
  const ops = await db.syncQueue.filter((o) => !o.sincronizado).toArray()
  return new Set(ops.map((o) => o.entidadId))
}

async function paradasDe(ids: string[]): Promise<Map<string, Parada[]> | null> {
  const sb = supabase
  const out = new Map<string, Parada[]>()
  if (!sb || ids.length === 0) return out
  for (let i = 0; i < ids.length; i += TANDA_IDS) {
    const lote = ids.slice(i, i + TANDA_IDS)
    const filas = await traerCompleto<ParadaRow>(() => sb.from('paradas').select('*').in('tarea_id', lote).order('id'))
    if (!filas) return null
    for (const f of filas) {
      const p = paradaFromRow(f)
      out.set(p.tareaId, [...(out.get(p.tareaId) ?? []), p])
    }
  }
  return out
}

/**
 * Pone al día las tareas abiertas del espejo local contra Supabase.
 * Devuelve null si no corrió (sin backend, ya corriendo, muy seguido o error).
 */
export async function ponerseAlDiaTareas(motivo = 'manual', forzar = false): Promise<{ nuevas: number; actualizadas: number; borradas: number } | null> {
  const sb = supabase
  if (!sb || enCurso) return null
  if (!forzar && Date.now() - ultimaCorrida < MINIMO_ENTRE_CORRIDAS_MS) return null
  enCurso = true
  ultimaCorrida = Date.now()
  ultimoError = ''
  let resultado: { nuevas: number; actualizadas: number; borradas: number } | null = null
  let delServidor: number | undefined
  try {
    resultado = await correr()
    return resultado
  } catch (e) {
    ultimoError = e instanceof Error ? e.message : String(e)
    console.warn('[sync] no se pudo poner al día las tareas', e)
    return null
  } finally {
    enCurso = false
    ultimoEstado = {
      en: new Date().toISOString(), motivo, delServidor,
      nuevas: resultado?.nuevas, borradas: resultado?.borradas,
      error: resultado ? undefined : (ultimoError || 'no se pudo completar'),
    }
  }

  async function correr(): Promise<{ nuevas: number; actualizadas: number; borradas: number } | null> {
    const sb = supabase!
    // ============================================================
    // v2.65 — SIN SESIÓN VÁLIDA NO SE TOCA NADA.
    // Si el equipo perdió la sesión (token vencido que no se pudo renovar) pero
    // la app sigue mostrando al usuario guardado, Supabase responde como ANÓNIMO:
    // la RLS devuelve 0 filas y NO da error. Sin este control, la puesta al día
    // creía que el colaborador ya no tenía tareas y las sacaba de la tablet
    // (caso mazza.alexander, 24/11: en la base estaban las 6; en su equipo, 0).
    // ============================================================
    const { data: ses, error: errSes } = await sb.auth.getSession()
    if (errSes || !ses?.session) {
      ultimoError = 'Este equipo no tiene una sesión válida: cerrá sesión y volvé a entrar.'
      return null
    }
    const servidor = await traerCompleto<TareaRow>(() => sb.from('tareas').select('*').neq('estado', 'finalizada').order('id'))
    if (!servidor) return null
    delServidor = servidor.length

    const locales = await db.tareas.toArray()
    // Segunda red: 0 abiertas en el servidor con abiertas en el equipo es casi
    // siempre una respuesta "vacía" por permisos, no la realidad. No se borra
    // nada; la próxima carga completa (al iniciar sesión) ordena el equipo.
    const abiertasLocales = locales.filter((t) => t.estado !== 'finalizada').length
    if (servidor.length === 0 && abiertasLocales > 0) {
      ultimoError = `El servidor devolvió 0 tareas abiertas y este equipo tiene ${abiertasLocales}: no se borró nada. Cerrá sesión y volvé a entrar.`
      return null
    }
    const plan = planificarPonerseAlDia(servidor, locales, await idsPendientes())

    // Las que el servidor ya no lista como abiertas: se pregunta por cada una.
    let revisadas: TareaRow[] = []
    for (let i = 0; i < plan.revisar.length; i += TANDA_IDS) {
      const lote = plan.revisar.slice(i, i + TANDA_IDS)
      const filas = await traerCompleto<TareaRow>(() => sb.from('tareas').select('*').in('id', lote).order('id'))
      if (!filas) return null
      revisadas = revisadas.concat(filas)
    }
    const siguenExistiendo = new Set(revisadas.map((r) => r.id))
    const borrar = plan.revisar.filter((id) => !siguenExistiendo.has(id))

    const paradas = await paradasDe([...plan.pedirParadas, ...revisadas.map((r) => r.id)])
    if (!paradas) return null

    // Se vuelve a mirar la cola JUSTO antes de escribir: si el operario tocó
    // algo mientras se consultaba, su cambio manda.
    const pendientes = await idsPendientes()
    const porId = new Map(locales.map((t) => [t.id, t]))
    const filas = [...plan.escribir, ...revisadas].filter((r) => !pendientes.has(r.id))
    const tareas = filas.map((r) => tareaFromRow(r, paradas.get(r.id) ?? porId.get(r.id)?.paradas ?? []))
    const nuevas = filas.filter((r) => !porId.has(r.id)).length
    await db.tareas.bulkPut(tareas)
    const aBorrar = borrar.filter((id) => !pendientes.has(id))
    if (aBorrar.length) await db.tareas.bulkDelete(aBorrar)

    if (nuevas || aBorrar.length) console.info(`[sync] puesta al día (${motivo}): ${nuevas} nueva(s), ${aBorrar.length} quitada(s)`)
    return { nuevas, actualizadas: tareas.length - nuevas, borradas: aBorrar.length }
  }
}

const alVolverVisible = () => { if (document.visibilityState === 'visible') void ponerseAlDiaTareas('pantalla') }
const alVolverRed = () => { void ponerseAlDiaTareas('red') }

/** Arranca los disparadores. Lo llama `iniciarSync` después del fetch inicial. */
export function activarPonerseAlDia(): void {
  if (activo || typeof window === 'undefined') return
  activo = true
  ultimaCorrida = Date.now() // el fetch inicial recién trajo todo
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void ponerseAlDiaTareas('periodico')
  }, CADA_MS)
  document.addEventListener('visibilitychange', alVolverVisible)
  window.addEventListener('online', alVolverRed)
}

/** Los apaga al cerrar sesión. */
export function desactivarPonerseAlDia(): void {
  if (!activo) return
  activo = false
  if (timer) clearInterval(timer)
  timer = undefined
  document.removeEventListener('visibilitychange', alVolverVisible)
  window.removeEventListener('online', alVolverRed)
}
