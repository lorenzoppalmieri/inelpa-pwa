import type { AreaDemora, ComponenteSemielaborado, OrdenProduccion, SectorId, Tarea } from '../types'
import { areaDemora, componenteEsDeOtroSector, componenteSirveSector } from '../types'
import { componentePorCodigo, componentesDeModelo, modeloDeOrden } from '../data/catalogo'

// ============================================================
// SALDO DE UNA OF POR SEMIELABORADO (v2.55)
//
// Hasta la v2.54, 1 tarea = 1 unidad y el cupo se contaba con `.length`. Con
// SAP llegan OF de, por ejemplo, 100 bobinas F2 BT, y la planificadora las
// reparte entre las estaciones que quiera (30 + 40 + 30). La regla:
//
//   saldo = cantidad de la OF (la que planificó SAP)
//           − suma de `cantidad` de las tareas ya asignadas (cualquier estado)
//
// La PWA NO deja inventar cantidades: no se puede asignar más que el saldo, y
// la cantidad de una OF de SAP no se edita en la PWA. Si se borra una tarea,
// desaparece de Dexie y sus unidades vuelven solas al saldo.
//
// Antes este cálculo estaba COPIADO en PlanificacionView y en EditarTarea. Ahora
// los dos llaman a esta función (un cálculo, una sola función).
// ============================================================

/** Unidades que cubre una tarea. Las anteriores a v2.55 no tienen cantidad: valen 1. */
export function cantidadTarea(t: Pick<Tarea, 'cantidad'>): number {
  const n = Number(t.cantidad)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * ¿El sector admite más de una unidad por tarea?
 * Montaje PO: NO. Cada tarea es UN transformador: genera UN ensayo de
 * laboratorio con su N° de serie. Con 3 unidades en una PO, el laboratorio
 * ensayaría 1 y se perderían 2. El saldo de la OF se respeta igual: 20
 * transformadores = 20 tareas de a 1.
 * v2.56: Montaje PA SÍ admite cantidad. Con SAP la parte activa es un
 * semielaborado más (OF de 100 partes activas repartidas entre estaciones).
 */
export function admiteCantidad(sectorId: SectorId): boolean {
  return sectorId !== 'montaje_po_dist' && sectorId !== 'montaje_po_rural'
}

/**
 * v2.56: ¿la OF vino de SAP con su artículo? Entonces la OF YA ES el
 * semielaborado (o el transformador): no se elige semielaborado, la tarea toma
 * el ItemCode de la OF y el saldo es la cantidad que planificó SAP.
 */
export function esOfSap(o: OrdenProduccion | undefined): o is OrdenProduccion & { itemCode: string } {
  return !!o && o.origen === 'sap' && !!o.itemCode
}

/** Evita basura de coma flotante al sumar decimales (0.1 + 0.2). */
function redondear(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * Semielaborados que se planifican contra una OF:
 *  - OF de transformador: los de la receta del modelo.
 *  - OF de un semielaborado (SAP manda, p. ej., una OF de 100 BOBBAJ...): el
 *    propio artículo. Antes no se ofrecía nada ("modelo no está en el catálogo").
 * Si SAP mandó OF HIJAS para algún semielaborado de la receta, ese semielaborado
 * se planifica contra la hija y se saca de la madre: si no, las mismas 20 bobinas
 * se podían planificar dos veces (20 por la madre + 20 por la hija).
 */
export function semielaboradosDeOrden(orden: OrdenProduccion | undefined, ordenes: OrdenProduccion[] = []): ComponenteSemielaborado[] {
  if (!orden) return []
  const modelo = modeloDeOrden(orden)
  if (modelo) {
    const conOfPropia = new Set(
      orden.sapDocEntry != null
        ? ordenes.filter((o) => o.sapParentDocEntry === orden.sapDocEntry && o.itemCode).map((o) => o.itemCode as string)
        : [],
    )
    return componentesDeModelo(modelo).filter((c) => !conOfPropia.has(c.codigo))
  }
  const propio = componentePorCodigo(orden.itemCode)
  return propio ? [propio] : []
}

export interface SaldoSemi {
  /** Lo que pide la OF (cantidad de SAP). Cada semielaborado de la receta va 1 por transformador. */
  total: number
  /** Suma de las tareas ya asignadas, en cualquier estado. */
  asignado: number
  /** De lo asignado, lo que ya está finalizado. */
  terminado: number
  /** Lo que queda por asignar (nunca negativo). */
  restante: number
}

/**
 * Saldo de un semielaborado dentro de una OF.
 * @param excluirTareaId la tarea que se está editando no se descuenta a sí misma.
 * @param area v2.56, solo OF de SAP: el saldo se cuenta POR ETAPA. Una OF de 10
 *   cubas se suelda 10 veces (herrería) y se pinta 10 veces (pintura): pintar
 *   no puede comerse el saldo de soldar. Las OF cargadas a mano no lo usan
 *   (cada componente de su receta ya es de un solo sector).
 */
export function saldoSemielaborado(
  orden: OrdenProduccion | undefined,
  componenteCodigo: string,
  tareas: Tarea[],
  excluirTareaId?: string,
  area?: AreaDemora,
): SaldoSemi {
  const total = orden?.cantidad ?? 1
  let asignado = 0
  let terminado = 0
  if (orden) {
    for (const t of tareas) {
      if (t.ordenId !== orden.id || t.componenteCodigo !== componenteCodigo || t.id === excluirTareaId) continue
      if (area && areaDemora(t.sectorId) !== area) continue
      const n = cantidadTarea(t)
      asignado += n
      if (t.estado === 'finalizada') terminado += n
    }
  }
  asignado = redondear(asignado)
  terminado = redondear(terminado)
  return { total, asignado, terminado, restante: Math.max(0, redondear(total - asignado)) }
}

/** v2.56: saldo de una OF de SAP en la etapa del sector elegido. */
export function saldoOfSap(
  orden: OrdenProduccion & { itemCode: string },
  sectorId: SectorId,
  tareas: Tarea[],
  excluirTareaId?: string,
): SaldoSemi {
  return saldoSemielaborado(orden, orden.itemCode, tareas, excluirTareaId, areaDemora(sectorId))
}

export interface SemiAsignable { c: ComponenteSemielaborado; saldo: SaldoSemi; deOtroSector: boolean }

/**
 * Semielaborados de la OF que sirven al sector, con su saldo. Se ocultan los
 * que ya están completos, salvo `mantenerCodigo` (el de la tarea que se edita,
 * para no perderlo del desplegable).
 */
export function semielaboradosAsignables(
  orden: OrdenProduccion | undefined,
  ordenes: OrdenProduccion[],
  sectorId: SectorId,
  tareas: Tarea[],
  opciones: { excluirTareaId?: string; mantenerCodigo?: string } = {},
): SemiAsignable[] {
  return semielaboradosDeOrden(orden, ordenes)
    .filter((c) => componenteSirveSector(c.sectorId, sectorId))
    .map((c) => ({
      c,
      saldo: saldoSemielaborado(orden, c.codigo, tareas, opciones.excluirTareaId),
      deOtroSector: componenteEsDeOtroSector(c.sectorId, sectorId),
    }))
    .filter((x) => x.saldo.restante > 0 || x.c.codigo === opciones.mantenerCodigo)
}

/** ¿La OF tiene semielaborados para este sector? (aunque ya estén todos asignados) */
export function sectorTieneSemielaborado(orden: OrdenProduccion | undefined, ordenes: OrdenProduccion[], sectorId: SectorId): boolean {
  return semielaboradosDeOrden(orden, ordenes).some((c) => componenteSirveSector(c.sectorId, sectorId))
}

export type ResultadoCantidad = { ok: true; cantidad: number } | { ok: false; error: string }

/**
 * Valida la cantidad que escribió la planificadora contra el saldo.
 * `decimales`: hoy siempre false (todo semielaborado es en unidades y la OF
 * trae una cantidad entera). Queda listo para cuando llegue una OF en kg/l.
 */
export function validarCantidad(valor: string | number, restante: number, decimales = false): ResultadoCantidad {
  const txt = String(valor).trim().replace(',', '.')
  const n = Number(txt)
  if (!txt || !Number.isFinite(n) || n <= 0) return { ok: false, error: 'La cantidad tiene que ser mayor a 0.' }
  if (!decimales && !Number.isInteger(n)) return { ok: false, error: 'La cantidad va en unidades enteras.' }
  const cantidad = redondear(n)
  if (cantidad > restante) {
    return { ok: false, error: `Quedan ${restante} por asignar en esta OF; no se puede asignar ${cantidad}.` }
  }
  return { ok: true, cantidad }
}

/** Tiempo estándar TOTAL de la tarea: el estándar es por unidad (lo que aprende el asistente) × cantidad. */
export function estandarTotalMin(porUnidadMin: number, cantidad: number): number {
  return Math.max(1, Math.round(Math.max(0, porUnidadMin) * cantidad))
}

/** Estándar por unidad de una tarea ya cargada (para editarla y para aprender estándares). */
export function estandarPorUnidadMin(t: Pick<Tarea, 'tiempoEstandarMin' | 'cantidad'>): number {
  return t.tiempoEstandarMin / cantidadTarea(t)
}
