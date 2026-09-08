import { describe, expect, it } from 'vitest'
import {
  FACTORES_CONMUTACION, TOL_RELACION_PCT,
  tensionTeorica, relacionTeorica, desvioPct, relacionEnNorma,
  radDe, ipDe, lecturaIP,
} from '../ensayosNorma'

// ============================================================
// v1.101 — Relación de transformación y resistencia de aislamiento.
//
// POR QUÉ EXISTEN ESTOS TESTS: son cálculos que no "se ven mal" en pantalla. Un
// desvío mal calculado no rompe nada visible — muestra un número plausible y
// deja pasar un transformador fuera de norma, o rebota uno que estaba bien. El
// único momento en que se descubriría es discutiendo con un cliente.
//
// Máquina de referencia: TTD 13,2 kV / 400 V, secundario en estrella.
// La tensión de BT por fase es 400/√3 ≈ 231 V, que es el divisor por defecto.
// ============================================================

const UN = 13200
const DIV = 231
const NOMINAL = 2        // índice de la posición 3, la nominal

describe('relación de transformación · teóricas', () => {
  it('la posición nominal es la tensión de AT sobre la de BT por fase', () => {
    expect(relacionTeorica(UN, DIV, NOMINAL)).toBeCloseTo(13200 / 231, 9)
  })

  it('las cinco posiciones son ±2 × 2,5 % sobre la nominal', () => {
    expect(FACTORES_CONMUTACION).toEqual([1.05, 1.025, 1, 0.975, 0.95])
    expect(tensionTeorica(UN, 0)).toBeCloseTo(13860, 9)   // +5 %
    expect(tensionTeorica(UN, 4)).toBeCloseTo(12540, 9)   // −5 %
  })

  it('la relación sube con la tensión de AT: posición 1 > nominal > posición 5', () => {
    const alta = relacionTeorica(UN, DIV, 0)!
    const nom = relacionTeorica(UN, DIV, NOMINAL)!
    const baja = relacionTeorica(UN, DIV, 4)!
    expect(alta).toBeGreaterThan(nom)
    expect(nom).toBeGreaterThan(baja)
  })

  it('sin tensión nominal o sin divisor no hay teórica que calcular', () => {
    expect(relacionTeorica(undefined, DIV, NOMINAL)).toBeUndefined()
    expect(relacionTeorica(UN, undefined, NOMINAL)).toBeUndefined()
    // Divisor 0 dividiría por cero: tiene que devolver undefined, no Infinity.
    expect(relacionTeorica(UN, 0, NOMINAL)).toBeUndefined()
  })
})

describe('relación de transformación · desvío y tolerancia', () => {
  const teo = relacionTeorica(UN, DIV, NOMINAL)!

  it('medir exactamente la teórica da desvío cero', () => {
    expect(desvioPct(teo, teo)).toBeCloseTo(0, 12)
  })

  it('el signo distingue medir de más de medir de menos', () => {
    expect(desvioPct(teo * 1.01, teo)).toBeCloseTo(1, 9)
    expect(desvioPct(teo * 0.99, teo)).toBeCloseTo(-1, 9)
  })

  it('la tolerancia es ±0,5 % e incluye el borde', () => {
    expect(TOL_RELACION_PCT).toBe(0.5)
    expect(relacionEnNorma(desvioPct(teo * 1.004, teo))).toBe(true)
    expect(relacionEnNorma(0.5)).toBe(true)     // borde exacto: entra
    expect(relacionEnNorma(-0.5)).toBe(true)
    expect(relacionEnNorma(0.51)).toBe(false)
    expect(relacionEnNorma(-0.51)).toBe(false)
  })

  it('rechaza por igual el desvío para arriba y para abajo', () => {
    expect(relacionEnNorma(desvioPct(teo * 1.006, teo))).toBe(false)
    expect(relacionEnNorma(desvioPct(teo * 0.994, teo))).toBe(false)
  })

  it('sin medida no dice ni que sí ni que no', () => {
    // Es la diferencia entre "no lo medí" y "lo medí y está mal". Si esto
    // devolviera false, un punto sin medir pintaría en rojo y rechazaría
    // el ensayo entero.
    expect(desvioPct(undefined, teo)).toBeUndefined()
    expect(relacionEnNorma(undefined)).toBeUndefined()
  })

  it('con teórica cero no calcula desvío en vez de devolver Infinity', () => {
    expect(desvioPct(57, 0)).toBeUndefined()
    expect(relacionEnNorma(desvioPct(57, 0))).toBeUndefined()
  })
})

describe('aislamiento · RAD e IP', () => {
  it('RAD es R60/R30 e IP es R600/R60', () => {
    expect(radDe(100, 150)).toBeCloseTo(1.5, 9)
    expect(ipDe(150, 450)).toBeCloseTo(3, 9)
  })

  it('un aislamiento que no absorbe da RAD e IP cercanos a 1', () => {
    // Si la resistencia no sube con el tiempo, el dieléctrico está húmedo o
    // sucio: las tres lecturas iguales tienen que dar 1, no 0 ni undefined.
    expect(radDe(500, 500)).toBeCloseTo(1, 9)
    expect(ipDe(500, 500)).toBeCloseTo(1, 9)
  })

  it('sin la lectura de base no hay cociente posible', () => {
    expect(radDe(0, 150)).toBeUndefined()
    expect(radDe(undefined, 150)).toBeUndefined()
    expect(ipDe(150, undefined)).toBeUndefined()
    expect(ipDe(0, 450)).toBeUndefined()
  })
})

describe('aislamiento · lectura del IP (IEEE 43)', () => {
  it('clasifica según los rangos clásicos', () => {
    expect(lecturaIP(0.8)).toBe('pobre')
    expect(lecturaIP(1.5)).toBe('dudoso')
    expect(lecturaIP(3)).toBe('bueno')
    expect(lecturaIP(5)).toBe('excelente')
  })

  it('los cortes son 1, 2 y 4, y el borde cae en el rango de arriba', () => {
    expect(lecturaIP(0.99)).toBe('pobre')
    expect(lecturaIP(1)).toBe('dudoso')
    expect(lecturaIP(2)).toBe('bueno')
    expect(lecturaIP(4)).toBe('excelente')
  })

  it('sin dato no inventa una clasificación', () => {
    expect(lecturaIP(undefined)).toBe('sin_dato')
    expect(lecturaIP(NaN)).toBe('sin_dato')
  })
})
