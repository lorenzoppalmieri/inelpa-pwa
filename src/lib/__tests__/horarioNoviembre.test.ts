import { describe, expect, it } from 'vitest'
import type { Tarea } from '../../types'
import {
  aperturaDelDia, esSabadoDevolucion, minutosLaborablesEntre, minutosLaboralesLogistica,
  recuperacionDiariaVigente, tramosLaborables,
} from '../calendario'
import { programar } from '../programacion'

// ============================================================
// v2.43 — Horario unificado de noviembre 2026 (comunicado de RRHH).
//   - Sin recuperación diaria desde el 1/11 (lo anterior se respeta).
//   - Último sábado del mes 06:00-15:00, solo para lo que se haga ese día.
//   - Pañol al horario unificado (07-16 / vie 07-15) desde el 1/11.
// Noviembre 2026: el 1 es domingo; el último sábado es el 28.
// Offset -03:00 a propósito (ver huecos.test).
// ============================================================
const L = (fecha: string, h: number, m = 0) =>
  `${fecha}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000-03:00`
const D = (fecha: string) => new Date(`${fecha}T12:00:00`)
const ms = (iso: string) => new Date(iso).getTime()

function tarea(over: Partial<Tarea> & { id: string }): Tarea {
  return {
    sectorId: 'bob_dist_at' as Tarea['sectorId'],
    maquinaId: 'm_bob_01', operarioId: 'op1',
    modelo: 'TTD 100/13', semana: '2026-W48', prioridad: 1,
    estado: 'pendiente', tiempoEstandarMin: 60, paradas: [],
    ...over,
  }
}

describe('último sábado del mes', () => {
  it('solo el último sábado y solo desde noviembre 2026', () => {
    expect(esSabadoDevolucion(D('2026-11-28'))).toBe(true)
    expect(esSabadoDevolucion(D('2026-11-21'))).toBe(false)   // no es el último
    expect(esSabadoDevolucion(D('2026-11-27'))).toBe(false)   // viernes
    expect(esSabadoDevolucion(D('2026-10-31'))).toBe(false)   // antes de la vigencia
  })

  it('abre 06:00-15:00 con almuerzo del grupo y limpieza, pero solo si se pide', () => {
    expect(tramosLaborables(D('2026-11-28'), 'A', 60, false, undefined, true)).toEqual([
      { iniMin: 6 * 60, finMin: 12 * 60 },
      { iniMin: 12 * 60 + 30, finMin: 14 * 60 + 45 },
    ])
    expect(tramosLaborables(D('2026-11-28'), 'A', 60)).toEqual([])
  })

  it('el sábado abre a las 06:00', () => {
    expect(ms(aperturaDelDia(L('2026-11-28', 10)))).toBe(ms(L('2026-11-28', 6)))
  })
})

describe('medición con el sábado de devolución', () => {
  it('una tarea abierta de viernes a lunes NO suma el sábado', () => {
    // vie 14:00-14:45 (45) + lun 07:00-08:00 (60)
    expect(minutosLaborablesEntre(L('2026-11-27', 14), L('2026-11-30', 8), 'A', 0, true)).toBe(105)
  })

  it('si termina el sábado, el sábado cuenta', () => {
    // vie 45 + sáb 06:00-10:00 (240)
    expect(minutosLaborablesEntre(L('2026-11-27', 14), L('2026-11-28', 10), 'A', 0, true)).toBe(285)
  })

  it('un trabajo de todo el sábado mide 06:00-14:45', () => {
    expect(minutosLaborablesEntre(L('2026-11-28', 6), L('2026-11-28', 15), 'A', 0, true)).toBe(525)
  })
})

describe('fin de la recuperación diaria', () => {
  it('octubre conserva la franja 16-17; noviembre ya no la tiene', () => {
    const oct = tramosLaborables(D('2026-10-26'), 'A', 60)
    const nov = tramosLaborables(D('2026-11-02'), 'A', 60)
    expect(oct.some((t) => t.iniMin === 16 * 60)).toBe(true)
    expect(nov.some((t) => t.finMin > 16 * 60)).toBe(false)
  })

  it('una tarea que cruza el 31/10 cuenta su recuperación solo hasta el viernes 30', () => {
    // vie 30/10: 14:00-14:45 (45) + recup 15:00-16:00 (60). lun 2/11: 07:00-15:45 (525), sin recup.
    expect(minutosLaborablesEntre(L('2026-10-30', 14), L('2026-11-02', 17), 'A', 60, true)).toBe(630)
  })

  it('las pantallas ya no ofrecen activarla', () => {
    expect(recuperacionDiariaVigente(D('2026-10-31'))).toBe(true)
    expect(recuperacionDiariaVigente(D('2026-11-01'))).toBe(false)
  })
})

describe('la cola del Gantt y el sábado', () => {
  it('la cola NO se corre sola al sábado: del viernes salta al lunes', () => {
    const t = tarea({ id: 'C', creada: L('2026-11-27', 8), tiempoEstandarMin: 120 })
    const p = programar([t], L('2026-11-27', 14)).get('C')!
    expect(ms(p.startISO)).toBe(ms(L('2026-11-27', 14)))
    // 45' el viernes + 75' el lunes desde las 07:00
    expect(ms(p.endISO)).toBe(ms(L('2026-11-30', 8, 15)))
  })

  it('una tarea planificada para el sábado se dibuja el sábado', () => {
    const t = tarea({ id: 'S', creada: L('2026-11-26', 8), inicioPlanificado: L('2026-11-28', 6), tiempoEstandarMin: 60 })
    const p = programar([t], L('2026-11-27', 9)).get('S')!
    expect(ms(p.startISO)).toBe(ms(L('2026-11-28', 6)))
    expect(ms(p.endISO)).toBe(ms(L('2026-11-28', 7)))
  })
})

describe('pañol al horario unificado', () => {
  it('desde noviembre abre 07:00 y cierra 16:00', () => {
    expect(minutosLaboralesLogistica(L('2026-11-02', 7), L('2026-11-02', 8))).toBe(60)
    expect(minutosLaboralesLogistica(L('2026-11-02', 15, 30), L('2026-11-02', 16, 30))).toBe(30)
  })

  it('octubre se sigue midiendo 08:00-17:00', () => {
    expect(minutosLaboralesLogistica(L('2026-10-26', 7), L('2026-10-26', 8))).toBe(0)
    expect(minutosLaboralesLogistica(L('2026-10-26', 16, 30), L('2026-10-26', 17, 30))).toBe(30)
  })
})
