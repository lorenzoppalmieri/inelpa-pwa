import type { Tarea, SectorId } from '../types'
import { minutosRecupTarea } from '../types'
import { sumarMinutosLaborables, proximoInstanteLaborable, type GrupoAlmuerzo, GRUPO_ALMUERZO_DEFAULT } from './calendario'

// ============================================================
// CUANTAS TAREAS PUEDE TENER UN COLABORADOR A LA VEZ  (v2.18)
//
// Pedido de los planificadores (15/9/2026): la fila de cada bobinador tiene que
// ser UNA sola, con sus tareas una al lado de la otra. "No puede empezar otra si
// no finalizo una" — un bobinador atiende una bobina por vez, y punto.
//
// Montaje PA Rural es la excepcion declarada: puede llevar DOS partes activas en
// paralelo. Todo lo demas (Montaje PA/PO Distribucion, PO Rural, herreria,
// corte) queda como estaba: sin limite, porque ahi el paralelismo es real y
// variable, y forzarlo mentiria sobre la capacidad de la linea.
//
// v2.19 — MONTAJE VA SIN LIMITE (decision de Lorenzo, 16/9/2026).
//
// Los carriles de montaje no son personas: son CUENTAS DE EQUIPO. "Equipo
// Montaje PA Distribucion" son 5 personas trabajando sobre la misma linea, que
// llevan 5 partes activas en paralelo. Serializarlas de a una —que es lo que
// hacia la cascada— le dibujaba al planificador una cola larguisima que no
// existe, y le escondia que en realidad tiene lugar para seguir cargando.
//
// Se eligio "sin limite" antes que un numero por sector: la dotacion de cada
// linea cambia, y un tope mal puesto miente igual que no tener ninguno, solo
// que en la direccion contraria. Sin limite, cada tarea de montaje arranca en
// su hora planificada y el Gantt muestra la carga real; si la linea esta
// sobrecargada se ve por la cantidad de barras superpuestas, no por una cola
// inventada. (Esto reemplaza el "PA Rural = 2" de v2.18: 2 era correcto como
// dotacion, pero como TOPE tampoco aportaba.)
//
// Bobinado sigue en 1 y eso NO es negociable: ahi el carril es una persona con
// una bobinadora, y "no puede empezar otra si no finalizo una" es la regla que
// pidieron los planificadores. Herreria y corte quedan en 1, como estaban.
//
// ESTE NUMERO NO TOPEA LAS FILAS DEL GANTT. El render siempre abre las filas que
// haga falta para que ninguna barra tape a otra (ver GanttOperativo v2.19).
// Aca solo se decide cuanto encola la cascada; alla, como se dibuja. Confundir
// las dos cosas fue el bug de v2.18.
// ============================================================
export function capacidadRecurso(sectorId: SectorId): number {
  if (sectorId.startsWith('montaje')) return Infinity
  return 1   // bobinado (una persona, una bobinadora), herreria, corte, laboratorio
}

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

// ------------------------------------------------------------
// Cursores con N huecos. Cada recurso (maquina u operario) tiene `capacidad`
// huecos; cada hueco guarda hasta cuando esta ocupado.
//   - libreDesde(): el hueco que se libera ANTES es el que va a usar la proxima
//     tarea, asi que la respuesta es el MINIMO de los huecos. Con capacidad 1 es
//     el cursor unico de siempre.
//   - ocupar(): mete el fin en el hueco que estaba libre primero.
// ------------------------------------------------------------
class Huecos {
  private slots: number[]
  /** true = capacidad infinita: el recurso nunca frena a nadie (montaje). */
  private sinLimite: boolean
  constructor(capacidad: number) {
    // OJO: `new Array(Infinity)` explota. La capacidad infinita se modela con un
    // flag, no con un array gigante.
    this.sinLimite = !Number.isFinite(capacidad)
    this.slots = this.sinLimite ? [] : new Array(Math.max(1, capacidad)).fill(-Infinity)
  }
  libreDesde(): number { return this.sinLimite ? -Infinity : Math.min(...this.slots) }
  ocupar(finMs: number): void {
    if (this.sinLimite) return
    let i = 0
    for (let k = 1; k < this.slots.length; k++) if (this.slots[k] < this.slots[i]) i = k
    // El hueco nunca retrocede: si ya estaba ocupado mas alla, se respeta.
    this.slots[i] = Math.max(this.slots[i], finMs)
  }
}

export function programar(tareas: Tarea[], ahoraISO: string, grupo: GrupoAlmuerzo = GRUPO_ALMUERZO_DEFAULT): Map<string, Plan> {
  const out = new Map<string, Plan>()
  // Cursor = instante en que se libera cada recurso. v2.18: con N huecos, para
  // que Montaje PA Rural pueda llevar dos partes activas en paralelo.
  const finMaquina = new Map<string, Huecos>()
  const finOperario = new Map<string, Huecos>()
  const huecosDe = (mapa: Map<string, Huecos>, clave: string, sectorId: SectorId): Huecos => {
    let h = mapa.get(clave)
    if (!h) { h = new Huecos(capacidadRecurso(sectorId)); mapa.set(clave, h) }
    return h
  }

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

    // v2.18: la hora de recuperacion estira el dia laborable de ESA tarea. Antes
    // no se pasaba y el Gantt ignoraba por completo que el colaborador se queda
    // 30' o 1h mas: la barra no crecia y la cola siguiente no se corria.
    // 0 si no la marco. Antes no se pasaba nada y `tramosLaborables` asumia 60,
    // o sea que el Gantt le planificaba trabajo en la franja de recuperacion a
    // TODOS, la hubieran devuelto o no.
    const recup = minutosRecupTarea(t)
    const sumar = (desde: string, min: number) => sumarMinutosLaborables(desde, min, grupo, recup)

    if (t.inicioReal) {
      // Ya arranco: se dibuja donde realmente paso. Si sigue abierta y ya paso su
      // estimado, se estira hasta ahora (el recurso sigue ocupado de verdad).
      const estEnd = sumar(t.inicioReal, t.tiempoEstandarMin)
      let endISO = t.finReal ?? estEnd
      if (!t.finReal && t.estado !== 'finalizada') endISO = elMasTardio(estEnd, ahoraISO)
      out.set(t.id, { startISO: t.inicioReal, endISO, estimada: false })
      // El recurso queda ocupado hasta el fin (real si cerro, proyectado si sigue).
      if (mk) huecosDe(finMaquina, mk, t.sectorId).ocupar(ms(endISO))
      if (ok) huecosDe(finOperario, ok, t.sectorId).ocupar(ms(endISO))
      continue
    }

    // Pendiente: arranca lo antes posible, pero nunca antes de AHORA ni antes de
    // que se liberen su estacion y su colaborador.
    const planificado = t.inicioPlanificado ?? ''
    // Arranca lo mas tarde entre: ahora, su hora planificada, y la liberacion de
    // su estacion y de su colaborador. Todo comparado por instante.
    //
    // Este `ahoraISO` es lo que hace que la cola "corra sola": el Gantt lo
    // refresca cada 60s, asi que mientras la tarea en curso se pasa del
    // estimado, la pendiente siguiente se va corriendo en pantalla en vez de
    // quedarse clavada en su horario viejo.
    let startISO = esPosterior(planificado, ahoraISO) ? planificado : ahoraISO
    let startMs = ms(startISO)
    if (mk) startMs = Math.max(startMs, huecosDe(finMaquina, mk, t.sectorId).libreDesde())
    if (ok) startMs = Math.max(startMs, huecosDe(finOperario, ok, t.sectorId).libreDesde())
    if (Number.isFinite(startMs)) startISO = new Date(startMs).toISOString()

    // Si no entra en lo que queda del dia, sumarMinutosLaborables la parte y la
    // sigue al dia siguiente; pasado el viernes cae el lunes a las 07:00. El
    // desborde a la semana que viene sale de aca, no hace falta nada extra.
    startISO = proximoInstanteLaborable(startISO, grupo, recup)
    const endISO = sumar(startISO, t.tiempoEstandarMin)
    out.set(t.id, { startISO, endISO, estimada: true })
    if (mk) huecosDe(finMaquina, mk, t.sectorId).ocupar(ms(endISO))
    if (ok) huecosDe(finOperario, ok, t.sectorId).ocupar(ms(endISO))
  }
  return out
}
