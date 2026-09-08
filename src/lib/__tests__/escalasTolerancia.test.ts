import { describe, expect, it } from 'vitest'
import {
  escalasDeModelo, escalaUnilateral, escalaBilateral,
  TOLERANCIAS_NORMA, ESCALA_PERDIDAS, ESCALA_IO,
  zonaDe, apruebaZona,
} from '../ensayoPerdidas'

// ============================================================
// v1.103 — Escalas de las agujas construidas desde las tolerancias del modelo.
//
// POR QUÉ EXISTEN ESTOS TESTS: acá se decide si un transformador aprueba o
// rebota. Un corte mal puesto no rompe nada visible — la aguja pinta igual, el
// número se ve razonable — y el error recién aparece cuando un cliente rechaza
// una máquina que la app había dado por buena.
//
// El caso más delicado es el CERO: la planilla trae `tol_io_pct = 0` en los 87
// modelos y el documento de cálculo dice +30%. Se decidió leer ese 0 como
// "columna sin cargar". Si esa regla se rompiera, todos los ensayos con io%
// apenas por encima del nominal pasarían a figurar fuera de norma de golpe.
// ============================================================

describe('escalas · valores por defecto del documento', () => {
  it('sin catálogo usa las tolerancias de norma', () => {
    const e = escalasDeModelo({})
    expect(e.po.amarilloHasta).toBe(100 + TOLERANCIAS_NORMA.po)     // +15 %
    expect(e.pcc.amarilloHasta).toBe(100 + TOLERANCIAS_NORMA.pcc)   // +15 %
    expect(e.io.amarilloHasta).toBe(100 + TOLERANCIAS_NORMA.io)     // +30 %
    expect(e.totales.amarilloHasta).toBe(100 + TOLERANCIAS_NORMA.pt) // +10 %
    expect(e.ucc.verdeHasta).toBe(100 + TOLERANCIAS_NORMA.ucc)      // ±10 %
  })

  it('reproduce exactamente las constantes que había antes', () => {
    // Blindaje contra regresiones: con el catálogo vacío la app tiene que
    // comportarse igual que antes de la v1.103.
    const e = escalasDeModelo({})
    expect(e.po.min).toBe(ESCALA_PERDIDAS.min)
    expect(e.po.max).toBe(ESCALA_PERDIDAS.max)
    expect(e.po.amarilloHasta).toBe(ESCALA_PERDIDAS.amarilloHasta)
    expect(e.io.min).toBe(ESCALA_IO.min)
    expect(e.io.max).toBe(ESCALA_IO.max)
    expect(e.io.amarilloHasta).toBe(ESCALA_IO.amarilloHasta)
    expect(e.ucc.min).toBe(80)
    expect(e.ucc.max).toBe(120)
    expect(e.ucc.bilateral).toBe(true)
  })
})

describe('escalas · el cero se lee como "sin dato"', () => {
  it('tol_io_pct = 0 cae al +30 % del documento', () => {
    // Es el caso REAL de la planilla: los 87 modelos traen 0 en esta columna.
    expect(escalasDeModelo({ io: 0 }).io.amarilloHasta).toBe(130)
  })

  it('un cero en cualquier tolerancia cae al valor por defecto', () => {
    const e = escalasDeModelo({ po: 0, pcc: 0, io: 0, ucc: 0, pt: 0 })
    expect(e.po.amarilloHasta).toBe(115)
    expect(e.pcc.amarilloHasta).toBe(115)
    expect(e.io.amarilloHasta).toBe(130)
    expect(e.totales.amarilloHasta).toBe(110)
    expect(e.ucc.verdeHasta).toBe(110)
  })

  it('los valores basura tampoco pisan la norma', () => {
    expect(escalaUnilateral(undefined, 15, ESCALA_PERDIDAS).amarilloHasta).toBe(115)
    expect(escalaUnilateral(NaN, 15, ESCALA_PERDIDAS).amarilloHasta).toBe(115)
    expect(escalaUnilateral(-5, 15, ESCALA_PERDIDAS).amarilloHasta).toBe(115)
  })
})

describe('escalas · el catálogo manda cuando trae un número', () => {
  it('una tolerancia del catálogo reemplaza a la de norma', () => {
    const e = escalasDeModelo({ po: 8, pcc: 20, io: 25, ucc: 7.5, pt: 12 })
    expect(e.po.amarilloHasta).toBe(108)
    expect(e.pcc.amarilloHasta).toBe(120)
    expect(e.io.amarilloHasta).toBe(125)
    expect(e.totales.amarilloHasta).toBe(112)
    expect(e.ucc.verdeHasta).toBe(107.5)
  })

  it('Po y Pcc son independientes', () => {
    // Antes compartían la constante ESCALA_PERDIDAS: cambiar una cambiaba las
    // dos. La planilla trae una columna para cada una.
    const e = escalasDeModelo({ po: 10, pcc: 20 })
    expect(e.po.amarilloHasta).toBe(110)
    expect(e.pcc.amarilloHasta).toBe(120)
  })

  it('una tolerancia grande no queda fuera de la escala', () => {
    // Si el corte amarillo cayera más allá del máximo, la zona roja no se vería
    // y la aguja daría a entender que todo entra en tolerancia.
    const e = escalaUnilateral(60, 15, ESCALA_PERDIDAS)
    expect(e.amarilloHasta).toBe(160)
    expect(e.max).toBeGreaterThan(e.amarilloHasta)
  })

  it('la escala bilateral abarca el doble de la tolerancia', () => {
    const e = escalaBilateral(10, 10)
    expect(e.min).toBe(80)
    expect(e.max).toBe(120)
    expect(e.verdeHasta).toBe(110)
    expect(e.bilateral).toBe(true)
  })
})

describe('escalas · el veredicto que sale de ellas', () => {
  const e = escalasDeModelo({})

  it('io% justo en el nominal aprueba', () => {
    expect(apruebaZona(zonaDe(100, e.io))).toBe(true)
  })

  it('io% al +25 % aprueba con tolerancia y al +35 % no', () => {
    expect(apruebaZona(zonaDe(125, e.io))).toBe(true)
    expect(zonaDe(135, e.io)).toBe('fuera')
  })

  it('Po al +15 % es el borde y todavía entra', () => {
    expect(apruebaZona(zonaDe(115, e.po))).toBe(true)
    expect(zonaDe(115.1, e.po)).toBe('fuera')
  })

  it('ucc% admite desvío para los dos lados', () => {
    expect(apruebaZona(zonaDe(92, e.ucc))).toBe(true)
    expect(apruebaZona(zonaDe(108, e.ucc))).toBe(true)
    expect(zonaDe(88, e.ucc)).toBe('fuera')
    expect(zonaDe(112, e.ucc)).toBe('fuera')
  })

  it('con una tolerancia de catálogo más estricta, rebota antes', () => {
    const estricta = escalasDeModelo({ io: 5 })
    expect(zonaDe(125, estricta.io)).toBe('fuera')   // con la de norma aprobaba
    expect(apruebaZona(zonaDe(104, estricta.io))).toBe(true)
  })

  it('sin dato no opina', () => {
    expect(zonaDe(undefined, e.po)).toBe('sin_dato')
    expect(apruebaZona(zonaDe(undefined, e.po))).toBe(false)
  })
})
