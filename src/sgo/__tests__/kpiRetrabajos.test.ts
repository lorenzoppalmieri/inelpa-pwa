import { describe, expect, it } from 'vitest'
import type { Tarea } from '../../types'
import { crearDatosRetrabajo } from '../retrabajos'
import {
  abiertosFueraDelPeriodo, antiguedadAbiertos, calcularKpisRetrabajos, enRango, moverPeriodo,
  paretoRetrabajos, periodoAnterior, rangoPeriodo, tendenciaRetrabajos,
} from '../kpiRetrabajos'
import type { AccionSGO, EventoSGO } from '../types'

// ============================================================
// v2.51 — KPIs de Retrabajos. Correr con TZ=America/Argentina/Buenos_Aires.
// ============================================================

function caso(id: string, detectadoEn: string, over: Partial<EventoSGO> = {}, datos: Partial<NonNullable<EventoSGO['retrabajo']>> = {}): EventoSGO {
  return {
    id, codigo: `R-${id}`, tipo: 'no_conformidad', pilar: 'calidad', titulo: 'Retrabajo', descripcion: '',
    severidad: 'media', estado: 'en_analisis', areaId: 'bobinado_rural', areaOrigenId: 'bobinado_rural',
    detectadoEn, detectadoPor: 'op', creadoEn: detectadoEn, actualizadoEn: detectadoEn, modelo: 'TMR 16/7',
    retrabajo: crearDatosRetrabajo('defecto_final', detectadoEn, datos),
    ...over,
  }
}

function tarea(id: string, finReal: string, sectorId = 'bob_rural_at'): Tarea {
  return { id, tipo: 'fabricacion', sectorId, estado: 'finalizada', finReal, paradas: [], tiempoEstandarMin: 60 } as unknown as Tarea
}

describe('período', () => {
  it('la semana va de lunes 00:00 a lunes 00:00, hora local', () => {
    const r = rangoPeriodo('semana', new Date(2026, 10, 18, 15, 0)) // miércoles 18/11/2026
    expect(new Date(r.desde)).toEqual(new Date(2026, 10, 16))
    expect(new Date(r.hasta)).toEqual(new Date(2026, 10, 23))
    expect(r.etiqueta).toBe('Semana 47 · 16/11 – 22/11')
  })

  it('el mes y la navegación', () => {
    const r = rangoPeriodo('mes', new Date(2026, 10, 18))
    expect(r.etiqueta).toBe('Noviembre 2026')
    expect(periodoAnterior(r)!.etiqueta).toBe('Octubre 2026')
    expect(rangoPeriodo('mes', moverPeriodo('mes', new Date(2026, 0, 31), -1)).etiqueta).toBe('Diciembre 2025')
    expect(periodoAnterior(rangoPeriodo('todo', new Date()))).toBeUndefined()
  })

  it('compara instantes: un caso del domingo 22:30 hora AR es de esa semana aunque en UTC sea lunes', () => {
    const semana = rangoPeriodo('semana', new Date(2026, 10, 18))
    expect(enRango('2026-11-23T01:30:00.000Z', semana)).toBe(true)        // dom 22/11 22:30 AR
    expect(enRango('2026-11-22T22:30:00-03:00', semana)).toBe(true)
    expect(enRango('2026-11-23T03:00:00+00:00', semana)).toBe(false)      // lun 23/11 00:00 AR
  })
})

describe('KPIs del período', () => {
  const nov = rangoPeriodo('mes', new Date(2026, 10, 10))
  const ahora = new Date('2026-11-20T15:00:00Z')

  it('FPY: tareas terminadas en el período sin ningún retrabajo', () => {
    const tareas = [tarea('t1', '2026-11-05T15:00:00Z'), tarea('t2', '2026-11-06T15:00:00Z'), tarea('t3', '2026-11-07T15:00:00Z'), tarea('t4', '2026-11-08T15:00:00Z')]
    const eventos = [caso('a', '2026-11-05T14:00:00Z', { tareaId: 't1' })]
    const k = calcularKpisRetrabajos({ eventos, acciones: [], tareas }, nov, ahora)
    expect(k.fpy).toBe(75)
    expect(k.fpyPorArea[0]).toMatchObject({ area: 'bobinado_rural', finalizadas: 4, conRetrabajo: 1, fpy: 75 })
  })

  it('no cuenta reparaciones, prototipos ni tareas fuera del período en el FPY', () => {
    const tareas = [
      tarea('t1', '2026-11-05T15:00:00Z'),
      { ...tarea('rep', '2026-11-05T15:00:00Z'), tipo: 'reparacion' } as Tarea,
      { ...tarea('proto', '2026-11-05T15:00:00Z'), esPrototipo: true } as Tarea,
      tarea('oct', '2026-10-20T15:00:00Z'),
    ]
    const k = calcularKpisRetrabajos({ eventos: [], acciones: [], tareas }, nov, ahora)
    expect(k.fpy).toBe(100)
    expect(k.fpyPorArea[0].finalizadas).toBe(1)
  })

  it('costo: total, % valorizado y material sin valorizar', () => {
    const conCosto = caso('a', '2026-11-05T14:00:00Z', { costoEstimado: 1000, costoDetalle: { manoObra: 1000, material: 0, maquina: 0, ensayos: 0, logistica: 0, terceros: 0 } },
      { modalidadCosto: 'detallado', costeo: { tarifario: {} as never, horasCorreccion: 1, personasInvolucradas: 1, materialTipo: 'ninguno', maquinaEstado: 'no_aplica', estado: 'estimado' } })
    const sinValorizar = caso('b', '2026-11-06T14:00:00Z', { costoEstimado: 500, costoDetalle: { manoObra: 500, material: 0, maquina: 0, ensayos: 0, logistica: 0, terceros: 0 } },
      { modalidadCosto: 'detallado', costeo: { tarifario: {} as never, horasCorreccion: 1, personasInvolucradas: 1, materialTipo: 'cobre', maquinaEstado: 'no_aplica', estado: 'estimado' } })
    const sinDefinir = caso('c', '2026-11-07T14:00:00Z')
    const k = calcularKpisRetrabajos({ eventos: [conCosto, sinValorizar, sinDefinir], acciones: [], tareas: [] }, nov, ahora)
    expect(k.costo.total).toBe(1500)
    expect(k.costo.manoObra).toBe(1500)
    expect(k.casosValorizados).toBe(1)
    expect(k.costoValorizadoPct).toBe(33.3)
  })

  it('toma en 24 h: los no tomados con plazo vencido cuentan como incumplidos', () => {
    const det = '2026-11-10T13:00:00.000Z'
    const aTiempo = caso('a', det, {}, { tomadoEn: '2026-11-10T20:00:00.000Z' })
    const tarde = caso('b', det, {}, { tomadoEn: '2026-11-12T13:00:00+00:00' })
    const sinTomarVencido = caso('c', det)
    const sinTomarEnPlazo = caso('d', '2026-11-20T10:00:00Z')
    const k = calcularKpisRetrabajos({ eventos: [aTiempo, tarde, sinTomarVencido, sinTomarEnPlazo], acciones: [], tareas: [] }, nov, ahora)
    expect(k.toma).toMatchObject({ evaluables: 3, cumplen: 1 })
    expect(k.toma.pct).toBe(33.3)
  })

  it('cierre en plazo por fecha de CIERRE, y escape / reincidencia', () => {
    const cerradoATiempo = caso('a', '2026-11-03T13:00:00Z', { estado: 'cerrado', cerradoEn: '2026-11-04T13:00:00Z' })
    const cerradoTarde = caso('b', '2026-10-28T13:00:00Z', { estado: 'cerrado', cerradoEn: '2026-11-05T13:00:00Z' })
    const lab = { ...caso('c', '2026-11-06T13:00:00Z', {}, { reincidente: true }), retrabajo: { ...crearDatosRetrabajo('laboratorio', '2026-11-06T13:00:00Z'), reincidente: true } }
    const k = calcularKpisRetrabajos({ eventos: [cerradoATiempo, cerradoTarde, lab], acciones: [], tareas: [] }, nov, ahora)
    expect(k.cierre).toMatchObject({ cerrados: 2, enPlazo: 1, pct: 50 })
    expect(k.casos).toBe(2) // el de octubre no es del período (aunque cerró en noviembre)
    expect(k.escapeLabPct).toBe(50)
    expect(k.reincidentes).toBe(1)
  })

  it('no cuenta las paradas de calidad descartadas', () => {
    const descartada = { ...caso('x', '2026-11-05T13:00:00Z'), retrabajo: crearDatosRetrabajo('parada_calidad', '2026-11-05T13:00:00Z', { decisionCalidad: 'descartada' }) }
    expect(calcularKpisRetrabajos({ eventos: [descartada], acciones: [], tareas: [] }, nov, ahora).casos).toBe(0)
  })

  it('acciones vencidas y eficacia', () => {
    const e = caso('a', '2026-11-05T13:00:00Z')
    const base = { eventoId: 'a', tipo: 'correctiva', descripcion: '', responsable: 'x', creadoEn: '', creadoPor: '', actualizadoEn: '' }
    const acciones = [
      { ...base, id: '1', fechaCompromiso: '2026-11-10', estado: 'pendiente' },
      { ...base, id: '2', fechaCompromiso: '2026-11-30', estado: 'en_curso' },
      { ...base, id: '3', fechaCompromiso: '2026-11-10', estado: 'verificada', eficaz: true },
      { ...base, id: '4', fechaCompromiso: '2026-11-10', estado: 'cancelada' },
    ] as AccionSGO[]
    const k = calcularKpisRetrabajos({ eventos: [e], acciones, tareas: [] }, nov, ahora)
    expect(k.acciones).toMatchObject({ total: 3, vencidas: 1, verificadas: 1, eficaces: 1, eficaciaPct: 100 })
  })
})

describe('Pareto, antigüedad y tendencia', () => {
  it('Pareto ordenado con acumulado y "Otros"', () => {
    const casos = [
      caso('1', '2026-11-02T13:00:00Z', {}, { clasificacionCausa: 'metodo' }),
      caso('2', '2026-11-02T13:00:00Z', {}, { clasificacionCausa: 'metodo' }),
      caso('3', '2026-11-02T13:00:00Z', {}, { clasificacionCausa: 'material' }),
      caso('4', '2026-11-02T13:00:00Z'),
    ]
    const p = paretoRetrabajos(casos, 'causa', 2)
    expect(p.map((f) => [f.label, f.n, f.acumulado])).toEqual([
      ['Método / procedimiento', 2, 50],
      ['Material / proveedor', 1, 75],
      ['Otros', 1, 100],
    ])
  })

  it('v2.52: el rechazo de laboratorio cuenta en el área que lo ORIGINÓ', () => {
    const lab = { ...caso('l', '2026-11-02T13:00:00Z', { areaId: 'laboratorio', areaOrigenId: 'montaje_rural' }), retrabajo: crearDatosRetrabajo('laboratorio', '2026-11-02T13:00:00Z') }
    const p = paretoRetrabajos([lab], 'area')
    expect(p[0]).toMatchObject({ clave: 'montaje_rural', n: 1 })
  })

  it('antigüedad de abiertos y abiertos fuera del período', () => {
    const ahora = new Date('2026-11-20T15:00:00Z')
    const eventos = [
      caso('a', '2026-11-19T15:00:00Z'),
      caso('b', '2026-11-15T15:00:00Z'),
      caso('c', '2026-10-01T15:00:00Z'),
      caso('d', '2026-10-01T15:00:00Z', { estado: 'cerrado', cerradoEn: '2026-10-02T15:00:00Z' }),
    ]
    expect(antiguedadAbiertos(eventos, ahora).map((t) => t.n)).toEqual([1, 1, 1])
    expect(abiertosFueraDelPeriodo(eventos, rangoPeriodo('mes', new Date(2026, 10, 20)))).toBe(1)
    expect(abiertosFueraDelPeriodo(eventos, rangoPeriodo('todo', new Date()))).toBe(0)
  })

  it('tendencia: 12 semanas o 6 meses, el último es el actual', () => {
    const datos = { eventos: [caso('a', '2026-11-18T13:00:00Z')], acciones: [], tareas: [] }
    const sem = tendenciaRetrabajos(datos, 'semana', new Date(2026, 10, 18))
    expect(sem).toHaveLength(12)
    expect(sem[11]).toMatchObject({ etiqueta: 'S47', casos: 1, actual: true })
    expect(tendenciaRetrabajos(datos, 'todo', new Date(2026, 10, 18))).toHaveLength(6)
  })
})
