import type { AccionSGO, EventoSGO } from './types'
import { validarCierreMejora } from './mejoras'

const TIPOS_CON_INVESTIGACION = new Set<EventoSGO['tipo']>([
  'no_conformidad',
  'incidente_seguridad',
  'cuasi_accidente',
  'incidente_ambiental',
  'desvio_entrega',
  'perdida_costo',
  'hallazgo_auditoria',
])

export function eventoRequiereInvestigacion(evento: EventoSGO): boolean {
  if (evento.tipo === 'observacion_preventiva') {
    return evento.seguridad?.tipoObservacion === 'insegura'
  }
  return TIPOS_CON_INVESTIGACION.has(evento.tipo)
}

export function validarCierreEvento(evento: EventoSGO, acciones: AccionSGO[]): string[] {
  if (evento.estado !== 'cerrado') return []

  const errores: string[] = []
  const requiereInvestigacion = eventoRequiereInvestigacion(evento)
  const activas = acciones.filter((accion) => accion.estado !== 'cancelada')
  const pendientes = activas.filter((accion) => accion.estado !== 'verificada')

  if (requiereInvestigacion && !evento.contencion?.trim()) errores.push('Registrar la contención inmediata.')
  if (requiereInvestigacion && !evento.causaRaiz?.trim()) errores.push('Completar la causa raíz.')
  if (requiereInvestigacion && !evento.metodoAnalisis) errores.push('Seleccionar el método de análisis.')
  if (evento.tipo === 'no_conformidad' && (!evento.disposicion || evento.disposicion === 'pendiente')) {
    errores.push('Definir la disposición de la no conformidad.')
  }
  if (requiereInvestigacion && activas.length === 0) errores.push('Registrar al menos una acción.')
  if (pendientes.length > 0) errores.push(`Verificar o cancelar ${pendientes.length} acción(es) pendiente(s).`)
  if (activas.some((accion) => accion.eficaz !== true)) errores.push('Confirmar la eficacia de todas las acciones no canceladas.')

  const evidenciaDisponible = Boolean(evento.evidenciaUrls?.some((url) => url.trim()) || activas.some((accion) => accion.evidencia?.trim()))
  if (['alta', 'critica'].includes(evento.severidad) && !evidenciaDisponible) {
    errores.push('Adjuntar al menos una referencia de evidencia.')
  }

  errores.push(...validarCierreMejora(evento, acciones))

  return errores
}
