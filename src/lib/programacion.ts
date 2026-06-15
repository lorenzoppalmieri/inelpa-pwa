import type { Tarea } from '../types'
import { sumarMinutosLaborables, proximoInstanteLaborable } from './calendario'

// ============================================================
// Programacion por maquina con auto-shift (multi-dia).
//  - Tareas iniciadas (inicioReal): fijas; si una en curso sobrepasa su
//    estimado, la maquina sigue ocupada hasta "ahora" y empuja a las siguientes.
//  - Tareas pendientes: arrancan en su inicioPlanificado; si colisionan en su
//    maquina se corren hacia adelante respetando turno + almuerzo (cruza dias).
//
// Lo usan tanto el Gantt (para dibujar) como la exportacion (para volcar la
// misma cola que el usuario ve en pantalla).
// ============================================================
export interface Plan { startISO: string; endISO: string; estimada: boolean }

export function programar(tareas: Tarea[], ahoraISO: string): Map<string, Plan> {
  const out = new Map<string, Plan>()
  const porMaquina = new Map<string, Tarea[]>()
  for (const t of tareas) {
    const arr = porMaquina.get(t.maquinaId) ?? []
    arr.push(t)
    porMaquina.set(t.maquinaId, arr)
  }
  for (const [, arr] of porMaquina) {
    const ordenadas = [...arr].sort((a, b) => {
      const ak = a.inicioReal ?? a.inicioPlanificado ?? ''
      const bk = b.inicioReal ?? b.inicioPlanificado ?? ''
      if (ak && bk && ak !== bk) return ak < bk ? -1 : 1
      if (ak && !bk) return -1
      if (!ak && bk) return 1
      return a.prioridad - b.prioridad
    })
    let cursor = ''
    for (const t of ordenadas) {
      if (t.inicioReal) {
        const estEnd = sumarMinutosLaborables(t.inicioReal, t.tiempoEstandarMin)
        let endISO = t.finReal ?? estEnd
        if (!t.finReal && t.estado !== 'finalizada') endISO = ahoraISO > estEnd ? ahoraISO : estEnd
        out.set(t.id, { startISO: t.inicioReal, endISO, estimada: false })
        if (!cursor || endISO > cursor) cursor = endISO
      } else {
        let startISO = t.inicioPlanificado ?? cursor ?? ahoraISO
        if (cursor && cursor > startISO) startISO = cursor
        startISO = proximoInstanteLaborable(startISO || ahoraISO)
        const endISO = sumarMinutosLaborables(startISO, t.tiempoEstandarMin)
        out.set(t.id, { startISO, endISO, estimada: true })
        cursor = endISO
      }
    }
  }
  return out
}
