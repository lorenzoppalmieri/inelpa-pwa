import { describe, expect, it } from 'vitest'
import type { Tarea } from '../../types'
import type { IndicadorSGO } from '../indicadores'
import { resolverKPIAutomaticos } from '../kpiAutomaticos'

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
