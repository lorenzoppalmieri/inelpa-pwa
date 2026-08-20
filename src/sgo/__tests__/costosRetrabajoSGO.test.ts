import { describe, expect, it } from 'vitest'
import { aplicarCosteoRetrabajo, calcularCostosRetrabajo, crearCosteoRetrabajo, TARIFARIO_COSTOS_BASE } from '../costosRetrabajo'
import type { EventoSGO } from '../types'

const evento: EventoSGO = {
  id: 'costo-1', codigo: 'SGO-COSTO-1', tipo: 'no_conformidad', pilar: 'calidad',
  titulo: 'Retrabajo', descripcion: 'Prueba de costeo', severidad: 'media', estado: 'en_analisis',
  detectadoEn: '2026-08-20T10:00:00.000Z', detectadoPor: 'Lara', creadoEn: '2026-08-20T10:00:00.000Z', actualizadoEn: '2026-08-20T10:00:00.000Z',
  retrabajo: {
    origen: 'parada_calidad', asignadoA: 'Lara', fechaLimiteToma: '2026-08-21T10:00:00.000Z',
    fechaLimiteInvestigacion: '2026-08-23T10:00:00.000Z', tomadoEn: '2026-08-20T11:00:00.000Z', tomadoPor: 'Lara',
  },
}

describe('calculadora de costos de retrabajo', () => {
  it('duplica el costo productivo de una hora hombre', () => {
    const costeo = { ...crearCosteoRetrabajo(TARIFARIO_COSTOS_BASE), horasCorreccion: 1, personasInvolucradas: 1 }
    expect(calcularCostosRetrabajo(costeo).manoObra).toBe(29000)
  })

  it('calcula cobre o aluminio mediante una selección exclusiva', () => {
    const base = crearCosteoRetrabajo(TARIFARIO_COSTOS_BASE)
    expect(calcularCostosRetrabajo({ ...base, materialTipo: 'cobre', materialKg: 2 }).material).toBe(44000)
    expect(calcularCostosRetrabajo({ ...base, materialTipo: 'aluminio', materialKg: 2 }).material).toBe(24000)
  })

  it('guarda la copia del tarifario y el total desglosado en el evento', () => {
    const costeo = {
      ...crearCosteoRetrabajo(TARIFARIO_COSTOS_BASE),
      horasCorreccion: 1,
      personasInvolucradas: 1,
      materialTipo: 'cobre' as const,
      materialKg: 1,
      ensayosCosto: 1000,
    }
    const actualizado = aplicarCosteoRetrabajo(evento, costeo)
    expect(actualizado.costoDetalle).toMatchObject({ manoObra: 29000, material: 22000, ensayos: 1000 })
    expect(actualizado.costoEstimado).toBe(52000)
    expect(actualizado.retrabajo?.costeo?.tarifario.horaHombre).toBe(14500)
  })
})
