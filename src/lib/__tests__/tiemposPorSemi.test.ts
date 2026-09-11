import { describe, expect, it } from 'vitest'
import type { Tarea } from '../../types'
import { tiemposPorSemielaborado } from '../tiemposPorSemi'

// ============================================================
// v2.14 — Tiempos reales por semielaborado. Martes 1/9/2026.
// ============================================================
const M = (h: number, m = 0) =>
  `2026-09-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000-03:00`

function tarea(over: Partial<Tarea> & { id: string }): Tarea {
  return {
    sectorId: 'bob_dist_at' as Tarea['sectorId'], maquinaId: 'm1', operarioId: 'op1',
    modelo: 'TTD 100/13', componenteCodigo: 'BOB-001',
    semana: '2026-W36', prioridad: 1, estado: 'finalizada',
    tiempoEstandarMin: 120, paradas: [],
    inicioReal: M(8), finReal: M(10), // 120' netos
    ...over,
  }
}

describe('agrupamiento', () => {
  it('junta las tareas del mismo semielaborado y sector', () => {
    const filas = tiemposPorSemielaborado([
      tarea({ id: 'a' }), tarea({ id: 'b' }), tarea({ id: 'c' }),
    ])
    expect(filas).toHaveLength(1)
    expect(filas[0].muestras).toBe(3)
  })

  it('separa el MISMO semielaborado hecho en sectores distintos', () => {
    const filas = tiemposPorSemielaborado([
      tarea({ id: 'a' }),
      tarea({ id: 'b', sectorId: 'bob_rural_at' as Tarea['sectorId'] }),
    ])
    expect(filas).toHaveLength(2)
  })

  it('deja afuera reparaciones, prototipos y tareas sin terminar', () => {
    const filas = tiemposPorSemielaborado([
      tarea({ id: 'rep', tipo: 'reparacion' }),
      tarea({ id: 'proto', esPrototipo: true }),
      tarea({ id: 'curso', estado: 'en_proceso', finReal: undefined }),
    ])
    expect(filas).toHaveLength(0)
  })

  it('filtra por área cuando se le pide', () => {
    const ts = [
      tarea({ id: 'bob' }),
      tarea({ id: 'mon', sectorId: 'montaje_pa_dist' as Tarea['sectorId'], componenteCodigo: 'PA-001' }),
    ]
    expect(tiemposPorSemielaborado(ts, ['bobinado'])).toHaveLength(1)
    expect(tiemposPorSemielaborado(ts, ['montaje'])).toHaveLength(1)
    expect(tiemposPorSemielaborado(ts, ['bobinado', 'montaje'])).toHaveLength(2)
  })
})

describe('los números', () => {
  // Tres tareas de 120', 180' y 600'. La última quedó mal cerrada.
  const ts = [
    tarea({ id: 'a', inicioReal: M(8), finReal: M(10) }),   // 120
    tarea({ id: 'b', inicioReal: M(8), finReal: M(11) }),   // 180
    tarea({ id: 'c', inicioReal: M(7), finReal: M(15, 45) }), // 525 (todo el turno)
  ]
  const [f] = tiemposPorSemielaborado(ts)

  it('la mediana no se deja arrastrar por el caso raro', () => {
    expect(f.medianaMin).toBe(180)
  })

  it('el promedio sí se corre, y por eso se muestran los dos', () => {
    expect(f.promedioMin).toBe(275) // (120+180+525)/3
    expect(f.promedioMin).toBeGreaterThan(f.medianaMin)
  })

  it('muestra el mínimo y el máximo para ver la dispersión', () => {
    expect(f.minMin).toBe(120)
    expect(f.maxMin).toBe(525)
  })

  it('el desvío compara la MEDIANA contra el estándar planificado', () => {
    // estándar 120, mediana 180 -> +50%
    expect(f.estandarMin).toBe(120)
    expect(Math.round(f.desvioPct * 100)).toBe(50)
  })

  it('descuenta las demoras justificadas: mide el trabajo, no la espera', () => {
    const conEspera = tarea({
      id: 'x', inicioReal: M(8), finReal: M(11), // 180' de real
      paradas: [{
        id: 'p', tareaId: 'x', causa: 'espera_alambre' as Tarea['paradas'][number]['causa'],
        inicio: M(9), fin: M(10), // 60' esperando material
      }],
    })
    const [g] = tiemposPorSemielaborado([conEspera])
    expect(g.medianaMin).toBe(120) // 180 − 60
  })
})
