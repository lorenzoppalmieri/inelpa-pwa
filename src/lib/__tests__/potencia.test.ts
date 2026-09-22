import { describe, expect, it } from 'vitest'
import { potenciaKVA, promedioKVA } from '../potencia'

describe('potencia del modelo', () => {
  it('lee el primer número del par', () => {
    expect(potenciaKVA('TTD 315/13')).toBe(315)
    expect(potenciaKVA('TTR 16/13')).toBe(16)
    expect(potenciaKVA('TTR 33/13')).toBe(33)
    expect(potenciaKVA('TMR 5/19')).toBe(5)
  })

  it('aguanta las potencias grandes', () => {
    expect(potenciaKVA('TTD 1000/13')).toBe(1000)
    expect(potenciaKVA('TTD 2000/33')).toBe(2000)
  })

  it('ignora el resto de la descripción', () => {
    expect(potenciaKVA('TTD 315/13 - Tanque Expansion - Plataforma - Cobre')).toBe(315)
    expect(potenciaKVA('TTD 40/13 - Llenado Integral - Monoposte - Aluminio')).toBe(40)
    expect(potenciaKVA('TBR 25/13 - Monoposte - Cobre - TIPO EDENOR')).toBe(25)
  })

  it('EL CASO TRAMPA: subtransmisión y medición ponen la potencia suelta', () => {
    // Acá el par 33/13,86 son las DOS tensiones; la potencia va antes.
    expect(potenciaKVA('TTS 200 33/13,86')).toBe(200)
    expect(potenciaKVA('TTS 630 33/13,86 - Reductor')).toBe(630)
    expect(potenciaKVA('TAM 400 13,2/19,05')).toBe(400)
  })

  it('MVA se convierte a kVA', () => {
    expect(potenciaKVA('TTS 10 MVA 33/13,86')).toBe(10000)
    expect(potenciaKVA('TTS 12,5 MVA 13,2/34,65')).toBe(12500)
  })

  it('devuelve null en vez de inventar', () => {
    expect(potenciaKVA(undefined)).toBeNull()
    expect(potenciaKVA('')).toBeNull()
    expect(potenciaKVA('Reparación de tapa golpeada')).toBeNull()
    expect(potenciaKVA('PROTOTIPO')).toBeNull()
    expect(potenciaKVA('TTD')).toBeNull()
  })
})

describe('promedio', () => {
  it('promedia lo que puede leer', () => {
    expect(promedioKVA(['TTD 100/13', 'TTD 200/13'])).toBe(150)
  })

  it('descarta lo ilegible sin romper el promedio', () => {
    // El texto suelto no debe contar como 0 ni bajar el promedio.
    expect(promedioKVA(['TTD 100/13', 'Reparación varias', 'TTD 200/13'])).toBe(150)
  })

  it('sin nada legible devuelve null', () => {
    expect(promedioKVA(['Reparación', undefined])).toBeNull()
    expect(promedioKVA([])).toBeNull()
  })
})
