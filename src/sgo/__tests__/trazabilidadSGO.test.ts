import { describe, expect, it } from 'vitest'
import type { Maquina, Tarea, Usuario } from '../../types'
import { resolverTrazabilidadProductiva } from '../trazabilidad'
import type { EventoSGO } from '../types'

const evento: EventoSGO = {
  id: 'e1', codigo: 'SGO-2026-E1', tipo: 'no_conformidad', pilar: 'calidad', titulo: 'Retrabajo',
  descripcion: 'Problema de calidad', severidad: 'media', estado: 'abierto', areaId: 'bobinado_distribucion',
  sectorId: 'bob_dist_at', maquinaId: 'm_bob_02', tareaId: 't1', detectadoEn: '2026-08-19T11:05:00Z',
  detectadoPor: 'Lorenzo', creadoEn: '2026-08-19T12:00:00Z', actualizadoEn: '2026-08-19T12:00:00Z',
  retrabajo: {
    origen: 'parada_calidad', asignadoA: 'Lara', fechaLimiteToma: '2026-08-20T11:05:00Z',
    fechaLimiteInvestigacion: '2026-08-22T11:05:00Z', resultadoVerificacion: 'pendiente', operarioId: 'u1',
  },
}

describe('trazabilidad productiva de eventos SGO', () => {
  it('diferencia el operario y la ubicacion de quien registro el expediente SGO', () => {
    const tarea = { id: 't1', sectorId: 'bob_dist_at', maquinaId: 'm_bob_02', operarioId: 'u1' } as Tarea
    const maquina = { id: 'm_bob_02', nombre: 'Bobinadora 02', sectorId: 'bob_dist_at', tipo: 'maquina', activo: true } as Maquina
    const operario = { id: 'u1', nombre: 'Juan Perez', usuario: 'jperez', activo: true } as Usuario
    const resultado = resolverTrazabilidadProductiva(evento, [tarea], [maquina], [operario])

    expect(resultado.sector).toBe('Bobinado Distribucion A.T.')
    expect(resultado.maquina).toBe('Bobinadora 02')
    expect(resultado.operario).toBe('Juan Perez')
    expect(resultado.registradoPor).toBe('Lorenzo')
    expect(resultado.ocurridoEn).toBe(evento.detectadoEn)
  })

  it('prioriza las descripciones congeladas en el expediente', () => {
    const resultado = resolverTrazabilidadProductiva({
      ...evento,
      retrabajo: { ...evento.retrabajo!, sectorNombre: 'Linea especial', maquinaNombre: 'Puesto A', operarioNombre: 'Maria' },
    }, [], [], [])
    expect(resultado).toMatchObject({ sector: 'Linea especial', maquina: 'Puesto A', operario: 'Maria' })
  })
})
