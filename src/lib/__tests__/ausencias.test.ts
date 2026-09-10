import { afterEach, describe, expect, it } from 'vitest'
import type { Tarea } from '../../types'
import {
  setAusencias, setFeriados, diasLaborablesDelRango,
  minutosProductivosDia, JORNADA_PRODUCTIVA_MIN,
} from '../calendario'
import { metricasTarea } from '../kpi'
import { huecosPorTarea } from '../huecos'

// ============================================================
// v2.04 — Ausencias por colaborador.
//
// Una ausencia cierra el día para UNA persona, igual que un feriado lo cierra
// para toda la planta. El día que faltó no suma ni al Tiempo Real ni a las
// demoras de SUS tareas, y no le cuenta como tiempo muerto en Bobinado.
//
// Martes 1/9/2026 (día de trabajo) y miércoles 2/9 (el día que se falta).
// Turno Lun-Jue 07:00-16:00 con 15' de limpieza → cierre productivo 15:45.
// ============================================================
const M = (d: number, h: number, m = 0) =>
  `2026-09-0${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000-03:00`

const AUSENTE_MIERCOLES = new Map([['op1', new Set(['2026-09-02'])]])

function tarea(over: Partial<Tarea> & { id: string }): Tarea {
  return {
    sectorId: 'bob_dist_at' as Tarea['sectorId'],
    maquinaId: 'm_bob_01', operarioId: 'op1',
    modelo: 'TTD 100/13', semana: '2026-W36', prioridad: 1,
    estado: 'finalizada', tiempoEstandarMin: 60, paradas: [],
    ...over,
  }
}

// Cada test declara su propio estado; se limpia para no contaminar a los demás.
afterEach(() => setAusencias(new Map()))

describe('el día de ausencia no cuenta', () => {
  // Arranca el martes 14:00 y cierra el jueves 09:00, faltando el miércoles.
  const t = tarea({ id: 'A', inicioReal: M(1, 14), finReal: M(3, 9) })

  it('sin ausencia cargada, el miércoles suma entero', () => {
    const m = metricasTarea(t)
    // martes 14:00-15:45 = 105' · miércoles 07:00-15:45 = 525' · jueves 07:00-09:00 = 120'
    expect(m.real).toBe(105 + 525 + 120)
  })

  it('con la ausencia cargada, el miércoles desaparece del Tiempo Real', () => {
    setAusencias(AUSENTE_MIERCOLES)
    expect(metricasTarea(t).real).toBe(105 + 120)
  })

  it('la ausencia baja la demora, no la esconde en otro lado', () => {
    setAusencias(AUSENTE_MIERCOLES)
    const m = metricasTarea(t)
    expect(m.demorado).toBe(m.real - m.estimado)
    // Las 3 identidades del auditor tienen que seguir cerrando.
    expect(m.demorado - m.adelanto).toBe(m.real - m.estimado)
    expect(m.justificadaAplicada + m.sinJustificar).toBe(m.demorado)
    expect(m.justificadaAplicada + m.justificadaExcedente).toBe(m.justificada)
  })

  it('NO afecta a las tareas de otro colaborador', () => {
    setAusencias(AUSENTE_MIERCOLES)
    const otro = tarea({ id: 'B', operarioId: 'op2', inicioReal: M(1, 14), finReal: M(3, 9) })
    expect(metricasTarea(otro).real).toBe(105 + 525 + 120)
  })

  it('una parada abierta que cruza la ausencia no se infla', () => {
    setAusencias(AUSENTE_MIERCOLES)
    const conParada = tarea({
      id: 'C', inicioReal: M(1, 14), finReal: M(3, 9),
      paradas: [{ id: 'p', tareaId: 'C', causa: 'falta_herramienta' as Tarea['paradas'][number]['causa'], inicio: M(1, 15), fin: M(3, 8) }],
    })
    const m = metricasTarea(conParada)
    // martes 15:00-15:45 = 45' + jueves 07:00-08:00 = 60'. El miércoles no cuenta.
    expect(m.justificada).toBe(45 + 60)
  })
})

describe('jornada productiva pura (v2.10)', () => {
  it('lunes a jueves son 495 min: 9h − 15′ de limpieza − 30′ de almuerzo', () => {
    expect(minutosProductivosDia(new Date(2026, 8, 1))).toBe(495) // martes
  })

  it('el viernes son 435: cierra a las 15:00', () => {
    expect(minutosProductivosDia(new Date(2026, 8, 4))).toBe(435) // viernes
  })

  it('el fin de semana es cero', () => {
    expect(minutosProductivosDia(new Date(2026, 8, 5))).toBe(0) // sábado
  })

  it('la constante compartida coincide con el día de lunes a jueves', () => {
    expect(JORNADA_PRODUCTIVA_MIN).toBe(minutosProductivosDia(new Date(2026, 8, 1)))
  })
})

describe('rangos de ausencia (v2.05)', () => {
  it('un solo día devuelve ese día', () => {
    expect(diasLaborablesDelRango('2026-09-01', '2026-09-01')).toEqual(['2026-09-01'])
  })

  it('saltea sábados y domingos', () => {
    // Vie 4/9 a lun 7/9 → viernes y lunes, sin el fin de semana.
    expect(diasLaborablesDelRango('2026-09-04', '2026-09-07')).toEqual(['2026-09-04', '2026-09-07'])
  })

  it('una licencia de 15 días corridos son 11 días hábiles', () => {
    // Mar 1/9 al mar 15/9: 15 días corridos, 2 fines de semana.
    expect(diasLaborablesDelRango('2026-09-01', '2026-09-15')).toHaveLength(11)
  })

  it('saltea feriados cargados', () => {
    setFeriados(['2026-09-02'])
    const dias = diasLaborablesDelRango('2026-09-01', '2026-09-03')
    setFeriados([])
    expect(dias).toEqual(['2026-09-01', '2026-09-03'])
  })

  it('si el hasta es anterior al desde, no devuelve nada', () => {
    expect(diasLaborablesDelRango('2026-09-10', '2026-09-01')).toEqual([])
  })

  it('un rango que cae entero en fin de semana no devuelve días', () => {
    expect(diasLaborablesDelRango('2026-09-05', '2026-09-06')).toEqual([])
  })
})

describe('huecos de bobinado con ausencia', () => {
  it('el día que faltó no se le cobra como tiempo muerto', () => {
    setAusencias(AUSENTE_MIERCOLES)
    const ts = [
      tarea({ id: 'A', inicioReal: M(1, 14), finReal: M(1, 15, 45) }), // cierra el martes
      tarea({ id: 'B', inicioReal: M(3, 7), finReal: M(3, 9) }),       // retoma el jueves
    ]
    expect(huecosPorTarea(ts).get('B')?.minutos ?? 0).toBe(0)
  })

  it('sin la ausencia, ese mismo hueco sería una jornada entera', () => {
    const ts = [
      tarea({ id: 'A', inicioReal: M(1, 14), finReal: M(1, 15, 45) }),
      tarea({ id: 'B', inicioReal: M(3, 7), finReal: M(3, 9) }),
    ]
    // El miércoles completo, con el almuerzo descontado: 525 - 30 = 495'.
    expect(huecosPorTarea(ts).get('B')?.minutos ?? 0).toBe(495)
  })
})
