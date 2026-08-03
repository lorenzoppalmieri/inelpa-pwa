import { supabase } from '../lib/supabaseClient'
import { OT_ABIERTAS } from './types'
import type { MantGama, MantOT } from './types'

// ============================================================
// ALERTAS TEMPRANAS (P6) — amarillo preventivo por degradacion.
// Regla TPM pragmática (sin ML): un activo entra en "advertencia"
// cuando cumple CUALQUIERA de estas condiciones:
//   1. >= ALERTA_PARADAS_7D  paradas con causa mant_correctivo en 7 dias, O
//   2. >= ALERTA_PARADAS_30D paradas mant_correctivo en 30 dias, O
//   3. tiene una GAMA PREVENTIVA VENCIDA (Sprint 4, ver abajo).
// Para ajustar la sensibilidad se tocan SOLO estas constantes.
// ============================================================

export const ALERTA_PARADAS_7D = 3
export const ALERTA_PARADAS_30D = 5
export const ALERTA_VENTANA_DIAS = 30
// Tolerancia tras la proxima ejecucion calculada antes de marcar vencida.
export const ALERTA_GAMA_TOLERANCIA_DIAS = 0
// Vista de gamas: "proxima" cuando faltan <= N dias para el vencimiento.
export const GAMA_PROXIMA_DIAS = 7

export const FRECUENCIA_DIAS: Record<MantGama['frecuencia'], number> = {
  diaria: 1, semanal: 7, quincenal: 14, mensual: 30,
  trimestral: 90, semestral: 180, anual: 365,
}

export interface GamaVencida {
  gamaId: string
  tarea: string
  diasVencida: number
}

export interface AlertaTemprana {
  activoId: string
  paradas7d: number
  paradas30d: number
  gamasVencidas: GamaVencida[]
}

interface ParadaConMaquina {
  inicio: string
  tareas: { maquina_id: string } | null
}

// ------------------------------------------------------------
// ESTADO DE UNA GAMA (calculo compartido: alertas + vista de gamas).
// Ultima ejecucion = fecha_cierre mas reciente de una OT cerrada con
// ese gama_id (el schema v1.64 no tiene columna de ultima ejecucion).
// CRITERIO CONSERVADOR: si la gama NUNCA se ejecuto (sin OT cerrada),
// NO dispara advertencia — no hay fecha base confiable en el schema
// (la alternativa, creado_en del activo, haria saltar las 60 gamas el
// dia 1). Una gama con OT abierta tampoco dispara: ya se esta atendiendo.
// ------------------------------------------------------------
export interface EstadoGama {
  ultimaEjecucion: string | null
  proxima: string | null            // ISO estimada
  diasParaVencer: number | null     // negativo = vencida
  tieneOtAbierta: boolean
  vencida: boolean
  proximaAVencer: boolean
}

export function estadoDeGama(gama: MantGama, ultimaEjecucion: string | null, tieneOtAbierta: boolean, ahora = Date.now()): EstadoGama {
  if (!ultimaEjecucion) {
    return { ultimaEjecucion: null, proxima: null, diasParaVencer: null, tieneOtAbierta, vencida: false, proximaAVencer: false }
  }
  const dias = FRECUENCIA_DIAS[gama.frecuencia] ?? 30
  const prox = new Date(ultimaEjecucion).getTime() + dias * 86400000
  const diasPara = Math.ceil((prox - ahora) / 86400000)
  return {
    ultimaEjecucion,
    proxima: new Date(prox).toISOString(),
    diasParaVencer: diasPara,
    tieneOtAbierta,
    vencida: !tieneOtAbierta && diasPara < -ALERTA_GAMA_TOLERANCIA_DIAS,
    proximaAVencer: !tieneOtAbierta && diasPara >= -ALERTA_GAMA_TOLERANCIA_DIAS && diasPara <= GAMA_PROXIMA_DIAS,
  }
}

// Resumen por gama (ultima ejecucion + si tiene OT abierta) en una pasada
// sobre las OT del modulo que tienen gama_id.
export function resumenPorGama(ots: Pick<MantOT, 'gama_id' | 'estado' | 'fecha_cierre'>[]): Map<string, { ultima: string | null; abierta: boolean }> {
  const m = new Map<string, { ultima: string | null; abierta: boolean }>()
  for (const o of ots) {
    if (!o.gama_id) continue
    const r = m.get(o.gama_id) ?? { ultima: null, abierta: false }
    if (OT_ABIERTAS.includes(o.estado)) r.abierta = true
    if (o.estado === 'cerrada' && o.fecha_cierre && (!r.ultima || o.fecha_cierre > r.ultima)) r.ultima = o.fecha_cierre
    m.set(o.gama_id, r)
  }
  return m
}

// ------------------------------------------------------------
// Carga plant-wide de alertas: una query de paradas (30 d, causa
// correctiva, join a tareas) + una de gamas + una de OT con gama.
// Cada senal tiene su propio try/catch: si una fuente falla (RLS /
// SQL pendiente), las demas siguen funcionando. Nunca lanza.
// ------------------------------------------------------------
export async function cargarAlertasTempranas(): Promise<Map<string, AlertaTemprana>> {
  const out = new Map<string, AlertaTemprana>()
  if (!supabase) return out

  const entrada = (activoId: string): AlertaTemprana => {
    const a = out.get(activoId) ?? { activoId, paradas7d: 0, paradas30d: 0, gamasVencidas: [] }
    out.set(activoId, a)
    return a
  }

  // --- Senal 1 y 2: paradas correctivas repetidas (Sprint 3) ---
  try {
    const desde = new Date(Date.now() - ALERTA_VENTANA_DIAS * 86400000).toISOString()
    const [{ data: acts, error: e1 }, { data: pars, error: e2 }] = await Promise.all([
      supabase.from('mant_activos').select('id, pwa_machine_key').not('pwa_machine_key', 'is', null),
      supabase.from('paradas').select('inicio, tareas!inner(maquina_id)')
        .eq('causa', 'mant_correctivo').gte('inicio', desde),
    ])
    if (e1 || e2) throw new Error(e1?.message ?? e2?.message)
    const activoPorMaquina = new Map<string, string>()
    for (const a of (acts ?? []) as { id: string; pwa_machine_key: string | null }[]) {
      if (a.pwa_machine_key) activoPorMaquina.set(a.pwa_machine_key, a.id)
    }
    const hace7 = Date.now() - 7 * 86400000
    const acum = new Map<string, { d7: number; d30: number }>()
    for (const p of ((pars ?? []) as unknown as ParadaConMaquina[])) {
      const mk = p.tareas?.maquina_id
      if (!mk) continue
      const activoId = activoPorMaquina.get(mk)
      if (!activoId) continue
      const a = acum.get(activoId) ?? { d7: 0, d30: 0 }
      a.d30++
      if (new Date(p.inicio).getTime() >= hace7) a.d7++
      acum.set(activoId, a)
    }
    for (const [activoId, a] of acum) {
      if (a.d7 >= ALERTA_PARADAS_7D || a.d30 >= ALERTA_PARADAS_30D) {
        const al = entrada(activoId)
        al.paradas7d = a.d7
        al.paradas30d = a.d30
      }
    }
  } catch (e) {
    console.warn('[alertasMant] senal de paradas no disponible (¿RLS o SQL pendiente?):', e)
  }

  // --- Senal 3: gama preventiva vencida (Sprint 4) ---
  try {
    const [{ data: gs, error: e1 }, { data: ots, error: e2 }] = await Promise.all([
      supabase.from('mant_gamas').select('*').eq('activa', true).not('activo_id', 'is', null),
      supabase.from('mant_ordenes_trabajo').select('gama_id, estado, fecha_cierre').not('gama_id', 'is', null),
    ])
    if (e1 || e2) throw new Error(e1?.message ?? e2?.message)
    const resumen = resumenPorGama((ots ?? []) as Pick<MantOT, 'gama_id' | 'estado' | 'fecha_cierre'>[])
    const ahora = Date.now()
    for (const g of (gs ?? []) as MantGama[]) {
      if (!g.activo_id) continue
      const r = resumen.get(g.id)
      const est = estadoDeGama(g, r?.ultima ?? null, r?.abierta ?? false, ahora)
      if (!est.vencida) continue
      entrada(g.activo_id).gamasVencidas.push({
        gamaId: g.id, tarea: g.tarea, diasVencida: Math.abs(est.diasParaVencer ?? 0),
      })
    }
  } catch (e) {
    console.warn('[alertasMant] senal de gamas vencidas no disponible:', e)
  }

  return out
}

// Texto corto del motivo de la alerta (para badges y OT sugerida).
export function textoAlerta(a: AlertaTemprana): string {
  const partes: string[] = []
  if (a.paradas7d >= ALERTA_PARADAS_7D) partes.push(`${a.paradas7d} paradas correctivas en 7 días`)
  if (a.paradas30d >= ALERTA_PARADAS_30D) partes.push(`${a.paradas30d} paradas en 30 días`)
  for (const g of a.gamasVencidas) partes.push(`gama "${g.tarea}" vencida hace ${g.diasVencida} d`)
  return partes.join(' · ')
}
