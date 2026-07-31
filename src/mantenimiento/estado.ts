import type { MantAviso, MantOT } from './types'
import { OT_ABIERTAS } from './types'

// ============================================================
// ESTADO EN VIVO DE UN ACTIVO (para el mapa de estado)
// Deriva el "semaforo" de cada maquina a partir de los avisos abiertos
// y las OT abiertas. Prioridad (de mas urgente a menos):
//   intervencion  ⚫  hay una OT en ejecucion (LOTO puesto, no tocar)
//   aviso         🔴  aviso de falla nuevo, u OT correctiva/emergencia abierta
//   preventivo    🟡  OT preventiva abierta (le llego la hora)
//   ok            🟢  sin nada pendiente
// ============================================================

export type Estado = 'intervencion' | 'aviso' | 'preventivo' | 'ok'

export interface EstadoInfo {
  id: Estado
  label: string
  color: string        // color del semaforo (hex)
}

export const ESTADOS: Record<Estado, EstadoInfo> = {
  intervencion: { id: 'intervencion', label: 'En intervención', color: '#64748b' },
  aviso:        { id: 'aviso',        label: 'Aviso de falla',  color: '#ef4444' },
  preventivo:   { id: 'preventivo',   label: 'Preventivo',      color: '#f59e0b' },
  ok:           { id: 'ok',           label: 'OK',              color: '#22c55e' },
}

// Orden para leyendas / conteos.
export const ESTADO_ORDEN: Estado[] = ['aviso', 'intervencion', 'preventivo', 'ok']

// Calcula el estado de un activo dado sus avisos y OT (ya filtrados por activo).
export function estadoDeActivo(avisos: MantAviso[], ots: MantOT[]): Estado {
  const abiertas = ots.filter((o) => OT_ABIERTAS.includes(o.estado))
  if (abiertas.some((o) => o.estado === 'en_ejecucion')) return 'intervencion'
  if (avisos.some((a) => a.estado === 'nuevo')) return 'aviso'
  if (abiertas.some((o) => o.tipo === 'correctiva' || o.tipo === 'emergencia')) return 'aviso'
  if (abiertas.some((o) => o.tipo === 'preventiva')) return 'preventivo'
  return 'ok'
}

// Construye el mapa activo_id -> estado a partir de las listas completas.
export function mapaDeEstados(avisos: MantAviso[], ots: MantOT[]): Map<string, Estado> {
  const porActivoAvisos = new Map<string, MantAviso[]>()
  for (const a of avisos) {
    const arr = porActivoAvisos.get(a.activo_id) ?? []
    arr.push(a); porActivoAvisos.set(a.activo_id, arr)
  }
  const porActivoOts = new Map<string, MantOT[]>()
  for (const o of ots) {
    const arr = porActivoOts.get(o.activo_id) ?? []
    arr.push(o); porActivoOts.set(o.activo_id, arr)
  }
  const ids = new Set<string>([...porActivoAvisos.keys(), ...porActivoOts.keys()])
  const out = new Map<string, Estado>()
  for (const id of ids) {
    out.set(id, estadoDeActivo(porActivoAvisos.get(id) ?? [], porActivoOts.get(id) ?? []))
  }
  return out
}
