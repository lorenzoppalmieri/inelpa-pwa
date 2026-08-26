import { describe, expect, it } from 'vitest'
import { construirAutorizacionesSGO } from '../autorizaciones'
import type { ActividadAgendaISO } from '../agendaISO'
import type { EjecucionControlSGO } from '../controles'
import type { TareaSGO } from '../tareasSGO'
import type { AccionSGO, EventoSGO } from '../types'

const fecha = '2026-08-24T12:00:00.000Z'

describe('bandeja de autorizaciones SGO', () => {
  it('reúne las decisiones pendientes de cada fuente sin duplicar registros', () => {
    const tarea = { id: 't-1', titulo: 'Revisar instructivo', asignadoA: 'azul', importancia: 'alta', estado: 'finalizada', finalizadaPor: 'azul', finalizadaEn: fecha, actualizadoEn: fecha } as TareaSGO
    const actividad = { id: 'iso-1', titulo: 'Auditoría interna', responsable: 'Azul', estado: 'completada', criticidad: 'alta', completadaPor: 'azul', completadaEn: fecha, actualizadoEn: fecha } as ActividadAgendaISO
    const ejecucion = { id: 'e-1', controlId: 'c-1', auditoriaCampo: { areaId: 'bobinado_rural', revisionesPuntaje: [{ id: 'r-1', itemId: 'i-1', puntajeOriginal: 0, puntajePropuesto: 2, estado: 'pendiente', areaResponsableId: 'mantenimiento', solicitadaPor: 'lara', solicitadaEn: fecha }] } } as EjecucionControlSGO
    const mejora = { id: 'm-1', titulo: 'Mejorar aparejo', detectadoPor: 'lara', detectadoEn: fecha, actualizadoEn: fecha, estado: 'abierto', severidad: 'alta', areaId: 'bobinado_rural', mejora: { decision: 'pendiente', prioridad: 'alta', presupuestoEstimado: 600000 } } as EventoSGO
    const accion = { id: 'a-1', eventoId: 'm-1', descripcion: 'Instalar final de carrera', responsable: 'Mantenimiento', estado: 'completada', completadaPor: 'Mantenimiento', completadaEn: fecha, actualizadoEn: fecha } as AccionSGO

    const items = construirAutorizacionesSGO({ tareas: [tarea], agenda: [actividad], ejecuciones: [ejecucion], eventos: [mejora], acciones: [accion] })

    expect(items.filter((item) => item.estado === 'pendiente')).toHaveLength(5)
    expect(items.filter((item) => item.clase === 'autorizacion_economica')).toHaveLength(1)
    expect(items.filter((item) => item.clase === 'revision_5s')).toHaveLength(1)
    expect(items.filter((item) => item.clase === 'seguimiento')).toHaveLength(3)
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length)
    expect(items.map((item) => item.tipo)).toEqual(expect.arrayContaining(['tarea_sgo', 'agenda_iso', 'revision_5s', 'mejora', 'accion']))
  })

  it('no envía a autorización económica una mejora de hasta el límite', () => {
    const mejora = { id: 'm-2', titulo: 'Orden visual', detectadoPor: 'lara', detectadoEn: fecha, actualizadoEn: fecha, estado: 'abierto', severidad: 'media', areaId: 'laminado', mejora: { decision: 'pendiente', prioridad: 'media', presupuestoEstimado: 500000 } } as EventoSGO
    const items = construirAutorizacionesSGO({ tareas: [], agenda: [], ejecuciones: [], eventos: [mejora], acciones: [] }, 500000)
    expect(items).toHaveLength(0)
  })

  it('mueve al historial las decisiones que ya fueron verificadas', () => {
    const tarea = { id: 't-2', titulo: 'Control cerrado', asignadoA: 'lara', importancia: 'media', estado: 'verificada', finalizadaPor: 'lara', verificadaPor: 'lorenzo', verificadaEn: fecha, actualizadoEn: fecha } as TareaSGO
    const accion = { id: 'a-2', eventoId: 'ev-2', descripcion: 'Acción eficaz', responsable: 'Lara', estado: 'verificada', eficaz: true, verificadaPor: 'lorenzo', verificadaEn: fecha, actualizadoEn: fecha } as AccionSGO
    const evento = { id: 'ev-2', codigo: 'SGO-2026-ABC', titulo: 'Evento', estado: 'abierto', severidad: 'media', detectadoEn: fecha, actualizadoEn: fecha } as EventoSGO

    const items = construirAutorizacionesSGO({ tareas: [tarea], agenda: [], ejecuciones: [], eventos: [evento], acciones: [accion] })

    expect(items).toHaveLength(2)
    expect(items.every((item) => item.estado === 'resuelta')).toBe(true)
  })
})
