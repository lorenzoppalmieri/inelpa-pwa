import { describe, expect, it } from 'vitest'
import { estadoContadorSeguridad, reiniciaContadorSeguridad } from '../contadoresSeguridad'
import type { IndicadorSGO } from '../indicadores'
import type { EventoSGO } from '../types'

const baseEvento: EventoSGO = {
  id: 'evento-1', codigo: 'SGO-2026-TEST01', tipo: 'incidente_seguridad', pilar: 'seguridad',
  titulo: 'Hecho de seguridad', descripcion: 'Descripción', severidad: 'media', estado: 'abierto',
  detectadoEn: '2026-08-04T12:00:00.000Z', detectadoPor: 'lara',
  creadoEn: '2026-08-04T12:00:00.000Z', actualizadoEn: '2026-08-04T12:00:00.000Z',
}

const ajuste: IndicadorSGO = {
  id: 'contador', areaId: 'gerencia_directorio', pilar: 'seguridad', nombre: 'Contador', unidad: 'días',
  direccion: 'mayor_mejor', meta: 365, umbralAmarillo: 30, valorActual: 10, origen: 'manual',
  periodo: '2026-08', frecuencia: 'anual', activo: true,
  actualizadoEn: '2026-08-01T12:00:00.000Z', actualizadoPor: 'lorenzo',
}

describe('contadores de Seguridad', () => {
  it('un hecho con lesión reinicia tanto accidentes como incidentes', () => {
    const evento = { ...baseEvento, seguridad: { fechaHoraHecho: '2026-08-04T09:00:00.000Z', lugarExacto: 'Planta', tareaActividad: 'Montaje', resultadoPersona: 'primeros_auxilios' as const } }
    expect(reiniciaContadorSeguridad(evento, 'accidentes')).toBe(true)
    expect(reiniciaContadorSeguridad(evento, 'incidentes')).toBe(true)
  })

  it('un hecho sin lesión reinicia incidentes pero no accidentes', () => {
    const evento = { ...baseEvento, seguridad: { fechaHoraHecho: '2026-08-04T09:00:00.000Z', lugarExacto: 'Planta', tareaActividad: 'Montaje', resultadoPersona: 'sin_lesion' as const } }
    expect(reiniciaContadorSeguridad(evento, 'accidentes')).toBe(false)
    expect(reiniciaContadorSeguridad(evento, 'incidentes')).toBe(true)
  })

  it('mantiene como accidente un registro histórico sin clasificación', () => {
    expect(reiniciaContadorSeguridad(baseEvento, 'accidentes')).toBe(true)
    expect(reiniciaContadorSeguridad(baseEvento, 'incidentes')).toBe(true)
  })

  it('un cuasi accidente reinicia incidentes pero no accidentes', () => {
    const evento = { ...baseEvento, tipo: 'cuasi_accidente' as const }
    expect(reiniciaContadorSeguridad(evento, 'accidentes')).toBe(false)
    expect(reiniciaContadorSeguridad(evento, 'incidentes')).toBe(true)
  })

  it('una observación preventiva no reinicia ningún contador', () => {
    const evento = { ...baseEvento, tipo: 'observacion_preventiva' as const }
    expect(reiniciaContadorSeguridad(evento, 'accidentes')).toBe(false)
    expect(reiniciaContadorSeguridad(evento, 'incidentes')).toBe(false)
  })

  it('incrementa diariamente el valor ajustado por Lorenzo', () => {
    const estado = estadoContadorSeguridad([], ajuste, 'incidentes', new Date('2026-08-05T15:00:00.000Z'))
    expect(estado.dias).toBe(14)
    expect(estado.motivo).toBe('Ajustado por lorenzo')
  })

  it('prioriza un incidente posterior al ajuste manual', () => {
    const evento = { ...baseEvento, seguridad: { fechaHoraHecho: '2026-08-04T09:00:00.000Z', lugarExacto: 'Planta', tareaActividad: 'Montaje', resultadoPersona: 'sin_lesion' as const } }
    const estado = estadoContadorSeguridad([evento], ajuste, 'incidentes', new Date('2026-08-07T15:00:00.000Z'))
    expect(estado.dias).toBe(3)
    expect(estado.motivo).toBe('Reiniciado por SGO-2026-TEST01')
  })
})
