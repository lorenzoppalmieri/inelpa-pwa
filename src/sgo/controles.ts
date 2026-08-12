import { fechaLocalISO, sumarDiasLocalISO } from '../lib/time'
import type { AreaSGOId, PilarSGO, TipoEventoSGO } from './types'
import type { DatosAuditoriaLogistica } from './logistica'
import type { AuditoriaCampoSGO } from './controlesCampo'

export type TipoControlSGO =
  | 'proceso_productivo'
  | 'semielaborado'
  | 'administrativo'
  | 'auditoria_iso'
  | 'auditoria_logistica'
  | 'auditoria_campo'
  | 'seguridad'
  | 'ambiente'

export type NormaControlSGO = 'iso_9001' | 'iso_45001' | 'iso_14001' | 'sgo_integral'
export type FrecuenciaControlSGO = 'unico' | 'diario' | 'semanal' | 'quincenal' | 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'
export type ResultadoControlSGO = 'conforme' | 'observacion' | 'no_conforme' | 'no_aplica'
export type EstadoProgramacionControl = 'vencido' | 'hoy' | 'proximo' | 'programado' | 'inactivo'

export interface ControlProgramadoSGO {
  id: string
  titulo: string
  tipo: TipoControlSGO
  areaId: AreaSGOId
  pilar: PilarSGO
  norma?: NormaControlSGO
  requisito?: string
  instrucciones: string
  responsable: string
  frecuencia: FrecuenciaControlSGO
  proximaFecha: string
  toleranciaDias: number
  activo: boolean
  creadoEn: string
  creadoPor: string
  actualizadoEn: string
  actualizadoPor: string
  plantillaCampoId?: string
}

export interface EjecucionControlSGO {
  id: string
  controlId: string
  fechaProgramada: string
  ejecutadoEn: string
  ejecutadoPor: string
  resultado: ResultadoControlSGO
  detalle: string
  evidencia?: string
  ordenId?: string
  nroSerie?: string
  semielaboradoCodigo?: string
  valorEsperado?: string
  valorEncontrado?: string
  unidad?: string
  eventoId?: string
  auditoriaLogistica?: DatosAuditoriaLogistica
  auditoriaCampo?: AuditoriaCampoSGO
}

export const TIPOS_CONTROL_SGO: { id: TipoControlSGO; label: string }[] = [
  { id: 'proceso_productivo', label: 'Proceso productivo' },
  { id: 'semielaborado', label: 'Semielaborado / trazabilidad' },
  { id: 'administrativo', label: 'Proceso administrativo' },
  { id: 'auditoria_iso', label: 'Auditoría ISO' },
  { id: 'auditoria_logistica', label: 'Auditoría logística' },
  { id: 'auditoria_campo', label: 'Control de campo / 5S' },
  { id: 'seguridad', label: 'Seguridad e higiene' },
  { id: 'ambiente', label: 'Medio ambiente' },
]

export const NORMAS_CONTROL_SGO: { id: NormaControlSGO; label: string }[] = [
  { id: 'iso_9001', label: 'ISO 9001' },
  { id: 'iso_45001', label: 'ISO 45001' },
  { id: 'iso_14001', label: 'ISO 14001' },
  { id: 'sgo_integral', label: 'SGO Integral' },
]

export const FRECUENCIAS_CONTROL_SGO: { id: FrecuenciaControlSGO; label: string }[] = [
  { id: 'unico', label: 'Una sola vez' },
  { id: 'diario', label: 'Diario' },
  { id: 'semanal', label: 'Semanal' },
  { id: 'quincenal', label: 'Quincenal' },
  { id: 'mensual', label: 'Mensual' },
  { id: 'bimestral', label: 'Bimestral' },
  { id: 'trimestral', label: 'Trimestral' },
  { id: 'semestral', label: 'Semestral' },
  { id: 'anual', label: 'Anual' },
]

export const RESULTADOS_CONTROL_SGO: { id: ResultadoControlSGO; label: string }[] = [
  { id: 'conforme', label: 'Conforme' },
  { id: 'observacion', label: 'Observación' },
  { id: 'no_conforme', label: 'No conforme' },
  { id: 'no_aplica', label: 'No aplica' },
]

function fechaDesdeISO(fecha: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(anio, mes - 1, dia, 12, 0, 0)
}

function sumarMeses(fecha: string, meses: number): string {
  const origen = fechaDesdeISO(fecha)
  const dia = origen.getDate()
  origen.setDate(1)
  origen.setMonth(origen.getMonth() + meses)
  const ultimoDia = new Date(origen.getFullYear(), origen.getMonth() + 1, 0).getDate()
  origen.setDate(Math.min(dia, ultimoDia))
  return fechaLocalISO(origen)
}

export function sumarFrecuenciaControl(fecha: string, frecuencia: FrecuenciaControlSGO): string | undefined {
  if (frecuencia === 'unico') return undefined
  if (frecuencia === 'diario') return sumarDiasLocalISO(1, fechaDesdeISO(fecha))
  if (frecuencia === 'semanal') return sumarDiasLocalISO(7, fechaDesdeISO(fecha))
  if (frecuencia === 'quincenal') return sumarDiasLocalISO(15, fechaDesdeISO(fecha))
  const meses = frecuencia === 'mensual' ? 1 : frecuencia === 'bimestral' ? 2 : frecuencia === 'trimestral' ? 3 : frecuencia === 'semestral' ? 6 : 12
  return sumarMeses(fecha, meses)
}

export function proximaFechaControl(control: Pick<ControlProgramadoSGO, 'proximaFecha' | 'frecuencia'>, hoy = fechaLocalISO()): string | undefined {
  let siguiente = sumarFrecuenciaControl(control.proximaFecha, control.frecuencia)
  let ciclos = 0
  while (siguiente && siguiente <= hoy && ciclos < 400) {
    siguiente = sumarFrecuenciaControl(siguiente, control.frecuencia)
    ciclos += 1
  }
  return siguiente
}

export function estadoProgramacionControl(control: Pick<ControlProgramadoSGO, 'activo' | 'proximaFecha' | 'toleranciaDias'>, hoy = fechaLocalISO()): EstadoProgramacionControl {
  if (!control.activo) return 'inactivo'
  const vencimientoConTolerancia = sumarDiasLocalISO(Math.max(0, control.toleranciaDias), fechaDesdeISO(control.proximaFecha))
  if (vencimientoConTolerancia < hoy) return 'vencido'
  if (control.proximaFecha <= hoy) return 'hoy'
  if (control.proximaFecha <= sumarDiasLocalISO(7, fechaDesdeISO(hoy))) return 'proximo'
  return 'programado'
}

export function tipoEventoDesdeControl(pilar: PilarSGO): TipoEventoSGO {
  if (pilar === 'seguridad') return 'observacion_preventiva'
  if (pilar === 'calidad') return 'no_conformidad'
  if (pilar === 'ambiente') return 'incidente_ambiental'
  if (pilar === 'entrega') return 'desvio_entrega'
  if (pilar === 'costos') return 'perdida_costo'
  return 'hallazgo_auditoria'
}

export function resultadoControlRequiereEvento(resultado: ResultadoControlSGO): boolean {
  return resultado === 'no_conforme'
}
