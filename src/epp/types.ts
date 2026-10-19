// ============================================================
// EPP — ENTIDADES (v1.83). Ver el catálogo y el porqué en ./catalogo.ts
// ============================================================
import type { EntregaEpp, SolicitudEpp } from '../types'
import { eppDeDefinicion } from './catalogo'

export type EstadoSolicitudEpp = 'pendiente' | 'aprobada' | 'rechazada' | 'usada'

export const ESTADOS_SOLICITUD_EPP: { id: EstadoSolicitudEpp; label: string; color: string }[] = [
  { id: 'pendiente', label: 'Esperando a HyS', color: 'var(--naranja)' },
  { id: 'aprobada', label: 'Aprobada', color: 'var(--estado-fin)' },
  { id: 'rechazada', label: 'Rechazada', color: 'var(--rojo)' },
  { id: 'usada', label: 'Entregada', color: 'var(--texto-tenue)' },
]

export function estadoSolicitudEppLabel(e: EstadoSolicitudEpp): string {
  return ESTADOS_SOLICITUD_EPP.find((x) => x.id === e)?.label ?? e
}

/** El año de la ficha: la planilla es anual y se reinicia cada 1 de enero. */
export function anioActual(d = new Date()): number {
  return d.getFullYear()
}

/** Cuántas unidades de ese EPP ya se entregaron en el año. */
export function entregadasEn(
  entregas: EntregaEpp[],
  colaboradorId: string,
  eppKey: string,
  anio: number,
): number {
  return entregas.filter((e) => e.colaboradorId === colaboradorId && e.eppKey === eppKey && e.anio === anio).length
}

/** Aprobaciones de HyS todavía sin usar para ese EPP y año. */
export function aprobacionesDisponibles(
  solicitudes: SolicitudEpp[],
  colaboradorId: string,
  eppKey: string,
  anio: number,
): SolicitudEpp[] {
  return solicitudes.filter((s) =>
    s.estado === 'aprobada' && s.colaboradorId === colaboradorId && s.eppKey === eppKey && s.anio === anio)
}

export type MotivoBloqueo = 'ok' | 'sin_cupo' | 'esperando_hys'

export interface EstadoEntrega {
  entregadas: number
  limite: number | null
  /** 'ok' = se puede entregar; 'sin_cupo' = hay que pedir a HyS; 'esperando_hys' = ya se pidió. */
  motivo: MotivoBloqueo
  /** La aprobación que se va a consumir, si la entrega sale por reposición extraordinaria. */
  aprobacion?: SolicitudEpp
}

/**
 * Decide si el de pañol puede entregar una unidad AHORA.
 *
 * Orden de evaluación:
 *  1. Si todavía hay cupo del año → se entrega normal.
 *  2. Si no hay cupo pero HyS ya aprobó una reposición sin usar → se entrega
 *     consumiendo esa aprobación.
 *  3. Si ya hay un pedido pendiente → esperando a HyS (no se pide dos veces).
 *  4. Si no → bloqueado: hay que pedir autorización.
 */
export function estadoEntrega(
  puestoId: string | undefined,
  eppKey: string,
  colaboradorId: string,
  anio: number,
  entregas: EntregaEpp[],
  solicitudes: SolicitudEpp[],
): EstadoEntrega {
  const def = eppDeDefinicion(puestoId, eppKey)
  const limite = def?.limite ?? null
  const entregadas = entregadasEn(entregas, colaboradorId, eppKey, anio)

  if (limite === null || entregadas < limite) return { entregadas, limite, motivo: 'ok' }

  const aprobacion = aprobacionesDisponibles(solicitudes, colaboradorId, eppKey, anio)[0]
  if (aprobacion) return { entregadas, limite, motivo: 'ok', aprobacion }

  const pendiente = solicitudes.some((s) =>
    s.estado === 'pendiente' && s.colaboradorId === colaboradorId && s.eppKey === eppKey && s.anio === anio)
  return { entregadas, limite, motivo: pendiente ? 'esperando_hys' : 'sin_cupo' }
}
