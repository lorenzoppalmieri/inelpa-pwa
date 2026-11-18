import { describe, expect, it } from 'vitest'
import type { OrdenProduccion } from '../../types'
import { etiquetaOrden, ordenesAsignables, ordenesRecientesPrimero } from '../ordenesAsignables'
import { ordenFromRow, ordenToRow, type OrdenRow } from '../../sync/mappers'
import { componentesDeModelo, modeloDeOrden } from '../../data/catalogo'

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

// ============================================================
// v2.53 — La OF de SAP "invisible": estaba en la base y en Dexie, pero la
// pestaña "Órdenes de fabricación" listaba en orden de UUID y quedaba perdida
// entre cientos de órdenes. Todas las listas usan ahora el mismo orden.
// ============================================================
describe('OF de SAP en las listas del planificador', () => {
  const filaSap: OrdenRow = {
    id: 'sap-1', nro_orden: '9901', nro_contrato: null, modelo: 'TRAFO TRIF. 315 KVA 13,2/0,4',
    material: 'cobre', linea: 'rural', cantidad: 1, fecha_entrega: '2026-12-15',
    creada_en: '2026-11-18T12:00:00.000Z',
    origen: 'sap', sap_abs_entry: 9901, sap_doc_num: '9901', sap_parent_abs_entry: null, item_code: 'TTD13V0000001',
  }

  it('la OF recién llegada de SAP queda primera en la pestaña de órdenes', () => {
    const lista = ordenesRecientesPrimero([...ORDENES, ordenFromRow(filaSap)])
    expect(lista[0].id).toBe('sap-1')
    expect(lista.map((o) => o.id)).toEqual(['sap-1', 'b', 'a', 'c'])
  })

  it('se encuentra por DocNum y por ItemCode de SAP', () => {
    const todas = [...ORDENES, ordenFromRow(filaSap)]
    expect(ordenesAsignables(todas, 'ttd13v').map((o) => o.id)).toEqual(['sap-1'])
    expect(ordenesAsignables(todas, '9901').map((o) => o.id)).toEqual(['sap-1'])
  })

  it('el desplegable marca las OF de SAP y no toca las de la PWA', () => {
    expect(etiquetaOrden(ordenFromRow(filaSap))).toBe('9901 · TRAFO TRIF. 315 KVA 13,2/0,4 [SAP]')
    expect(etiquetaOrden(ORDENES[0])).toBe('OF-100 · TMR 16/7')
  })

  it('una fila sin columnas SAP (base de producción sin la v2.40) se lee igual', () => {
    const { origen, sap_abs_entry, sap_doc_num, sap_parent_abs_entry, item_code, ...vieja } = filaSap
    void origen; void sap_abs_entry; void sap_doc_num; void sap_parent_abs_entry; void item_code
    const o = ordenFromRow(vieja as OrdenRow)
    expect(o.origen).toBeUndefined()
    expect(o.sapDocEntry).toBeUndefined()
    expect(etiquetaOrden(o)).not.toContain('[SAP]')
  })

  it('al editar la OF en la PWA NO se mandan las columnas SAP (son del endpoint)', () => {
    const fila = ordenToRow(ordenFromRow(filaSap)) as unknown as Record<string, unknown>
    for (const k of ['origen', 'sap_abs_entry', 'sap_doc_num', 'sap_parent_abs_entry', 'item_code']) {
      expect(fila).not.toHaveProperty(k)
    }
  })

  it('si SAP renombró el artículo, el modelo se encuentra igual por ItemCode (y ofrece sus semielaborados)', () => {
    const renombrada = ordenFromRow({ ...filaSap, modelo: 'TTD 16/13 - NOMBRE CAMBIADO EN SAP' })
    const m = modeloDeOrden(renombrada)
    expect(m?.codigo).toBe('TTD13V0000001')
    expect(componentesDeModelo(m).length).toBeGreaterThan(0)
  })

  it('una OF cargada a mano (sin ItemCode) se sigue resolviendo por nombre', () => {
    expect(modeloDeOrden({ modelo: 'TTD 16/13 - Tanque Expansion - Plataforma - Cobre' })?.codigo).toBe('TTD13V0000001')
    expect(modeloDeOrden({ modelo: 'no existe' })).toBeUndefined()
    expect(modeloDeOrden(undefined)).toBeUndefined()
  })
})
