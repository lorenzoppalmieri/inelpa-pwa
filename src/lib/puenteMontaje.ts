import type { Maquina, SectorId, Tarea, TiempoEstandar } from '../types'
import { claveEstandar, esReparacion, maquinaSirveSector } from '../types'
import { isoWeek } from './time'

// ============================================================
// PUENTE MONTAJE PA → PO (v2.06)
//
// ATAJO MANUAL, NO AUTOMÁTICO. Una parte activa terminada NO siempre sigue a la
// parte operativa: puede guardarse como STOCK de PA y usarse más adelante, o
// para otra orden. Por eso esto es un botón que la planificadora decide apretar,
// y no un disparador que corre solo al finalizar la PA.
//
// La diferencia con el otro puente es deliberada: PO → Laboratorio SÍ es
// automático (`sgo/integraciones.ts` crea la ficha al finalizar la PO), porque
// ahí no hay decisión: todo transformador armado se ensaya. Acá sí la hay.
//
// Lo que aporta: cuando la planificadora decide que esa PA va a PO, se le evita
// volver a tipear doce datos que la app ya tiene.
//
// IDEMPOTENCIA — v2.13, CAMBIÓ EL MECANISMO.
//
// La primera versión derivaba el id de la PO del id de la PA (`po_<idPA>`) para
// que dos clics generaran la misma tarea. **No funcionaba**: `tareas.id` en
// Supabase es UUID y `po_550e8400-...` no es un UUID válido, así que el servidor
// lo rechazaba. Dexie sí lo aceptaba, con lo cual la tarea aparecía, el cartel
// decía "generada", y al recargar de la nube desaparecía. Exactamente lo que
// reportó Luis: "pone que se generó pero después no lo hace".
//
// Ahora el id es un UUID normal y la idempotencia se apoya en `origenTareaId`:
// antes de generar se busca si ya existe una PO nacida de esa PA. Es una
// garantía algo más débil (dos clics MUY rápidos podrían pasar), por eso el
// botón además se bloquea mientras guarda.
// ============================================================

/** PA → PO dentro de la misma línea. Rural con rural, distribución con dist. */
const PA_A_PO: Partial<Record<SectorId, SectorId>> = {
  montaje_pa_dist: 'montaje_po_dist',
  montaje_pa_rural: 'montaje_po_rural',
}

/** El sector PO que le corresponde a una PA, o undefined si no es una PA. */
export function sectorPODe(sectorId: SectorId): SectorId | undefined {
  return PA_A_PO[sectorId]
}

export function esMontajePA(sectorId: SectorId): boolean {
  return sectorPODe(sectorId) !== undefined
}

/** La PO ya generada a partir de esa PA, si existe. */
export function poDe(tareaPAId: string, todas: Tarea[]): Tarea | undefined {
  return todas.find((t) => t.origenTareaId === tareaPAId)
}

/**
 * Estación válida para el sector Y dada de alta. Se chequea `activo` porque el
 * resto del planificador solo ofrece estaciones activas; sin esto el atajo
 * podría mandar la tarea a una línea que está fuera de servicio.
 * `activo !== false` (y no `=== true`) por los registros viejos sin el campo.
 */
function estacionUsable(m: Maquina, sectorPO: SectorId): boolean {
  return m.activo !== false && maquinaSirveSector(m, sectorPO)
}

export type MotivoNoGenerable =
  | 'no_es_pa'          // la tarea no es de Montaje PA
  | 'no_finalizada'     // la PA todavía no terminó
  | 'es_reparacion'     // una reparación no sigue el circuito PA → PO
  | 'ya_generada'       // ya existe la PO de esta PA
  | 'sin_estacion'      // no hay línea de Montaje PO cargada para ese sector

export interface Generable {
  puede: boolean
  motivo?: MotivoNoGenerable
  /** Tarea PO existente, si ya se había generado. */
  existente?: Tarea
}

/**
 * ¿Se puede generar la PO de esta PA? Devuelve el motivo cuando no, para que la
 * tarjeta explique por qué el botón no está en vez de esconderlo sin más.
 */
export function puedeGenerarPO(pa: Tarea, todas: Tarea[], maquinas: Maquina[]): Generable {
  const sectorPO = sectorPODe(pa.sectorId)
  if (!sectorPO) return { puede: false, motivo: 'no_es_pa' }
  if (esReparacion(pa)) return { puede: false, motivo: 'es_reparacion' }
  if (pa.estado !== 'finalizada') return { puede: false, motivo: 'no_finalizada' }

  const existente = poDe(pa.id, todas)
  if (existente) return { puede: false, motivo: 'ya_generada', existente }

  if (!maquinas.some((m) => estacionUsable(m, sectorPO))) {
    return { puede: false, motivo: 'sin_estacion' }
  }
  return { puede: true }
}

export interface OpcionesPO {
  maquinas: Maquina[]
  estandares: TiempoEstandar[]
  /** Estándar de respaldo si todavía no hay uno aprendido para ese modelo. */
  estandarPorDefecto?: number
  ahoraISO?: string
}

/**
 * Construye la tarea PO a partir de la PA. NO la guarda: devolverla permite
 * testear la cuenta sin tocar la base.
 *
 * Qué se hereda: orden, modelo, fase, N° de transformador, cliente y la línea
 * de Montaje PO del sector (hay una sola por sector).
 *
 * Qué NO se hereda, a propósito:
 *  - `operarioId`: el que armó la parte activa no es necesariamente el que hace
 *    la operativa. La tarea nace SIN asignar, y en la tablet le aparece a
 *    cualquiera de la línea PO; queda reclamada cuando alguien la inicia (misma
 *    mecánica que la tablet compartida de Montaje Rural).
 *  - `componenteCodigo`: el semielaborado de la PA es la parte activa, que es
 *    justamente el INSUMO de la PO, no su producto. Copiarlo consumiría cupo de
 *    la orden dos veces.
 *  - tiempos reales, paradas y estado: la PO nace pendiente y vacía.
 */
export function construirTareaPO(pa: Tarea, op: OpcionesPO): Tarea {
  const sectorPO = sectorPODe(pa.sectorId)
  if (!sectorPO) throw new Error(`${pa.sectorId} no es un sector de Montaje PA`)

  const ahora = op.ahoraISO ?? new Date().toISOString()
  // Arranca cuando terminó la parte activa. Si la PA no tiene fin (no debería
  // llegar acá), cae a ahora. El auto-shift del Gantt la corre si la línea está
  // ocupada: no hace falta calcular la cola acá.
  const inicioPlanificado = pa.finReal ?? ahora

  const maquina = op.maquinas.find((m) => estacionUsable(m, sectorPO))
  if (!maquina) throw new Error(`No hay estación cargada para ${sectorPO}`)

  // Estándar APRENDIDO para sector + modelo (en montaje la clave no usa máquina
  // ni componente). PA y PO tienen tiempos distintos, por eso NO se copia el de
  // la parte activa: daría un desvío mal desde el primer día.
  const clave = claveEstandar(sectorPO, pa.modelo)
  const aprendido = op.estandares.find((e) => e.id === clave)?.minutos
  const estandar = Math.max(1, Math.round(aprendido ?? op.estandarPorDefecto ?? 1))

  return {
    // v2.13: UUID normal. `tareas.id` es uuid en Supabase y un id con prefijo
    // era rechazado por el servidor. El vínculo con la PA va en `origenTareaId`.
    id: crypto.randomUUID(),
    origenTareaId: pa.id,
    tipo: 'fabricacion',
    ordenId: pa.ordenId,
    sectorId: sectorPO,
    maquinaId: maquina.id,
    operarioId: undefined,
    modelo: pa.modelo,
    fase: pa.fase,
    nroTransformador: pa.nroTransformador,
    cliente: pa.cliente,
    componenteCodigo: undefined,
    semana: isoWeek(new Date(inicioPlanificado)),
    // v2.23: la PO nace acá, así que acá se congela su objetivo.
    semanaObjetivo: isoWeek(new Date(inicioPlanificado)),
    prioridad: pa.prioridad,
    estado: 'pendiente',
    tiempoEstandarMin: estandar,
    inicioPlanificado,
    creada: ahora,
    paradas: [],
    esPrototipo: pa.esPrototipo,
    notas: pa.esPrototipo ? pa.notas : undefined,
  }
}

/** true = el estándar salió del histórico; false = se usó el de respaldo. */
export function tieneEstandarAprendido(pa: Tarea, estandares: TiempoEstandar[]): boolean {
  const sectorPO = sectorPODe(pa.sectorId)
  if (!sectorPO) return false
  return estandares.some((e) => e.id === claveEstandar(sectorPO, pa.modelo))
}
