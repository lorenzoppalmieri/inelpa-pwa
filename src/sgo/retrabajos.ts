import { costoNoCalidadTotal, type AccionSGO, type DatosRetrabajoSGO, type EventoSGO, type OrigenRetrabajoSGO } from './types'

export const INICIO_CIRCUITO_RETRABAJOS = '2026-08-19T00:00:00.000-03:00'
export const RESPONSABLE_INVESTIGACION_RETRABAJO = 'Lara'
export type EstadoInvestigacionRetrabajo = 'nuevo' | 'en_investigacion' | 'con_acciones' | 'pendiente_verificacion' | 'listo_cierre' | 'cerrado' | 'reincidencia'

export const ESTADOS_INVESTIGACION_RETRABAJO: { id: EstadoInvestigacionRetrabajo; label: string }[] = [
  { id: 'nuevo', label: 'Nuevo' }, { id: 'en_investigacion', label: 'En investigación' },
  { id: 'con_acciones', label: 'Con acciones' }, { id: 'pendiente_verificacion', label: 'Pendiente de verificar' },
  { id: 'listo_cierre', label: 'Listo para cerrar' }, { id: 'cerrado', label: 'Cerrado' },
  { id: 'reincidencia', label: 'Reincidencia' },
]

function sumarHoras(fecha: string, horas: number): string {
  return new Date(new Date(fecha).getTime() + horas * 60 * 60 * 1000).toISOString()
}

export function crearDatosRetrabajo(origen: OrigenRetrabajoSGO, detectadoEn: string, extra: Partial<DatosRetrabajoSGO> = {}): DatosRetrabajoSGO {
  return {
    origen,
    asignadoA: RESPONSABLE_INVESTIGACION_RETRABAJO,
    fechaLimiteToma: sumarHoras(detectadoEn, 24),
    fechaLimiteInvestigacion: sumarHoras(detectadoEn, 72),
    resultadoVerificacion: 'pendiente',
    ...extra,
  }
}

export function esEventoRetrabajo(evento: EventoSGO): boolean {
  return Boolean(evento.retrabajo)
}

export function minutosDeParada(inicio: string, fin?: string): number | undefined {
  if (!fin) return undefined
  return Math.max(0, Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 60000))
}

export function estadoInvestigacionRetrabajo(evento: EventoSGO, acciones: AccionSGO[]): EstadoInvestigacionRetrabajo {
  const datos = evento.retrabajo
  if (!datos) return 'nuevo'
  if (evento.estado === 'cerrado') return 'cerrado'
  if (datos.resultadoVerificacion === 'reincidencia') return 'reincidencia'
  if (!datos.tomadoEn) return 'nuevo'
  if (!evento.causaRaiz?.trim() || !evento.metodoAnalisis || !datos.clasificacionCausa || !datos.costosRevisados) return 'en_investigacion'
  const activas = acciones.filter((accion) => accion.estado !== 'cancelada')
  if (!activas.length || activas.some((accion) => ['pendiente', 'en_curso'].includes(accion.estado))) return 'con_acciones'
  if (activas.some((accion) => accion.estado === 'completada' || accion.eficaz !== true)) return 'pendiente_verificacion'
  return datos.resultadoVerificacion === 'eficaz' ? 'listo_cierre' : 'pendiente_verificacion'
}

export function semaforoSLAInvestigacion(evento: EventoSGO, ahora = new Date().toISOString()): { tono: 'verde' | 'amarillo' | 'rojo'; label: string } {
  const datos = evento.retrabajo
  if (!datos || evento.estado === 'cerrado') return { tono: 'verde', label: 'En término' }
  if (evento.severidad === 'critica') return { tono: 'rojo', label: 'Crítico' }
  const limite = datos.tomadoEn && !evento.causaRaiz?.trim() ? datos.fechaLimiteInvestigacion : datos.fechaLimiteToma
  const faltanHoras = (new Date(limite).getTime() - new Date(ahora).getTime()) / 3600000
  if (faltanHoras < 0) return { tono: 'rojo', label: 'Vencido' }
  if (faltanHoras <= 6) return { tono: 'amarillo', label: 'Por vencer' }
  return { tono: 'verde', label: 'En término' }
}

export function validarCierreRetrabajo(evento: EventoSGO): string[] {
  if (!evento.retrabajo || evento.estado !== 'cerrado') return []
  const datos = evento.retrabajo
  const errores: string[] = []
  if (!datos.tomadoEn) errores.push('Lara debe tomar la investigación.')
  if (!datos.procesoOrigen?.trim()) errores.push('Identificar el proceso donde se originó el retrabajo.')
  if (!datos.procesoDeteccion?.trim()) errores.push('Identificar el proceso donde se detectó el retrabajo.')
  if (!datos.clasificacionCausa) errores.push('Clasificar la causa raíz.')
  if (!datos.factoresContribuyentes?.trim()) errores.push('Documentar los factores contribuyentes.')
  if (!datos.costosRevisados) errores.push('Revisar y confirmar los costos del retrabajo.')
  if (datos.costosRevisados && costoNoCalidadTotal(evento.costoDetalle) === 0 && !datos.costosJustificacion?.trim()) {
    errores.push('Justificar por qué el retrabajo no tiene costo registrado.')
  }
  if (!datos.fechaVerificacion) errores.push('Definir la fecha de verificación de eficacia.')
  if (datos.fechaVerificacion && datos.fechaVerificacion > new Date().toISOString().slice(0, 10)) {
    errores.push('La verificación de eficacia no puede tener una fecha futura.')
  }
  if (datos.resultadoVerificacion !== 'eficaz') errores.push('Verificar que las acciones fueron eficaces antes del cierre.')
  if (!datos.observacionVerificacion?.trim()) errores.push('Documentar cómo se verificó la eficacia.')
  if (!datos.verificadoEn || !datos.verificadoPor?.trim()) errores.push('Registrar quién realizó la verificación y cuándo.')
  return errores
}
