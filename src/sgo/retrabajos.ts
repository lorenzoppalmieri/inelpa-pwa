import {
  costoNoCalidadTotal, type AccionSGO, type DatosRetrabajoSGO, type EventoSGO,
  type NivelInvestigacionRetrabajoSGO, type OrigenRetrabajoSGO,
} from './types'

export const INICIO_CIRCUITO_RETRABAJOS = '2026-08-19T00:00:00.000-03:00'
export const RESPONSABLE_INVESTIGACION_RETRABAJO = 'Lara'
export type EstadoInvestigacionRetrabajo = 'nuevo' | 'en_investigacion' | 'con_acciones' | 'pendiente_verificacion' | 'listo_cierre' | 'cerrado' | 'reincidencia'

export const NIVELES_INVESTIGACION_RETRABAJO: { id: NivelInvestigacionRetrabajoSGO; label: string; ayuda: string }[] = [
  { id: 'simple', label: 'Retrabajo simple', ayuda: 'Corrección puntual, primera vez y sin impacto relevante.' },
  { id: 'con_accion', label: 'Con acción correctiva', ayuda: 'Requiere responsable, plazo y comprobación del resultado.' },
  { id: 'critica', label: 'Crítico o recurrente', ayuda: 'Investigación formal y cierre exclusivo de Lorenzo.' },
]

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
    nivelInvestigacion: origen === 'laboratorio' ? 'critica' : 'simple',
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

export function nivelInvestigacionRetrabajo(evento: EventoSGO): NivelInvestigacionRetrabajoSGO {
  const datos = evento.retrabajo
  if (!datos) return 'simple'
  if (['alta', 'critica'].includes(evento.severidad) || datos.reincidente || datos.resultadoVerificacion === 'reincidencia' || datos.origen === 'laboratorio') {
    return 'critica'
  }
  return datos.nivelInvestigacion ?? 'simple'
}

export function costoRetrabajoTotal(evento: EventoSGO): number {
  const modalidad = evento.retrabajo?.modalidadCosto
  if (modalidad === 'sin_costo') return 0
  if (modalidad === 'total_estimado') return Math.max(0, evento.costoEstimado ?? 0)
  const detalle = costoNoCalidadTotal(evento.costoDetalle)
  return detalle || Math.max(0, evento.costoEstimado ?? 0)
}

function costoDefinido(evento: EventoSGO): boolean {
  return Boolean(evento.retrabajo?.modalidadCosto || evento.retrabajo?.costosRevisados)
}

export function requisitosCierreRetrabajo(evento: EventoSGO, acciones: AccionSGO[]): string[] {
  const datos = evento.retrabajo
  if (!datos) return []
  const nivel = nivelInvestigacionRetrabajo(evento)
  const activas = acciones.filter((accion) => accion.estado !== 'cancelada')
  const errores: string[] = []

  if (!datos.tomadoEn) errores.push('Tomar la investigación.')
  if (!evento.contencion?.trim()) errores.push(nivel === 'simple' ? 'Registrar la corrección realizada.' : 'Registrar la contención inmediata.')
  if (!evento.causaRaiz?.trim()) errores.push(nivel === 'simple' ? 'Describir brevemente la causa o motivo.' : 'Completar la causa raíz.')
  if (!evento.disposicion || evento.disposicion === 'pendiente') errores.push('Definir la disposición del producto.')
  if (!datos.resultadoResolucion?.trim()) errores.push('Documentar el resultado obtenido.')
  if (!costoDefinido(evento)) errores.push('Elegir cómo se registrará el costo del retrabajo.')
  if (datos.modalidadCosto === 'total_estimado' && !(evento.costoEstimado && evento.costoEstimado > 0)) errores.push('Ingresar el costo total estimado.')
  if (datos.modalidadCosto === 'detallado' && datos.costeo) {
    const costeo = datos.costeo
    if (!(costeo.horasCorreccion > 0)) errores.push('Registrar el tiempo utilizado para corregir el retrabajo.')
    if (!(costeo.personasInvolucradas >= 1)) errores.push('Registrar cuántas personas participaron de la corrección.')
    if (['cobre', 'aluminio'].includes(costeo.materialTipo) && !(costeo.materialKg && costeo.materialKg > 0)) errores.push('Ingresar los kilogramos de material perdido.')
    if (costeo.materialTipo === 'otro' && (!costeo.materialDescripcion?.trim() || !(costeo.materialCostoManual && costeo.materialCostoManual > 0))) errores.push('Describir y valorizar el otro material perdido.')
    if (costeo.maquinaEstado !== 'no_aplica' && !costeo.maquinaDetalle?.trim()) errores.push('Describir la rotura, reparación o repuesto de la máquina.')
    if (['estimado', 'confirmado'].includes(costeo.maquinaEstado) && !(costeo.maquinaCosto && costeo.maquinaCosto > 0)) errores.push('Ingresar el costo relevado de la máquina o repuesto.')
    if ((costeo.ensayosCosto ?? 0) > 0 && !costeo.ensayosDetalle?.trim()) errores.push('Explicar el costo adicional de ensayos.')
    if ((costeo.logisticaCosto ?? 0) > 0 && !costeo.logisticaDetalle?.trim()) errores.push('Explicar el costo adicional de logística.')
    if ((costeo.tercerosCosto ?? 0) > 0 && !costeo.tercerosDetalle?.trim()) errores.push('Explicar el costo de terceros.')
    if (nivel === 'critica' && costeo.maquinaEstado === 'pendiente_cotizacion') errores.push('Confirmar con Compras el costo pendiente de máquina o repuesto.')
    if (nivel === 'critica' && (costeo.estado !== 'confirmado' || costeo.confirmadoPor?.trim().toLowerCase() !== 'lorenzo')) errores.push('Lorenzo debe confirmar el costeo antes de cerrar un retrabajo crítico.')
  }

  if (nivel === 'simple') {
    if (activas.some((accion) => accion.estado !== 'verificada')) errores.push('Resolver o cancelar las acciones abiertas, o cambiar el nivel a “Con acción correctiva”.')
    return [...new Set(errores)]
  }

  if (!evento.metodoAnalisis) errores.push('Seleccionar el método de análisis.')
  if (!datos.clasificacionCausa) errores.push('Clasificar la causa raíz.')
  if (!activas.length) errores.push('Registrar al menos una acción.')
  if (activas.some((accion) => ['pendiente', 'en_curso'].includes(accion.estado))) errores.push('Completar o cancelar las acciones pendientes.')
  if (datos.resultadoVerificacion !== 'eficaz') errores.push('Confirmar que la solución fue eficaz.')
  if (!datos.observacionVerificacion?.trim()) errores.push('Explicar brevemente cómo se comprobó el resultado.')

  if (nivel === 'critica') {
    if (!datos.procesoOrigen?.trim()) errores.push('Identificar el proceso donde se originó el retrabajo.')
    if (!datos.procesoDeteccion?.trim()) errores.push('Identificar el proceso donde se detectó el retrabajo.')
    if (!datos.factoresContribuyentes?.trim()) errores.push('Documentar los factores contribuyentes.')
    if (activas.some((accion) => accion.estado !== 'verificada' || accion.eficaz !== true)) errores.push('Verificar individualmente la eficacia de todas las acciones.')
    const evidencia = Boolean(evento.evidenciaUrls?.some((url) => url.trim()) || activas.some((accion) => accion.evidencia?.trim()))
    if (!evidencia) errores.push('Adjuntar al menos una evidencia o referencia.')
    if (!datos.fechaVerificacion) errores.push('Registrar la fecha real de verificación.')
    if (datos.fechaVerificacion && datos.fechaVerificacion > new Date().toISOString().slice(0, 10)) errores.push('La fecha de verificación no puede ser futura.')
    if (!datos.verificadoEn || !datos.verificadoPor?.trim()) errores.push('Registrar quién realizó la verificación y cuándo.')
  }
  return [...new Set(errores)]
}

export function estadoInvestigacionRetrabajo(evento: EventoSGO, acciones: AccionSGO[]): EstadoInvestigacionRetrabajo {
  const datos = evento.retrabajo
  if (!datos) return 'nuevo'
  if (evento.estado === 'cerrado') return 'cerrado'
  if (datos.resultadoVerificacion === 'reincidencia') return 'reincidencia'
  if (!datos.tomadoEn) return 'nuevo'
  const nivel = nivelInvestigacionRetrabajo(evento)
  if (!evento.causaRaiz?.trim() || !evento.contencion?.trim() || !evento.disposicion || evento.disposicion === 'pendiente' || !datos.resultadoResolucion?.trim() || !costoDefinido(evento)) return 'en_investigacion'
  const activas = acciones.filter((accion) => accion.estado !== 'cancelada')
  if (nivel === 'simple') return activas.some((accion) => accion.estado !== 'verificada') ? 'con_acciones' : 'listo_cierre'
  if (!evento.metodoAnalisis || !datos.clasificacionCausa || !activas.length || activas.some((accion) => ['pendiente', 'en_curso'].includes(accion.estado))) return 'con_acciones'
  if (nivel === 'critica' && activas.some((accion) => accion.estado !== 'verificada' || accion.eficaz !== true)) return 'pendiente_verificacion'
  return datos.resultadoVerificacion === 'eficaz' && Boolean(datos.observacionVerificacion?.trim()) ? 'listo_cierre' : 'pendiente_verificacion'
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

export function validarCierreRetrabajo(evento: EventoSGO, acciones: AccionSGO[]): string[] {
  if (!evento.retrabajo || evento.estado !== 'cerrado') return []
  return requisitosCierreRetrabajo(evento, acciones)
}
