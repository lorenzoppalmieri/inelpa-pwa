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
//
// v2.17 — NUNCA COMPARAR ISO COMO TEXTO. Hasta esta version todo este archivo
// ordenaba y comparaba instantes con `<` y `>` sobre strings. Eso esta MAL y es
// la causa raiz del solapamiento que Lorenzo reporto tres veces:
//
//   las tablets escriben   2026-09-14T10:30:00.000Z
//   Supabase devuelve      2026-09-14T10:30:00+00:00
//
// Es el MISMO instante, pero como texto no son iguales: en la posicion donde
// divergen, '+' (43) es menor que '.' (46), asi que lo que viene de Supabase
// compara SIEMPRE como anterior. Peor todavia con un offset real (`-03:00`):
// "2026-09-14T16:00:00-03:00" (=19:00Z) parece anterior a "2026-09-14T17:00:00.000Z"
// y es tres horas posterior.
//
// Consecuencia concreta: `if (cursor > startISO)` no frenaba a la tarea
// siguiente, el recurso quedaba "libre" y las barras se pisaban — con los datos
// perfectamente bien cargados.
//
// Es la TERCERA vez que este mismo error aparece en el proyecto (antes en
// huecos.ts y en fusionarIntervalos, v2.12). La regla es: comparar por instante
// con ms(), nunca por string. Ver [[reference_medicion_tiempos]].
// ============================================================
export interface Plan { startISO: string; endISO: string; estimada: boolean }

/** Instante de un ISO, en ms. NaN si la fecha es vacia o invalida. */
const ms = (iso: string | null | undefined): number =>
  iso ? new Date(iso).getTime() : NaN

/** `a` es posterior a `b`? Falso si alguno no es una fecha valida. */
const esPosterior = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const x = ms(a), y = ms(b)
  return Number.isFinite(x) && Number.isFinite(y) && x > y
}

/** El mas tardio de dos instantes. Si uno no es valido, devuelve el otro. */
const elMasTardio = (a: string, b: string | undefined): string =>
  esPosterior(b, a) ? (b as string) : a

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
    // Se ordena por INSTANTE, no por texto: ver la nota de v2.17 arriba.
    const ak = ms(claveOrden(a)), bk = ms(claveOrden(b))
    const aOk = Number.isFinite(ak), bOk = Number.isFinite(bk)
    if (aOk && bOk && ak !== bk) return ak - bk
    if (aOk && !bOk) return -1
    if (!aOk && bOk) return 1
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
      if (!t.finReal && t.estado !== 'finalizada') endISO = elMasTardio(estEnd, ahoraISO)
      out.set(t.id, { startISO: t.inicioReal, endISO, estimada: false })
      // El recurso queda ocupado hasta el fin (real si cerro, proyectado si sigue).
      if (mk) finMaquina.set(mk, elMasTardio(endISO, finMaquina.get(mk)))
      if (ok) finOperario.set(ok, elMasTardio(endISO, finOperario.get(ok)))
      continue
    }

    // Pendiente: arranca lo antes posible, pero nunca antes de AHORA ni antes de
    // que se liberen su estacion y su colaborador.
    const planificado = t.inicioPlanificado ?? ''
    // Arranca lo mas tarde entre: ahora, su hora planificada, y la liberacion de
    // su estacion y de su colaborador. Todo comparado por instante.
    let startISO = esPosterior(planificado, ahoraISO) ? planificado : ahoraISO
    if (mk) startISO = elMasTardio(startISO, finMaquina.get(mk))
    if (ok) startISO = elMasTardio(startISO, finOperario.get(ok))

    startISO = proximoInstanteLaborable(startISO, grupo)
    const endISO = sumarMinutosLaborables(startISO, t.tiempoEstandarMin, grupo)
    out.set(t.id, { startISO, endISO, estimada: true })
    // elMasTardio y no asignacion directa: proximoInstanteLaborable pudo haber
    // adelantado el arranque dentro del turno, pero el cursor nunca retrocede.
    if (mk) finMaquina.set(mk, elMasTardio(endISO, finMaquina.get(mk)))
    if (ok) finOperario.set(ok, elMasTardio(endISO, finOperario.get(ok)))
  }
  return out
}
