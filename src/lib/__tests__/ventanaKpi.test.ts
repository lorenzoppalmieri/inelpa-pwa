import { describe, expect, it } from 'vitest'
import type { Tarea } from '../../types'
import {
  calcularOEE, eficienciaPorOperario, metricasTarea, metricasTareaEnVentana,
  paretoDemoras, tareasEnVentana, type VentanaKPI,
} from '../kpi'

// ============================================================
// v2.35 — Recorte de KPIs por ventana (time bounding) con estándar prorrateado.
//
// Planta: Lun-Jue 07:00-16:00, Vie 07:00-15:00, 15' de limpieza al final.
// Viernes 25/9/2026 y lunes 28/9/2026. Offset -03:00 a propósito (ver huecos.test).
//
// Caso acordado con Lorenzo: bobina de 300' de estándar.
//   Vie 25/9 12:45-14:45 → 120' trabajados.
//   Lun 28/9 07:00-11:00 → 240' de reloj, con 60' de espera de alambre (08-09).
//   Total: real 360, justificada 60, neto 300 = exacto el estándar.
// ============================================================
const F = (d: number, h: number, m = 0) =>
  `2026-09-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000-03:00`

const SEM_A: VentanaKPI = { desde: F(21, 0), hasta: F(28, 0) }              // semana del 21/9
const SEM_B: VentanaKPI = { desde: F(28, 0), hasta: '2026-10-05T00:00:00.000-03:00' } // semana del 28/9

function tarea(over: Partial<Tarea> & { id: string }): Tarea {
  return {
    sectorId: 'bob_dist_at' as Tarea['sectorId'],
    maquinaId: 'm_bob_01', operarioId: 'op1',
    modelo: 'TTD 100/13', semana: '2026-W39', prioridad: 1,
    estado: 'finalizada', tiempoEstandarMin: 300, paradas: [],
    ...over,
  }
}

const cruzada = () => tarea({
  id: 'X', inicioReal: F(25, 12, 45), finReal: F(28, 11),
  paradas: [{ id: 'p1', tareaId: 'X', causa: 'espera_alambre' as Tarea['paradas'][number]['causa'], inicio: F(28, 8), fin: F(28, 9) }],
})

describe('tarea que cruza el borde de la semana', () => {
  it('la tarea entera: real 360, justificada 60, neto = estándar', () => {
    const m = metricasTarea(cruzada())
    expect(m.real).toBe(360)
    expect(m.justificada).toBe(60)
    expect(m.estimado).toBe(300)
  })

  it('semana A (viernes): 120 trabajados contra 120 de estándar prorrateado', () => {
    const m = metricasTareaEnVentana(cruzada(), SEM_A)
    expect(m.parcial).toBe(true)
    expect(m.real).toBe(120)
    expect(m.justificada).toBe(0)
    expect(m.estimado).toBe(120)
    expect(m.sinJustificar).toBe(0)
  })

  it('semana B (lunes): 240 de real, 60 justificados, 180 contra 180', () => {
    const m = metricasTareaEnVentana(cruzada(), SEM_B)
    expect(m.parcial).toBe(true)
    expect(m.real).toBe(240)
    expect(m.justificada).toBe(60)
    expect(m.estimado).toBe(180)
    expect(m.sinJustificar).toBe(0)
  })

  it('las dos porciones suman exactamente la tarea entera', () => {
    const t = cruzada()
    const a = metricasTareaEnVentana(t, SEM_A)
    const b = metricasTareaEnVentana(t, SEM_B)
    const tot = metricasTarea(t)
    expect(a.real + b.real).toBe(tot.real)
    expect(a.justificada + b.justificada).toBe(tot.justificada)
    expect(a.estimado + b.estimado).toBe(tot.estimado)
  })

  it('la tarea entra en los dos períodos', () => {
    expect(tareasEnVentana([cruzada()], SEM_A)).toHaveLength(1)
    expect(tareasEnVentana([cruzada()], SEM_B)).toHaveLength(1)
  })
})

describe('caso común: la tarea cae entera dentro del período', () => {
  it('da exactamente lo mismo que metricasTarea', () => {
    const t = tarea({ id: 'E', tiempoEstandarMin: 60, inicioReal: F(22, 8), finReal: F(22, 10) })
    const m = metricasTareaEnVentana(t, SEM_A)
    expect(m).toEqual({ ...metricasTarea(t), parcial: false, fraccion: 1 })
  })

  it('con ventana "todas" el OEE no cambia', () => {
    const ts = [
      tarea({ id: 'E1', tiempoEstandarMin: 60, inicioReal: F(22, 8), finReal: F(22, 10) }),
      cruzada(),
    ]
    const todo: VentanaKPI = { desde: '2000-01-01T00:00:00.000Z', hasta: '2076-01-01T00:00:00.000Z' }
    expect(calcularOEE(ts, todo)).toEqual(calcularOEE(ts))
  })

  it('una tarea fuera del período no entra', () => {
    const t = tarea({ id: 'F', inicioReal: F(14, 8), finReal: F(14, 10) })
    expect(tareasEnVentana([t], SEM_A)).toHaveLength(0)
  })
})

describe('tarea todavía abierta', () => {
  const ahora = F(28, 11)
  const abierta = () => tarea({ id: 'O', estado: 'en_proceso', inicioReal: F(25, 12, 45) })

  it('aporta su tiempo al período pero sin estándar (fracción 0)', () => {
    const m = metricasTareaEnVentana(abierta(), SEM_B, ahora)
    expect(m.real).toBe(240)
    expect(m.fraccion).toBe(0)
    expect(m.estimado).toBe(0)
  })

  it('cuenta en la eficiencia del colaborador (indicador de flujo)', () => {
    const e = eficienciaPorOperario(tareasEnVentana([abierta()], SEM_B, ahora), SEM_B)
    expect(e.get('op1')).toBeDefined()
  })
})

describe('Pareto de demoras recortado', () => {
  // Espera de alambre del viernes 14:00 al lunes 08:00.
  const t = () => tarea({
    id: 'P', inicioReal: F(25, 12, 45), finReal: F(28, 11),
    paradas: [{ id: 'p2', tareaId: 'P', causa: 'espera_alambre' as Tarea['paradas'][number]['causa'], inicio: F(25, 14), fin: F(28, 8) }],
  })
  const min = (v?: VentanaKPI) => paretoDemoras([t()], v).find((x) => x.causa === 'espera_alambre')?.minutos ?? 0

  it('reparte los minutos entre las dos semanas', () => {
    expect(min(SEM_A)).toBe(45)  // vie 14:00-14:45
    expect(min(SEM_B)).toBe(60)  // lun 07:00-08:00
  })

  it('las dos partes suman la demora completa', () => {
    expect(min(SEM_A) + min(SEM_B)).toBe(min())
  })
})
