import { describe, expect, it } from 'vitest'
import type { Parada, Tarea } from '../../types'
import { metricasTarea } from '../kpi'
import { auditarTarea, auditarTiempos, type Totales } from '../auditoriaTiempos'

// ============================================================
// v2.01 — Las tres identidades de los totales del "Detalle por tarea" y los
// detectores del banner auditor.
//
// El pedido original pedía que "Justificada + Sin justificar = Demorado". Eso
// era FALSO con las definiciones vigentes (justificada es una medición aparte,
// no una parte del demorado). Estos tests fijan la versión que SÍ vale, usando
// la descomposición aplicada/excedente/adelanto.
// ============================================================

// Martes 1 de septiembre de 2026. Turno de planta: 07:00–16:00 (L-J).
const D = (h: number, m = 0) => `2026-09-01T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000-03:00`

function parada(id: string, causa: string, hIni: number, mIni: number, hFin?: number, mFin = 0): Parada {
  return {
    id, tareaId: 't', causa: causa as Parada['causa'],
    inicio: D(hIni, mIni), fin: hFin === undefined ? undefined : D(hFin, mFin),
  }
}

function tarea(over: Partial<Tarea> = {}): Tarea {
  return {
    id: 't', sectorId: 'montaje_distribucion' as Tarea['sectorId'], maquinaId: 'm1',
    modelo: 'TTD 100/13', semana: '2026-W36', prioridad: 1, estado: 'finalizada',
    tiempoEstandarMin: 120, paradas: [],
    inicioReal: D(7), finReal: D(11),
    ...over,
  }
}

const sumar = (ts: Tarea[]): Totales => {
  const ms = ts.map((t) => metricasTarea(t))
  const s = (f: (m: ReturnType<typeof metricasTarea>) => number) => ms.reduce((a, m) => a + f(m), 0)
  return {
    n: ts.length,
    estimado: s((m) => m.estimado), real: s((m) => m.real),
    demorado: s((m) => m.demorado), justificada: s((m) => m.justificada),
    sinJust: s((m) => m.sinJustificar), adelanto: s((m) => m.adelanto),
    aplicada: s((m) => m.justificadaAplicada), excedente: s((m) => m.justificadaExcedente),
  }
}

describe('descomposición balanceada de los totales', () => {
  // El set mezcla a propósito los tres casos que rompían la cuenta.
  const tareas = [
    // A: 4 h reales contra 2 h de estándar, sin justificar nada -> puro exceso.
    tarea({ id: 'A', tiempoEstandarMin: 120 }),
    // B: se pasó 60' pero justificó 90' -> justifica DE MÁS (excedente 30').
    tarea({
      id: 'B', tiempoEstandarMin: 180,
      paradas: [parada('p1', 'falta_material', 8, 0, 9, 30)],
    }),
    // C: terminó ANTES del estándar -> aporta adelanto, no demorado.
    tarea({ id: 'C', tiempoEstandarMin: 360 }),
    // D: caso normal, justifica una parte del exceso.
    tarea({ id: 'D', tiempoEstandarMin: 60, paradas: [parada('p2', 'falta_material', 8, 0, 9, 0)] }),
  ]
  const tot = sumar(tareas)

  it('Demorado − Adelanto = Real − Estimado', () => {
    expect(tot.demorado - tot.adelanto).toBe(tot.real - tot.estimado)
  })

  it('Justif. aplicada + Sin justificar = Demorado', () => {
    expect(tot.aplicada + tot.sinJust).toBe(tot.demorado)
  })

  it('Justif. aplicada + Excedente = Demora justificada', () => {
    expect(tot.aplicada + tot.excedente).toBe(tot.justificada)
  })

  it('sin la descomposición las cuentas NO cerraban (esto era el bug reportado)', () => {
    expect(tot.real - tot.estimado).not.toBe(tot.demorado)      // por la tarea C
    expect(tot.justificada + tot.sinJust).not.toBe(tot.demorado) // por la tarea B
  })

  it('el adelanto sale de la tarea que terminó antes del estándar', () => {
    const c = metricasTarea(tareas[2])
    expect(c.demorado).toBe(0)
    expect(c.adelanto).toBe(360 - c.real)
  })

  it('el excedente sale de la tarea que justificó más de lo que se pasó', () => {
    const b = metricasTarea(tareas[1])
    expect(b.justificadaExcedente).toBeGreaterThan(0)
    expect(b.sinJustificar).toBe(0)
  })

  it('las identidades valen tarea por tarea, no solo en el total', () => {
    for (const t of tareas) {
      const m = metricasTarea(t)
      expect(m.demorado - m.adelanto).toBe(m.real - m.estimado)
      expect(m.justificadaAplicada + m.sinJustificar).toBe(m.demorado)
      expect(m.justificadaAplicada + m.justificadaExcedente).toBe(m.justificada)
    }
  })
})

describe('auditor de datos', () => {
  it('un set sano no dispara ninguna alerta', () => {
    const ts = [tarea({ id: 'ok', paradas: [parada('p', 'falta_material', 8, 0, 8, 30)] })]
    const r = auditarTiempos(ts, sumar(ts))
    expect(r.ok).toBe(true)
    expect(r.anomalias).toHaveLength(0)
    expect(r.ecuaciones.every((e) => e.ok)).toBe(true)
  })

  it('detecta una tarea cerrada antes de arrancar', () => {
    const t = tarea({ inicioReal: D(11), finReal: D(7) })
    expect(auditarTarea(t).map((a) => a.tipo)).toContain('fin_antes_inicio')
  })

  it('detecta tiempo real cero', () => {
    const t = tarea({ inicioReal: D(9), finReal: D(9) })
    expect(auditarTarea(t).map((a) => a.tipo)).toContain('real_cero')
  })

  it('detecta una parada sin cerrar', () => {
    const t = tarea({ paradas: [parada('p', 'falta_material', 8, 0)] })
    expect(auditarTarea(t).map((a) => a.tipo)).toContain('parada_abierta')
  })

  it('detecta una parada que cae fuera del inicio/fin de la tarea', () => {
    const t = tarea({ paradas: [parada('p', 'falta_material', 13, 0, 14, 0)] }) // la tarea cerró 11:00
    expect(auditarTarea(t).map((a) => a.tipo)).toContain('parada_fuera_ventana')
  })

  it('detecta un almuerzo por encima del tope de 30 minutos', () => {
    const t = tarea({ finReal: D(15), paradas: [parada('p', 'Almuerzo', 12, 0, 13, 0)] })
    expect(auditarTarea(t).map((a) => a.tipo)).toContain('almuerzo_largo')
  })

  it('detecta dos almuerzos el mismo día', () => {
    const t = tarea({
      finReal: D(15),
      paradas: [parada('p1', 'Almuerzo', 12, 0, 12, 25), parada('p2', 'Almuerzo', 12, 30, 12, 55)],
    })
    expect(auditarTarea(t).map((a) => a.tipo)).toContain('almuerzo_duplicado')
  })

  it('avisa si alguna identidad se rompe (guarda contra futuros cambios)', () => {
    const ts = [tarea()]
    const totRoto = { ...sumar(ts), demorado: 99999 }
    const r = auditarTiempos(ts, totRoto)
    expect(r.ok).toBe(false)
    expect(r.anomalias.some((a) => a.tipo === 'ecuacion_rota')).toBe(true)
  })
})
