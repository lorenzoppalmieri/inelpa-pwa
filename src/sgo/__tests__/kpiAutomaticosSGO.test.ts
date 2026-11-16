import { describe, expect, it } from 'vitest'
import type { Tarea } from '../../types'
import type { IndicadorSGO } from '../indicadores'
import { resolverKPIAutomaticos } from '../kpiAutomaticos'
import { crearDatosRetrabajo } from '../retrabajos'
import type { EventoSGO } from '../types'

// ============================================================
// v2.47 — KPI "cumplimiento de producción" del SGO: comparar INSTANTES (ms),
// no texto. Con texto, '09:00-03:00' (= 12:00 UTC) quedaba "antes" que
// '11:00Z' y una tarea terminada 1 h tarde contaba como cumplida.
// ============================================================
const indicador = {
  id: 'kpi1', areaId: 'bobinado_rural', pilar: 'calidad', nombre: 'Cumplimiento', unidad: '%',
  direccion: 'mayor', meta: 90, umbralAmarillo: 80, origen: 'automatico',
  claveCalculo: 'produccion_cumplimiento', periodo: '2026-09', frecuencia: 'mensual',
  activo: true, actualizadoEn: '2026-09-01T00:00:00.000Z', actualizadoPor: 'Lorenzo',
} as unknown as IndicadorSGO

function tarea(id: string, finReal: string): Tarea {
  return {
    id, tipo: 'fabricacion', sectorId: 'bob_rural_at', estado: 'finalizada',
    tiempoEstandarMin: 60,
    inicioPlanificado: '2026-09-01T10:00:00.000Z', // mar 01/09 07:00 hora AR → fin plan. 08:00 AR
    finReal, paradas: [],
  } as unknown as Tarea
}

// v2.51 — La Matriz cuenta los MISMOS retrabajos que SGO › Retrabajos.
describe('KPI retrabajos del área (Matriz) = expedientes de retrabajo', () => {
  it('cuenta expedientes por área de origen y no las paradas descartadas', () => {
    const ind = { ...indicador, id: 'kpi2', claveCalculo: 'produccion_retrabajos', periodo: '2026-11' } as unknown as IndicadorSGO
    const ev = (id: string, origen: 'parada_calidad' | 'defecto_final', extra: Record<string, unknown> = {}) => ({
      id, codigo: id, tipo: 'no_conformidad', pilar: 'calidad', titulo: 't', descripcion: '', severidad: 'media', estado: 'abierto',
      areaId: 'bobinado_rural', areaOrigenId: 'bobinado_rural', detectadoEn: '2026-11-05T13:00:00Z', detectadoPor: 'x',
      creadoEn: '', actualizadoEn: '', retrabajo: crearDatosRetrabajo(origen, '2026-11-05T13:00:00Z', extra),
    }) as unknown as EventoSGO
    const eventos = [
      ev('a', 'defecto_final'),
      ev('b', 'parada_calidad', { decisionCalidad: 'investigar' }),
      ev('c', 'parada_calidad', { decisionCalidad: 'descartada' }),
      { ...ev('d', 'defecto_final'), areaOrigenId: 'montaje_rural' } as EventoSGO,
    ]
    const [r] = resolverKPIAutomaticos([ind], { tareas: [], laboratorio: [], tareasLogistica: [], eventos, acciones: [] })
    expect(r.valorActual).toBe(2)
  })
})

describe('KPI cumplimiento de producción (SGO)', () => {
  it('compara el fin real con el planificado en ms, aunque vengan en distinto formato', () => {
    const datos = {
      tareas: [
        tarea('a_tiempo', '2026-09-01T07:50:00.000-03:00'), // 10:50 UTC: antes del fin planificado
        tarea('tarde', '2026-09-01T09:00:00.000-03:00'),    // 12:00 UTC: 1 h tarde
      ],
      laboratorio: [], tareasLogistica: [], eventos: [], acciones: [],
    }
    const [r] = resolverKPIAutomaticos([indicador], datos)
    expect(r.valorActual).toBe(50)
  })
})
