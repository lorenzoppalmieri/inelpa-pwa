import { db } from '../db/dexie'
import { supabase } from '../lib/supabaseClient'
import { causaLabel } from '../types'
import type { CausaParada, Parada, Tarea } from '../types'
import type { AvisoMantPendiente } from './types'

// ============================================================
// PUENTE PRODUCCION -> MANTENIMIENTO (aviso automatico) + COLA OFFLINE
// DE AVISOS (v1.66).
//
//  GENERACION (desde una parada con causa mant_correctivo/mant_preventivo):
//    - Se encola en Dexie (avisosMant) SIEMPRE, con uuid de cliente y la
//      machineKey de la tarea (tarea.maquinaId, ej. 'm_bob_07').
//    - La parada productiva NUNCA se bloquea por esto: todo va en
//      try/catch y los errores quedan en console.warn.
//
//  FLUSH (procesarColaAvisosMant): lo llama el motor de sync
//    (src/sync/syncEngine.ts) al vaciar la cola, al volver la red y cada
//    30 s. Por cada aviso pendiente, ONLINE:
//      1. Resuelve la maquina -> activo (mant_activos.pwa_machine_key).
//         Sin match: se descarta el aviso (warn) y NO se reintenta.
//      2. Inserta en mant_avisos con el MISMO uuid (upsert
//         ignoreDuplicates) -> reenvios tras un corte no duplican.
//      3. Si las tablas mant_* todavia no existen en Supabase, el error
//         se trata como transitorio: queda pendiente sin romper nada.
// ============================================================

const MAX_INTENTOS_AVISO = 5

// Causas de parada que generan aviso automatico a mantenimiento.
export function esCausaMantenimiento(causa: CausaParada): boolean {
  return causa === 'mant_correctivo' || causa === 'mant_preventivo'
}

// ¿El fallo fue de red (transitorio) o definitivo (tabla inexistente/RLS)?
// A diferencia del sync productivo, aca TODO se trata como transitorio
// (acotado por MAX_INTENTOS_AVISO): si Lorenzo aun no corrio los SQL v1.62,
// los avisos esperan en la cola en vez de descartarse.
function esErrorDeRed(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = e instanceof Error ? e.message : String(e)
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg)
}

// ------------------------------------------------------------
// Encola un aviso en Dexie y dispara el flush (no bloquea al caller).
// Devuelve el id del aviso encolado.
// ------------------------------------------------------------
async function encolarAviso(aviso: AvisoMantPendiente): Promise<string> {
  await db.avisosMant.put(aviso)
  void procesarColaAvisosMant() // si hay red, sale en el momento
  return aviso.id
}

// ------------------------------------------------------------
// AVISO AUTOMATICO desde una parada de produccion con causa mant_*.
// Idempotente por parada: si ya hay un aviso con ese paradaId, no duplica.
// NUNCA lanza: cualquier problema queda en console.warn.
// ------------------------------------------------------------
export async function generarAvisoDesdeParada(tarea: Tarea, parada: Parada, emisor: string): Promise<void> {
  try {
    if (!esCausaMantenimiento(parada.causa)) return
    const yaHay = await db.avisosMant.where('paradaId').equals(parada.id).count()
    if (yaHay > 0) return // ya se genero (reintento de sync / doble invocacion)

    // Nombre legible de la maquina (espejo offline de db.maquinas).
    let nombreMaquina = tarea.maquinaId
    try {
      const m = await db.maquinas.get(tarea.maquinaId)
      if (m?.nombre) nombreMaquina = m.nombre
    } catch { /* si falla el espejo, va el id crudo */ }

    const partes = [
      `Parada de producción · ${causaLabel(parada.causa)}`,
      nombreMaquina,
    ]
    if (tarea.modelo) partes.push(`Modelo ${tarea.modelo}`)
    let sintoma = partes.join(' — ')
    if (parada.observacion?.trim()) sintoma += `. Obs: ${parada.observacion.trim()}`

    await encolarAviso({
      id: crypto.randomUUID(),
      paradaId: parada.id,
      pwaMachineKey: tarea.maquinaId,
      emisor: emisor || 'desconocido',
      sintoma,
      origen: 'parada',
      creadoEn: new Date().toISOString(),
      sincronizado: false,
    })
  } catch (e) {
    // Jamas afectar el flujo productivo.
    console.warn('[avisosMant] no se pudo generar el aviso de la parada:', e)
  }
}

// ------------------------------------------------------------
// AVISO MANUAL (desde el modulo, AvisoFalla): el activo ya viene resuelto.
// ------------------------------------------------------------
export async function generarAvisoManual(activoId: string, sintoma: string, emisor: string): Promise<string> {
  return encolarAviso({
    id: crypto.randomUUID(),
    activoId,
    emisor: emisor || 'desconocido',
    sintoma: sintoma.trim(),
    origen: 'manual',
    creadoEn: new Date().toISOString(),
    sincronizado: false,
  })
}

// ------------------------------------------------------------
// FLUSH: empuja los avisos pendientes a mant_avisos. Nunca lanza.
// ------------------------------------------------------------
let procesandoAvisos = false
export async function procesarColaAvisosMant(): Promise<void> {
  if (procesandoAvisos || typeof navigator === 'undefined' || !navigator.onLine || !supabase) return
  procesandoAvisos = true
  try {
    const pendientes = await db.avisosMant.filter((a) => !a.sincronizado && !a.error).toArray()
    if (pendientes.length === 0) return

    // Mapa maquina de produccion -> activo de mantenimiento (una sola query
    // por tanda). Si la tabla mant_activos aun no existe, el error sale por
    // el catch general y los avisos quedan pendientes (transitorio).
    let mapaActivos = new Map<string, string>()
    try {
      const { data, error } = await supabase
        .from('mant_activos')
        .select('id, pwa_machine_key')
        .not('pwa_machine_key', 'is', null)
      if (error) throw new Error(error.message)
      for (const r of (data ?? []) as { id: string; pwa_machine_key: string | null }[]) {
        if (r.pwa_machine_key) mapaActivos.set(r.pwa_machine_key, r.id)
      }
    } catch (e) {
      // Tabla inexistente / RLS / red: nada se puede enviar en esta tanda.
      console.warn('[avisosMant] no se pudo cargar el mapa de activos (¿falta correr el SQL v1.62?):', e)
      return
    }

    for (const av of pendientes) {
      try {
        // Resolver activo: directo (manual) o via pwa_machine_key (parada).
        const activoId = av.activoId ?? (av.pwaMachineKey ? mapaActivos.get(av.pwaMachineKey) : undefined)
        if (!activoId) {
          // La maquina no esta vinculada a ningun activo: se descarta el
          // aviso SIN ruido (la parada productiva ya quedo registrada).
          console.warn(`[avisosMant] sin activo para la máquina "${av.pwaMachineKey ?? '(sin clave)'}" — aviso ${av.id} descartado.`)
          await db.avisosMant.update(av.id, { error: 'sin_activo_match' })
          continue
        }
        const { error } = await supabase.from('mant_avisos').upsert({
          id: av.id, // uuid de cliente: el reenvio pisa el mismo id (idempotente)
          activo_id: activoId,
          emisor: av.emisor,
          sintoma: av.sintoma,
          estado: 'nuevo',
          creado_en: av.creadoEn,
        }, { onConflict: 'id', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
        await db.avisosMant.update(av.id, { sincronizado: true })
      } catch (e) {
        const intentos = (av.intentos ?? 0) + 1
        if (!esErrorDeRed(e) && intentos >= MAX_INTENTOS_AVISO) {
          console.error(`[avisosMant] ⛔ aviso ${av.id} descartado tras ${intentos} intentos:`, e)
          await db.avisosMant.update(av.id, { error: `reintentos agotados: ${e instanceof Error ? e.message : String(e)}`, intentos })
        } else {
          await db.avisosMant.update(av.id, { intentos })
          // Transitorio (red/sesion): cortar la tanda; se reintenta en el proximo ciclo.
          if (esErrorDeRed(e)) break
        }
      }
    }
  } catch (e) {
    console.warn('[avisosMant] procesarColaAvisosMant fallo:', e)
  } finally {
    procesandoAvisos = false
  }
}
