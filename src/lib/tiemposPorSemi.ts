import type { AreaDemora, SectorId, Tarea } from '../types'
import { areaDemora, esReparacion, sectorById } from '../types'
import { componentePorCodigo } from '../data/catalogo'
import { metricasTarea } from './kpi'
import { mediana } from './estandaresSugeridos'

// ============================================================
// TIEMPOS REALES POR SEMIELABORADO (v2.14)
//
// Responde a "¿cuánto tarda realmente cada bobina / cada parte activa?".
//
// No confundir con el ASISTENTE DE ESTÁNDARES (`estandaresSugeridos.ts`): ese
// muestra SOLO los grupos que conviene corregir (mínimo 3 muestras y más de 5%
// de desvío). Acá salen TODOS, aunque tengan una sola tarea, porque el uso es
// distinto: mirar el panorama completo, no decidir un ajuste puntual.
//
// ------------------------------------------------------------
// POR QUÉ ESTO NO SE PUEDE SACAR CON UNA CONSULTA SQL
//
// El tiempo hay que medirlo en HORAS HÁBILES: sin noches, sin fines de semana,
// sin feriados, sin el almuerzo y sin los días que el colaborador faltó. Un
// `avg(fin_real - inicio_real)` en Supabase devuelve tiempo de reloj: una bobina
// que cruza el fin de semana daría 60 horas. Es el bug que se arregló en v1.45 y
// que volvió dos veces por otros caminos. Por eso esto vive acá, sobre
// `metricasTarea`, que es la única fuente que sabe medir bien.
// ------------------------------------------------------------
//
// SE USA EL TIEMPO **NETO** (real menos las demoras justificadas). La pregunta
// es cuánto lleva HACER la pieza, no cuánto tardó incluyendo la media hora que
// esperó el material. Para lo otro están el Pareto y los cuellos.
// ============================================================

export interface TiempoSemi {
  /** Clave del grupo: semielaborado (o modelo si no tiene) + sector. */
  id: string
  /** Lo que se produce: descripción del semielaborado, o el modelo. */
  semielaborado: string
  /** Código del catálogo, si lo tiene. */
  codigo?: string
  modelo: string
  area: AreaDemora
  sectorId: SectorId
  sector: string
  muestras: number
  /** Mediana del tiempo neto. Es el número en el que hay que confiar. */
  medianaMin: number
  /** Promedio del tiempo neto. Se muestra al lado para poder compararlos. */
  promedioMin: number
  minMin: number
  maxMin: number
  /** Promedio del estándar con que se planificaron esas tareas. */
  estandarMin: number
  /** (mediana − estándar) / estándar. Positivo = tarda más de lo planificado. */
  desvioPct: number
}

/**
 * Una fila por semielaborado y sector.
 *
 * Se separa por sector a propósito: la misma parte activa armada en distribución
 * y en rural son dos operaciones distintas y no tienen por qué tardar lo mismo.
 *
 * @param areas si se pasa, filtra (ej. ['bobinado', 'montaje']).
 */
export function tiemposPorSemielaborado(tareas: Tarea[], areas?: AreaDemora[]): TiempoSemi[] {
  interface Acum {
    semielaborado: string; codigo?: string; modelo: string
    area: AreaDemora; sectorId: SectorId
    netos: number[]; estandares: number[]
  }
  const grupos = new Map<string, Acum>()

  for (const t of tareas) {
    if (t.estado !== 'finalizada') continue
    if (esReparacion(t)) continue   // no tienen estándar de pieza
    if (t.esPrototipo) continue     // una prueba única no sirve de referencia

    const area = areaDemora(t.sectorId)
    if (areas && !areas.includes(area)) continue

    const m = metricasTarea(t)
    // Neto 0 = tarea sin tiempo útil (mal cerrada). El auditor ya la marca.
    if (m.real - m.justificada <= 0) continue

    const comp = t.componenteCodigo ? componentePorCodigo(t.componenteCodigo) : undefined
    const etiqueta = comp?.descripcion ?? t.componenteCodigo ?? t.modelo
    const id = `${t.componenteCodigo ?? t.modelo}||${t.sectorId}`

    const g = grupos.get(id) ?? {
      semielaborado: etiqueta, codigo: t.componenteCodigo, modelo: t.modelo,
      area, sectorId: t.sectorId, netos: [], estandares: [],
    }
    g.netos.push(m.real - m.justificada)
    g.estandares.push(m.estimado)
    grupos.set(id, g)
  }

  const out: TiempoSemi[] = []
  for (const [id, g] of grupos) {
    const med = Math.round(mediana(g.netos))
    const prom = Math.round(g.netos.reduce((a, b) => a + b, 0) / g.netos.length)
    const est = Math.round(g.estandares.reduce((a, b) => a + b, 0) / g.estandares.length)
    out.push({
      id,
      semielaborado: g.semielaborado,
      codigo: g.codigo,
      modelo: g.modelo,
      area: g.area,
      sectorId: g.sectorId,
      sector: sectorById(g.sectorId).nombre,
      muestras: g.netos.length,
      medianaMin: med,
      promedioMin: prom,
      minMin: Math.round(Math.min(...g.netos)),
      maxMin: Math.round(Math.max(...g.netos)),
      estandarMin: est,
      desvioPct: est > 0 ? (med - est) / est : 0,
    })
  }

  // Por sector y después por nombre: así se lee como un listado de planta.
  return out.sort((a, b) => (a.sector === b.sector
    ? a.semielaborado.localeCompare(b.semielaborado)
    : a.sector.localeCompare(b.sector)))
}
