export type CoberturaGarantia = 'si' | 'no' | 'en_evaluacion' | 'sin_dato'
export type EstadoGarantia = 'abierto' | 'en_analisis' | 'pendiente_cliente' | 'resuelto' | 'verificado'
export type CategoriaGarantia =
  | 'perdida_aceite'
  | 'electrico_bobinado'
  | 'soldadura_herreria'
  | 'aislacion'
  | 'transporte_manipulacion'
  | 'mecanica_parte_activa'
  | 'accesorios_componentes'
  | 'otro'

export interface GarantiaISO {
  id: string
  codigo: string
  tipo: string
  nroSerie?: string
  fechaSalida?: string
  fechaDeteccion: string
  ingresadoPor?: string
  cliente?: string
  clienteOriginal?: string
  diagnostico: string
  causas?: string
  cobertura: CoberturaGarantia
  categoria: CategoriaGarantia
  estado: EstadoGarantia
  areaResponsableId?: import('./types').AreaSGOId
  defectoCodigo?: string
  eventoId?: string
  responsable?: string
  fechaCompromiso?: string
  solucion?: string
  fechaResolucion?: string
  verificado: boolean
  verificacionDetalle?: string
  costoEstimado?: number
  observaciones?: string
  fuenteFila?: number
  creadoEn: string
  actualizadoEn: string
  actualizadoPor: string
}

export const COBERTURAS_GARANTIA: { id: CoberturaGarantia; label: string }[] = [
  { id: 'si', label: 'Sí, corresponde garantía' },
  { id: 'no', label: 'No corresponde garantía' },
  { id: 'en_evaluacion', label: 'En evaluación' },
  { id: 'sin_dato', label: 'Sin determinar' },
]

export const ESTADOS_GARANTIA: { id: EstadoGarantia; label: string }[] = [
  { id: 'abierto', label: 'Abierto' },
  { id: 'en_analisis', label: 'En análisis' },
  { id: 'pendiente_cliente', label: 'Pendiente cliente / tercero' },
  { id: 'resuelto', label: 'Resuelto' },
  { id: 'verificado', label: 'Verificado' },
]

export const CATEGORIAS_GARANTIA: { id: CategoriaGarantia; label: string }[] = [
  { id: 'perdida_aceite', label: 'Pérdida de aceite / estanqueidad' },
  { id: 'electrico_bobinado', label: 'Falla eléctrica / bobinado' },
  { id: 'soldadura_herreria', label: 'Soldadura / herrería' },
  { id: 'aislacion', label: 'Aislación' },
  { id: 'transporte_manipulacion', label: 'Transporte / manipulación' },
  { id: 'mecanica_parte_activa', label: 'Mecánica / parte activa' },
  { id: 'accesorios_componentes', label: 'Accesorios / componentes' },
  { id: 'otro', label: 'Otros / sin clasificar' },
]

export function categoriaGarantiaLabel(id: CategoriaGarantia): string {
  return CATEGORIAS_GARANTIA.find((c) => c.id === id)?.label ?? id
}

export function estadoGarantiaLabel(id: EstadoGarantia): string {
  return ESTADOS_GARANTIA.find((e) => e.id === id)?.label ?? id
}

export function diasEntreGarantia(desde?: string, hasta?: string): number | undefined {
  if (!desde || !hasta) return undefined
  const a = new Date(`${desde.slice(0, 10)}T12:00:00`).getTime()
  const b = new Date(`${hasta.slice(0, 10)}T12:00:00`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return undefined
  return Math.round((b - a) / 86_400_000)
}

export function erroresConsistenciaGarantia(g: GarantiaISO): string[] {
  const errores: string[] = []
  if (g.fechaSalida && g.fechaDeteccion < g.fechaSalida) errores.push('La detección no puede ser anterior a la salida.')
  if (g.fechaResolucion && g.fechaResolucion < g.fechaDeteccion) errores.push('La resolución no puede ser anterior a la detección.')
  if (g.estado === 'resuelto' && !g.fechaResolucion) errores.push('Un reclamo resuelto debe tener fecha de resolución.')
  if ((g.estado === 'verificado' || g.verificado) && !g.fechaResolucion) errores.push('La verificación requiere fecha de resolución.')
  if ((g.estado === 'verificado' || g.verificado) && !g.verificacionDetalle?.trim()) errores.push('La verificación requiere una explicación.')
  if (g.estado === 'verificado' && !g.verificado) errores.push('El estado Verificado requiere marcar la solución como verificada.')
  return errores
}
