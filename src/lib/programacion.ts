import type { Tarea } from '../types'
import { sumarMinutosLaborables, proximoInstanteLaborable, type GrupoAlmuerzo, GRUPO_ALMUERZO_DEFAULT } from './calendario'

// ============================================================
// Programacion con auto-shift (multi-dia). Lo usan el Gantt (para dibujar) y la
// exportacion, para volcar la misma cola que el usuario ve en pantalla.
//
// REGLAS (v1.42):
//  1) Tareas ya iniciadas (inicioReal): son un HECHO, no se mueven. Si una en
//     curso sobrepasa su estimado, el recurso sigue ocupado hasta "ahora" y eso
//     EMPUJA a las siguientes.
//  2) Tareas pendientes: NO pueden dibujarse en el pasado. Arrancan como muy
//     temprano AHORA, aunque su hora planificada ya haya vencido. Asi, a medida
//     que la produccion se atrasa, la cola se corre sola hacia adelante en vez de
//     quedar amontonada sobre la franja de la mañana.
//  3) Un recurso no puede hacer dos cosas a la vez: se encola por MAQUINA
//     (estacion) y tambien por OPERARIO. Una tarea arranca despues de que se
//     liberan AMBOS. Esto evita solapamientos en todas las lineas (bobinados,
//     herreria, montajes) sin romper el paralelismo real: dos personas distintas
//     en la misma linea siguen pudiendo trabajar en simultaneo.
//  4) Todo se corre en tiempo laborable (respeta turno, almuerzo, cierre y finde).
// ============================================================
export interface Plan { startISO: string; endISO: string; estimada: boolean }

// Clave de orden: por donde arranca realmente cada tarea; a igualdad, por prioridad.
function claveOrden(t: Tarea): string {
  return t.inicioReal ?? t.inicioPlanificado ?? ''
}

export function programar(tareas: Tarea[], ahoraISO: string, grupo: GrupoAlmuerzo = GRUPO_ALMUERZO_DEFAULT): Map<string, Plan> {
  const out = new Map<string, Plan>()
  // Cursor = instante en que se libera cada recurso.
  const finMaquina = new Map<string, string>()
  const finOperario = new Map<string, string>()

  // Se procesa TODO en orden cronologico (no por maquina): asi los cursores de
  // maquina y de operario se van llenando en el orden real de ejecucion.
  const ordenadas = [...tareas].sort((a, b) => {
    const ak = claveOrden(a), bk = claveOrden(b)
    if (ak && bk && ak !== bk) return ak < bk ? -1 : 1
    if (ak && !bk) return -1
    if (!ak && bk) return 1
    return a.prioridad - b.prioridad
  })

  for (const t of ordenadas) {
    const mk = t.maquinaId
    const ok = t.operarioId

    if (t.inicioReal) {
      // Ya arranco: se dibuja donde realmente paso. Si sigue abierta y ya paso su
      // estimado, se estira hasta ahora (el recurso sigue ocupado de verdad).
      const estEnd = sumarMinutosLaborables(t.inicioReal, t.tiempoEstandarMin, grupo)
      let endISO = t.finReal ?? estEnd
      if (!t.finReal && t.estado !== 'finalizada') endISO = ahoraISO > estEnd ? ahoraISO : estEnd
      out.set(t.id, { startISO: t.inicioReal, endISO, estimada: false })
      // El recurso queda ocupado hasta el fin (real si cerro, proyectado si sigue).
      if (mk) {
        const prev = finMaquina.get(mk)
        if (!prev || endISO > prev) finMaquina.set(mk, endISO)
      }
      if (ok) {
        const prev = finOperario.get(ok)
        if (!prev || endISO > prev) finOperario.set(ok, endISO)
      }
      continue
    }

    // Pendiente: arranca lo antes posible, pero nunca antes de AHORA ni antes de
    // que se liberen su estacion y su colaborador.
    const planificado = t.inicioPlanificado ?? ''
    let startISO = planificado && planificado > ahoraISO ? planificado : ahoraISO
    const cm = mk ? finMaquina.get(mk) : undefined
    if (cm && cm > startISO) startISO = cm
    const co = ok ? finOperario.get(ok) : undefined
    if (co && co > startISO) startISO = co

    startISO = proximoInstanteLaborable(startISO, grupo)
    const endISO = sumarMinutosLaborables(startISO, t.tiempoEstandarMin, grupo)
    out.set(t.id, { startISO, endISO, estimada: true })
    if (mk) finMaquina.set(mk, endISO)
    if (ok) finOperario.set(ok, endISO)
  }
  return out
}
