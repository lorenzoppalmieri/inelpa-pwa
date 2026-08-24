import { describe, expect, it } from 'vitest'
import {
  exigirPermisoBorradoSGO, usuarioEsLorenzo, usuarioPuedeExportarInformesSGO,
  usuarioPuedeResolverRevision5S, usuarioPuedeSolicitarRevision5S,
} from '../permisos'

describe('permisos de borrado SGO', () => {
  it('reconoce a Lorenzo sin depender de mayúsculas o espacios', () => {
    expect(usuarioEsLorenzo(' Lorenzo ')).toBe(true)
    expect(usuarioEsLorenzo('LORENZO')).toBe(true)
  })

  it('rechaza a cualquier otro usuario', () => {
    expect(usuarioEsLorenzo('GestionSGO')).toBe(false)
    expect(() => exigirPermisoBorradoSGO('azul')).toThrow(/Solo el usuario Lorenzo/)
  })

  it('autoriza el borrado para Lorenzo', () => {
    expect(() => exigirPermisoBorradoSGO('lorenzo')).not.toThrow()
  })
})

describe('permisos de exportación de informes SGO', () => {
  it.each(['lorenzo', 'Lara', 'nicolas.sgo', 'Nicolás', 'AZUL', 'GestionSGO'])(
    'autoriza a %s',
    (usuario) => expect(usuarioPuedeExportarInformesSGO(usuario)).toBe(true),
  )

  it('no habilita la exportación a usuarios ajenos al equipo SGO', () => {
    expect(usuarioPuedeExportarInformesSGO('operario.planta')).toBe(false)
  })
})

describe('permisos de revisión de puntaje 5S', () => {
  it.each(['lorenzo', 'lara', 'nicolas.sgo', 'azul', 'GestionSGO'])(
    'permite a %s solicitar una revisión',
    (usuario) => expect(usuarioPuedeSolicitarRevision5S(usuario)).toBe(true),
  )

  it('reserva la aprobación exclusivamente a Lorenzo', () => {
    expect(usuarioPuedeResolverRevision5S('lorenzo')).toBe(true)
    expect(usuarioPuedeResolverRevision5S('lara')).toBe(false)
    expect(usuarioPuedeResolverRevision5S('azul')).toBe(false)
  })
})
