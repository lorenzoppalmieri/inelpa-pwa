import { describe, expect, it } from 'vitest'
import type { OrdenProduccion } from '../../types'
import { ordenesAsignables } from '../ordenesAsignables'

// ============================================================
// v2.49 — Una OF no se "consume" con la primera tarea.
// Caso real: la OF tenía la Cuba ya finalizada en Herrería y desaparecía del
// desplegable al querer asignar la Parte Activa.
// ============================================================
const of = (id: string, nroOrden: string, creada?: string, modelo = 'TMR 16/7'): OrdenProduccion => ({
  id, nroOrden, modelo, material: 'cobre', linea: 'rural', cantidad: 1, fechaEntrega: '', creada,
} as OrdenProduccion)

const ORDENES = [
  of('a', 'OF-100', '2026-11-01T10:00:00.000Z'),
  of('b', 'OF-200', '2026-11-08T10:00:00.000Z', 'TMD 315'), // la de la Cuba ya finalizada
  of('c', 'OF-050'),                                         // vieja, sin fecha de alta
]

describe('OF elegibles al asignar una tarea', () => {
  it('trae TODAS las OF, tengan o no tareas finalizadas', () => {
    expect(ordenesAsignables(ORDENES).map((o) => o.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('ordena de la más reciente a la más antigua; sin fecha, al final', () => {
    expect(ordenesAsignables(ORDENES).map((o) => o.id)).toEqual(['b', 'a', 'c'])
  })

  it('el buscador filtra por número y por modelo', () => {
    expect(ordenesAsignables(ORDENES, 'of-200').map((o) => o.id)).toEqual(['b'])
    expect(ordenesAsignables(ORDENES, 'tmd').map((o) => o.id)).toEqual(['b'])
    expect(ordenesAsignables(ORDENES, '  ')).toHaveLength(3)
  })

  it('no modifica el arreglo original', () => {
    const copia = [...ORDENES]
    ordenesAsignables(ORDENES)
    expect(ORDENES).toEqual(copia)
  })
})
