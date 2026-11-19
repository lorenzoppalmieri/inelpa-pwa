import type { EstadoTarea, LineaReceta, SectorId, Tarea } from '../types'
import { esReparacion } from '../types'
import { cantidadTarea } from './saldoOF'

// ============================================================
// MATERIALES DE UNA TAREA (v2.57) — receta de SAP × cantidad asignada.
//
// SAP manda la receta de cada artículo POR UNIDAD (una bobina BT lleva 24,6 kg
// de foil). La tarea dice cuántas unidades se fabrican (cantidadTarea). Los
// materiales de la tarea son el producto de las dos cosas. Es SOLO LECTURA:
// la transferencia de materiales se hace en SAP (solicitud sobre la OF).
//
// Lo usan tres pantallas, y las tres llaman a ESTAS funciones (un cálculo, una
// sola función): la tarjeta del operario, la lista del planificador y la
// pestaña "Materiales por estación" de Logística.
//
// LÍMITE CONOCIDO: es la receta del ARTÍCULO, no la de la OF. Si en SAP se
// cambia un material o una cantidad en una OF puntual, la PWA no se entera
// (la OF llega sin líneas de material).
// ============================================================

export interface MaterialCalculado {
  codigo: string
  /** Nombre de SAP. Si SAP todavía no mandó el artículo (insumos), el código. */
  nombre: string
  /** Total para la tarea (o la estación): por unidad × unidades. */
  cantidad: number
  unidad: string
  /** Tiene receta propia en SAP: no sale del pañol, sale de otra OF. */
  esSemielaborado: boolean
}

const UNIDADES: Record<string, string> = {
  kilogramos: 'kg', kg: 'kg', metros: 'm', m: 'm', litros: 'l', l: 'l', unidad: 'u.', un: 'u.', unidades: 'u.',
}

/** Unidad de SAP en corto, para que la lista entre en una tablet. */
export function unidadCorta(uom?: string): string {
  if (!uom) return 'u.'
  return UNIDADES[uom.trim().toLowerCase()] ?? uom
}

const red = (n: number) => Math.round(n * 1000) / 1000

/** Cantidad legible: hasta 2 decimales, con coma (24,6 · 738 · 0,25). */
export function formatoCantidad(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

/** Recetas agrupadas por artículo y en el orden de SAP. Se arma una vez por pantalla. */
export function recetaPorArticulo(lineas: LineaReceta[]): Map<string, LineaReceta[]> {
  const m = new Map<string, LineaReceta[]>()
  for (const l of lineas) {
    const arr = m.get(l.parentCode) ?? []
    arr.push(l)
    m.set(l.parentCode, arr)
  }
  for (const arr of m.values()) arr.sort((a, b) => a.linea - b.linea)
  return m
}

/** Suma materiales por código y unidad, respetando el orden de aparición. */
function consolidar(items: MaterialCalculado[]): MaterialCalculado[] {
  const m = new Map<string, MaterialCalculado>()
  for (const it of items) {
    const k = `${it.codigo}|${it.unidad}`
    const prev = m.get(k)
    if (prev) prev.cantidad = red(prev.cantidad + it.cantidad)
    else m.set(k, { ...it })
  }
  return [...m.values()]
}

/** Materiales de UNA tarea: receta de su artículo × su cantidad. Vacío si no hay receta. */
export function materialesDeTarea(
  t: Pick<Tarea, 'componenteCodigo' | 'cantidad'>,
  recetas: Map<string, LineaReceta[]>,
): MaterialCalculado[] {
  if (!t.componenteCodigo) return []
  const lineas = recetas.get(t.componenteCodigo) ?? []
  const n = cantidadTarea(t)
  return consolidar(lineas.map((l) => ({
    codigo: l.childCode,
    nombre: l.childName ?? l.childCode,
    cantidad: red(l.cantidad * n),
    unidad: unidadCorta(l.uom),
    esSemielaborado: l.esSemielaborado,
  })))
}

export interface EstacionMateriales {
  maquinaId: string
  sectorId: SectorId
  /** Tareas abiertas de la estación, en el orden en que se van a hacer. */
  tareas: Tarea[]
  /** Todo lo que hay que tener en la estación para esas tareas, sumado. */
  materiales: MaterialCalculado[]
}

/** Clave de orden de una tarea en su estación: arranque planificado, o alta. */
const ordenTarea = (t: Tarea) => t.inicioPlanificado ?? t.creada ?? ''

/**
 * Logística: qué preparar en cada estación. Toma las tareas ABIERTAS (no
 * finalizadas, sin reparaciones) cuyo artículo tiene receta, y las agrupa por
 * estación con los materiales sumados.
 */
export function materialesPorEstacion(
  tareas: Tarea[],
  recetas: Map<string, LineaReceta[]>,
  opciones: { estados?: EstadoTarea[]; sectorId?: SectorId } = {},
): EstacionMateriales[] {
  const estados = opciones.estados ?? ['pendiente', 'en_proceso', 'pausada']
  const porEstacion = new Map<string, EstacionMateriales>()
  for (const t of tareas) {
    if (!estados.includes(t.estado) || esReparacion(t)) continue
    if (opciones.sectorId && t.sectorId !== opciones.sectorId) continue
    if (!t.componenteCodigo || !recetas.has(t.componenteCodigo)) continue
    const e = porEstacion.get(t.maquinaId) ?? { maquinaId: t.maquinaId, sectorId: t.sectorId, tareas: [], materiales: [] }
    e.tareas.push(t)
    porEstacion.set(t.maquinaId, e)
  }
  const out = [...porEstacion.values()]
  for (const e of out) {
    e.tareas.sort((a, b) => ordenTarea(a).localeCompare(ordenTarea(b)))
    e.materiales = consolidar(e.tareas.flatMap((t) => materialesDeTarea(t, recetas)))
  }
  // La estación que arranca antes, primero.
  return out.sort((a, b) => ordenTarea(a.tareas[0]).localeCompare(ordenTarea(b.tareas[0])))
}
