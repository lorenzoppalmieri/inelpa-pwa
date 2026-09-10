import { describe, expect, it } from 'vitest'
import {
  gestorMejora, normalizarGestorMejora,
  usuarioPuedeCerrarMejora, usuarioPuedeGestionarMejora, usuarioPuedeEvaluarMejora,
} from '../gestionMejoras'
import type { EventoSGO } from '../types'

const evento = (areaId: EventoSGO['areaId'], fuente: NonNullable<EventoSGO['mejora']>['fuente'], extra: Partial<EventoSGO> = {}) => ({
  areaId, pilar: 'mejora', severidad: 'media', mejora: {
    clase: 'oportunidad', fuente, pilaresBeneficiados: ['mejora'], decision: 'pendiente', prioridad: 'media', seguimientoResultado: 'pendiente',
  }, ...extra,
}) as EventoSGO

describe('gestión distribuida de mejora continua', () => {
  it.each(['Lorenzo', 'lara', 'Nicolás', 'nicolas.sgo', 'azul'])('permite evaluar a %s sin asumir el seguimiento de otro integrante', (usuario) => {
    const ajena = evento('administracion', 'manual')
    expect(usuarioPuedeEvaluarMejora(usuario)).toBe(true)
    expect(gestorMejora(ajena)).toBe('azul')
  })

  it.each(['GestionSGO', 'operario', '', 'compras'])('no permite evaluar a usuarios ajenos al equipo: %s', (usuario) => {
    expect(usuarioPuedeEvaluarMejora(usuario)).toBe(false)
  })

  it('asigna automáticamente según el alcance del equipo', () => {
    expect(gestorMejora(evento('bobinado_rural', '5s'))).toBe('lara')
    expect(gestorMejora(evento('logistica_despacho', 'manual'))).toBe('nicolas.sgo')
    expect(gestorMejora(evento('administracion', 'manual'))).toBe('azul')
    expect(gestorMejora(evento('bobinado_rural', 'auditoria_iso_interna'))).toBe('azul')
    expect(gestorMejora(evento('administracion', 'auditoria_logistica'))).toBe('nicolas.sgo')
  })

  it('normaliza el usuario de Nicolás e incluye a Lorenzo como gestor', () => {
    expect(normalizarGestorMejora('Nicolás')).toBe('nicolas.sgo')
    expect(normalizarGestorMejora('lorenzo')).toBe('lorenzo')
    expect(normalizarGestorMejora('GestionSGO')).toBeUndefined()
  })

  it('reserva el seguimiento al gestor asignado', () => {
    const mejora = evento('logistica_operativa', 'manual')
    expect(usuarioPuedeGestionarMejora('nicolas.sgo', mejora)).toBe(true)
    expect(usuarioPuedeGestionarMejora('lara', mejora)).toBe(false)
    expect(usuarioPuedeGestionarMejora('lorenzo', mejora)).toBe(false)
    mejora.mejora = { ...mejora.mejora!, gestorSGO: 'lorenzo' }
    expect(usuarioPuedeGestionarMejora('lorenzo', mejora)).toBe(true)
  })

  it('permite al mismo gestor aprobar y cerrar mejoras críticas', () => {
    const critica = evento('bobinado_rural', 'manual', { severidad: 'critica' })
    critica.mejora = { ...critica.mejora!, gestorSGO: 'lara', decision: 'aprobada', decisionPor: 'lara' }
    expect(usuarioPuedeCerrarMejora('lara', critica)).toBe(true)
    expect(usuarioPuedeCerrarMejora('azul', critica)).toBe(false)
    expect(usuarioPuedeCerrarMejora('lorenzo', critica)).toBe(false)
  })

  it('permite a Lorenzo aprobar y gestionar una mejora asignada a él', () => {
    const propia = evento('gerencia_directorio', 'manual')
    propia.mejora = { ...propia.mejora!, gestorSGO: 'lorenzo' }
    expect(gestorMejora(propia)).toBe('lorenzo')
    expect(usuarioPuedeGestionarMejora('Lorenzo', propia)).toBe(true)
  })

  it('permite a Lorenzo cerrar su mejora costosa sin otro aprobador', () => {
    const costosa = evento('bobinado_distribucion', 'manual')
    costosa.mejora = {
      ...costosa.mejora!, gestorSGO: 'lorenzo', decision: 'aprobada', decisionPor: 'lorenzo', presupuestoEstimado: 18000000,
    }
    expect(usuarioPuedeCerrarMejora('lorenzo', costosa)).toBe(true)
    expect(usuarioPuedeCerrarMejora('lara', costosa)).toBe(false)
  })

  it('permite al gestor cerrar directamente una mejora normal', () => {
    const normal = evento('administracion', 'manual')
    normal.mejora = { ...normal.mejora!, gestorSGO: 'azul', decision: 'aprobada', decisionPor: 'azul' }
    expect(usuarioPuedeCerrarMejora('azul', normal)).toBe(true)
    expect(usuarioPuedeCerrarMejora('lara', normal)).toBe(false)
  })

  it.each(['lorenzo', 'lara', 'nicolas.sgo', 'azul'])('permite a %s completar su seguimiento de seguridad y ambiente', (usuario) => {
    const propia = evento('bobinado_rural', '5s', { pilar: 'seguridad', severidad: 'critica' })
    propia.mejora = {
      ...propia.mejora!, gestorSGO: normalizarGestorMejora(usuario), decision: 'aprobada',
      decisionPor: usuario, prioridad: 'critica', pilaresBeneficiados: ['seguridad', 'ambiente'], presupuestoEstimado: 500001,
    }
    expect(usuarioPuedeGestionarMejora(usuario, propia)).toBe(true)
    expect(usuarioPuedeCerrarMejora(usuario, propia)).toBe(true)
    expect(usuarioPuedeCerrarMejora('GestionSGO', propia)).toBe(false)
    expect(usuarioPuedeCerrarMejora('operario', propia)).toBe(false)
  })

  it('respeta al gestor actual después de tomar el seguimiento, sin cambiar la decisión histórica', () => {
    const propia = evento('bobinado_rural', '5s')
    propia.mejora = { ...propia.mejora!, gestorSGO: 'azul', decision: 'aprobada', decisionPor: 'lara' }
    expect(usuarioPuedeGestionarMejora('Azul', propia)).toBe(true)
    expect(usuarioPuedeCerrarMejora('Azul', propia)).toBe(true)
    expect(usuarioPuedeCerrarMejora('lara', propia)).toBe(false)
    expect(propia.mejora.decisionPor).toBe('lara')
  })
})
