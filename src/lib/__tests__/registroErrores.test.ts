import { describe, expect, it } from 'vitest'
import { debeAnotar } from '../registroErrores'

// ============================================================
// v2.67 — El registro automático de errores no puede inundar la base: el
// mismo error se anota una vez cada 15 minutos (el resto se cuenta).
// ============================================================
describe('registro de errores: anti-inundación', () => {
  it('el primero se anota; el mismo en los 15 minutos siguientes, no', () => {
    const reg = new Map<string, { en: number; repeticiones: number }>()
    expect(debeAnotar('sync|timeout', 0, reg)).toBe(true)
    expect(debeAnotar('sync|timeout', 5 * 60000, reg)).toBe(false)
    expect(debeAnotar('sync|timeout', 10 * 60000, reg)).toBe(false)
    expect(reg.get('sync|timeout')!.repeticiones).toBe(3)
  })

  it('pasados los 15 minutos se vuelve a anotar', () => {
    const reg = new Map<string, { en: number; repeticiones: number }>()
    debeAnotar('sync|timeout', 0, reg)
    expect(debeAnotar('sync|timeout', 16 * 60000, reg)).toBe(true)
  })

  it('errores distintos se anotan por separado', () => {
    const reg = new Map<string, { en: number; repeticiones: number }>()
    expect(debeAnotar('sync|timeout', 0, reg)).toBe(true)
    expect(debeAnotar('pantalla|x is undefined', 1000, reg)).toBe(true)
  })
})
