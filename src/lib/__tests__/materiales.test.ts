import { describe, expect, it } from 'vitest'
import type { LineaReceta, Tarea } from '../../types'
import { formatoCantidad, materialesDeTarea, materialesPorEstacion, recetaPorArticulo, unidadCorta } from '../materiales'
import { lineaRecetaFromRow } from '../../sync/mappers'

// ============================================================
// v2.57 — Materiales = receta de SAP (por unidad) × cantidad de la tarea.
// Datos reales de INELPA-TEST: receta de la bobina BT BOBBAJ0000268.
// ============================================================
const L = (parentCode: string, childCode: string, linea: number, cantidad: number, uom: string, childName?: string, esSemielaborado = false): LineaReceta =>
  ({ id: `${parentCode}|${childCode}|1`, parentCode, childCode, ocurrencia: 1, linea, cantidad, uom, childName, esSemielaborado })

const BOBINA = 'BOBBAJ0000268'
const PA = 'PARDIS0000122'
const RECETAS = recetaPorArticulo([
  L(BOBINA, 'AISECP0000093', 3, 19.78, 'Metros', 'Aislacion entre Capas'),
  L(BOBINA, 'FOLALU0000006', 1, 24.6, 'Kilogramos'),                     // insumo sin nombre todavía
  L(BOBINA, 'AISCAR0000054', 0, 0.7, 'Unidad', 'Pressphan Carretel', true),
  L(PA, 'PRESUP0000126', 0, 2, 'Unidad', 'Prensayugo Superior', true),
  L(PA, 'BULARA0000006', 1, 32, 'Unidad', 'Arandela'),
])

let n = 0
const tarea = (componenteCodigo: string, cantidad: number | undefined, over: Partial<Tarea> = {}): Tarea => ({
  id: `t${++n}`, componenteCodigo, cantidad, estado: 'pendiente', sectorId: 'bob_dist_bt', maquinaId: 'm19',
  modelo: 'x', semana: '2026-W47', prioridad: 1, tiempoEstandarMin: 60, paradas: [], ...over,
} as Tarea)

describe('materiales de una tarea', () => {
  it('30 bobinas: 30 × 24,6 kg de foil = 738 kg, en el orden de la receta de SAP', () => {
    const m = materialesDeTarea(tarea(BOBINA, 30), RECETAS)
    expect(m.map((x) => x.codigo)).toEqual(['AISCAR0000054', 'FOLALU0000006', 'AISECP0000093'])
    expect(m.find((x) => x.codigo === 'FOLALU0000006')).toMatchObject({ cantidad: 738, unidad: 'kg' })
    expect(m.find((x) => x.codigo === 'AISECP0000093')).toMatchObject({ cantidad: 593.4, unidad: 'm' })
    expect(m.find((x) => x.codigo === 'AISCAR0000054')).toMatchObject({ cantidad: 21, esSemielaborado: true })
  })

  it('sin cantidad (tarea vieja) vale 1 unidad', () => {
    expect(materialesDeTarea(tarea(BOBINA, undefined), RECETAS).find((x) => x.codigo === 'FOLALU0000006')?.cantidad).toBe(24.6)
  })

  it('si SAP no mandó el nombre del insumo, se muestra el código', () => {
    expect(materialesDeTarea(tarea(BOBINA, 1), RECETAS).find((x) => x.codigo === 'FOLALU0000006')?.nombre).toBe('FOLALU0000006')
  })

  it('artículo sin receta o tarea sin artículo: no hay materiales', () => {
    expect(materialesDeTarea(tarea('NUCSTE0000011', 3), RECETAS)).toEqual([])
    expect(materialesDeTarea({ componenteCodigo: undefined }, RECETAS)).toEqual([])
  })
})

describe('materiales por estación (logística)', () => {
  it('suma lo que hay que preparar en cada estación y deja afuera lo finalizado y las reparaciones', () => {
    const tareas = [
      tarea(BOBINA, 10, { maquinaId: 'm19', inicioPlanificado: '2026-11-20T10:00:00Z' }),
      tarea(BOBINA, 5, { maquinaId: 'm19', inicioPlanificado: '2026-11-20T08:00:00Z' }),
      tarea(BOBINA, 99, { maquinaId: 'm19', estado: 'finalizada' }),
      tarea(PA, 3, { maquinaId: 'pa1', sectorId: 'montaje_pa_dist', inicioPlanificado: '2026-11-21T07:00:00Z' }),
      tarea(BOBINA, 7, { maquinaId: 'm02', tipo: 'reparacion' }),
    ]
    const r = materialesPorEstacion(tareas, RECETAS)
    expect(r.map((e) => e.maquinaId)).toEqual(['m19', 'pa1'])
    const m19 = r[0]
    expect(m19.tareas.map((t) => t.cantidad)).toEqual([5, 10])                 // en el orden en que se hacen
    expect(m19.materiales.find((x) => x.codigo === 'FOLALU0000006')?.cantidad).toBe(369)  // 15 × 24,6
    expect(r[1].materiales.find((x) => x.codigo === 'BULARA0000006')?.cantidad).toBe(96)  // 3 × 32
  })

  it('filtra por sector y por estado', () => {
    const tareas = [
      tarea(BOBINA, 1, { maquinaId: 'm19', estado: 'en_proceso' }),
      tarea(PA, 1, { maquinaId: 'pa1', sectorId: 'montaje_pa_dist' }),
    ]
    expect(materialesPorEstacion(tareas, RECETAS, { sectorId: 'montaje_pa_dist' }).map((e) => e.maquinaId)).toEqual(['pa1'])
    expect(materialesPorEstacion(tareas, RECETAS, { estados: ['en_proceso'] }).map((e) => e.maquinaId)).toEqual(['m19'])
  })
})

describe('formato', () => {
  it('unidades de SAP en corto y cantidades con coma', () => {
    expect(unidadCorta('Kilogramos')).toBe('kg')
    expect(unidadCorta('Metros')).toBe('m')
    expect(unidadCorta('Litros')).toBe('l')
    expect(unidadCorta('UN')).toBe('u.')
    expect(unidadCorta(undefined)).toBe('u.')
    expect(formatoCantidad(593.4)).toBe('593,4')
    expect(formatoCantidad(0.125)).toBe('0,13')
  })

  it('la fila de la vista se lee bien (numeric como texto, sin nombre)', () => {
    const l = lineaRecetaFromRow({
      id: 'A|B|1', parent_code: 'A', child_code: 'B', ocurrencia: 1, linea: 0,
      cantidad: '24.600', uom: 'Kilogramos', child_name: null, child_con_receta: null,
    })
    expect(l).toMatchObject({ cantidad: 24.6, childName: undefined, esSemielaborado: false })
  })
})
