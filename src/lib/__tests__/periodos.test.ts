import { describe, expect, it } from 'vitest'
import type { Tarea } from '../../types'
import { fechaDeReferencia, opcionesPeriodo, rangoPeriodo, tareaEnPeriodo } from '../periodos'

// ============================================================
// v2.07 — Filtro de período compartido entre KPIs y "Asignar tareas".
// Referencia: martes 15 de septiembre de 2026.
// ============================================================
const AHORA = new Date(2026, 8, 15, 10, 0, 0) // mes 8 = septiembre

const tarea = (inicioPlanificado?: string, inicioReal?: string): Tarea => ({
  id: 't', sectorId: 'bob_dist_at' as Tarea['sectorId'], maquinaId: 'm1',
  modelo: 'TTD 100/13', semana: '2026-W38', prioridad: 1, estado: 'pendiente',
  tiempoEstandarMin: 60, paradas: [], inicioPlanificado, inicioReal,
})

/** Instante local dentro de ese día, para no pelearse con el huso. */
const enDia = (y: number, m: number, d: number) => new Date(y, m, d, 10, 0, 0).toISOString()

describe('rangos por período', () => {
  it('mes actual va del 1° al 1° del siguiente', () => {
    const r = rangoPeriodo('mes_actual', AHORA)
    expect(r.desde).toBe(new Date(2026, 8, 1).toISOString())
    expect(r.hasta).toBe(new Date(2026, 9, 1).toISOString())
  })

  it('mes anterior es agosto', () => {
    const r = rangoPeriodo('mes_anterior', AHORA)
    expect(r.desde).toBe(new Date(2026, 7, 1).toISOString())
    expect(r.hasta).toBe(new Date(2026, 8, 1).toISOString())
  })

  it('el día específico incluye el día ENTERO', () => {
    const r = rangoPeriodo('dia', AHORA, '2026-09-15')
    expect(r.desde).toBe(new Date(2026, 8, 15).toISOString())
    expect(r.hasta).toBe(new Date(2026, 8, 16).toISOString())
  })

  it('el rango incluye el último día completo, no lo corta a las 00:00', () => {
    const r = rangoPeriodo('rango', AHORA, undefined, '2026-09-10', '2026-09-12')
    expect(r.hasta).toBe(new Date(2026, 8, 13).toISOString())
  })

  it('si invierte las fechas, las normaliza en vez de no mostrar nada', () => {
    const alReves = rangoPeriodo('rango', AHORA, undefined, '2026-09-12', '2026-09-10')
    const derecho = rangoPeriodo('rango', AHORA, undefined, '2026-09-10', '2026-09-12')
    expect(alReves).toEqual(derecho)
  })

  it('rango sin un extremo no trae nada (no trae toda la base)', () => {
    const r = rangoPeriodo('rango', AHORA, undefined, '2026-09-10', '')
    expect(r.desde).toBe(r.hasta)
  })
})

describe('qué tareas entran', () => {
  it('usa el arranque REAL cuando existe', () => {
    const t = tarea(enDia(2026, 7, 20), enDia(2026, 8, 15)) // planificada agosto, real septiembre
    expect(tareaEnPeriodo(t, 'mes_actual', AHORA)).toBe(true)
    expect(tareaEnPeriodo(t, 'mes_anterior', AHORA)).toBe(false)
  })

  it('si todavía no arrancó, usa el planificado', () => {
    const t = tarea(enDia(2026, 8, 20))
    expect(tareaEnPeriodo(t, 'mes_actual', AHORA)).toBe(true)
  })

  it('una tarea sin ninguna fecha no entra en ningún período acotado', () => {
    expect(tareaEnPeriodo(tarea(), 'mes_actual', AHORA)).toBe(false)
  })

  it('"Todas" trae hasta las que no tienen fecha', () => {
    expect(tareaEnPeriodo(tarea(), 'todas', AHORA)).toBe(true)
  })

  it('el día específico agarra la tarea de ese día y no la del siguiente', () => {
    const hoy = tarea(enDia(2026, 8, 15))
    const manana = tarea(enDia(2026, 8, 16))
    expect(tareaEnPeriodo(hoy, 'dia', AHORA, '2026-09-15')).toBe(true)
    expect(tareaEnPeriodo(manana, 'dia', AHORA, '2026-09-15')).toBe(false)
  })

  it('el último día del rango entra completo', () => {
    const ultimo = tarea(enDia(2026, 8, 12))
    expect(tareaEnPeriodo(ultimo, 'rango', AHORA, undefined, '2026-09-10', '2026-09-12')).toBe(true)
  })
})

// ============================================================
// v2.22 — Las finalizadas se anclan al FIN.
//
// El punto ciego que esto corrige: una tarea que arranca un mes y termina el
// siguiente quedaba contada en el mes en que casi no se trabajó en ella, y no
// aparecía al filtrar el mes en que realmente se terminó.
// ============================================================
const finalizada = (inicioReal: string, finReal?: string): Tarea => ({
  ...tarea(undefined, inicioReal),
  estado: 'finalizada',
  finReal,
})

describe('ancla de las tareas finalizadas', () => {
  it('EL CASO REPORTADO: arrancó en agosto, terminó en septiembre', () => {
    const t = finalizada(enDia(2026, 7, 28), enDia(2026, 8, 3))
    expect(tareaEnPeriodo(t, 'mes_actual', AHORA)).toBe(true)      // septiembre: SÍ
    expect(tareaEnPeriodo(t, 'mes_anterior', AHORA)).toBe(false)   // agosto: ya no
  })

  it('EL CASO DEL RANGO: arrancó el 05/09, terminó el 08/09, se filtra 07→11', () => {
    const t = finalizada(enDia(2026, 8, 5), enDia(2026, 8, 8))
    expect(tareaEnPeriodo(t, 'rango', AHORA, undefined, '2026-09-07', '2026-09-11')).toBe(true)
  })

  it('una finalizada sin fin cargado no desaparece: cae al inicio', () => {
    const t = finalizada(enDia(2026, 8, 5), undefined)
    expect(tareaEnPeriodo(t, 'mes_actual', AHORA)).toBe(true)
  })

  it('las que NO están finalizadas se siguen ubicando por el arranque', () => {
    const enCurso: Tarea = { ...tarea(undefined, enDia(2026, 7, 28)), estado: 'en_proceso' }
    expect(tareaEnPeriodo(enCurso, 'mes_anterior', AHORA)).toBe(true)
    expect(tareaEnPeriodo(enCurso, 'mes_actual', AHORA)).toBe(false)
  })

  it('fechaDeReferencia elige el campo correcto según el estado', () => {
    const ini = enDia(2026, 7, 28), fin = enDia(2026, 8, 3)
    expect(fechaDeReferencia(finalizada(ini, fin))).toBe(fin)
    expect(fechaDeReferencia({ ...tarea(undefined, ini), estado: 'pausada' })).toBe(ini)
    expect(fechaDeReferencia(tarea(enDia(2026, 8, 20)))).toBe(enDia(2026, 8, 20))
  })
})

describe('comparación por instante, no por texto', () => {
  // Las tablets escriben `...Z` y Supabase devuelve `...+00:00`. Como texto el
  // mismo instante compara distinto ('+' < '.' en ASCII), así que las tareas del
  // borde del período entraban o quedaban afuera sin motivo.
  it('un fin en formato Supabase cae en el mismo período que en formato tablet', () => {
    const zulu = '2026-09-10T13:00:00.000Z'
    const supa = '2026-09-10T13:00:00+00:00'
    const a = finalizada(enDia(2026, 8, 9), zulu)
    const b = finalizada(enDia(2026, 8, 9), supa)
    expect(tareaEnPeriodo(a, 'mes_actual', AHORA)).toBe(tareaEnPeriodo(b, 'mes_actual', AHORA))
    expect(tareaEnPeriodo(a, 'dia', AHORA, '2026-09-10')).toBe(tareaEnPeriodo(b, 'dia', AHORA, '2026-09-10'))
    expect(tareaEnPeriodo(a, 'dia', AHORA, '2026-09-10')).toBe(true)
  })
})

describe('opciones del desplegable', () => {
  it('KPIs no ofrece "Todas"', () => {
    expect(opcionesPeriodo(false).map((p) => p.id)).not.toContain('todas')
  })
  it('el listado de tareas sí', () => {
    expect(opcionesPeriodo(true).map((p) => p.id)).toContain('todas')
  })
  it('las dos ofrecen día y rango personalizado', () => {
    for (const conTodas of [true, false]) {
      const ids = opcionesPeriodo(conTodas).map((p) => p.id)
      expect(ids).toContain('dia')
      expect(ids).toContain('rango')
    }
  })
})
