import { describe, expect, it } from 'vitest'
import type { LineaReceta, PreparacionMaterial, Tarea } from '../../types'
import { recetaPorArticulo } from '../materiales'
import {
  deshacerPaso, etapaEntrega, marcarEnPreparacion, marcarEntregado, tableroEntregas, urgenciaEntrega,
} from '../preparacionMaterial'
import { preparacionFromRow, preparacionToRow } from '../../sync/mappers'

// ============================================================
// v2.58 — Tablero de entrega de materiales de logística.
// Ahora = jueves 19/11/2026 10:00 (hora de planta, -03:00).
// ============================================================
const AHORA = new Date('2026-11-19T13:00:00.000Z')
const AHORA_ISO = AHORA.toISOString()
const BOBINA = 'BOBBAJ0000268'

const RECETAS = recetaPorArticulo([
  { id: 'x|FOL|1', parentCode: BOBINA, childCode: 'FOLALU0000006', ocurrencia: 1, linea: 0, cantidad: 24.6, uom: 'Kilogramos', esSemielaborado: false } as LineaReceta,
])

let n = 0
const tarea = (over: Partial<Tarea> = {}): Tarea => ({
  id: `t${++n}`, componenteCodigo: BOBINA, estado: 'pendiente', sectorId: 'bob_dist_bt', maquinaId: 'm19',
  modelo: 'x', semana: '2026-W47', prioridad: 1, tiempoEstandarMin: 60, paradas: [], ...over,
} as Tarea)
const prep = (id: string, over: Partial<PreparacionMaterial>): PreparacionMaterial =>
  ({ id, estado: 'en_preparacion', actualizado: AHORA_ISO, ...over })

describe('etapa de la entrega', () => {
  it('sin registro: por preparar la tarea entera', () => {
    expect(etapaEntrega(tarea({ cantidad: 10 }))).toEqual({ etapa: 'por_preparar', complemento: false, unidades: 10 })
  })

  it('en preparación y entregado', () => {
    const t = tarea({ cantidad: 10 })
    expect(etapaEntrega(t, prep(t.id, {})).etapa).toBe('en_preparacion')
    expect(etapaEntrega(t, prep(t.id, { estado: 'entregado', unidadesEntregadas: 10 })).etapa).toBe('entregado')
  })

  it('si la tarea creció después de entregar (10 -> 15), vuelve como complemento por 5', () => {
    const t = tarea({ cantidad: 15 })
    expect(etapaEntrega(t, prep(t.id, { estado: 'entregado', unidadesEntregadas: 10 })))
      .toEqual({ etapa: 'por_preparar', complemento: true, unidades: 5 })
  })
})

describe('urgencia', () => {
  it('el operario ya arrancó sin material: urgente', () => {
    expect(urgenciaEntrega({ estado: 'en_proceso' }, '2026-11-25T10:00:00Z', AHORA)).toBe('urgente')
    expect(urgenciaEntrega({ estado: 'pausada' }, undefined, AHORA)).toBe('urgente')
  })
  it('arranque previsto ya pasado: urgente; más tarde hoy: hoy; otro día: próxima', () => {
    expect(urgenciaEntrega({ estado: 'pendiente' }, '2026-11-19T12:00:00Z', AHORA)).toBe('urgente')
    expect(urgenciaEntrega({ estado: 'pendiente' }, '2026-11-19T18:00:00Z', AHORA)).toBe('hoy')     // 15:00 local
    expect(urgenciaEntrega({ estado: 'pendiente' }, '2026-11-20T11:00:00Z', AHORA)).toBe('proxima')
  })
})

describe('tablero', () => {
  const urgente = tarea({ estado: 'en_proceso', cantidad: 2 })
  const hoy = tarea({ cantidad: 5 })
  const manana = tarea({ cantidad: 1 })
  const semanaQueViene = tarea({ cantidad: 3 })
  const preparando = tarea({ cantidad: 4 })
  const entregadaHoy = tarea({ cantidad: 6 })
  const entregadaAyer = tarea({ cantidad: 6 })
  const terminada = tarea({ estado: 'finalizada' })
  const sinReceta = tarea({ componenteCodigo: 'NUCSTE0000011' })
  const reparacion = tarea({ tipo: 'reparacion' })
  const planes = new Map([
    [urgente.id, { startISO: '2026-11-19T11:00:00Z' }],
    [hoy.id, { startISO: '2026-11-19T18:00:00Z' }],
    [manana.id, { startISO: '2026-11-20T11:00:00Z' }],
    [semanaQueViene.id, { startISO: '2026-11-26T11:00:00Z' }],
    [preparando.id, { startISO: '2026-11-19T16:00:00Z' }],
  ])
  const preps = [
    prep(preparando.id, { responsable: 'Guillermo' }),
    prep(entregadaHoy.id, { estado: 'entregado', entregadoEn: '2026-11-19T12:30:00Z', unidadesEntregadas: 6 }),
    prep(entregadaAyer.id, { estado: 'entregado', entregadoEn: '2026-11-18T15:00:00Z', unidadesEntregadas: 6 }),
  ]
  const todas = [semanaQueViene, manana, hoy, urgente, preparando, entregadaHoy, entregadaAyer, terminada, sinReceta, reparacion]

  it('ordena por urgencia y deja afuera lo terminado, lo sin receta y las reparaciones', () => {
    const tb = tableroEntregas(todas, preps, RECETAS, planes, AHORA)
    expect(tb.porPreparar.map((i) => i.tarea.id)).toEqual([urgente.id, hoy.id, manana.id, semanaQueViene.id])
    expect(tb.enPreparacion.map((i) => i.tarea.id)).toEqual([preparando.id])
    expect(tb.entregadasHoy.map((i) => i.tarea.id)).toEqual([entregadaHoy.id])   // la de ayer ya no aparece
  })

  it('el horizonte esconde lo lejano pero nunca lo urgente ni lo de hoy', () => {
    const tb = tableroEntregas(todas, preps, RECETAS, planes, AHORA, { horizonteDias: 2 })
    expect(tb.porPreparar.map((i) => i.tarea.id)).toEqual([urgente.id, hoy.id, manana.id])
    expect(tb.fueraDeHorizonte).toBe(1)
    const soloHoy = tableroEntregas(todas, preps, RECETAS, planes, AHORA, { horizonteDias: 0 })
    expect(soloHoy.porPreparar.map((i) => i.tarea.id)).toEqual([urgente.id, hoy.id])
  })

  it('los materiales de la tarjeta son por las unidades a preparar', () => {
    const tb = tableroEntregas(todas, preps, RECETAS, planes, AHORA)
    expect(tb.porPreparar.find((i) => i.tarea.id === hoy.id)?.materiales[0].cantidad).toBe(123)   // 5 × 24,6
  })
})

describe('botones: preparar, entregado, deshacer', () => {
  it('preparar -> entregado guarda quién, cuándo y cuántas unidades cubrió', () => {
    const t = tarea({ cantidad: 8 })
    const p1 = marcarEnPreparacion(t, undefined, 'Guillermo', 'logistica_equipo', '2026-11-19T13:00:00Z')
    expect(p1).toMatchObject({ id: t.id, estado: 'en_preparacion', responsable: 'Guillermo', preparandoEn: '2026-11-19T13:00:00Z' })
    const p2 = marcarEntregado(t, p1, undefined, undefined, '2026-11-19T13:40:00Z')
    expect(p2).toMatchObject({ estado: 'entregado', responsable: 'Guillermo', preparandoEn: '2026-11-19T13:00:00Z', entregadoEn: '2026-11-19T13:40:00Z', unidadesEntregadas: 8 })
  })

  it('deshacer: entregado -> en preparación -> por preparar', () => {
    const t = tarea({ cantidad: 8 })
    const enPrep = marcarEnPreparacion(t, undefined, 'Juan', undefined, AHORA_ISO)
    const entregado = marcarEntregado(t, enPrep, undefined, undefined, AHORA_ISO)
    const atras = deshacerPaso(entregado, AHORA_ISO)!
    expect(atras.estado).toBe('en_preparacion')
    expect(etapaEntrega(t, atras).etapa).toBe('en_preparacion')
    expect(deshacerPaso(atras, AHORA_ISO)).toBeNull()
  })

  it('deshacer un complemento vuelve a lo ya entregado, no a cero', () => {
    const t = tarea({ cantidad: 15 })
    const entregadoAntes = prep(t.id, { estado: 'entregado', entregadoEn: '2026-11-18T15:00:00Z', unidadesEntregadas: 10 })
    const complemento = marcarEnPreparacion(t, entregadoAntes, 'Enzo', undefined, AHORA_ISO)
    expect(etapaEntrega(t, complemento)).toMatchObject({ etapa: 'en_preparacion', complemento: true, unidades: 5 })
    const atras = deshacerPaso(complemento, AHORA_ISO)!
    expect(atras).toMatchObject({ estado: 'entregado', unidadesEntregadas: 10 })
  })

  it('la fila de la base ida y vuelta', () => {
    const p = marcarEntregado(tarea({ cantidad: 3 }), undefined, 'Lucas', 'lorenzo', AHORA_ISO)
    expect(preparacionFromRow({ ...preparacionToRow(p), unidades_entregadas: '3.000' })).toEqual(p)
  })
})
