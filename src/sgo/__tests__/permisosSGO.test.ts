import { describe, expect, it } from 'vitest'
import { exigirPermisoBorradoSGO, usuarioEsLorenzo, usuarioPuedeExportarInformesSGO } from '../permisos'

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
