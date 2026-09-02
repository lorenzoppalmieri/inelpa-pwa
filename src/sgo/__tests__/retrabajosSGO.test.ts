import { describe, expect, it } from 'vitest'
import {
  crearDatosRetrabajo,
  esEventoRetrabajo,
  estadoInvestigacionRetrabajo,
  nivelInvestigacionRetrabajo,
  semaforoSLAInvestigacion,
  validarCierreRetrabajo,
} from '../retrabajos'
import type { AccionSGO, EventoSGO } from '../types'

const detectadoEn = '2026-08-19T10:00:00.000Z'
const eventoBase: EventoSGO = {
  id: 'r1', codigo: 'SGO-2026-R1', tipo: 'no_conformidad', pilar: 'calidad',
  titulo: 'Retrabajo en bobinado', descripcion: 'Aislación fuera de posición.',
  severidad: 'media', estado: 'abierto', areaId: 'bobinado_rural', responsable: 'Lara',
  detectadoEn, detectadoPor: 'operario', creadoEn: detectadoEn, actualizadoEn: detectadoEn,
  retrabajo: crearDatosRetrabajo('parada_calidad', detectadoEn),
}

const accion: AccionSGO = {
  id: 'a1', eventoId: eventoBase.id, tipo: 'correctiva', descripcion: 'Estandarizar posición de aislación',
  responsable: 'Encargado', fechaCompromiso: '2026-08-25', estado: 'pendiente',
  creadoEn: detectadoEn, creadoPor: 'Lara', actualizadoEn: detectadoEn,
}

describe('circuito simplificado de investigaciones de retrabajo', () => {
  it('asigna a Lara y fija SLA de toma e investigación', () => {
    expect(eventoBase.retrabajo?.asignadoA).toBe('Lara')
    expect(eventoBase.retrabajo?.fechaLimiteToma).toBe('2026-08-20T10:00:00.000Z')
    expect(eventoBase.retrabajo?.fechaLimiteInvestigacion).toBe('2026-08-22T10:00:00.000Z')
  })

  it('separa una parada de calidad común de un retrabajo explícito', () => {
    expect(esEventoRetrabajo({ ...eventoBase, retrabajo: { ...eventoBase.retrabajo!, causaId: 'calidad_alambre', causaRegistrada: 'Problemas calidad del alambre o planchuela' } })).toBe(false)
    expect(esEventoRetrabajo({ ...eventoBase, retrabajo: { ...eventoBase.retrabajo!, causaId: 'retrabajo', causaRegistrada: 'Retrabajo' } })).toBe(true)
    expect(esEventoRetrabajo({ ...eventoBase, retrabajo: { ...eventoBase.retrabajo!, causaId: 'calidad_alambre', decisionCalidad: 'investigar' } })).toBe(true)
    expect(esEventoRetrabajo({ ...eventoBase, retrabajo: { ...eventoBase.retrabajo!, causaId: 'retrabajo', decisionCalidad: 'descartada' } })).toBe(false)
  })

  it('permite resolver un caso simple sin exigir una acción correctiva', () => {
    expect(estadoInvestigacionRetrabajo(eventoBase, [])).toBe('nuevo')
    const resuelto: EventoSGO = {
      ...eventoBase,
      causaRaiz: 'Ajuste incorrecto del tope', contencion: 'Se corrigió la posición', disposicion: 'retrabajo',
      retrabajo: {
        ...eventoBase.retrabajo!, tomadoEn: '2026-08-19T11:00:00.000Z', tomadoPor: 'Lara',
        modalidadCosto: 'sin_costo', costosRevisados: true, resultadoResolucion: 'Pieza corregida y controlada',
      },
    }
    expect(estadoInvestigacionRetrabajo(resuelto, [])).toBe('listo_cierre')
    expect(validarCierreRetrabajo({ ...resuelto, estado: 'cerrado' }, [])).toEqual([])
    expect(estadoInvestigacionRetrabajo(resuelto, [accion])).toBe('con_acciones')
  })

  it('acepta la verificación documentada como resultado en expedientes anteriores', () => {
    const historico: EventoSGO = {
      ...eventoBase,
      causaRaiz: 'Se utilizó una cuba alternativa.', contencion: 'Se adecuaron los prensayugos.', disposicion: 'retrabajo',
      retrabajo: {
        ...eventoBase.retrabajo!, tomadoEn: '2026-08-31T10:00:00.000Z', tomadoPor: 'Lara',
        modalidadCosto: 'sin_costo', costosRevisados: true, resultadoVerificacion: 'eficaz',
        observacionVerificacion: 'Se verificó la adecuación y la unidad quedó conforme.',
      },
    }
    expect(estadoInvestigacionRetrabajo(historico, [])).toBe('listo_cierre')
    expect(validarCierreRetrabajo({ ...historico, estado: 'cerrado' }, [])).toEqual([])
  })

  it('eleva automáticamente a crítica una reincidencia', () => {
    const reincidente: EventoSGO = {
      ...eventoBase,
      retrabajo: { ...eventoBase.retrabajo!, nivelInvestigacion: 'simple', reincidente: true },
    }
    expect(nivelInvestigacionRetrabajo(reincidente)).toBe('critica')
  })

  it('marca vencimiento y devuelve una sola lista de requisitos pendientes', () => {
    expect(semaforoSLAInvestigacion(eventoBase, '2026-08-21T10:00:00.000Z')).toEqual({ tono: 'rojo', label: 'Vencido' })
    expect(validarCierreRetrabajo({ ...eventoBase, estado: 'cerrado' }, [])).toEqual(expect.arrayContaining([
      'Tomar la investigación.',
      'Registrar la corrección realizada.',
      'Elegir cómo se registrará el costo del retrabajo.',
    ]))
  })
})
