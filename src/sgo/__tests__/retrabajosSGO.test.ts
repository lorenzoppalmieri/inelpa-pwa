import { describe, expect, it } from 'vitest'
import {
  AREAS_ORIGEN_RETRABAJO,
  crearDatosRetrabajo,
  esEventoRetrabajo,
  faltaAreaOrigen,
  estadoInvestigacionRetrabajo,
  nivelInvestigacionRetrabajo,
  semaforoSLAInvestigacion,
  validarCierreRetrabajo,
} from '../retrabajos'
import { aplicarCosteoRetrabajo, crearCosteoRetrabajo, materialSinValorizar, TARIFARIO_COSTOS_BASE } from '../costosRetrabajo'
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
        clasificacionCausa: 'metodo',
      },
    }
    expect(estadoInvestigacionRetrabajo(resuelto, [])).toBe('listo_cierre')
    // v2.51: sin clasificar la causa, el caso simple no queda listo para cerrar.
    const sinClasificar: EventoSGO = { ...resuelto, retrabajo: { ...resuelto.retrabajo!, clasificacionCausa: undefined } }
    expect(estadoInvestigacionRetrabajo(sinClasificar, [])).toBe('en_investigacion')
    expect(validarCierreRetrabajo({ ...sinClasificar, estado: 'cerrado' }, [])).toContain('Clasificar la causa (persona, método, máquina, material…).')
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
        observacionVerificacion: 'Se verificó la adecuación y la unidad quedó conforme.', clasificacionCausa: 'material',
      },
    }
    expect(estadoInvestigacionRetrabajo(historico, [])).toBe('listo_cierre')
    expect(validarCierreRetrabajo({ ...historico, estado: 'cerrado' }, [])).toEqual([])
  })

  // v2.52 — Un rechazo de Laboratorio tiene que decir qué área generó el defecto.
  it('el rechazo de laboratorio exige el área de origen; los demás orígenes no', () => {
    const lab: EventoSGO = { ...eventoBase, areaId: 'laboratorio', areaOrigenId: undefined, retrabajo: crearDatosRetrabajo('laboratorio', detectadoEn) }
    expect(faltaAreaOrigen(lab)).toBe(true)
    expect(validarCierreRetrabajo({ ...lab, estado: 'cerrado' }, [])).toContain('Indicar el área donde se originó el defecto.')
    expect(faltaAreaOrigen({ ...lab, areaOrigenId: 'bobinado_rural' })).toBe(false)
    expect(faltaAreaOrigen({ ...eventoBase, areaOrigenId: undefined })).toBe(false) // parada de calidad
    expect(AREAS_ORIGEN_RETRABAJO.some((a) => a.id === 'rrhh')).toBe(false)
  })

  it('eleva automáticamente a crítica una reincidencia', () => {
    const reincidente: EventoSGO = {
      ...eventoBase,
      retrabajo: { ...eventoBase.retrabajo!, nivelInvestigacion: 'simple', reincidente: true },
    }
    expect(nivelInvestigacionRetrabajo(reincidente)).toBe('critica')
  })

  // v2.47 — El valor del material perdido es OPCIONAL para cerrar.
  it('cierra un costeo detallado aunque el material no esté valorizado', () => {
    const costeo = { ...crearCosteoRetrabajo(TARIFARIO_COSTOS_BASE), horasCorreccion: 1, personasInvolucradas: 1 }
    const base: EventoSGO = {
      ...eventoBase,
      causaRaiz: 'Ajuste incorrecto del tope', contencion: 'Se corrigió la posición', disposicion: 'retrabajo',
      retrabajo: { ...eventoBase.retrabajo!, tomadoEn: '2026-08-19T11:00:00.000Z', tomadoPor: 'Lara', resultadoResolucion: 'Pieza corregida', clasificacionCausa: 'metodo' },
    }
    const cobreSinKg = aplicarCosteoRetrabajo(base, { ...costeo, materialTipo: 'cobre' })
    expect(materialSinValorizar(cobreSinKg.retrabajo?.costeo)).toBe(true)
    expect(validarCierreRetrabajo({ ...cobreSinKg, estado: 'cerrado' }, [])).toEqual([])

    const otroSinValor = aplicarCosteoRetrabajo(base, { ...costeo, materialTipo: 'otro', materialDescripcion: 'Papel aislante' })
    expect(validarCierreRetrabajo({ ...otroSinValor, estado: 'cerrado' }, [])).toEqual([])

    // Qué material fue sí se sigue pidiendo si se eligió "otro".
    const otroSinDescripcion = aplicarCosteoRetrabajo(base, { ...costeo, materialTipo: 'otro' })
    expect(validarCierreRetrabajo({ ...otroSinDescripcion, estado: 'cerrado' }, [])).toContain('Describir el otro material perdido.')

    const valorizado = aplicarCosteoRetrabajo(base, { ...costeo, materialTipo: 'cobre', materialKg: 2 })
    expect(materialSinValorizar(valorizado.retrabajo?.costeo)).toBe(false)
    expect(materialSinValorizar({ ...costeo, materialTipo: 'ninguno' })).toBe(false)
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
