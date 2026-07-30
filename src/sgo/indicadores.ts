import type { AreaSGOId, PilarSGO } from './types'

export type DireccionKPI = 'mayor_mejor' | 'menor_mejor'
export type EstadoSemaforo = 'verde' | 'amarillo' | 'rojo' | 'sin_dato'
export type FrecuenciaKPI = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'
export type ClaveCalculoKPI =
  | 'produccion_cumplimiento'
  | 'produccion_retrabajos'
  | 'laboratorio_fpy'
  | 'logistica_cumplimiento'
  | 'costo_no_calidad'
  | 'acciones_en_fecha'

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
  origen?: 'manual' | 'automatico'
  claveCalculo?: ClaveCalculoKPI
  periodo: string
  frecuencia?: FrecuenciaKPI
  activo: boolean
  actualizadoEn: string
  actualizadoPor: string
}

export const FRECUENCIAS_KPI: { id: FrecuenciaKPI; label: string; meses: number }[] = [
  { id: 'mensual', label: 'Mensual', meses: 1 },
  { id: 'bimestral', label: 'Bimestral', meses: 2 },
  { id: 'trimestral', label: 'Trimestral', meses: 3 },
  { id: 'semestral', label: 'Semestral', meses: 6 },
  { id: 'anual', label: 'Anual', meses: 12 },
]

export function mesesFrecuenciaKPI(frecuencia: FrecuenciaKPI = 'mensual'): number {
  return FRECUENCIAS_KPI.find((f) => f.id === frecuencia)?.meses ?? 1
}

export function normalizarPeriodoKPI(periodo: string, frecuencia: FrecuenciaKPI = 'mensual'): string {
  const [anio, mes] = periodo.split('-').map(Number)
  if (!anio || !mes) return periodo
  const meses = mesesFrecuenciaKPI(frecuencia)
  const mesInicio = Math.floor((mes - 1) / meses) * meses + 1
  return `${anio}-${String(mesInicio).padStart(2, '0')}`
}

export function rangoPeriodoKPI(periodo: string, frecuencia: FrecuenciaKPI = 'mensual') {
  const inicio = normalizarPeriodoKPI(periodo, frecuencia)
  const [anio, mes] = inicio.split('-').map(Number)
  const meses = mesesFrecuenciaKPI(frecuencia)
  const fin = new Date(Date.UTC(anio, mes - 1 + meses, 1))
  return { inicio, finExclusivo: `${fin.getUTCFullYear()}-${String(fin.getUTCMonth() + 1).padStart(2, '0')}` }
}

const nombreMes = (mes: number) => new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, mes - 1, 1)))

export function periodoKPILabel(periodo: string, frecuencia: FrecuenciaKPI = 'mensual'): string {
  const { inicio, finExclusivo } = rangoPeriodoKPI(periodo, frecuencia)
  const [anio, mes] = inicio.split('-').map(Number)
  if (frecuencia === 'mensual') return `${nombreMes(mes)} de ${anio}`
  if (frecuencia === 'anual') return `año ${anio}`
  const fin = new Date(Date.UTC(Number(finExclusivo.slice(0, 4)), Number(finExclusivo.slice(5, 7)) - 1, 1))
  fin.setUTCMonth(fin.getUTCMonth() - 1)
  return `${nombreMes(mes)} - ${nombreMes(fin.getUTCMonth() + 1)} de ${fin.getUTCFullYear()}`
}

export function periodoKPIEtiquetaCorta(periodo: string, frecuencia: FrecuenciaKPI = 'mensual'): string {
  const inicio = normalizarPeriodoKPI(periodo, frecuencia)
  const [anio, mes] = inicio.split('-').map(Number)
  if (frecuencia === 'mensual') return `${String(mes).padStart(2, '0')}/${String(anio).slice(2)}`
  if (frecuencia === 'bimestral') return `B${Math.floor((mes - 1) / 2) + 1}/${String(anio).slice(2)}`
  if (frecuencia === 'trimestral') return `T${Math.floor((mes - 1) / 3) + 1}/${String(anio).slice(2)}`
  if (frecuencia === 'semestral') return `S${Math.floor((mes - 1) / 6) + 1}/${String(anio).slice(2)}`
  return String(anio)
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
