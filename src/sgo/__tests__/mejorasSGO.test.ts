import { describe, expect, it } from 'vitest'
import { estadoGestionMejora, crearDatosMejora, validarCierreMejora } from '../mejoras'
import type { AccionSGO, EventoSGO } from '../types'

const eventoBase: EventoSGO = {
  id: 'm1', codigo: 'SGO-2026-M1', tipo: 'oportunidad_mejora', pilar: 'mejora', titulo: 'Reducir espera',
  descripcion: 'Se detecta espera entre operaciones.', severidad: 'media', estado: 'abierto', areaId: 'bobinado_rural',
  detectadoEn: '2026-08-19T10:00:00Z', detectadoPor: 'lara', creadoEn: '2026-08-19T10:00:00Z', actualizadoEn: '2026-08-19T10:00:00Z',
  mejora: crearDatosMejora({ clase: 'oportunidad', fuente: 'entrevista' }),
}

const accion: AccionSGO = {
  id: 'a1', eventoId: eventoBase.id, tipo: 'mejora', descripcion: 'Cambiar método', responsable: 'Encargado',
  fechaCompromiso: '2026-08-30', estado: 'pendiente', creadoEn: '', creadoPor: 'lara', actualizadoEn: '',
}

describe('gestión de mejora continua', () => {
  it('distingue detección, evaluación y aprobación sin duplicar acciones', () => {
    expect(estadoGestionMejora(eventoBase, [])).toBe('detectada')
    expect(estadoGestionMejora({ ...eventoBase, responsable: 'Lara' }, [])).toBe('en_evaluacion')
    const aprobada = { ...eventoBase, mejora: { ...eventoBase.mejora!, decision: 'aprobada' as const } }
    expect(estadoGestionMejora(aprobada, [])).toBe('aprobada')
    expect(estadoGestionMejora(aprobada, [accion])).toBe('en_ejecucion')
  })

  it('pasa por verificación antes de quedar lista para cerrar', () => {
    const aprobada = { ...eventoBase, mejora: { ...eventoBase.mejora!, decision: 'aprobada' as const } }
    expect(estadoGestionMejora(aprobada, [{ ...accion, estado: 'completada' }])).toBe('pendiente_verificacion')
    expect(estadoGestionMejora(aprobada, [{ ...accion, estado: 'verificada', eficaz: true }])).toBe('lista_para_cerrar')
  })

  it('exige resultado, responsable, acción eficaz y seguimiento para cerrar', () => {
    const candidata: EventoSGO = { ...eventoBase, estado: 'cerrado', mejora: { ...eventoBase.mejora!, decision: 'aprobada' } }
    expect(validarCierreMejora(candidata, [])).toEqual(expect.arrayContaining([
      'Asignar un responsable de la mejora.', 'Documentar el resultado obtenido.',
      'Registrar al menos una acción de mejora.', 'Programar una fecha para comprobar que la mejora se sostenga.',
    ]))
    const completa: EventoSGO = { ...candidata, responsable: 'Lara', mejora: { ...candidata.mejora!, resultado: 'Espera reducida', fechaSeguimiento: '2026-10-01' } }
    expect(validarCierreMejora(completa, [{ ...accion, estado: 'verificada', eficaz: true }])).toEqual([])
  })

  it('ignora los campos históricos retirados al determinar el avance', () => {
    const legado = { ...eventoBase, mejora: { ...eventoBase.mejora!, impacto: 5 as const, urgencia: 4 as const, esfuerzo: 2 as const, referenciaSAP: 'SOL-123' } }
    expect(estadoGestionMejora(legado, [])).toBe('detectada')
  })
})
