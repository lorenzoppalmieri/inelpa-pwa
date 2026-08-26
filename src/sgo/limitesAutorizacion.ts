import { supabase } from '../lib/supabaseClient'
import { usuarioEsLorenzo } from './permisos'

const CACHE_UMBRAL = 'sgo_umbral_autorizacion_mejoras_v1'
export const UMBRAL_AUTORIZACION_MEJORAS_BASE = 500000

export interface LimiteAutorizacionMejoraSGO {
  id: string
  monto: number
  vigenteDesde: string
  creadoEn?: string
  creadoPor: string
}

interface LimiteRow {
  id: string
  monto: number
  vigente_desde: string
  creado_en: string
  creado_por: string
}

function desdeRow(row: LimiteRow): LimiteAutorizacionMejoraSGO {
  return { id: row.id, monto: Number(row.monto), vigenteDesde: row.vigente_desde, creadoEn: row.creado_en, creadoPor: row.creado_por }
}

function guardarCache(limite: LimiteAutorizacionMejoraSGO) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(CACHE_UMBRAL, JSON.stringify(limite))
}

function leerCache(): LimiteAutorizacionMejoraSGO | undefined {
  if (typeof localStorage === 'undefined') return undefined
  try {
    const dato = JSON.parse(localStorage.getItem(CACHE_UMBRAL) ?? 'null') as LimiteAutorizacionMejoraSGO | null
    return dato && dato.monto > 0 ? dato : undefined
  } catch { return undefined }
}

export async function obtenerLimiteAutorizacionMejora(fecha = new Date().toISOString().slice(0, 10)): Promise<LimiteAutorizacionMejoraSGO> {
  const base = leerCache() ?? { id: 'base-500000', monto: UMBRAL_AUTORIZACION_MEJORAS_BASE, vigenteDesde: '2026-08-26', creadoPor: 'Lorenzo' }
  if (!supabase) return base
  const { data, error } = await supabase.from('sgo_limites_autorizacion')
    .select('id,monto,vigente_desde,creado_en,creado_por').eq('tipo', 'presupuesto_mejora')
    .lte('vigente_desde', fecha).order('vigente_desde', { ascending: false }).order('creado_en', { ascending: false }).limit(1)
  if (error || !data?.length) {
    console.warn('[SGO] No se pudo leer el umbral de autorización; se usa la copia local.', error)
    return base
  }
  const limite = desdeRow(data[0] as LimiteRow)
  guardarCache(limite)
  return limite
}

export async function guardarLimiteAutorizacionMejora(monto: number, usuario: string): Promise<LimiteAutorizacionMejoraSGO> {
  if (!usuarioEsLorenzo(usuario)) throw new Error('Solo Lorenzo puede modificar el límite de autorización.')
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('El límite debe ser mayor que cero.')
  if (!supabase) throw new Error('Se necesita conexión para actualizar el límite compartido.')
  const { data, error } = await supabase.from('sgo_limites_autorizacion').insert({
    tipo: 'presupuesto_mejora', monto: Math.round(monto * 100) / 100,
    vigente_desde: new Date().toISOString().slice(0, 10), creado_por: usuario,
  }).select('id,monto,vigente_desde,creado_en,creado_por').single()
  if (error) throw error
  const limite = desdeRow(data as LimiteRow)
  guardarCache(limite)
  return limite
}
