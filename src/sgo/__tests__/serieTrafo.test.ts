import { describe, expect, it } from 'vitest'
import type { DespachoTrafo } from '../../types'
import { despachoTieneSerie, normalizarNumeroSerie } from '../../types'

function despacho(nroSerie: string, numerosSerie?: string[]): DespachoTrafo {
  return {
    id: 'd-1', ot: '', cliente: 'Stock', nroSerie, numerosSerie,
    linea: 'distribucion', fechaIngreso: '2026-08-04T12:00:00Z',
    estado: 'embalado', creada: '2026-08-04T12:00:00Z',
  }
}

describe('identidad por número de serie', () => {
  it('ignora puntos, guiones, espacios y mayúsculas', () => {
    expect(normalizarNumeroSerie(' ab-25.610 ')).toBe('AB25610')
  })

  it('encuentra una serie en un despacho de una sola unidad', () => {
    expect(despachoTieneSerie(despacho('24.610'), '24610')).toBe(true)
  })

  it('encuentra una serie dentro de un despacho de varias unidades', () => {
    expect(despachoTieneSerie(despacho('24610, 24611', ['24610', '24611']), '24.611')).toBe(true)
  })

  it('no considera un valor vacío como una coincidencia real', () => {
    expect(despachoTieneSerie(despacho(''), '')).toBe(false)
  })
})
