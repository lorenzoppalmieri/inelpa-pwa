import { describe, expect, it } from 'vitest'
import { exigirPermisoBorradoSGO, usuarioEsLorenzo } from '../permisos'

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
