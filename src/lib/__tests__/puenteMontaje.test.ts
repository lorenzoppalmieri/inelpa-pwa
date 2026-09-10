import { describe, expect, it } from 'vitest'
import type { Maquina, Tarea, TiempoEstandar } from '../../types'
import { claveEstandar } from '../../types'
import {
  construirTareaPO, poDe, puedeGenerarPO, sectorPODe, tieneEstandarAprendido,
} from '../puenteMontaje'

// ============================================================
// v2.06 — Puente Montaje PA → PO.
// ============================================================
const MAQUINAS: Maquina[] = [
  { id: 'm_pa_rural', nombre: 'Linea Montaje PA', sectorId: 'montaje_pa_rural' } as Maquina,
  { id: 'm_po_rural', nombre: 'Linea Montaje PO', sectorId: 'montaje_po_rural' } as Maquina,
  { id: 'm_po_dist', nombre: 'Linea Montaje PO', sectorId: 'montaje_po_dist' } as Maquina,
]

function pa(over: Partial<Tarea> = {}): Tarea {
  return {
    id: 'pa1',
    tipo: 'fabricacion',
    ordenId: 'of1',
    sectorId: 'montaje_pa_rural' as Tarea['sectorId'],
    maquinaId: 'm_pa_rural',
    operarioId: 'op_pa',
    modelo: 'TMR 16/7',
    fase: 'monofasico',
    nroTransformador: '1234',
    cliente: 'Cooperativa X',
    componenteCodigo: 'PARRUR-001',
    semana: '2026-W36',
    prioridad: 2,
    estado: 'finalizada',
    tiempoEstandarMin: 300,
    inicioReal: '2026-09-01T07:00:00.000-03:00',
    finReal: '2026-09-01T12:00:00.000-03:00',
    paradas: [],
    ...over,
  }
}

describe('cuándo se puede generar', () => {
  it('una PA finalizada sí', () => {
    expect(puedeGenerarPO(pa(), [], MAQUINAS).puede).toBe(true)
  })

  it('una PA en proceso no', () => {
    const r = puedeGenerarPO(pa({ estado: 'en_proceso', finReal: undefined }), [], MAQUINAS)
    expect(r).toMatchObject({ puede: false, motivo: 'no_finalizada' })
  })

  it('una tarea que no es de Montaje PA no', () => {
    const r = puedeGenerarPO(pa({ sectorId: 'bob_dist_at' as Tarea['sectorId'] }), [], MAQUINAS)
    expect(r).toMatchObject({ puede: false, motivo: 'no_es_pa' })
  })

  it('una reparación no entra al circuito', () => {
    const r = puedeGenerarPO(pa({ tipo: 'reparacion' }), [], MAQUINAS)
    expect(r).toMatchObject({ puede: false, motivo: 'es_reparacion' })
  })

  it('si ya se generó, avisa y devuelve la existente', () => {
    const original = pa()
    // v2.13: la PO se reconoce por `origenTareaId`, no por un id con prefijo.
    const ya = { ...original, id: 'otro-uuid', origenTareaId: original.id }
    const r = puedeGenerarPO(original, [ya], MAQUINAS)
    expect(r).toMatchObject({ puede: false, motivo: 'ya_generada' })
    expect(r.existente?.id).toBe('otro-uuid')
  })

  it('sin línea de PO cargada, no', () => {
    const r = puedeGenerarPO(pa(), [], [MAQUINAS[0]])
    expect(r).toMatchObject({ puede: false, motivo: 'sin_estacion' })
  })

  it('una línea de PO dada de baja no cuenta como estación', () => {
    const baja = [{ ...MAQUINAS[1], activo: false } as Maquina]
    const r = puedeGenerarPO(pa(), [], baja)
    expect(r).toMatchObject({ puede: false, motivo: 'sin_estacion' })
  })
})

describe('el mapeo de sector respeta la línea', () => {
  it('rural va a rural', () => {
    expect(sectorPODe('montaje_pa_rural' as Tarea['sectorId'])).toBe('montaje_po_rural')
  })
  it('distribución va a distribución', () => {
    expect(sectorPODe('montaje_pa_dist' as Tarea['sectorId'])).toBe('montaje_po_dist')
  })
  it('un sector que no es PA no mapea a nada', () => {
    expect(sectorPODe('montaje_po_rural' as Tarea['sectorId'])).toBeUndefined()
  })
})

describe('la tarea PO generada', () => {
  const t = construirTareaPO(pa(), { maquinas: MAQUINAS, estandares: [], estandarPorDefecto: 240 })

  it('hereda transformador, cliente, orden, modelo y fase', () => {
    expect(t).toMatchObject({
      ordenId: 'of1', modelo: 'TMR 16/7', fase: 'monofasico',
      nroTransformador: '1234', cliente: 'Cooperativa X', prioridad: 2,
    })
  })

  it('va a la línea de PO del mismo sector, no a la de PA', () => {
    expect(t.sectorId).toBe('montaje_po_rural')
    expect(t.maquinaId).toBe('m_po_rural')
  })

  it('nace SIN colaborador y pendiente', () => {
    expect(t.operarioId).toBeUndefined()
    expect(t.estado).toBe('pendiente')
    expect(t.paradas).toEqual([])
    expect(t.inicioReal).toBeUndefined()
    expect(t.finReal).toBeUndefined()
  })

  it('NO copia el semielaborado de la PA (sería consumir cupo dos veces)', () => {
    expect(t.componenteCodigo).toBeUndefined()
  })

  it('arranca cuando terminó la parte activa', () => {
    expect(t.inicioPlanificado).toBe('2026-09-01T12:00:00.000-03:00')
  })

  // v2.13 — EL BUG QUE REPORTÓ LUIS. El id era `po_<idPA>`, pero `tareas.id` en
  // Supabase es UUID: el servidor lo rechazaba, Dexie lo aceptaba, y la tarea
  // aparecía un rato y después desaparecía al recargar de la nube.
  it('el id es un UUID válido, no lleva prefijo', () => {
    expect(t.id).not.toMatch(/^po_/)
    expect(t.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('guarda de qué parte activa salió', () => {
    expect(t.origenTareaId).toBe('pa1')
  })

  it('la PO generada se encuentra por su origen', () => {
    expect(poDe('pa1', [t])?.id).toBe(t.id)
    expect(poDe('otra', [t])).toBeUndefined()
  })
})

describe('tiempo estándar de la PO', () => {
  it('usa el aprendido del sector PO cuando existe', () => {
    const est: TiempoEstandar[] = [
      { id: claveEstandar('montaje_po_rural' as Tarea['sectorId'], 'TMR 16/7'), minutos: 180 } as TiempoEstandar,
    ]
    const t = construirTareaPO(pa(), { maquinas: MAQUINAS, estandares: est, estandarPorDefecto: 240 })
    expect(t.tiempoEstandarMin).toBe(180)
    expect(tieneEstandarAprendido(pa(), est)).toBe(true)
  })

  it('NO copia el estándar de la PA: son operaciones distintas', () => {
    const t = construirTareaPO(pa(), { maquinas: MAQUINAS, estandares: [], estandarPorDefecto: 240 })
    expect(t.tiempoEstandarMin).toBe(240)
    expect(t.tiempoEstandarMin).not.toBe(300) // 300 era el de la PA
  })

  it('no toma el estándar de la PA aunque exista para ese sector', () => {
    const est: TiempoEstandar[] = [
      { id: claveEstandar('montaje_pa_rural' as Tarea['sectorId'], 'TMR 16/7'), minutos: 999 } as TiempoEstandar,
    ]
    const t = construirTareaPO(pa(), { maquinas: MAQUINAS, estandares: est, estandarPorDefecto: 240 })
    expect(t.tiempoEstandarMin).toBe(240)
    expect(tieneEstandarAprendido(pa(), est)).toBe(false)
  })
})
