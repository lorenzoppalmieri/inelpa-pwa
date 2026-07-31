import { describe, expect, it } from 'vitest'
import { construirCelda } from '../../components/sgo/MatrizSGO'
import type { AccionSGO, EventoSGO } from '../types'
import type { IndicadorSGO } from '../indicadores'

const kpi: IndicadorSGO = {
  id: 'k', areaId: 'bobinado_rural', pilar: 'calidad', nombre: 'FPY', unidad: '%',
  direccion: 'mayor_mejor', meta: 95, umbralAmarillo: 85, valorActual: 97,
  periodo: '2026-07', activo: true, actualizadoEn: '', actualizadoPor: 'Azul',
}

const evento: EventoSGO = {
  id: 'e', codigo: 'SGO-E', tipo: 'no_conformidad', pilar: 'calidad', titulo: 'NC',
  descripcion: 'NC', severidad: 'alta', estado: 'abierto', areaOrigenId: 'bobinado_rural',
  detectadoEn: '2026-07-30T10:00:00Z', detectadoPor: 'Azul', creadoEn: '', actualizadoEn: '',
}

const accion: AccionSGO = {
  id: 'a', eventoId: 'e', tipo: 'correctiva', descripcion: 'Corregir', responsable: 'Nico',
  fechaCompromiso: '2020-01-01', estado: 'pendiente', creadoEn: '', creadoPor: 'Azul', actualizadoEn: '',
}

describe('prioridad del semáforo de matriz', () => {
  it('muestra verde con KPI conforme y sin desvíos', () => {
    expect(construirCelda('bobinado_rural', 'calidad', [], [], [kpi]).estado).toBe('verde')
  })

  it('prioriza un evento alto sobre un KPI verde', () => {
    expect(construirCelda('bobinado_rural', 'calidad', [evento], [], [kpi]).estado).toBe('rojo')
  })

  it('prioriza una acción vencida', () => {
    expect(construirCelda('bobinado_rural', 'calidad', [{ ...evento, severidad: 'baja' }], [accion], [kpi]).estado).toBe('rojo')
  })
})
