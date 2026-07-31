import { describe, expect, it } from 'vitest'
import { fechaLocalISO, periodoLocalISO, sumarDiasLocalISO } from '../../lib/time'
import { validarCierreEvento } from '../cierre'
import { aplicarMedicionesIndicadores, estadoIndicador, normalizarPeriodoKPI, type IndicadorSGO, type MedicionIndicadorSGO } from '../indicadores'
import { erroresConsistenciaGarantia, type GarantiaISO } from '../garantias'
import type { AccionSGO, EventoSGO } from '../types'

const indicador: IndicadorSGO = {
  id: 'kpi-1', areaId: 'bobinado_rural', pilar: 'calidad', nombre: 'Retrabajos',
  unidad: 'cantidad', direccion: 'menor_mejor', meta: 0, umbralAmarillo: 2,
  periodo: '2026-07', frecuencia: 'mensual', activo: true,
  actualizadoEn: '2026-07-31T12:00:00Z', actualizadoPor: 'lorenzo', origen: 'manual',
}

const eventoBase: EventoSGO = {
  id: 'evento-1', codigo: 'SGO-2026-TEST', tipo: 'no_conformidad', pilar: 'calidad',
  titulo: 'Desvío', descripcion: 'Descripción', severidad: 'alta', estado: 'cerrado',
  areaId: 'laboratorio', areaOrigenId: 'bobinado_rural', detectadoEn: '2026-07-30T12:00:00Z',
  detectadoPor: 'gestionsgo', contencion: 'Producto segregado', causaRaiz: 'Método incorrecto',
  metodoAnalisis: '5_porques', disposicion: 'retrabajo', evidenciaUrls: ['acta-123'],
  creadoEn: '2026-07-30T12:00:00Z', actualizadoEn: '2026-07-31T12:00:00Z',
}

const accionVerificada: AccionSGO = {
  id: 'accion-1', eventoId: eventoBase.id, tipo: 'correctiva', descripcion: 'Actualizar método',
  responsable: 'Nico', fechaCompromiso: '2026-07-31', estado: 'verificada',
  evidencia: 'instructivo-v2', completadaEn: '2026-07-31T10:00:00Z',
  verificadaEn: '2026-07-31T11:00:00Z', eficaz: true,
  creadoEn: '2026-07-30T12:00:00Z', creadoPor: 'Azul', actualizadoEn: '2026-07-31T11:00:00Z',
}

function garantiaBase(): GarantiaISO {
  return {
    id: 'g-1', codigo: 'GAR-1', tipo: 'TTD', fechaSalida: '2026-07-01',
    fechaDeteccion: '2026-07-10', diagnostico: 'Pérdida', cobertura: 'si',
    categoria: 'perdida_aceite', estado: 'abierto', verificado: false,
    creadoEn: '2026-07-10T12:00:00Z', actualizadoEn: '2026-07-10T12:00:00Z',
    actualizadoPor: 'Azul',
  }
}

describe('fechas calendario local', () => {
  it('no adelanta el día por conversión UTC', () => {
    const local = new Date(2026, 6, 31, 23, 30)
    expect(fechaLocalISO(local)).toBe('2026-07-31')
    expect(periodoLocalISO(local)).toBe('2026-07')
  })

  it('suma días respetando el calendario local', () => {
    expect(sumarDiasLocalISO(1, new Date(2026, 6, 31, 23))).toBe('2026-08-01')
  })
})

describe('indicadores y mediciones', () => {
  it('normaliza períodos trimestrales', () => {
    expect(normalizarPeriodoKPI('2026-08', 'trimestral')).toBe('2026-07')
  })

  it('usa la medición del período sin perder las anteriores', () => {
    const mediciones: MedicionIndicadorSGO[] = [
      { id: 'm1', indicadorId: indicador.id, periodo: '2026-06', valor: 3, cerrado: true, registradoEn: '', registradoPor: 'Azul', actualizadoEn: '', actualizadoPor: 'Azul' },
      { id: 'm2', indicadorId: indicador.id, periodo: '2026-07', valor: 1, cerrado: false, registradoEn: '', registradoPor: 'Nico', actualizadoEn: '', actualizadoPor: 'Nico' },
    ]
    const [resuelto] = aplicarMedicionesIndicadores([indicador], mediciones)
    expect(resuelto.valorActual).toBe(1)
    expect(estadoIndicador(resuelto)).toBe('amarillo')
    expect(mediciones).toHaveLength(2)
  })
})

describe('cierre controlado', () => {
  it('acepta un expediente completo y eficaz', () => {
    expect(validarCierreEvento(eventoBase, [accionVerificada])).toEqual([])
  })

  it('rechaza cierre sin causa, método ni acciones', () => {
    const incompleto = { ...eventoBase, causaRaiz: undefined, metodoAnalisis: undefined }
    expect(validarCierreEvento(incompleto, [])).toEqual(expect.arrayContaining([
      'Completar la causa raíz.',
      'Seleccionar el método de análisis.',
      'Registrar al menos una acción.',
    ]))
  })

  it('rechaza acciones sin eficacia confirmada', () => {
    expect(validarCierreEvento(eventoBase, [{ ...accionVerificada, eficaz: false }])).toContain('Confirmar la eficacia de todas las acciones no canceladas.')
  })
})

describe('consistencia de garantías', () => {
  it('exige fecha y explicación para verificar', () => {
    const g = { ...garantiaBase(), estado: 'verificado' as const, verificado: true }
    expect(erroresConsistenciaGarantia(g)).toEqual(expect.arrayContaining([
      'La verificación requiere fecha de resolución.',
      'La verificación requiere una explicación.',
    ]))
  })

  it('rechaza cronología inválida', () => {
    const g = { ...garantiaBase(), fechaResolucion: '2026-07-05' }
    expect(erroresConsistenciaGarantia(g)).toContain('La resolución no puede ser anterior a la detección.')
  })
})
