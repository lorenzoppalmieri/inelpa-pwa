export type PilarSGO = 'seguridad' | 'calidad' | 'ambiente' | 'entrega' | 'costos' | 'mejora'

export type TipoEventoSGO =
  | 'no_conformidad'
  | 'incidente_seguridad'
  | 'cuasi_accidente'
  | 'observacion_preventiva'
  | 'incidente_ambiental'
  | 'desvio_entrega'
  | 'perdida_costo'
  | 'oportunidad_mejora'
  | 'hallazgo_auditoria'

export type SeveridadSGO = 'baja' | 'media' | 'alta' | 'critica'
export type EstadoEventoSGO = 'abierto' | 'contenido' | 'en_analisis' | 'con_acciones' | 'cerrado'
export type EstadoAccionSGO = 'pendiente' | 'en_curso' | 'completada' | 'verificada' | 'cancelada'
export type TipoAccionSGO = 'correccion' | 'correctiva' | 'preventiva' | 'mejora'

export type AreaSGOId =
  | 'bobinado_rural'
  | 'bobinado_distribucion'
  | 'montaje_distribucion'
  | 'montaje_rural'
  | 'herreria_pintura'
  | 'laminado'
  | 'administracion'
  | 'logistica_operativa'
  | 'logistica_administrativa'
  | 'mantenimiento'
  | 'automatismo'
  | 'it'
  | 'planificacion_produccion'
  | 'laboratorio'
  | 'gerencia_directorio'
  | 'diseno'

export interface CostoNoCalidad {
  material: number
  manoObra: number
  maquina: number
  ensayos: number
  logistica: number
  terceros: number
}

export interface DatosSeguridadSGO {
  fechaHoraHecho: string
  lugarExacto: string
  turno?: 'manana' | 'tarde' | 'noche' | 'otro'
  tareaActividad: string
  personaAfectada?: string
  legajoDni?: string
  puesto?: string
  personasInvolucradas?: string
  colaboradorObservado?: string
  testigos?: string
  tipoObservacion?: 'segura' | 'insegura'
  resultadoPersona?: 'sin_lesion' | 'primeros_auxilios' | 'atencion_medica' | 'baja'
  tipoLesion?: string
  parteCuerpo?: string
  atencionBrindada?: string
  derivadoA?: string
  denunciaART?: boolean
  nroSiniestroART?: string
  diasPerdidos?: number
  equipoInvolucrado?: string
  eppRequerido?: string
  eppUtilizado?: string
  condicionObservada?: string
  factoresContribuyentes?: string
  consecuenciaPotencial?: string
  accionInmediata?: string
  sectorAislado?: boolean
  notificadoA?: string
}

export function costoNoCalidadTotal(c?: Partial<CostoNoCalidad>): number {
  return (c?.material ?? 0) + (c?.manoObra ?? 0) + (c?.maquina ?? 0) +
    (c?.ensayos ?? 0) + (c?.logistica ?? 0) + (c?.terceros ?? 0)
}

export interface EventoSGO {
  id: string
  codigo: string
  tipo: TipoEventoSGO
  pilar: PilarSGO
  titulo: string
  descripcion: string
  severidad: SeveridadSGO
  estado: EstadoEventoSGO
  areaId?: AreaSGOId
  areaOrigenId?: AreaSGOId
  sectorId?: string
  maquinaId?: string
  ordenId?: string
  tareaId?: string
  paradaId?: string
  laboratorioId?: string
  despachoId?: string
  controlId?: string
  nroSerie?: string
  modelo?: string
  defectoCodigo?: string
  detectadoEn: string
  detectadoPor: string
  responsable?: string
  contencion?: string
  disposicion?: 'pendiente' | 'retrabajo' | 'rechazo' | 'concesion' | 'devolucion' | 'no_aplica'
  cantidadAfectada?: number
  costoEstimado?: number
  costoDetalle?: CostoNoCalidad
  seguridad?: DatosSeguridadSGO
  causaRaiz?: string
  metodoAnalisis?: '5_porques' | 'ishikawa' | 'a3' | '8d' | 'otro'
  evidenciaUrls?: string[]
  creadoEn: string
  actualizadoEn: string
  cerradoEn?: string
  cerradoPor?: string
}

export interface AccionSGO {
  id: string
  eventoId: string
  tipo: TipoAccionSGO
  descripcion: string
  responsable: string
  fechaCompromiso: string
  estado: EstadoAccionSGO
  evidencia?: string
  completadaEn?: string
  completadaPor?: string
  verificadaEn?: string
  verificadaPor?: string
  eficaz?: boolean
  comentarioVerificacion?: string
  creadoEn: string
  creadoPor: string
  actualizadoEn: string
}

export type EntidadAuditoriaSGO = 'evento' | 'accion' | 'indicador' | 'medicion' | 'garantia' | 'control' | 'ejecucion_control'

export interface AuditoriaSGO {
  id: string
  entidad: EntidadAuditoriaSGO
  entidadId: string
  operacion: 'INSERT' | 'UPDATE' | 'DELETE'
  datosAnteriores?: Record<string, unknown>
  datosNuevos?: Record<string, unknown>
  usuario: string
  creadoEn: string
}

export const PILARES_SGO: { id: PilarSGO; label: string; color: string }[] = [
  { id: 'seguridad', label: 'Seguridad', color: '#dc2626' },
  { id: 'calidad', label: 'Calidad', color: '#2563eb' },
  { id: 'ambiente', label: 'Medio Ambiente', color: '#16a34a' },
  { id: 'entrega', label: 'Entrega', color: '#7c3aed' },
  { id: 'costos', label: 'Costos', color: '#d97706' },
  { id: 'mejora', label: 'Mejora Continua', color: '#0891b2' },
]

export const AREAS_SGO: { id: AreaSGOId; label: string }[] = [
  { id: 'bobinado_rural', label: 'BOBINADO RURAL' },
  { id: 'bobinado_distribucion', label: 'BOBINADO DISTRIBUCIÓN' },
  { id: 'montaje_distribucion', label: 'MONTAJE DISTRIBUCIÓN (PA y PO)' },
  { id: 'montaje_rural', label: 'MONTAJE RURAL (PA y PO)' },
  { id: 'herreria_pintura', label: 'HERRERÍA Y PINTURA' },
  { id: 'laminado', label: 'LAMINADO' },
  { id: 'administracion', label: 'ADMINISTRACIÓN' },
  { id: 'logistica_operativa', label: 'LOGÍSTICA OPERATIVA' },
  { id: 'logistica_administrativa', label: 'LOGÍSTICA ADMINISTRATIVA' },
  { id: 'mantenimiento', label: 'MANTENIMIENTO' },
  { id: 'automatismo', label: 'AUTOMATISMO' },
  { id: 'it', label: 'IT' },
  { id: 'planificacion_produccion', label: 'PLANIFICACIÓN PRODUCCIÓN' },
  { id: 'laboratorio', label: 'LABORATORIO' },
  { id: 'gerencia_directorio', label: 'GERENCIA Y DIRECTORIO' },
  { id: 'diseno', label: 'DISEÑO' },
]

export function areaSGOLabel(id?: string): string {
  return AREAS_SGO.find((a) => a.id === id)?.label ?? 'Sin área'
}

export const TIPOS_EVENTO_SGO: { id: TipoEventoSGO; label: string; pilar: PilarSGO }[] = [
  { id: 'no_conformidad', label: 'No conformidad', pilar: 'calidad' },
  { id: 'incidente_seguridad', label: 'Accidente / incidente de seguridad', pilar: 'seguridad' },
  { id: 'cuasi_accidente', label: 'Cuasi accidente', pilar: 'seguridad' },
  { id: 'observacion_preventiva', label: 'Observación preventiva', pilar: 'seguridad' },
  { id: 'incidente_ambiental', label: 'Incidente ambiental', pilar: 'ambiente' },
  { id: 'desvio_entrega', label: 'Desvio de entrega', pilar: 'entrega' },
  { id: 'perdida_costo', label: 'Perdida de costo', pilar: 'costos' },
  { id: 'oportunidad_mejora', label: 'Oportunidad de mejora', pilar: 'mejora' },
  { id: 'hallazgo_auditoria', label: 'Hallazgo de auditoria', pilar: 'mejora' },
]

export function codigoEventoSGO(fecha = new Date(), id: string = crypto.randomUUID()): string {
  return `SGO-${fecha.getFullYear()}-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}
