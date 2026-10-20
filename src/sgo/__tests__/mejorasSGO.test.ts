import { describe, expect, it } from 'vitest'
import { estadoGestionMejora, crearDatosMejora, validarCierreMejora, normalizarMejoraAlCerrar } from '../mejoras'
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

  it('v1.84: cerrar una mejora ya no exige expediente completo', () => {
    // Antes esto devolvia 4 errores (responsable, resultado, accion, seguimiento)
    // y dejaba el caso trabado. Una mejora no es una no conformidad.
    const candidata: EventoSGO = { ...eventoBase, estado: 'cerrado', mejora: { ...eventoBase.mejora!, decision: 'aprobada' } }
    expect(validarCierreMejora(candidata, [])).toEqual([])
  })

  it('v1.84: la decision pendiente no traba el cierre y se da por aprobada', () => {
    const sinDecidir: EventoSGO = { ...eventoBase, estado: 'cerrado', mejora: { ...eventoBase.mejora!, decision: 'pendiente' } }
    expect(validarCierreMejora(sinDecidir, [])).toEqual([])
    expect(normalizarMejoraAlCerrar(sinDecidir).mejora?.decision).toBe('aprobada')
  })

  it('v1.84: no toca una mejora abierta ni una decision ya tomada', () => {
    const abierta: EventoSGO = { ...eventoBase, estado: 'abierto', mejora: { ...eventoBase.mejora!, decision: 'pendiente' } }
    expect(normalizarMejoraAlCerrar(abierta).mejora?.decision).toBe('pendiente')
    const noViable: EventoSGO = { ...eventoBase, estado: 'cerrado', mejora: { ...eventoBase.mejora!, decision: 'no_viable' } }
    expect(normalizarMejoraAlCerrar(noViable).mejora?.decision).toBe('no_viable')
  })

  it('ignora los campos históricos retirados al determinar el avance', () => {
    const legado = { ...eventoBase, mejora: { ...eventoBase.mejora!, impacto: 5 as const, urgencia: 4 as const, esfuerzo: 2 as const, referenciaSAP: 'SOL-123' } }
    expect(estadoGestionMejora(legado, [])).toBe('detectada')
  })
})
