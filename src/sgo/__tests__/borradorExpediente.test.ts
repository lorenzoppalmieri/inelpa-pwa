import { describe, expect, it } from 'vitest'
import { reconciliarBorrador } from '../borradorExpediente'

describe('volver al caso desde su expediente', () => {
  const base = { id: 'caso', contencion: '', causaRaiz: '', estado: 'abierto', mejora: { resultado: '', beneficioEsperado: 'Inicial', decision: 'pendiente' }, retrabajo: { causaRaiz: '', resultadoResolucion: '' }, evidenciaUrls: ['inicial'] }
  it('incorpora lo guardado en el expediente sin borrar la redacción del caso', () => {
    const borrador = { ...base, mejora: { ...base.mejora, resultado: 'Trabajo en curso' } }
    const actual = { ...base, contencion: 'Corrección guardada', causaRaiz: 'Causa documentada', evidenciaUrls: ['foto'] }
    const resultado = reconciliarBorrador(base, borrador, actual)
    expect(resultado.contencion).toBe('Corrección guardada')
    expect(resultado.causaRaiz).toBe('Causa documentada')
    expect(resultado.evidenciaUrls).toEqual(['foto'])
    expect(resultado.mejora.resultado).toBe('Trabajo en curso')
    expect(base.contencion).toBe('')
  })
  it('conserva el borrador del retrabajo y actualiza el estado y los campos no editados', () => {
    const borrador = { ...base, retrabajo: { ...base.retrabajo, causaRaiz: 'Investigación en curso' } }
    const actual = { ...base, estado: 'con_acciones', retrabajo: { ...base.retrabajo, resultadoResolucion: 'Comprobado' } }
    expect(reconciliarBorrador(base, borrador, actual)).toMatchObject({ estado: 'con_acciones', retrabajo: { causaRaiz: 'Investigación en curso', resultadoResolucion: 'Comprobado' } })
  })
  it('no reabre por datos viejos un expediente cerrado sin cambios locales de estado', () => {
    expect(reconciliarBorrador(base, { ...base, mejora: { ...base.mejora, resultado: 'Borrador' } }, { ...base, estado: 'cerrado' }).estado).toBe('cerrado')
  })
  it('respeta borrados explícitos y no mezcla arrays de evidencia', () => {
    const origen = { texto: 'Anterior', archivos: ['A', 'B'] }
    expect(reconciliarBorrador(origen, { texto: '', archivos: ['C'] }, { texto: 'Remoto', archivos: ['D'] })).toEqual({ texto: '', archivos: ['C'] })
  })
  it('dos idas al expediente no restituyen valores antiguos', () => {
    const primera = { ...base, contencion: 'Primera corrección' }
    const borrador = reconciliarBorrador(base, { ...base, mejora: { ...base.mejora, resultado: 'Nota' } }, primera)
    expect(reconciliarBorrador(primera, borrador, { ...primera, contencion: 'Segunda corrección' })).toMatchObject({ contencion: 'Segunda corrección', mejora: { resultado: 'Nota' } })
  })
})
