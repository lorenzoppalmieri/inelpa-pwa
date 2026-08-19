import { describe, expect, it } from 'vitest'
import {
  crearDatosRetrabajo,
  estadoInvestigacionRetrabajo,
  semaforoSLAInvestigacion,
  validarCierreRetrabajo,
} from '../retrabajos'
import type { AccionSGO, EventoSGO } from '../types'

const detectadoEn = '2026-08-19T10:00:00.000Z'
const eventoBase: EventoSGO = {
  id: 'r1', codigo: 'SGO-2026-R1', tipo: 'no_conformidad', pilar: 'calidad',
  titulo: 'Retrabajo en bobinado', descripcion: 'Aislacion fuera de posicion.',
  severidad: 'media', estado: 'abierto', areaId: 'bobinado_rural', responsable: 'Lara',
  detectadoEn, detectadoPor: 'operario', creadoEn: detectadoEn, actualizadoEn: detectadoEn,
  retrabajo: crearDatosRetrabajo('parada_calidad', detectadoEn),
}

const accion: AccionSGO = {
  id: 'a1', eventoId: eventoBase.id, tipo: 'correctiva', descripcion: 'Estandarizar posicion de aislacion',
  responsable: 'Encargado', fechaCompromiso: '2026-08-25', estado: 'pendiente',
  creadoEn: detectadoEn, creadoPor: 'Lara', actualizadoEn: detectadoEn,
}

describe('circuito de investigaciones de retrabajo', () => {
  it('asigna a Lara y fija SLA de toma e investigacion', () => {
    expect(eventoBase.retrabajo?.asignadoA).toBe('Lara')
    expect(eventoBase.retrabajo?.fechaLimiteToma).toBe('2026-08-20T10:00:00.000Z')
    expect(eventoBase.retrabajo?.fechaLimiteInvestigacion).toBe('2026-08-22T10:00:00.000Z')
  })

  it('avanza de nuevo a investigacion, acciones y verificacion', () => {
    expect(estadoInvestigacionRetrabajo(eventoBase, [])).toBe('nuevo')
    const investigado: EventoSGO = {
      ...eventoBase,
      causaRaiz: 'Falta de referencia visual', metodoAnalisis: '5_porques',
      retrabajo: {
        ...eventoBase.retrabajo!, tomadoEn: '2026-08-19T11:00:00.000Z', tomadoPor: 'Lara',
        procesoOrigen: 'Bobinado', procesoDeteccion: 'Montaje', clasificacionCausa: 'metodo',
        factoresContribuyentes: 'Plano poco visible', costosRevisados: true, costosJustificacion: 'Sin consumo adicional',
      },
    }
    expect(estadoInvestigacionRetrabajo(investigado, [])).toBe('con_acciones')
    expect(estadoInvestigacionRetrabajo(investigado, [accion])).toBe('con_acciones')
    expect(estadoInvestigacionRetrabajo(investigado, [{ ...accion, estado: 'completada' }])).toBe('pendiente_verificacion')
    expect(estadoInvestigacionRetrabajo(investigado, [{ ...accion, estado: 'verificada', eficaz: true }])).toBe('pendiente_verificacion')
    expect(estadoInvestigacionRetrabajo({ ...investigado, retrabajo: { ...investigado.retrabajo!, resultadoVerificacion: 'eficaz' } }, [{ ...accion, estado: 'verificada', eficaz: true }])).toBe('listo_cierre')
  })

  it('marca vencimiento y bloquea un cierre incompleto', () => {
    expect(semaforoSLAInvestigacion(eventoBase, '2026-08-21T10:00:00.000Z')).toEqual({ tono: 'rojo', label: 'Vencido' })
    expect(validarCierreRetrabajo({ ...eventoBase, estado: 'cerrado' })).toEqual(expect.arrayContaining([
      'Lara debe tomar la investigación.',
      'Revisar y confirmar los costos del retrabajo.',
      'Verificar que las acciones fueron eficaces antes del cierre.',
    ]))
  })
})
