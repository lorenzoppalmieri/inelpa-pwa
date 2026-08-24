import { db } from '../db/dexie'
import { supabase } from '../lib/supabaseClient'
import type { AuditoriaCampoSGO } from './controlesCampo'
import type { EjecucionControlSGO } from './controles'

/**
 * Las auditorías cerradas se actualizan en línea y de forma directa para que
 * el trigger de Supabase valide la transición contra la última versión real.
 * No se usa la cola offline porque una decisión de premio no debe resolverse
 * sobre una copia desactualizada.
 */
export async function actualizarRevisionAuditoriaCampo(
  ejecucion: EjecucionControlSGO,
  auditoriaCampo: AuditoriaCampoSGO,
): Promise<EjecucionControlSGO> {
  if (!supabase || typeof navigator === 'undefined' || !navigator.onLine) {
    throw new Error('La revisión de puntaje requiere conexión para validar permisos y trazabilidad.')
  }
  const { data, error } = await supabase.from('sgo_control_ejecuciones')
    .update({ auditoria_campo: auditoriaCampo })
    .eq('id', ejecucion.id)
    .select('auditoria_campo')
    .maybeSingle()
  if (error) throw new Error(`No se pudo actualizar la revisión: ${error.message}`)
  if (!data?.auditoria_campo) throw new Error('La auditoría cambió o ya no está disponible. Actualizá la pantalla e intentá nuevamente.')
  const actualizada = { ...ejecucion, auditoriaCampo: data.auditoria_campo as AuditoriaCampoSGO }
  await db.ejecucionesControlesSGO.put(actualizada)
  return actualizada
}
