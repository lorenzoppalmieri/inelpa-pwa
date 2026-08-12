export type NormaAgendaISO = 'iso_9001' | 'iso_45001' | 'iso_14001' | 'sgi'
export type CategoriaAgendaISO = 'auditoria_externa' | 'auditoria_interna' | 'informe' | 'legal_hys' | 'medicion' | 'reunion' | 'otro'
export type EstadoAgendaISO = 'sin_programar' | 'planificada' | 'en_curso' | 'esperando_tercero' | 'esperando_evidencia' | 'completada' | 'verificada' | 'reprogramada' | 'no_aplica'
export type FrecuenciaAgendaISO = 'unica' | 'mensual' | 'trimestral' | 'semestral' | 'anual'
export type CriticidadAgendaISO = 'baja' | 'media' | 'alta' | 'critica'

export interface ActividadAgendaISO {
  id: string
  titulo: string
  categoria: CategoriaAgendaISO
  normas: NormaAgendaISO[]
  requisito?: string
  area?: string
  responsable: string
  frecuencia: FrecuenciaAgendaISO
  fechaObjetivo?: string
  avisoDias: number
  estado: EstadoAgendaISO
  criticidad: CriticidadAgendaISO
  evidenciaEsperada?: string
  evidencia?: string
  resultado?: string
  observaciones?: string
  fuente?: string
  completadaEn?: string
  completadaPor?: string
  verificadaEn?: string
  verificadaPor?: string
  verificacion?: string
  creadoEn: string
  creadoPor: string
  actualizadoEn: string
  actualizadoPor: string
}

export const NORMAS_AGENDA_ISO: { id: NormaAgendaISO; label: string; color: string }[] = [
  { id: 'iso_9001', label: 'ISO 9001', color: '#2563eb' },
  { id: 'iso_45001', label: 'ISO 45001', color: '#dc2626' },
  { id: 'iso_14001', label: 'ISO 14001', color: '#16a34a' },
  { id: 'sgi', label: 'SGI', color: '#7c3aed' },
]

export const CATEGORIAS_AGENDA_ISO: { id: CategoriaAgendaISO; label: string }[] = [
  { id: 'auditoria_externa', label: 'Auditoría externa' }, { id: 'auditoria_interna', label: 'Auditoría interna' },
  { id: 'informe', label: 'Informe' }, { id: 'legal_hys', label: 'Documentación legal HyS' },
  { id: 'medicion', label: 'Medición' }, { id: 'reunion', label: 'Reunión' }, { id: 'otro', label: 'Otra' },
]

export const ESTADOS_AGENDA_ISO: { id: EstadoAgendaISO; label: string }[] = [
  { id: 'sin_programar', label: 'Sin programar' }, { id: 'planificada', label: 'Planificada' },
  { id: 'en_curso', label: 'En curso' }, { id: 'esperando_tercero', label: 'Esperando tercero' },
  { id: 'esperando_evidencia', label: 'Esperando evidencia' }, { id: 'completada', label: 'Completada' },
  { id: 'verificada', label: 'Verificada' }, { id: 'reprogramada', label: 'Reprogramada' }, { id: 'no_aplica', label: 'No aplica' },
]

export function agendaISOEsCerrada(a: ActividadAgendaISO): boolean {
  return ['verificada', 'no_aplica'].includes(a.estado)
}

export function agendaISOEstaVencida(a: ActividadAgendaISO, hoy: string): boolean {
  return !!a.fechaObjetivo && !agendaISOEsCerrada(a) && a.fechaObjetivo < hoy
}

export function agendaISOProxima(a: ActividadAgendaISO, hoy: string, hasta: string): boolean {
  return !!a.fechaObjetivo && !agendaISOEsCerrada(a) && a.fechaObjetivo >= hoy && a.fechaObjetivo <= hasta
}

export function puedeGestionarAgendaISO(usuario: string): boolean {
  return ['lorenzo', 'azul'].includes(usuario.trim().toLowerCase())
}
