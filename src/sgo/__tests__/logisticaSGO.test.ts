import { describe, expect, it } from 'vitest'
import {
  auditoriaCompleta, calcularCumplimientoAuditoria, calcularCubicaje, checklistDesdePlantilla,
  type EspacioCarga, type ItemCarga, type PuntoAuditoriaLogistica,
} from '../logistica'

describe('auditoría logística', () => {
  it('calcula cumplimiento excluyendo los puntos no aplicables', () => {
    const puntos: PuntoAuditoriaLogistica[] = [
      { id: '1', label: 'A', pilar: 'calidad', estado: 'conforme' },
      { id: '2', label: 'B', pilar: 'calidad', estado: 'conforme' },
      { id: '3', label: 'C', pilar: 'calidad', estado: 'no_conforme' },
      { id: '4', label: 'D', pilar: 'calidad', estado: 'no_aplica' },
    ]
    expect(calcularCumplimientoAuditoria(puntos)).toBe(67)
    expect(auditoriaCompleta(puntos)).toBe(true)
  })

  it('crea todos los puntos pendientes desde cada plantilla', () => {
    const puntos = checklistDesdePlantilla('embalaje_carga')
    expect(puntos.length).toBeGreaterThan(5)
    expect(puntos.every((p) => p.estado === 'pendiente')).toBe(true)
    expect(auditoriaCompleta(puntos)).toBe(false)
  })
})

describe('cubicaje', () => {
  const espacio: EspacioCarga = { nombre: 'Prueba', largoM: 2, anchoM: 1, altoM: 1, cargaMaxKg: 1000 }
  const base: ItemCarga = { id: 'a', descripcion: 'Caja', cantidad: 2, largoM: 1, anchoM: 1, altoM: 1, pesoKg: 100, rotatable: true, apilable: false, color: '#000' }

  it('ubica dos unidades que ocupan todo el espacio', () => {
    const resultado = calcularCubicaje([base], espacio)
    expect(resultado.usoVolumenPct).toBe(100)
    expect(resultado.unidadesNoUbicadas).toBe(0)
    expect(resultado.ubicaciones).toHaveLength(2)
  })

  it('advierte cuando se supera la carga máxima', () => {
    const resultado = calcularCubicaje([{ ...base, pesoKg: 600 }], espacio)
    expect(resultado.usoPesoPct).toBe(120)
    expect(resultado.advertencias.some((a) => a.includes('peso total'))).toBe(true)
  })

  it('considera capas para bultos apilables iguales', () => {
    const resultado = calcularCubicaje([{ ...base, cantidad: 3, apilable: true }], { ...espacio, largoM: 1, altoM: 3 })
    expect(resultado.unidadesNoUbicadas).toBe(0)
    expect(resultado.ubicaciones[0].unidades).toBe(3)
  })
})
