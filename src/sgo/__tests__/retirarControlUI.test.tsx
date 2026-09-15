import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RetirarControlButton from '../../components/sgo/RetirarControlButton'
import type { ControlProgramadoSGO } from '../controles'

vi.mock('../../sync/syncEngine', () => ({ retirarControlProgramadoSGO: vi.fn() }))
const control: ControlProgramadoSGO = {
  id: 'c', titulo: 'Control con informes previos', tipo: 'auditoria_campo', areaId: 'bobinado_rural', pilar: 'mejora',
  instrucciones: 'Verificar', responsable: 'Lara', frecuencia: 'semanal', proximaFecha: '2026-08-12', toleranciaDias: 1,
  activo: true, creadoEn: '', creadoPor: 'lorenzo', actualizadoEn: '', actualizadoPor: 'lara',
}
describe('eliminar de agenda', () => {
  it('muestra el acceso a Lorenzo incluso si el control ya tiene informes', () => {
    expect(renderToStaticMarkup(<RetirarControlButton control={control} usuario="LORENZO" />)).toContain('Eliminar de agenda')
  })
  it.each(['lara', 'azul', 'nicolas.sgo', 'GestionSGO'])('no lo ofrece a %s', (usuario) => {
    expect(renderToStaticMarkup(<RetirarControlButton control={control} usuario={usuario} />)).toBe('')
  })
  it('no permite retirar nuevamente un inactivo', () => {
    expect(renderToStaticMarkup(<RetirarControlButton control={{ ...control, activo: false }} usuario="lorenzo" />)).toBe('')
  })
})
