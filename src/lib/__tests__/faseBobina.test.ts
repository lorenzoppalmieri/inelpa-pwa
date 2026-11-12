import { describe, expect, it } from 'vitest'
import { faseBobina, modeloBase } from '../../types'
import catalogo from '../../data/catalogoComponentes.json'

// ============================================================
// v2.50 — Filtro de fase en Planificación (agrupando por modelo).
// La fase va en el MEDIO de la descripción del maestro SAP, no al final.
// ============================================================
describe('faseBobina', () => {
  it('lee la fase en la posición real del maestro', () => {
    expect(faseBobina('Bobina AT Distribucion Trifasica Cuadrado 63/33 F1 Al')).toBe('F1')
    expect(faseBobina('Bobina BT Rural Trifasica 10/13 F2 Cu')).toBe('F2')
    expect(faseBobina('Bobina BT Distribucion Trifasica Redondo 160/13 F3 Al')).toBe('F3')
  })

  it('acepta variantes con espacio o la palabra FASE', () => {
    expect(faseBobina('Bobina AT 315/13 F 2 Cu')).toBe('F2')
    expect(faseBobina('Bobina AT 315/13 Fase 3 Cu')).toBe('F3')
  })

  it('sin marcador de fase devuelve undefined (cubas, PA, monofásicas)', () => {
    expect(faseBobina('Cuba Distribucion 315')).toBeUndefined()
    expect(faseBobina(undefined)).toBeUndefined()
    expect(faseBobina('Bobina AT 315/13 F10 Cu')).toBeUndefined()
  })

  it('contra el catálogo real: toda descripción con fase es una bobina y coincide con modeloBase', () => {
    const items = (Array.isArray(catalogo) ? catalogo : Object.values(catalogo)) as { descripcion?: string }[]
    const conFase = items.map((c) => c.descripcion ?? '').filter((d) => faseBobina(d))
    expect(conFase.length).toBeGreaterThan(100)
    for (const d of conFase) {
      expect(d).toMatch(/^Bobina/i)
      // La descripción sin fase no debe conservar el marcador.
      expect(faseBobina(modeloBase(d))).toBeUndefined()
    }
  })
})
