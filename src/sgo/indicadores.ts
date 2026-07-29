import type { AreaSGOId, PilarSGO } from './types'

export type DireccionKPI = 'mayor_mejor' | 'menor_mejor'
export type EstadoSemaforo = 'verde' | 'amarillo' | 'rojo' | 'sin_dato'

export interface IndicadorSGO {
  id: string
  areaId: AreaSGOId
  pilar: PilarSGO
  nombre: string
  unidad: string
  direccion: DireccionKPI
  meta: number
  umbralAmarillo: number
  valorActual?: number
  periodo: string
  activo: boolean
  actualizadoEn: string
  actualizadoPor: string
}

export function estadoIndicador(i: IndicadorSGO): EstadoSemaforo {
  if (!i.activo || i.valorActual === undefined || !Number.isFinite(i.valorActual)) return 'sin_dato'
  if (i.direccion === 'mayor_mejor') {
    if (i.valorActual >= i.meta) return 'verde'
    if (i.valorActual >= i.umbralAmarillo) return 'amarillo'
    return 'rojo'
  }
  if (i.valorActual <= i.meta) return 'verde'
  if (i.valorActual <= i.umbralAmarillo) return 'amarillo'
  return 'rojo'
}

export function configuracionUmbralValida(i: Pick<IndicadorSGO, 'direccion' | 'meta' | 'umbralAmarillo'>): boolean {
  return i.direccion === 'mayor_mejor' ? i.umbralAmarillo <= i.meta : i.umbralAmarillo >= i.meta
}

export const KPI_SUGERIDOS: Record<PilarSGO, { nombre: string; unidad: string; direccion: DireccionKPI }[]> = {
  seguridad: [
    { nombre: 'Incidentes registrables', unidad: 'cantidad', direccion: 'menor_mejor' },
    { nombre: 'Observaciones preventivas cerradas', unidad: '%', direccion: 'mayor_mejor' },
  ],
  calidad: [
    { nombre: 'First Pass Yield', unidad: '%', direccion: 'mayor_mejor' },
    { nombre: 'Retrabajos', unidad: 'cantidad', direccion: 'menor_mejor' },
  ],
  ambiente: [
    { nombre: 'Scrap sobre material consumido', unidad: '%', direccion: 'menor_mejor' },
    { nombre: 'Incidentes ambientales', unidad: 'cantidad', direccion: 'menor_mejor' },
  ],
  entrega: [
    { nombre: 'Cumplimiento del plan', unidad: '%', direccion: 'mayor_mejor' },
    { nombre: 'Órdenes atrasadas', unidad: 'cantidad', direccion: 'menor_mejor' },
  ],
  costos: [
    { nombre: 'Costo de no calidad', unidad: '$', direccion: 'menor_mejor' },
    { nombre: 'Desvío de costo', unidad: '%', direccion: 'menor_mejor' },
  ],
  mejora: [
    { nombre: 'Acciones cerradas en fecha', unidad: '%', direccion: 'mayor_mejor' },
    { nombre: 'Mejoras implementadas', unidad: 'cantidad', direccion: 'mayor_mejor' },
  ],
}
