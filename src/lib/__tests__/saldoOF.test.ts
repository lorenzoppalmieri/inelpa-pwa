import { describe, expect, it } from 'vitest'
import type { OrdenProduccion, Tarea } from '../../types'
import {
  admiteCantidad, cantidadTarea, estandarPorUnidadMin, estandarTotalMin, saldoSemielaborado,
  sectorTieneSemielaborado, semielaboradosAsignables, semielaboradosDeOrden, validarCantidad,
} from '../saldoOF'
import { tareaFromRow, tareaToRow } from '../../sync/mappers'

// ============================================================
// v2.55 — Una OF de SAP de 100 bobinas se reparte entre estaciones, sin pasarse
// de lo que planificó SAP. Datos reales del catálogo: TTD13V0000001 (TTD 16/13)
// y su bobina BT F2 BOBBAJ0000110.
// ============================================================
const F2_BT = 'BOBBAJ0000110'

const ofTrafo: OrdenProduccion = {
  id: 'of-pt', nroOrden: '9901', modelo: 'TTD 16/13 - Tanque Expansion - Plataforma - Cobre',
  material: 'cobre', linea: 'distribucion', cantidad: 20, fechaEntrega: '2026-12-15',
  origen: 'sap', sapDocEntry: 9901, itemCode: 'TTD13V0000001',
}
const ofBobinas: OrdenProduccion = {
  id: 'of-se', nroOrden: '9950', modelo: 'Bobina BT Distribucion Trifasica Cuadrado 16/13 F2 Cu',
  material: 'cobre', linea: 'distribucion', cantidad: 100, fechaEntrega: '2026-12-10',
  origen: 'sap', sapDocEntry: 9950, itemCode: F2_BT,
}

let n = 0
const tarea = (ordenId: string, componenteCodigo: string, cantidad?: number, estado: Tarea['estado'] = 'pendiente'): Tarea => ({
  id: `t${++n}`, ordenId, componenteCodigo, cantidad, estado, sectorId: 'bob_dist_bt', maquinaId: 'm1',
  modelo: 'x', semana: '2026-W47', prioridad: 1, tiempoEstandarMin: 60, paradas: [],
} as Tarea)

describe('cantidad de una tarea', () => {
  it('las tareas viejas (sin cantidad) valen 1', () => {
    expect(cantidadTarea({})).toBe(1)
    expect(cantidadTarea({ cantidad: 30 })).toBe(30)
    expect(cantidadTarea({ cantidad: 0 })).toBe(1)
  })

  it('Montaje PA y PO van de a 1 transformador; el resto admite cantidad', () => {
    expect(admiteCantidad('bob_dist_bt')).toBe(true)
    expect(admiteCantidad('soldadura_dist')).toBe(true)
    expect(admiteCantidad('montaje_pa_dist')).toBe(false)
    expect(admiteCantidad('montaje_po_rural')).toBe(false)
  })
})

describe('saldo de la OF por semielaborado', () => {
  it('100 bobinas repartidas 30 + 40: quedan 30 (ejemplo del pedido)', () => {
    const tareas = [tarea('of-se', F2_BT, 30, 'finalizada'), tarea('of-se', F2_BT, 40)]
    expect(saldoSemielaborado(ofBobinas, F2_BT, tareas)).toEqual({ total: 100, asignado: 70, terminado: 30, restante: 30 })
  })

  it('si se borra una tarea, sus unidades vuelven al saldo', () => {
    const t1 = tarea('of-se', F2_BT, 30)
    const t2 = tarea('of-se', F2_BT, 40)
    expect(saldoSemielaborado(ofBobinas, F2_BT, [t1, t2]).restante).toBe(30)
    expect(saldoSemielaborado(ofBobinas, F2_BT, [t1]).restante).toBe(70)
  })

  it('las tareas viejas sin cantidad descuentan 1 cada una (igual que antes)', () => {
    const tareas = [tarea('of-pt', F2_BT), tarea('of-pt', F2_BT)]
    expect(saldoSemielaborado(ofTrafo, F2_BT, tareas).restante).toBe(18)
  })

  it('al editar, la tarea no se descuenta a sí misma', () => {
    const t1 = tarea('of-se', F2_BT, 60)
    expect(saldoSemielaborado(ofBobinas, F2_BT, [t1], t1.id).restante).toBe(100)
  })

  it('no mezcla otras OF ni otros semielaborados, y nunca da negativo', () => {
    const tareas = [tarea('otra', F2_BT, 50), tarea('of-se', 'BOBBAJ0000109', 50), tarea('of-se', F2_BT, 120)]
    expect(saldoSemielaborado(ofBobinas, F2_BT, tareas)).toMatchObject({ asignado: 120, restante: 0 })
  })
})

describe('qué semielaborados ofrece cada OF', () => {
  it('OF de transformador: los de la receta del modelo', () => {
    expect(semielaboradosDeOrden(ofTrafo).map((c) => c.codigo)).toContain(F2_BT)
  })

  it('OF de un semielaborado de SAP: el propio artículo (antes no ofrecía nada)', () => {
    expect(semielaboradosDeOrden(ofBobinas).map((c) => c.codigo)).toEqual([F2_BT])
  })

  it('si SAP mandó una OF hija para la bobina, se planifica contra la hija y sale de la madre', () => {
    const hija = { ...ofBobinas, sapParentDocEntry: 9901 }
    const deLaMadre = semielaboradosDeOrden(ofTrafo, [ofTrafo, hija]).map((c) => c.codigo)
    expect(deLaMadre).not.toContain(F2_BT)
    expect(deLaMadre).toContain('BOBBAJ0000109') // la F1 no tiene hija: sigue en la madre
  })

  it('una OF cargada a mano (sin datos SAP) se comporta como siempre', () => {
    const manual = { ...ofTrafo, id: 'of-man', origen: undefined, sapDocEntry: undefined, itemCode: undefined }
    expect(semielaboradosDeOrden(manual, [manual, { ...ofBobinas, sapParentDocEntry: 9901 }]).map((c) => c.codigo)).toContain(F2_BT)
  })

  it('filtra por sector, oculta los completos y mantiene el de la tarea en edición', () => {
    const llena = [tarea('of-se', F2_BT, 100)]
    expect(semielaboradosAsignables(ofBobinas, [], 'bob_dist_bt', llena)).toEqual([])
    expect(semielaboradosAsignables(ofBobinas, [], 'bob_dist_bt', llena, { mantenerCodigo: F2_BT })).toHaveLength(1)
    expect(semielaboradosAsignables(ofBobinas, [], 'soldadura_dist', [])).toEqual([])
    expect(sectorTieneSemielaborado(ofBobinas, [], 'bob_dist_bt')).toBe(true)
    expect(sectorTieneSemielaborado(ofBobinas, [], 'soldadura_dist')).toBe(false)
  })
})

describe('validación de la cantidad', () => {
  it('no deja asignar más que el saldo', () => {
    expect(validarCantidad('31', 30)).toEqual({ ok: false, error: 'Quedan 30 por asignar en esta OF; no se puede asignar 31.' })
    expect(validarCantidad('30', 30)).toEqual({ ok: true, cantidad: 30 })
  })

  it('rechaza cero, negativos, vacío y texto', () => {
    for (const v of ['0', '-2', '', 'abc']) expect(validarCantidad(v, 30).ok).toBe(false)
  })

  it('en unidades no acepta decimales; con decimales habilitados sí (coma o punto)', () => {
    expect(validarCantidad('2.5', 30).ok).toBe(false)
    expect(validarCantidad('2,5', 30, true)).toEqual({ ok: true, cantidad: 2.5 })
    expect(validarCantidad('0.1', 0.3, true)).toEqual({ ok: true, cantidad: 0.1 })
  })
})

describe('tiempo estándar por unidad', () => {
  it('la tarea guarda el total: 45 min por bobina × 30 = 1350', () => {
    expect(estandarTotalMin(45, 30)).toBe(1350)
    expect(estandarTotalMin(0, 3)).toBe(1)
  })

  it('el estándar por unidad se recupera dividiendo por la cantidad', () => {
    expect(estandarPorUnidadMin({ tiempoEstandarMin: 1350, cantidad: 30 })).toBe(45)
    expect(estandarPorUnidadMin({ tiempoEstandarMin: 60 })).toBe(60)
  })
})

describe('sincronización de la cantidad', () => {
  it('una tarea de 1 unidad NO manda la columna (sigue subiendo aunque falte el SQL v2.55)', () => {
    expect(tareaToRow(tarea('of-se', F2_BT))).not.toHaveProperty('cantidad')
  })

  it('una tarea de varias unidades la manda, y vuelve igual desde la base (numeric como texto)', () => {
    const fila = tareaToRow(tarea('of-se', F2_BT, 30))
    expect(fila).toHaveProperty('cantidad', 30)
    expect(tareaFromRow({ ...fila, cantidad: '30.000' }, []).cantidad).toBe(30)
    expect(tareaFromRow({ ...fila, cantidad: undefined }, []).cantidad).toBeUndefined()
  })
})

