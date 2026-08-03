import type { MantAviso, MantOT } from './types'
import { OT_ABIERTAS } from './types'

// ============================================================
// SEMAFORO CANONICO DEL MODULO (P9, Sprint 5) — UNICA fuente de
// verdad de estados, colores y nombres. Todo el modulo lee de aca:
// pines del SCADA y del mapa, leyendas, badge de la ficha, tablero.
//
//   🔴 falla         #ef4444  aviso nuevo sin atender u OT correctiva/
//                             emergencia abierta: esta rota y NADIE la
//                             esta trabajando todavia.
//   🟣 intervencion  #8b5cf6  hay una OT EN EJECUCION: alguien trabaja
//                             AHORA en la maquina. Violeta = mismo color
//                             que "reparacion" en Produccion. DECISION:
//                             la intervencion de una correctiva BAJA el
//                             rojo a violeta — "siendo reparada" es la
//                             info accionable (ya nadie tiene que correr);
//                             el rojo queda para "rota esperando".
//   🟡 atencion      #f59e0b  advertencia: OT preventiva abierta, gama
//                             vencida o alerta temprana (P6, alertas.ts).
//   🟢 ok            #22c55e  operativo, sin nada pendiente.
//
//   Prioridad: falla > intervencion > atencion > ok.
//   NOTA Produccion: sus estados de tarea (pendiente gris, en_proceso
//   azul, pausada ambar, finalizada verde) son del flujo de TRABAJO, no
//   del semaforo de SALUD de la maquina: no se mezclan con este modelo.
// ============================================================

export type Estado = 'falla' | 'intervencion' | 'atencion' | 'ok'

export interface EstadoInfo {
  id: Estado
  label: string        // palabra de planta (leyenda, tooltips, badges)
  color: string        // hex canonico (mismo valor que la CSS var --mant-*)
  cssVar: string       // var(--mant-*) para reglas CSS
}

export const ESTADOS: Record<Estado, EstadoInfo> = {
  falla:        { id: 'falla',        label: 'Falla',         color: '#ef4444', cssVar: 'var(--mant-falla)' },
  intervencion: { id: 'intervencion', label: 'En reparación', color: '#8b5cf6', cssVar: 'var(--mant-intervencion)' },
  atencion:     { id: 'atencion',     label: 'Atención',      color: '#f59e0b', cssVar: 'var(--mant-atencion)' },
  ok:           { id: 'ok',           label: 'OK',            color: '#22c55e', cssVar: 'var(--mant-ok)' },
}

// Orden para leyendas / conteos (de mas urgente a menos).
export const ESTADO_ORDEN: Estado[] = ['falla', 'intervencion', 'atencion', 'ok']

// Calcula el estado de un activo dado sus avisos y OT (ya filtrados por activo).
// P6: `advertencia` = alerta temprana por paradas correctivas repetidas o
// gama vencida (ver alertas.ts). Mapea al amarillo 'atencion' SIN pisar el
// rojo ni la intervencion. LA DETECCION NO CAMBIO EN EL P9: solo se
// unificaron ids, nombres y colores.
export function estadoDeActivo(avisos: MantAviso[], ots: MantOT[], advertencia = false): Estado {
  const abiertas = ots.filter((o) => OT_ABIERTAS.includes(o.estado))
  if (abiertas.some((o) => o.estado === 'en_ejecucion')) return 'intervencion'
  if (avisos.some((a) => a.estado === 'nuevo')) return 'falla'
  if (abiertas.some((o) => o.tipo === 'correctiva' || o.tipo === 'emergencia')) return 'falla'
  if (abiertas.some((o) => o.tipo === 'preventiva')) return 'atencion'
  if (advertencia) return 'atencion'
  return 'ok'
}

// Construye el mapa activo_id -> estado a partir de las listas completas.
// `advertencias` (P6): ids con alerta temprana; se incluyen en el mapa
// aunque no tengan avisos ni OT (la advertencia sola pinta el amarillo).
export function mapaDeEstados(avisos: MantAviso[], ots: MantOT[], advertencias?: Set<string>): Map<string, Estado> {
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
  const ids = new Set<string>([...porActivoAvisos.keys(), ...porActivoOts.keys(), ...(advertencias ?? [])])
  const out = new Map<string, Estado>()
  for (const id of ids) {
    out.set(id, estadoDeActivo(porActivoAvisos.get(id) ?? [], porActivoOts.get(id) ?? [], advertencias?.has(id) ?? false))
  }
  return out
}
