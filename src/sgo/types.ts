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

export type ClaseMejoraSGO = 'idea' | 'observacion' | 'oportunidad' | 'mejora' | 'no_conformidad'
export type FuenteMejoraSGO =
  | '5s'
  | 'entrevista'
  | 'sugerencia_personal'
  | 'auditoria_iso_interna'
  | 'auditoria_iso_externa'
  | 'auditoria_logistica'
  | 'control_programado'
  | 'kpi'
  | 'reclamo'
  | 'accidente_incidente'
  | 'reunion_produccion'
  | 'reunion_logistica'
  | 'recorrido_planta'
  | 'revision_direccion'
  | 'retrabajo_produccion'
  | 'evento_sgo'
  | 'manual'
  | 'otro'
export type DecisionMejoraSGO = 'pendiente' | 'aprobada' | 'a_futuro' | 'no_viable'
export type PrioridadMejoraSGO = 'baja' | 'media' | 'alta' | 'critica'
export type SeguimientoMejoraSGO = 'pendiente' | 'sostenida' | 'reincidencia'
export type GestorMejoraSGO = 'lorenzo' | 'lara' | 'nicolas.sgo' | 'azul'
export type OrigenEntidadMejoraSGO = 'control_5s' | 'auditoria_logistica' | 'control_programado' | 'agenda_iso' | 'indicador' | 'evento_manual' | 'retrabajo'

export type OrigenRetrabajoSGO = 'parada_calidad' | 'defecto_final' | 'laboratorio'
export type ClasificacionCausaRetrabajoSGO = 'persona' | 'metodo' | 'maquina' | 'material' | 'medicion' | 'ambiente' | 'diseno' | 'otro'
export type ResultadoVerificacionRetrabajoSGO = 'pendiente' | 'eficaz' | 'reincidencia'
export type NivelInvestigacionRetrabajoSGO = 'simple' | 'con_accion' | 'critica'
export type DecisionParadaCalidadSGO = 'pendiente' | 'investigar' | 'descartada'
export type ModalidadCostoRetrabajoSGO = 'sin_costo' | 'total_estimado' | 'detallado'
export type MaterialCostoRetrabajoSGO = 'ninguno' | 'cobre' | 'aluminio' | 'otro'
export type EstadoCostoMaquinaSGO = 'no_aplica' | 'pendiente_cotizacion' | 'estimado' | 'confirmado'
export type EstadoCosteoRetrabajoSGO = 'estimado' | 'confirmado'

export interface TarifarioCostosRetrabajoSGO {
  id: string
  vigenteDesde: string
  horaHombre: number
  factorTiempoPerdido: number
  cobreKg: number
  aluminioKg: number
  creadoEn?: string
  creadoPor?: string
}

export interface DatosCosteoRetrabajoSGO {
  tarifario: TarifarioCostosRetrabajoSGO
  horasCorreccion: number
  personasInvolucradas: number
  materialTipo: MaterialCostoRetrabajoSGO
  materialKg?: number
  materialDescripcion?: string
  materialCostoManual?: number
  maquinaEstado: EstadoCostoMaquinaSGO
  maquinaDetalle?: string
  maquinaReferenciaCompras?: string
  maquinaCosto?: number
  ensayosCosto?: number
  ensayosDetalle?: string
  logisticaCosto?: number
  logisticaDetalle?: string
  tercerosCosto?: number
  tercerosDetalle?: string
  estado: EstadoCosteoRetrabajoSGO
  confirmadoEn?: string
  confirmadoPor?: string
}

export interface DatosRetrabajoSGO {
  origen: OrigenRetrabajoSGO
  asignadoA: string
  fechaLimiteToma: string
  fechaLimiteInvestigacion: string
  nivelInvestigacion?: NivelInvestigacionRetrabajoSGO
  tomadoEn?: string
  tomadoPor?: string
  operarioId?: string
  operarioNombre?: string
  sectorNombre?: string
  maquinaNombre?: string
  causaId?: string
  causaRegistrada?: string
  observacionOrigen?: string
  minutosRetrabajo?: number
  /** Clasificación realizada en SGO para una parada operativa de Calidad. */
  decisionCalidad?: DecisionParadaCalidadSGO
  decisionCalidadEn?: string
  decisionCalidadPor?: string
  decisionCalidadMotivo?: string
  procesoOrigen?: string
  procesoDeteccion?: string
  clasificacionCausa?: ClasificacionCausaRetrabajoSGO
  factoresContribuyentes?: string
  reincidente?: boolean
  antecedenteEventoId?: string
  costosRevisados?: boolean
  costosJustificacion?: string
  modalidadCosto?: ModalidadCostoRetrabajoSGO
  costeo?: DatosCosteoRetrabajoSGO
  referenciaSAP?: string
  resultadoResolucion?: string
  fechaVerificacion?: string
  resultadoVerificacion?: ResultadoVerificacionRetrabajoSGO
  observacionVerificacion?: string
  verificadoEn?: string
  verificadoPor?: string
  mejoraEventoId?: string
}

export interface DatosMejoraSGO {
  clase: ClaseMejoraSGO
  fuente: FuenteMejoraSGO
  colaborador?: string
  beneficioEsperado?: string
  pilaresBeneficiados: PilarSGO[]
  decision: DecisionMejoraSGO
  justificacionDecision?: string
  prioridad: PrioridadMejoraSGO
  impacto?: 1 | 2 | 3 | 4 | 5
  urgencia?: 1 | 2 | 3 | 4 | 5
  esfuerzo?: 1 | 2 | 3 | 4 | 5
  fechaObjetivo?: string
  fechaRevision?: string
  presupuestoEstimado?: number
  /** Campos heredados del circuito económico anterior; se conservan para leer el historial. */
  umbralAutorizacionAplicado?: number
  autorizacionRequerida?: boolean
  autorizacionEstado?: 'no_requiere' | 'pendiente' | 'aprobada' | 'postergada' | 'rechazada'
  autorizacionDecididaEn?: string
  autorizacionDecididaPor?: string
  gestorSGO?: GestorMejoraSGO
  decisionEn?: string
  decisionPor?: string
  verificacionSGOEn?: string
  verificacionSGOPor?: string
  referenciaSAP?: string
  resultado?: string
  beneficioReal?: string
  estandarizacion?: string
  metricaAntes?: number
  metricaDespues?: number
  unidadMetrica?: string
  fechaSeguimiento?: string
  seguimientoResultado?: SeguimientoMejoraSGO
  seguimientoObservacion?: string
  seguimientoEn?: string
  seguimientoPor?: string
  origenEntidad?: OrigenEntidadMejoraSGO
  origenId?: string
}

export type AreaSGOId =
  | 'bobinado_rural'
  | 'bobinado_distribucion'
  | 'montaje_distribucion'
  | 'montaje_rural'
  | 'herreria_pintura'
  | 'laminado'
  | 'carpinteria'
  | 'corte_aislacion'
  | 'administracion'
  | 'logistica_operativa'
  | 'logistica_despacho'
  | 'mantenimiento'
  | 'automatismo'
  | 'it'
  | 'planificacion_produccion'
  | 'laboratorio'
  | 'gerencia_directorio'
  | 'diseno'
  | 'rrhh'

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
  mejora?: DatosMejoraSGO
  retrabajo?: DatosRetrabajoSGO
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
  { id: 'carpinteria', label: 'CARPINTERÍA' },
  { id: 'corte_aislacion', label: 'CORTE AISLACIÓN' },
  { id: 'administracion', label: 'ADMINISTRACIÓN' },
  { id: 'logistica_operativa', label: 'ABASTECIMIENTO' },
  { id: 'logistica_despacho', label: 'DESPACHO' },
  { id: 'mantenimiento', label: 'MANTENIMIENTO' },
  { id: 'automatismo', label: 'AUTOMATISMO' },
  { id: 'it', label: 'IT' },
  { id: 'planificacion_produccion', label: 'PLANIFICACIÓN PRODUCCIÓN' },
  { id: 'laboratorio', label: 'LABORATORIO' },
  { id: 'gerencia_directorio', label: 'GERENCIA Y DIRECTORIO' },
  { id: 'diseno', label: 'DISEÑO' },
  // v1.96: se imputan acá capacitaciones, reuniones, retiros y accidentes.
  { id: 'rrhh', label: 'RECURSOS HUMANOS' },
]

// El id 'logistica_operativa' se conserva para no invalidar expedientes, KPIs e
// indicadores ya cargados y desde v1.86 representa ABASTECIMIENTO. DESPACHO se
// registra por separado con un id propio.
const ALIAS_AREA_SGO: Record<string, AreaSGOId> = {
  logistica_administrativa: 'logistica_operativa',
}

/** Normaliza un areaId que puede venir de la base con un id ya retirado. */
export function normalizarAreaSGO<T extends string | undefined>(id: T): T | AreaSGOId {
  if (!id) return id
  return ALIAS_AREA_SGO[id] ?? id
}

export function areaSGOLabel(id?: string): string {
  const norm = normalizarAreaSGO(id)
  return AREAS_SGO.find((a) => a.id === norm)?.label ?? 'Sin área'
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
