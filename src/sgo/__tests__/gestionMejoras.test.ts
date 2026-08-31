import { describe, expect, it } from 'vitest'
import {
  gestorMejora, mejoraRequiereSegundoControl, normalizarGestorMejora,
  usuarioPuedeCerrarMejora, usuarioPuedeGestionarMejora,
} from '../gestionMejoras'
import type { EventoSGO } from '../types'

const evento = (areaId: EventoSGO['areaId'], fuente: NonNullable<EventoSGO['mejora']>['fuente'], extra: Partial<EventoSGO> = {}) => ({
  areaId, pilar: 'mejora', severidad: 'media', mejora: {
    clase: 'oportunidad', fuente, pilaresBeneficiados: ['mejora'], decision: 'pendiente', prioridad: 'media', seguimientoResultado: 'pendiente',
  }, ...extra,
}) as EventoSGO

describe('gestión distribuida de mejora continua', () => {
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

  it('permite aprobar solamente al gestor asignado', () => {
    const mejora = evento('logistica_operativa', 'manual')
    expect(usuarioPuedeGestionarMejora('nicolas.sgo', mejora)).toBe(true)
    expect(usuarioPuedeGestionarMejora('lara', mejora)).toBe(false)
    expect(usuarioPuedeGestionarMejora('lorenzo', mejora)).toBe(false)
    mejora.mejora = { ...mejora.mejora!, gestorSGO: 'lorenzo' }
    expect(usuarioPuedeGestionarMejora('lorenzo', mejora)).toBe(true)
  })

  it('exige otro integrante SGO para cerrar mejoras críticas, de seguridad o costosas', () => {
    const critica = evento('bobinado_rural', 'manual', { severidad: 'critica' })
    critica.mejora = { ...critica.mejora!, gestorSGO: 'lara', decision: 'aprobada', decisionPor: 'lara' }
    expect(mejoraRequiereSegundoControl(critica)).toBe(true)
    expect(usuarioPuedeCerrarMejora('lara', critica)).toBe(false)
    expect(usuarioPuedeCerrarMejora('azul', critica)).toBe(true)
    expect(usuarioPuedeCerrarMejora('lorenzo', critica)).toBe(true)
  })

  it('permite a Lorenzo aprobar y gestionar una mejora asignada a él', () => {
    const propia = evento('gerencia_directorio', 'manual')
    propia.mejora = { ...propia.mejora!, gestorSGO: 'lorenzo' }
    expect(gestorMejora(propia)).toBe('lorenzo')
    expect(usuarioPuedeGestionarMejora('Lorenzo', propia)).toBe(true)
  })

  it('mantiene el segundo control independiente cuando Lorenzo aprueba una mejora costosa', () => {
    const costosa = evento('bobinado_distribucion', 'manual')
    costosa.mejora = {
      ...costosa.mejora!, gestorSGO: 'lorenzo', decision: 'aprobada', decisionPor: 'lorenzo', presupuestoEstimado: 18000000,
    }
    expect(mejoraRequiereSegundoControl(costosa)).toBe(true)
    expect(usuarioPuedeCerrarMejora('lorenzo', costosa)).toBe(false)
    expect(usuarioPuedeCerrarMejora('lara', costosa)).toBe(true)
  })

  it('permite al gestor cerrar directamente una mejora normal', () => {
    const normal = evento('administracion', 'manual')
    normal.mejora = { ...normal.mejora!, gestorSGO: 'azul', decision: 'aprobada', decisionPor: 'azul' }
    expect(usuarioPuedeCerrarMejora('azul', normal)).toBe(true)
    expect(usuarioPuedeCerrarMejora('lara', normal)).toBe(false)
  })
})
