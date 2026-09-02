import { describe, expect, it } from 'vitest'
import type { Parada } from '../../types'
import { estadoRevisionParadaCalidad, esParadaDeCalidad, esRetrabajoExplicito, mesAnteriorISO, nivelRecurrencia, variacionPorcentual } from '../paradasCalidad'
import type { EventoSGO } from '../types'

const parada: Parada = { id: 'p1', tareaId: 't1', causa: 'calidad_alambre', inicio: '2026-09-01T10:00:00Z' }

describe('clasificación de paradas de calidad', () => {
  it('distingue calidad operativa de retrabajo explícito', () => {
    expect(esParadaDeCalidad(parada)).toBe(true)
    expect(esRetrabajoExplicito(parada)).toBe(false)
    expect(esRetrabajoExplicito({ ...parada, causa: 'retrabajo' })).toBe(true)
  })

  it('mantiene trazable el descarte y la promoción a investigación', () => {
    expect(estadoRevisionParadaCalidad(parada)).toBe('pendiente')
    expect(estadoRevisionParadaCalidad({ ...parada, ncDescartada: true })).toBe('descartada')
    const evento = { retrabajo: { origen: 'parada_calidad', decisionCalidad: 'investigar' } } as EventoSGO
    expect(estadoRevisionParadaCalidad(parada, evento)).toBe('investigando')
  })

  it('calcula comparación mensual y nivel de recurrencia', () => {
    expect(mesAnteriorISO('2026-01')).toBe('2025-12')
    expect(variacionPorcentual(12, 10)).toBe(20)
    expect(variacionPorcentual(2, 0)).toBeUndefined()
    expect(nivelRecurrencia(3, 10)).toBe('prioritaria')
    expect(nivelRecurrencia(1, 35)).toBe('atencion')
  })
})
