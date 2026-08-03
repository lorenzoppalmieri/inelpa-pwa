import { describe, expect, it } from 'vitest'
import {
  TARIMAS_INELPA, auditoriaCompleta, calcularCumplimientoAuditoria, calcularCubicaje, checklistDesdePlantilla,
  evaluarDistribucion, type EspacioCarga, type ItemCarga, type PiezaUbicada, type PuntoAuditoriaLogistica,
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

  it('incorpora las cuatro tarimas de los planos por rango de transformador', () => {
    expect(TARIMAS_INELPA.map((t) => [t.id, t.rangoTransformador, t.largoM, t.anchoM])).toEqual([
      ['F1', 'TTD16 a TTD40', 1.2, 0.6],
      ['F2', 'TTD63 a TTD200', 1.3, 0.8],
      ['F3', 'TTD250 a TTD500', 1.5, 1],
      ['F4', 'TTD630 a TTD1000', 1.95, 1.1],
    ])
  })

  it('permite ubicar la huella aunque falten altura y peso', () => {
    const resultado = calcularCubicaje([{ ...base, cantidad: 1, altoM: 0, pesoKg: 0 }], espacio)
    expect(resultado.ubicaciones).toHaveLength(1)
    expect(resultado.volumenCargaM3).toBe(0)
    expect(resultado.pesoTotalKg).toBe(0)
    expect(resultado.advertencias.some((a) => a.includes('altura y peso'))).toBe(true)
  })

  it('detecta pallets superpuestos o fuera de los límites del camión', () => {
    const pieza = (id: string, xM: number, yM: number): PiezaUbicada => ({
      id, itemId: id, descripcion: id, xM, yM, largoM: 1, anchoM: 1, altoM: 1, unidades: 1, color: '#000',
    })
    const evaluacion = evaluarDistribucion([pieza('a', 0, 0), pieza('b', .5, 0), pieza('c', 1.5, .5)], espacio)
    expect(evaluacion.valida).toBe(false)
    expect(evaluacion.superpuestos).toEqual(expect.arrayContaining(['a', 'b']))
    expect(evaluacion.fueraDeLimites).toContain('c')
  })
})
