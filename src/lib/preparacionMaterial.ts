import type { LineaReceta, PreparacionMaterial, SectorId, Tarea } from '../types'
import { esReparacion } from '../types'
import { cantidadTarea } from './saldoOF'
import { materialesDeTarea, type MaterialCalculado } from './materiales'

// ============================================================
// TABLERO DE ENTREGA DE MATERIALES (v2.58)
//
// Logística no prepara "todo": prepara lo que se necesita primero. Cada tarea
// abierta con receta de SAP es una tarjeta que pasa por tres etapas:
//
//   Por preparar  ->  En preparación  ->  Entregado (sale del tablero)
//
// ORDEN ESTRATÉGICO: primero lo URGENTE (el operario ya arrancó y no tiene el
// material, o el arranque previsto ya pasó), después lo de HOY, después lo que
// viene, siempre por hora prevista de arranque. La hora sale de `programar()`,
// la misma cascada que dibuja el Gantt (un cálculo, una sola función): si
// logística mirara `inicioPlanificado` crudo, una tarea encolada "sin fecha"
// figuraría como atrasada desde el momento en que se cargó.
//
// COMPLEMENTO: si después de entregar la planificadora sube la cantidad de la
// tarea (10 -> 15), la tarjeta vuelve a Por preparar solo por las 5 que faltan.
// ============================================================

export type EtapaEntrega = 'por_preparar' | 'en_preparacion' | 'entregado'
export type Urgencia = 'urgente' | 'hoy' | 'proxima'

export interface ItemEntrega {
  tarea: Tarea
  prep?: PreparacionMaterial
  etapa: EtapaEntrega
  /** Ya se entregó una parte y la tarea creció: se prepara solo la diferencia. */
  complemento: boolean
  /** Unidades a preparar en esta entrega (la tarea entera, o la diferencia). */
  unidades: number
  /** Arranque previsto según la cascada del Gantt. */
  inicioISO?: string
  urgencia: Urgencia
  materiales: MaterialCalculado[]
}

const red = (n: number) => Math.round(n * 1000) / 1000

/** En qué etapa está la entrega de una tarea y cuántas unidades hay que preparar. */
export function etapaEntrega(t: Tarea, prep?: PreparacionMaterial): { etapa: EtapaEntrega; complemento: boolean; unidades: number } {
  const total = cantidadTarea(t)
  const yaEntregadas = prep?.unidadesEntregadas ?? 0
  const faltan = red(total - yaEntregadas)
  if (prep?.estado === 'en_preparacion') {
    return { etapa: 'en_preparacion', complemento: yaEntregadas > 0, unidades: faltan > 0 ? faltan : total }
  }
  if (prep?.estado === 'entregado' && faltan <= 0) return { etapa: 'entregado', complemento: false, unidades: total }
  return { etapa: 'por_preparar', complemento: yaEntregadas > 0, unidades: faltan > 0 ? faltan : total }
}

/** Fecha local YYYY-MM-DD (la planta trabaja en hora argentina, no en UTC). */
function diaLocal(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

/** Urgencia de la entrega. */
export function urgenciaEntrega(t: Pick<Tarea, 'estado'>, inicioISO: string | undefined, ahora: Date): Urgencia {
  // El operario ya está trabajando (o pausado) y el material no le llegó.
  if (t.estado === 'en_proceso' || t.estado === 'pausada') return 'urgente'
  if (!inicioISO) return 'proxima'
  const inicio = new Date(inicioISO)
  if (inicio.getTime() <= ahora.getTime()) return 'urgente'
  return diaLocal(inicio) === diaLocal(ahora) ? 'hoy' : 'proxima'
}

const RANGO: Record<Urgencia, number> = { urgente: 0, hoy: 1, proxima: 2 }

export interface OpcionesTablero {
  sectorId?: SectorId
  /**
   * Hasta qué día se muestra en Por preparar: 0 = hoy, 1 = hoy y mañana, etc.
   * (hasta el final de ese día). null = todo. Lo urgente y lo de hoy se ven siempre.
   * Es una ventana de días corridos para ordenar el trabajo, no una medición de
   * tiempo trabajado: por eso no pasa por el calendario hábil.
   */
  horizonteDias?: number | null
}

export interface Tablero {
  porPreparar: ItemEntrega[]
  enPreparacion: ItemEntrega[]
  /** Entregadas HOY (para revisar o deshacer). */
  entregadasHoy: ItemEntrega[]
  /** Tarjetas por preparar que quedan fuera del horizonte elegido. */
  fueraDeHorizonte: number
}

/**
 * Arma el tablero de logística.
 * @param planes arranque previsto por tarea (resultado de `programar()`)
 */
export function tableroEntregas(
  tareas: Tarea[],
  preparaciones: PreparacionMaterial[],
  recetas: Map<string, LineaReceta[]>,
  planes: Map<string, { startISO: string }>,
  ahora: Date,
  opciones: OpcionesTablero = {},
): Tablero {
  const prepPorTarea = new Map(preparaciones.map((p) => [p.id, p]))
  const horizonte = opciones.horizonteDias ?? null
  let limite: Date | null = null
  if (horizonte != null) {
    limite = new Date(ahora)
    limite.setDate(limite.getDate() + horizonte)
    limite.setHours(23, 59, 59, 999)
  }
  const hoy = diaLocal(ahora)

  const porPreparar: ItemEntrega[] = []
  const enPreparacion: ItemEntrega[] = []
  const entregadasHoy: ItemEntrega[] = []
  let fueraDeHorizonte = 0

  for (const t of tareas) {
    if (esReparacion(t) || !t.componenteCodigo || !recetas.has(t.componenteCodigo)) continue
    if (opciones.sectorId && t.sectorId !== opciones.sectorId) continue
    const prep = prepPorTarea.get(t.id)
    const { etapa, complemento, unidades } = etapaEntrega(t, prep)
    const inicioISO = planes.get(t.id)?.startISO
    const item: ItemEntrega = {
      tarea: t, prep, etapa, complemento, unidades, inicioISO,
      urgencia: urgenciaEntrega(t, inicioISO, ahora),
      materiales: materialesDeTarea({ componenteCodigo: t.componenteCodigo, cantidad: unidades }, recetas),
    }

    if (etapa === 'entregado') {
      // Se muestran las de hoy, aunque la tarea ya se haya terminado.
      if (prep?.entregadoEn && diaLocal(new Date(prep.entregadoEn)) === hoy) entregadasHoy.push(item)
      continue
    }
    // Una tarea terminada ya no necesita material.
    if (t.estado === 'finalizada') continue
    if (etapa === 'en_preparacion') { enPreparacion.push(item); continue }

    const dentro = limite == null || item.urgencia !== 'proxima'
      || (inicioISO != null && new Date(inicioISO).getTime() <= limite.getTime())
    if (dentro) porPreparar.push(item)
    else fueraDeHorizonte++
  }

  const porUrgencia = (a: ItemEntrega, b: ItemEntrega) =>
    RANGO[a.urgencia] - RANGO[b.urgencia] || (a.inicioISO ?? '9').localeCompare(b.inicioISO ?? '9')
  porPreparar.sort(porUrgencia)
  enPreparacion.sort(porUrgencia)
  entregadasHoy.sort((a, b) => (b.prep?.entregadoEn ?? '').localeCompare(a.prep?.entregadoEn ?? ''))
  return { porPreparar, enPreparacion, entregadasHoy, fueraDeHorizonte }
}

// ------------------------------------------------------------
// Transiciones. Devuelven el registro nuevo; quien llama lo guarda.
// ------------------------------------------------------------

/** "Preparar": la tarjeta pasa a En preparación. Conserva lo ya entregado (complemento). */
export function marcarEnPreparacion(
  t: Tarea, prev: PreparacionMaterial | undefined, responsable: string | undefined, usuario: string | undefined, ahoraISO: string,
): PreparacionMaterial {
  return {
    id: t.id,
    estado: 'en_preparacion',
    responsable: responsable || undefined,
    registradoPor: usuario || undefined,
    preparandoEn: ahoraISO,
    entregadoEn: prev?.entregadoEn,
    unidadesEntregadas: prev?.unidadesEntregadas,
    actualizado: ahoraISO,
  }
}

/** "Entregado": cubre la cantidad ACTUAL de la tarea. */
export function marcarEntregado(
  t: Tarea, prev: PreparacionMaterial | undefined, responsable: string | undefined, usuario: string | undefined, ahoraISO: string,
): PreparacionMaterial {
  return {
    id: t.id,
    estado: 'entregado',
    responsable: responsable || prev?.responsable,
    registradoPor: usuario || prev?.registradoPor,
    preparandoEn: prev?.preparandoEn ?? ahoraISO,
    entregadoEn: ahoraISO,
    unidadesEntregadas: cantidadTarea(t),
    actualizado: ahoraISO,
  }
}

/**
 * "Deshacer". Desde En preparación: vuelve a Por preparar (null = borrar el
 * registro), salvo que fuera un complemento, que vuelve a "entregado" por lo
 * que ya se había entregado. Desde Entregado: vuelve a En preparación.
 */
export function deshacerPaso(prev: PreparacionMaterial, ahoraISO: string): PreparacionMaterial | null {
  if (prev.estado === 'entregado') {
    return { ...prev, estado: 'en_preparacion', entregadoEn: undefined, unidadesEntregadas: undefined, actualizado: ahoraISO }
  }
  if (prev.unidadesEntregadas && prev.entregadoEn) {
    return { ...prev, estado: 'entregado', actualizado: ahoraISO }
  }
  return null
}
