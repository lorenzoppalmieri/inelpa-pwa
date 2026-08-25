import type {
  AccionSGO, ClaseMejoraSGO, DatosMejoraSGO, DecisionMejoraSGO, EventoSGO,
  FuenteMejoraSGO, PilarSGO, PrioridadMejoraSGO, SeveridadSGO,
} from './types'

export type EstadoGestionMejora =
  | 'detectada'
  | 'en_evaluacion'
  | 'a_futuro'
  | 'aprobada'
  | 'en_ejecucion'
  | 'pendiente_verificacion'
  | 'lista_para_cerrar'
  | 'cerrada'
  | 'no_viable'
  | 'reincidencia'

export const CLASES_MEJORA: { id: ClaseMejoraSGO; label: string }[] = [
  { id: 'idea', label: 'Idea' },
  { id: 'observacion', label: 'Observación' },
  { id: 'oportunidad', label: 'Oportunidad de mejora' },
  { id: 'mejora', label: 'Mejora' },
  { id: 'no_conformidad', label: 'No conformidad' },
]

export const FUENTES_MEJORA: { id: FuenteMejoraSGO; label: string }[] = [
  { id: '5s', label: 'Auditoría 5S' },
  { id: 'entrevista', label: 'Entrevista con colaboradores' },
  { id: 'sugerencia_personal', label: 'Sugerencia del personal' },
  { id: 'auditoria_iso_interna', label: 'Auditoría ISO interna' },
  { id: 'auditoria_iso_externa', label: 'Auditoría ISO externa' },
  { id: 'auditoria_logistica', label: 'Auditoría logística' },
  { id: 'control_programado', label: 'Control programado' },
  { id: 'kpi', label: 'Desvío de KPI' },
  { id: 'reclamo', label: 'Reclamo' },
  { id: 'accidente_incidente', label: 'Accidente o incidente' },
  { id: 'reunion_produccion', label: 'Reunión de producción' },
  { id: 'reunion_logistica', label: 'Reunión de logística' },
  { id: 'recorrido_planta', label: 'Recorrido de planta' },
  { id: 'revision_direccion', label: 'Revisión por la dirección' },
  { id: 'retrabajo_produccion', label: 'Retrabajo de producción o laboratorio' },
  { id: 'evento_sgo', label: 'Evento SGO' },
  { id: 'manual', label: 'Carga manual' },
  { id: 'otro', label: 'Otro' },
]

export const DECISIONES_MEJORA: { id: DecisionMejoraSGO; label: string }[] = [
  { id: 'pendiente', label: 'Pendiente de evaluación' },
  { id: 'aprobada', label: 'Aprobada' },
  { id: 'a_futuro', label: 'A futuro' },
  { id: 'no_viable', label: 'No viable' },
]

export const PRIORIDADES_MEJORA: { id: PrioridadMejoraSGO; label: string }[] = [
  { id: 'baja', label: 'Baja' },
  { id: 'media', label: 'Media' },
  { id: 'alta', label: 'Alta' },
  { id: 'critica', label: 'Crítica' },
]

export const ESTADOS_GESTION_MEJORA: { id: EstadoGestionMejora; label: string }[] = [
  { id: 'detectada', label: 'Detectada' },
  { id: 'en_evaluacion', label: 'En evaluación' },
  { id: 'a_futuro', label: 'A futuro' },
  { id: 'aprobada', label: 'Aprobada' },
  { id: 'en_ejecucion', label: 'En ejecución' },
  { id: 'pendiente_verificacion', label: 'Pendiente de verificar' },
  { id: 'lista_para_cerrar', label: 'Lista para cerrar' },
  { id: 'cerrada', label: 'Cerrada' },
  { id: 'no_viable', label: 'No viable' },
  { id: 'reincidencia', label: 'Reincidencia' },
]

export function crearDatosMejora(inicial: Partial<DatosMejoraSGO> & Pick<DatosMejoraSGO, 'clase' | 'fuente'>): DatosMejoraSGO {
  return {
    pilaresBeneficiados: ['mejora'], decision: 'pendiente', prioridad: 'media',
    seguimientoResultado: 'pendiente', ...inicial,
  }
}

export function prioridadDesdeSeveridad(severidad: SeveridadSGO): PrioridadMejoraSGO {
  return severidad
}

export function claseDesdeEvento(tipo: EventoSGO['tipo']): ClaseMejoraSGO {
  if (tipo === 'no_conformidad') return 'no_conformidad'
  if (tipo === 'hallazgo_auditoria' || tipo === 'observacion_preventiva') return 'observacion'
  return 'oportunidad'
}

export function fuenteDesdeEvento(tipo: EventoSGO['tipo']): FuenteMejoraSGO {
  if (['incidente_seguridad', 'cuasi_accidente', 'incidente_ambiental'].includes(tipo)) return 'accidente_incidente'
  return 'evento_sgo'
}

export function datosMejoraDesdeEvento(
  evento: Pick<EventoSGO, 'tipo' | 'pilar' | 'severidad'>,
  extra: Partial<DatosMejoraSGO> = {},
): DatosMejoraSGO {
  const pilares = new Set<PilarSGO>(['mejora', evento.pilar, ...(extra.pilaresBeneficiados ?? [])])
  return crearDatosMejora({
    clase: extra.clase ?? claseDesdeEvento(evento.tipo),
    fuente: extra.fuente ?? fuenteDesdeEvento(evento.tipo),
    prioridad: extra.prioridad ?? prioridadDesdeSeveridad(evento.severidad),
    ...extra,
    pilaresBeneficiados: [...pilares],
  })
}

export function esExpedienteMejora(evento: EventoSGO): boolean {
  return Boolean(evento.mejora)
}

export function accionMejoraVencida(accion: AccionSGO, hoy: string): boolean {
  return !['verificada', 'cancelada'].includes(accion.estado) && accion.fechaCompromiso < hoy
}

export function estadoGestionMejora(evento: EventoSGO, acciones: AccionSGO[]): EstadoGestionMejora {
  const mejora = evento.mejora
  if (!mejora) return 'detectada'
  if (evento.estado === 'cerrado') return mejora.decision === 'no_viable' ? 'no_viable' : 'cerrada'
  if (mejora.seguimientoResultado === 'reincidencia') return 'reincidencia'
  if (mejora.decision === 'a_futuro') return 'a_futuro'
  if (mejora.decision === 'no_viable') return 'no_viable'
  if (mejora.decision === 'pendiente') {
    return mejora.beneficioEsperado || evento.responsable
      ? 'en_evaluacion' : 'detectada'
  }
  const activas = acciones.filter((accion) => accion.estado !== 'cancelada')
  if (!activas.length) return 'aprobada'
  if (activas.every((accion) => accion.estado === 'verificada' && accion.eficaz === true)) return 'lista_para_cerrar'
  if (activas.some((accion) => accion.estado === 'completada')) return 'pendiente_verificacion'
  return 'en_ejecucion'
}

export function seguimientoVencido(evento: EventoSGO, hoy: string): boolean {
  const mejora = evento.mejora
  return evento.estado === 'cerrado' && mejora?.decision === 'aprobada' && Boolean(mejora.fechaSeguimiento) &&
    mejora?.seguimientoResultado !== 'sostenida' && mejora?.seguimientoResultado !== 'reincidencia' && mejora.fechaSeguimiento! < hoy
}

export function validarCierreMejora(evento: EventoSGO, acciones: AccionSGO[]): string[] {
  const mejora = evento.mejora
  if (!mejora || evento.estado !== 'cerrado') return []
  if (mejora.decision === 'pendiente') return ['Definir la decisión de viabilidad.']
  if (mejora.decision === 'a_futuro') return ['Una mejora a futuro debe permanecer abierta y tener fecha de revisión.']
  if (mejora.decision === 'no_viable') {
    return mejora.justificacionDecision?.trim() ? [] : ['Justificar por qué la mejora no es viable.']
  }
  const errores: string[] = []
  const activas = acciones.filter((accion) => accion.estado !== 'cancelada')
  if (!evento.responsable?.trim()) errores.push('Asignar un responsable de la mejora.')
  if (!mejora.resultado?.trim()) errores.push('Documentar el resultado obtenido.')
  if (!activas.length) errores.push('Registrar al menos una acción de mejora.')
  if (activas.some((accion) => accion.estado !== 'verificada' || accion.eficaz !== true)) {
    errores.push('Todas las acciones deben estar verificadas como eficaces.')
  }
  if (!mejora.fechaSeguimiento) errores.push('Programar una fecha para comprobar que la mejora se sostenga.')
  return errores
}

export function fechaHoyISO(): string {
  const ahora = new Date()
  return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
