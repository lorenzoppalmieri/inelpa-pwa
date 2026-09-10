import type { CorteLuz, Parada, SectorId, Tarea } from '../types'

// ============================================================
// CORTES DE LUZ (v2.12)
//
// EL PROBLEMA FÍSICO. Las tablets están enchufadas a 220 V: cuando se corta la
// luz se apagan, justo en el momento en que el operario tendría que registrar la
// parada. La demora existe pero nadie puede cargarla, y después aparece como
// "demora sin justificar" de alguien que no hizo nada malo.
//
// LA SOLUCIÓN. Cuando vuelve la luz, el planificador carga el rango horario y
// los sectores afectados. El sistema le agrega esa parada a todas las tareas
// cuyo trabajo cruzó el corte.
//
// ------------------------------------------------------------
// DECISIÓN DE DISEÑO: LA PARADA ES **VIRTUAL**, NO SE GUARDA EN LA TAREA.
//
// La alternativa obvia era escribir una `Parada` dentro de cada `Tarea`
// afectada. Se descartó por tres razones concretas:
//
//  1. Un corte que pega en 20 tareas dispararía 20 escrituras y 20 mensajes en
//     la cola de sync, desde una tablet que puede estar offline.
//  2. Deshacer un corte cargado con la hora equivocada obligaría a recorrer las
//     20 tareas de nuevo y borrar la parada de cada una, con el riesgo de dejar
//     la mitad hecha si algo falla en el medio.
//  3. Editar el rango horario sería borrar y volver a escribir todo.
//
// Guardando SOLO el corte y derivando la parada al vuelo, las tres cosas se
// resuelven solas: corregir la hora o borrar el corte recalcula todo al
// instante, sin tocar ninguna tarea. Mismo patrón que feriados y ausencias.
//
// El precio: cualquier código que lea `t.paradas` en crudo NO ve estas paradas.
// Por eso `desglosePausas` —la fuente única que consumen el Gantt, los KPIs y el
// Pareto— las inyecta ahí, y todo lo demás las hereda.
// ============================================================

/** Causa única para toda la planta: un corte es UN evento, no tres por sector. */
export const CAUSA_CORTE_LUZ = 'corte_luz'

/** Registro en memoria, lo llena el sync desde Dexie (igual que FERIADOS). */
let CORTES: CorteLuz[] = []

export function setCortesLuz(cs: CorteLuz[]): void {
  CORTES = cs
}

export function cortesLuzCargados(): CorteLuz[] {
  return CORTES
}

/** ¿El corte alcanzó a ese sector? `sectores` vacío = toda la planta. */
export function corteAfectaSector(c: CorteLuz, sectorId: SectorId): boolean {
  return c.sectores.length === 0 || c.sectores.includes(sectorId)
}

const ms = (iso: string) => new Date(iso).getTime()

/**
 * Ventana de trabajo de la tarea. Una tarea sin arrancar no puede haber sufrido
 * un corte; una en curso se considera abierta hasta ahora.
 */
function ventanaDeTarea(t: Tarea, ahoraISO: string): { ini: number; fin: number } | null {
  if (!t.inicioReal) return null
  return { ini: ms(t.inicioReal), fin: ms(t.finReal ?? ahoraISO) }
}

/**
 * Paradas VIRTUALES de corte de luz que le corresponden a una tarea.
 *
 * El tramo se recorta a la intersección entre el corte y el trabajo de la tarea:
 * si el corte fue de 10:00 a 12:00 pero la tarea arrancó 11:00, solo cuenta la
 * hora que efectivamente la frenó.
 *
 * NOTA: no hace falta descontar acá noches ni almuerzos. El tramo se mide después
 * con el motor de horas hábiles, y si se pisa con otra parada que el operario sí
 * llegó a cargar, la fusión de intervalos evita el doble conteo (v1.89).
 */
export function paradasDeCorte(t: Tarea, ahoraISO = new Date().toISOString()): Parada[] {
  const v = ventanaDeTarea(t, ahoraISO)
  if (!v) return []

  const out: Parada[] = []
  for (const c of CORTES) {
    if (!corteAfectaSector(c, t.sectorId)) continue
    const ini = Math.max(v.ini, ms(c.desde))
    const fin = Math.min(v.fin, ms(c.hasta))
    if (fin <= ini) continue // no se tocan
    out.push({
      // Id determinista: si el mismo corte se recalcula, es la MISMA parada.
      id: `corte_${c.id}_${t.id}`,
      tareaId: t.id,
      causa: CAUSA_CORTE_LUZ as Parada['causa'],
      inicio: new Date(ini).toISOString(),
      fin: new Date(fin).toISOString(),
      observacion: c.nota?.trim() || 'Corte de luz registrado por planificación',
      corteLuzId: c.id,
    })
  }
  return out
}

export interface ResumenCorte {
  corte: CorteLuz
  /** Minutos de reloj del corte (lo que se informa como "planta parada"). */
  minutosCorte: number
  /** Tareas que estaban trabajando cuando se cortó. */
  tareasAfectadas: number
  /** Suma de los minutos que el corte le comió a cada tarea. */
  minutosProductivosPerdidos: number
}

/**
 * Informe de un corte: cuánto estuvo parada la planta y a cuántas tareas pegó.
 *
 * Los dos números son distintos y los dos importan:
 *  - `minutosCorte` es el reloj: "la planta estuvo parada 1h 40m".
 *  - `minutosProductivosPerdidos` los suma POR TAREA, así que si el corte frenó
 *    a 6 bobinadoras a la vez, son 6 × 100' = 600' de producción perdida.
 */
export function resumenDeCorte(c: CorteLuz, tareas: Tarea[], ahoraISO = new Date().toISOString()): ResumenCorte {
  const minutosCorte = Math.max(0, Math.round((ms(c.hasta) - ms(c.desde)) / 60000))
  let tareasAfectadas = 0
  let minutosProductivosPerdidos = 0

  for (const t of tareas) {
    if (!corteAfectaSector(c, t.sectorId)) continue
    const v = ventanaDeTarea(t, ahoraISO)
    if (!v) continue
    const ini = Math.max(v.ini, ms(c.desde))
    const fin = Math.min(v.fin, ms(c.hasta))
    if (fin <= ini) continue
    tareasAfectadas++
    minutosProductivosPerdidos += Math.round((fin - ini) / 60000)
  }

  return { corte: c, minutosCorte, tareasAfectadas, minutosProductivosPerdidos }
}
