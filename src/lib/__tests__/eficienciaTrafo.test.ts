import { describe, expect, it } from 'vitest'
import {
  pccATemperatura, calcularEficiencia, K_COBRE,
  type ResultadoCortocircuito, type Nominales,
} from '../ensayoPerdidas'

// ============================================================
// v1.101 — Rendimiento de la máquina y corrección de Pcc a otra temperatura.
//
// POR QUÉ EXISTEN ESTOS TESTS: un rendimiento mal calculado no se ve raro. Da
// 98 y pico igual, que es lo que uno espera de un transformador de
// distribución, así que nadie lo mira dos veces. Los dos errores que se comen
// esa clase de cálculo son:
//
//   1. Olvidar el CUADRADO del factor de carga en las pérdidas de
//      cortocircuito. Da rendimientos demasiado buenos a carga parcial.
//   2. Corregir Joule y Skin para el mismo lado. Joule sube con la temperatura
//      y Skin baja; corregir las dos hacia arriba infla Pcc y hunde el
//      rendimiento (y al revés).
//
// Los dos casos tienen su test abajo y los dos fallarían con un número que
// igual parecería creíble.
//
// Máquina de referencia: 315 kVA, cobre. Medido: P0 = 600 W, Joule = 3200 W y
// Skin = 300 W a tcc = 25 °C.
// ============================================================

const NOM: Nominales = { snKVA: 315 }
const CC: ResultadoCortocircuito = { pj: 3200, ps: 300 }
const TCC = 25
const T_REF = 75
const P0 = 600

describe('Pcc llevada a otra temperatura', () => {
  it('a la misma temperatura del ensayo devuelve Joule + Skin sin tocar', () => {
    expect(pccATemperatura(CC, 'cobre', TCC, TCC)).toBeCloseTo(3500, 9)
  })

  it('Joule SUBE y Skin BAJA al subir la temperatura', () => {
    const joule = 3200 * ((K_COBRE + T_REF) / (K_COBRE + TCC))
    const skin = 300 * ((K_COBRE + TCC) / (K_COBRE + T_REF))
    expect(joule).toBeGreaterThan(3200)      // el cobre conduce peor caliente
    expect(skin).toBeLessThan(300)           // las parásitas aflojan
    expect(pccATemperatura(CC, 'cobre', TCC, T_REF)).toBeCloseTo(joule + skin, 9)
  })

  it('no corrige las dos para el mismo lado', () => {
    // El error clásico sería `pj*subir + ps*subir`. Este test lo agarra: el
    // resultado correcto tiene que quedar por DEBAJO de esa cuenta.
    const subir = (K_COBRE + T_REF) / (K_COBRE + TCC)
    const ambasArriba = (3200 + 300) * subir
    expect(pccATemperatura(CC, 'cobre', TCC, T_REF)!).toBeLessThan(ambasArriba)
  })

  it('el aluminio corrige distinto que el cobre', () => {
    const cu = pccATemperatura(CC, 'cobre', TCC, T_REF)!
    const al = pccATemperatura(CC, 'aluminio', TCC, T_REF)!
    expect(al).not.toBeCloseTo(cu, 6)
  })

  it('sin Skin, sin Joule o sin temperatura de ensayo no corrige', () => {
    // Skin sale de Pcc medida menos Joule calculado: si faltan las resistencias
    // no existe, y devolver sólo el Joule sería mentir por defecto.
    expect(pccATemperatura({ pj: 3200 }, 'cobre', TCC, T_REF)).toBeUndefined()
    expect(pccATemperatura({ ps: 300 }, 'cobre', TCC, T_REF)).toBeUndefined()
    expect(pccATemperatura(CC, 'cobre', undefined, T_REF)).toBeUndefined()
    expect(pccATemperatura(CC, 'cobre', TCC, undefined)).toBeUndefined()
  })
})

describe('rendimiento', () => {
  const pcc75 = pccATemperatura(CC, 'cobre', TCC, T_REF)!

  it('a plena carga da un valor típico de un trafo de distribución', () => {
    const r = calcularEficiencia(NOM, P0, pcc75, 1)
    expect(r.rendimientoPct).toBeGreaterThan(98)
    expect(r.rendimientoPct).toBeLessThan(99)
    expect(r.rendimientoPct).toBeCloseTo((315000 / (315000 + P0 + pcc75)) * 100, 9)
  })

  it('las pérdidas de cortocircuito van con el CUADRADO del factor de carga', () => {
    // A media carga, Pcc aporta la CUARTA parte, no la mitad.
    const r = calcularEficiencia(NOM, P0, pcc75, 0.5)
    expect(r.perdidas).toBeCloseTo(P0 + 0.25 * pcc75, 9)
    expect(r.perdidas).not.toBeCloseTo(P0 + 0.5 * pcc75, 3)
  })

  it('las pérdidas en vacío NO dependen de la carga', () => {
    // El núcleo está excitado siempre: P0 entero aparece a cualquier carga.
    const r = calcularEficiencia(NOM, P0, pcc75, 0.25)
    expect(r.perdidas! - Math.pow(0.25, 2) * pcc75).toBeCloseTo(P0, 9)
  })

  it('rinde mejor a media carga que a plena', () => {
    // Consecuencia del fc²: es el comportamiento real de un transformador y la
    // razón por la que se dimensionan por debajo del nominal.
    const plena = calcularEficiencia(NOM, P0, pcc75, 1).rendimientoPct!
    const media = calcularEficiencia(NOM, P0, pcc75, 0.5).rendimientoPct!
    expect(media).toBeGreaterThan(plena)
  })

  it('nunca da 100 % ni más', () => {
    for (const fc of [0.1, 0.25, 0.5, 0.75, 1, 1.2]) {
      const r = calcularEficiencia(NOM, P0, pcc75, fc).rendimientoPct!
      expect(r).toBeGreaterThan(0)
      expect(r).toBeLessThan(100)
    }
  })

  it('con carga cero no informa rendimiento', () => {
    // Sería 0 %, que es cierto y no dice nada: el trafo igual consume P0.
    // Mejor no mostrar número que mostrar uno que se lee como una falla.
    expect(calcularEficiencia(NOM, P0, pcc75, 0).rendimientoPct).toBeUndefined()
    expect(calcularEficiencia(NOM, P0, pcc75, -1).rendimientoPct).toBeUndefined()
  })

  it('si falta cualquiera de los tres datos, no calcula', () => {
    expect(calcularEficiencia(NOM, undefined, pcc75, 1).rendimientoPct).toBeUndefined()
    expect(calcularEficiencia(NOM, P0, undefined, 1).rendimientoPct).toBeUndefined()
    expect(calcularEficiencia({}, P0, pcc75, 1).rendimientoPct).toBeUndefined()
    expect(calcularEficiencia({ snKVA: 0 }, P0, pcc75, 1).rendimientoPct).toBeUndefined()
  })

  it('una máquina con menos pérdidas rinde más', () => {
    const buena = calcularEficiencia(NOM, 400, pcc75, 1).rendimientoPct!
    const mala = calcularEficiencia(NOM, 900, pcc75, 1).rendimientoPct!
    expect(buena).toBeGreaterThan(mala)
  })
})
