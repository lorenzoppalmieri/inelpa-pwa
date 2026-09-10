import { afterEach, describe, expect, it } from 'vitest'
import type { CorteLuz, Tarea } from '../../types'
import { setCortesLuz, paradasDeCorte, resumenDeCorte } from '../cortesLuz'
import { metricasTarea, desglosePausas } from '../kpi'

// ============================================================
// v2.12 — Cortes de luz. Martes 1/9/2026, turno 07:00–15:45 productivo.
// ============================================================
const M = (h: number, m = 0) =>
  `2026-09-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000-03:00`

function corte(over: Partial<CorteLuz> = {}): CorteLuz {
  return {
    id: 'c1', desde: M(10), hasta: M(12), sectores: [],
    cargadoPor: 'lorenzo', actualizado: M(13), ...over,
  }
}

function tarea(over: Partial<Tarea> = {}): Tarea {
  return {
    id: 't1', sectorId: 'bob_dist_at' as Tarea['sectorId'], maquinaId: 'm1', operarioId: 'op1',
    modelo: 'TTD 100/13', semana: '2026-W36', prioridad: 1, estado: 'finalizada',
    tiempoEstandarMin: 120, paradas: [],
    inicioReal: M(8), finReal: M(14),
    ...over,
  }
}

afterEach(() => setCortesLuz([]))

describe('a qué tareas les pega', () => {
  it('a la que estaba trabajando durante el corte', () => {
    setCortesLuz([corte()])
    expect(paradasDeCorte(tarea())).toHaveLength(1)
  })

  it('NO a la que arrancó después de que volvió la luz', () => {
    setCortesLuz([corte()])
    expect(paradasDeCorte(tarea({ inicioReal: M(13), finReal: M(15) }))).toHaveLength(0)
  })

  it('NO a la que ya había terminado antes del corte', () => {
    setCortesLuz([corte()])
    expect(paradasDeCorte(tarea({ inicioReal: M(7), finReal: M(9) }))).toHaveLength(0)
  })

  it('NO a una tarea que nunca arrancó', () => {
    setCortesLuz([corte()])
    expect(paradasDeCorte(tarea({ estado: 'pendiente', inicioReal: undefined, finReal: undefined }))).toHaveLength(0)
  })

  it('el corte parcial solo alcanza a los sectores marcados', () => {
    setCortesLuz([corte({ sectores: ['montaje_po_dist' as Tarea['sectorId']] })])
    expect(paradasDeCorte(tarea())).toHaveLength(0)
    expect(paradasDeCorte(tarea({ sectorId: 'montaje_po_dist' as Tarea['sectorId'] }))).toHaveLength(1)
  })

  it('sin sectores marcados alcanza a toda la planta', () => {
    setCortesLuz([corte({ sectores: [] })])
    for (const s of ['bob_dist_at', 'montaje_po_rural', 'soldadura_dist'] as Tarea['sectorId'][]) {
      expect(paradasDeCorte(tarea({ sectorId: s }))).toHaveLength(1)
    }
  })
})

describe('el tramo se recorta a lo que realmente frenó', () => {
  // Las paradas de corte SIEMPRE salen cerradas: el corte tiene fin conocido.
  const instante = (iso: string | undefined) => new Date(iso ?? '').getTime()

  it('si la tarea arrancó en el medio del corte, solo cuenta desde ahí', () => {
    setCortesLuz([corte()]) // 10:00 a 12:00
    const [p] = paradasDeCorte(tarea({ inicioReal: M(11), finReal: M(14) }))
    expect(instante(p.inicio)).toBe(instante(M(11)))
    expect(instante(p.fin)).toBe(instante(M(12)))
  })

  it('si la tarea cerró durante el corte, se corta ahí', () => {
    setCortesLuz([corte()])
    const [p] = paradasDeCorte(tarea({ inicioReal: M(8), finReal: M(11) }))
    expect(instante(p.fin)).toBe(instante(M(11)))
  })
})

describe('efecto en los tiempos', () => {
  const t = tarea() // 08:00 a 14:00, estándar 120'

  it('sin corte, el exceso queda como demora SIN justificar', () => {
    const m = metricasTarea(t)
    expect(m.justificada).toBe(0)
    expect(m.sinJustificar).toBeGreaterThan(0)
  })

  it('con el corte cargado, esas 2 h pasan a demora JUSTIFICADA', () => {
    const sin = metricasTarea(t)
    setCortesLuz([corte()])
    const con = metricasTarea(t)
    expect(con.justificada).toBe(120)
    expect(con.sinJustificar).toBe(sin.sinJustificar - 120)
  })

  it('las 3 identidades del auditor siguen cerrando', () => {
    setCortesLuz([corte()])
    const m = metricasTarea(t)
    expect(m.demorado - m.adelanto).toBe(m.real - m.estimado)
    expect(m.justificadaAplicada + m.sinJustificar).toBe(m.demorado)
    expect(m.justificadaAplicada + m.justificadaExcedente).toBe(m.justificada)
  })

  it('si el operario YA había marcado una parada que se pisa, no se cuenta dos veces', () => {
    // Marcó "falta de material" de 09:00 a 11:00; el corte va de 10:00 a 12:00.
    // Juntas son 09:00–12:00 = 180', no 120 + 120 = 240.
    const conParada = tarea({
      paradas: [{
        id: 'p', tareaId: 't1', causa: 'espera_alambre' as Tarea['paradas'][number]['causa'],
        inicio: M(9), fin: M(11),
      }],
    })
    setCortesLuz([corte()])
    expect(metricasTarea(conParada).justificada).toBe(180)
  })

  it('la parada aparece en el desglose que leen el Gantt y la tarjeta del operario', () => {
    setCortesLuz([corte()])
    const tramo = desglosePausas(t).find((x) => x.causa === 'corte_luz')
    expect(tramo).toBeDefined()
    expect(tramo!.productiva).toBe(true) // es demora justificada, no almuerzo
    expect(tramo!.minutos).toBe(120)
  })
})

describe('informe del corte', () => {
  it('separa el tiempo de reloj de la producción perdida', () => {
    const c = corte() // 2 h
    const tres = [tarea({ id: 'a' }), tarea({ id: 'b' }), tarea({ id: 'c' })]
    const r = resumenDeCorte(c, tres)
    expect(r.minutosCorte).toBe(120)              // la planta estuvo parada 2 h
    expect(r.tareasAfectadas).toBe(3)
    expect(r.minutosProductivosPerdidos).toBe(360) // 3 líneas × 2 h
  })

  it('no cuenta las tareas que no estaban trabajando', () => {
    const r = resumenDeCorte(corte(), [tarea({ id: 'x', inicioReal: M(13), finReal: M(15) })])
    expect(r.tareasAfectadas).toBe(0)
    expect(r.minutosProductivosPerdidos).toBe(0)
  })
})
