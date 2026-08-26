import type { ActividadAgendaISO } from './agendaISO'
import type { EjecucionControlSGO } from './controles'
import { areaSGOLabel, type AccionSGO, type EventoSGO, type SeveridadSGO } from './types'
import { estadoInvestigacionRetrabajo, nivelInvestigacionRetrabajo } from './retrabajos'
import { etiquetaResponsableTareaSGO, type TareaSGO } from './tareasSGO'

export type TipoAutorizacionSGO = 'revision_5s' | 'tarea_sgo' | 'agenda_iso' | 'mejora' | 'retrabajo' | 'accion'
export type ClaseAutorizacionSGO = 'autorizacion_economica' | 'revision_5s' | 'seguimiento'
export type EstadoAutorizacionSGO = 'pendiente' | 'resuelta'
export type PrioridadAutorizacionSGO = 'baja' | 'media' | 'alta' | 'critica'

export interface AutorizacionSGO {
  id: string
  tipo: TipoAutorizacionSGO
  clase: ClaseAutorizacionSGO
  origenId: string
  eventoId?: string
  estado: EstadoAutorizacionSGO
  prioridad: PrioridadAutorizacionSGO
  titulo: string
  detalle: string
  solicitadoPor: string
  fecha: string
  area?: string
  resultado?: string
}

export interface DatosAutorizacionesSGO {
  tareas: TareaSGO[]
  agenda: ActividadAgendaISO[]
  ejecuciones: EjecucionControlSGO[]
  eventos: EventoSGO[]
  acciones: AccionSGO[]
}

const prioridadDesdeSeveridad = (severidad: SeveridadSGO): PrioridadAutorizacionSGO => severidad

export function construirAutorizacionesSGO(
  { tareas, agenda, ejecuciones, eventos, acciones }: DatosAutorizacionesSGO,
  umbralAutorizacion = 500000,
): AutorizacionSGO[] {
  const items: AutorizacionSGO[] = []
  const eventosPorId = new Map(eventos.map((evento) => [evento.id, evento]))

  for (const tarea of tareas) {
    if (!['finalizada', 'verificada'].includes(tarea.estado)) continue
    const resuelta = tarea.estado === 'verificada'
    items.push({
      id: `tarea:${tarea.id}`,
      tipo: 'tarea_sgo',
      clase: 'seguimiento',
      origenId: tarea.id,
      estado: resuelta ? 'resuelta' : 'pendiente',
      prioridad: tarea.importancia,
      titulo: tarea.titulo,
      detalle: resuelta ? 'Tarea verificada y cerrada.' : `Tarea finalizada por ${etiquetaResponsableTareaSGO(tarea.asignadoA)}. Revisar la conclusión y el entregable.`,
      solicitadoPor: tarea.finalizadaPor ?? etiquetaResponsableTareaSGO(tarea.asignadoA),
      fecha: resuelta ? (tarea.verificadaEn ?? tarea.actualizadoEn) : (tarea.finalizadaEn ?? tarea.actualizadoEn),
      resultado: resuelta ? `Verificada por ${tarea.verificadaPor ?? 'Lorenzo'}` : undefined,
    })
  }

  for (const actividad of agenda) {
    if (!['completada', 'verificada'].includes(actividad.estado)) continue
    const resuelta = actividad.estado === 'verificada'
    items.push({
      id: `agenda:${actividad.id}`,
      tipo: 'agenda_iso',
      clase: 'seguimiento',
      origenId: actividad.id,
      estado: resuelta ? 'resuelta' : 'pendiente',
      prioridad: actividad.criticidad,
      titulo: actividad.titulo,
      detalle: resuelta ? 'Actividad ISO verificada.' : 'Actividad marcada como completada. Revisar resultado, evidencia y requisito aplicable.',
      solicitadoPor: actividad.completadaPor ?? actividad.responsable,
      fecha: resuelta ? (actividad.verificadaEn ?? actividad.actualizadoEn) : (actividad.completadaEn ?? actividad.actualizadoEn),
      area: actividad.area,
      resultado: resuelta ? actividad.verificacion : undefined,
    })
  }

  for (const ejecucion of ejecuciones) {
    const auditoria = ejecucion.auditoriaCampo
    if (!auditoria) continue
    for (const revision of auditoria.revisionesPuntaje ?? []) {
      const resuelta = revision.estado !== 'pendiente'
      items.push({
        id: `revision5s:${ejecucion.id}:${revision.id}`,
        tipo: 'revision_5s',
        clase: 'revision_5s',
        origenId: ejecucion.id,
        eventoId: revision.mejoraEventoId,
        estado: resuelta ? 'resuelta' : 'pendiente',
        prioridad: revision.puntajeOriginal === 0 ? 'alta' : 'media',
        titulo: `Revisión de puntaje 5S · ${areaSGOLabel(auditoria.areaId)}`,
        detalle: `Puntaje observado ${revision.puntajeOriginal}/2; se propone ${revision.puntajePropuesto}/2. Responsabilidad investigada: ${areaSGOLabel(revision.areaResponsableId)}.`,
        solicitadoPor: revision.solicitadaPor,
        fecha: resuelta ? (revision.decididaEn ?? revision.solicitadaEn) : revision.solicitadaEn,
        area: areaSGOLabel(auditoria.areaId),
        resultado: resuelta ? `${revision.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'} por ${revision.decididaPor ?? 'Lorenzo'}${revision.decisionComentario ? ` · ${revision.decisionComentario}` : ''}` : undefined,
      })
    }
  }

  for (const evento of eventos) {
    const presupuesto = Math.max(0, Number(evento.mejora?.presupuestoEstimado) || 0)
    const requiereAutorizacion = evento.mejora?.autorizacionRequerida ?? presupuesto > (evento.mejora?.umbralAutorizacionAplicado ?? umbralAutorizacion)
    if (evento.mejora && requiereAutorizacion && (evento.mejora.decision !== 'pendiente' || evento.estado !== 'cerrado')) {
      const resuelta = evento.mejora.decision !== 'pendiente'
      items.push({
        id: `mejora:${evento.id}`,
        tipo: 'mejora',
        clase: 'autorizacion_economica',
        origenId: evento.id,
        eventoId: evento.id,
        estado: resuelta ? 'resuelta' : 'pendiente',
        prioridad: evento.mejora.prioridad,
        titulo: evento.titulo,
        detalle: resuelta ? `Decisión económica registrada para un presupuesto de ${presupuesto.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}.` : `Presupuesto estimado: ${presupuesto.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}. Supera el límite autorizado y requiere decisión de Lorenzo.`,
        solicitadoPor: evento.detectadoPor,
        fecha: resuelta ? evento.actualizadoEn : evento.detectadoEn,
        area: areaSGOLabel(evento.areaId),
        resultado: resuelta ? `Decisión: ${evento.mejora.decision.replace('_', ' ')}` : undefined,
      })
    }

    if (evento.retrabajo && nivelInvestigacionRetrabajo(evento) === 'critica') {
      const resuelta = evento.estado === 'cerrado'
      const etapa = estadoInvestigacionRetrabajo(evento, acciones.filter((accion) => accion.eventoId === evento.id))
      items.push({
        id: `retrabajo:${evento.id}`,
        tipo: 'retrabajo',
        clase: 'seguimiento',
        origenId: evento.id,
        eventoId: evento.id,
        estado: resuelta ? 'resuelta' : 'pendiente',
        prioridad: 'critica',
        titulo: evento.titulo,
        detalle: resuelta ? 'Investigación crítica verificada y cerrada.' : `Retrabajo crítico en etapa “${etapa.replaceAll('_', ' ')}”. La validación operativa corresponde a Lara o Lorenzo.`,
        solicitadoPor: evento.retrabajo.tomadoPor ?? evento.retrabajo.asignadoA,
        fecha: resuelta ? (evento.cerradoEn ?? evento.actualizadoEn) : evento.actualizadoEn,
        area: areaSGOLabel(evento.areaOrigenId ?? evento.areaId),
        resultado: resuelta ? `Cerrado por ${evento.cerradoPor ?? 'Lorenzo'}` : undefined,
      })
    }
  }

  for (const accion of acciones) {
    if (!['completada', 'verificada'].includes(accion.estado)) continue
    const evento = eventosPorId.get(accion.eventoId)
    const resuelta = accion.estado === 'verificada'
    items.push({
      id: `accion:${accion.id}`,
      tipo: 'accion',
      clase: 'seguimiento',
      origenId: accion.id,
      eventoId: accion.eventoId,
      estado: resuelta ? 'resuelta' : 'pendiente',
      prioridad: prioridadDesdeSeveridad(evento?.severidad ?? 'media'),
      titulo: accion.descripcion,
      detalle: resuelta ? 'Eficacia de la acción verificada.' : `Acción completada en ${evento?.codigo ?? 'un expediente SGO'}. Revisar evidencia y eficacia.`,
      solicitadoPor: accion.completadaPor ?? accion.responsable,
      fecha: resuelta ? (accion.verificadaEn ?? accion.actualizadoEn) : (accion.completadaEn ?? accion.actualizadoEn),
      area: evento ? areaSGOLabel(evento.areaOrigenId ?? evento.areaId) : undefined,
      resultado: resuelta ? `${accion.eficaz ? 'Eficaz' : 'No eficaz'}${accion.comentarioVerificacion ? ` · ${accion.comentarioVerificacion}` : ''}` : undefined,
    })
  }

  return items.sort((a, b) => {
    const orden: Record<PrioridadAutorizacionSGO, number> = { critica: 0, alta: 1, media: 2, baja: 3 }
    return Number(a.estado === 'resuelta') - Number(b.estado === 'resuelta') || orden[a.prioridad] - orden[b.prioridad] || b.fecha.localeCompare(a.fecha)
  })
}
