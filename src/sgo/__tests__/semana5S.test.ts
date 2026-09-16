import { describe, expect, it } from 'vitest'
import { esAuditoria5SEspecial, ejecucionEnFecha, estadoProgramacionControl, fechaArgentina, retirarControlDeAgenda, type ControlProgramadoSGO, type EjecucionControlSGO } from '../controles'
import { controlProgramadoSGOFromRow, controlProgramadoSGOToRow } from '../../sync/mappers'

const control: ControlProgramadoSGO = {
  id: 'sgo-5s-semana-bobinado_rural-2026-09-14', titulo: 'Semana 14/09', tipo: 'auditoria_campo', areaId: 'bobinado_rural',
  pilar: 'mejora', instrucciones: 'Auditar de lunes a viernes', responsable: 'Lara', frecuencia: 'unico', semana5S: '2026-09-14',
  proximaFecha: '2026-09-18', toleranciaDias: 0, activo: true, plantillaCampoId: 'rit-9-2-12-5s',
  creadoEn: '', creadoPor: 'sistema_5s_semanal', actualizadoEn: '', actualizadoPor: 'sistema_5s_semanal',
}
const ejecucion: EjecucionControlSGO = { id: 'e', controlId: control.id, fechaProgramada: control.proximaFecha, ejecutadoEn: '2026-09-18T23:00:00Z', ejecutadoPor: 'Lara', resultado: 'conforme', detalle: 'Informe' }

describe('5S semanal de lunes a viernes', () => {
  it.each(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'])('no vence durante el plazo: %s', (hoy) => {
    expect(estadoProgramacionControl(control, hoy)).not.toBe('vencido')
    expect(ejecucionEnFecha({ ...ejecucion, ejecutadoEn: `${hoy}T18:00:00Z` })).toBe(true)
  })
  it('vence el sábado y deja de contar si se completó o retiró', () => {
    expect(estadoProgramacionControl(control, '2026-09-19')).toBe('vencido')
    expect(estadoProgramacionControl(retirarControlDeAgenda(control, 'lorenzo'), '2026-09-19')).toBe('inactivo')
  })
  it('respeta el viernes completo en Argentina, aunque en UTC ya sea sábado', () => {
    expect(fechaArgentina('2026-09-19T02:59:59Z')).toBe('2026-09-18')
    expect(ejecucionEnFecha({ ...ejecucion, ejecutadoEn: '2026-09-19T02:59:59Z' })).toBe(true)
    expect(ejecucionEnFecha({ ...ejecucion, ejecutadoEn: '2026-09-19T03:00:00Z' })).toBe(false)
  })
  it('distingue la ocurrencia semanal de una auditoría especial', () => {
    expect(esAuditoria5SEspecial(control)).toBe(false)
    expect(esAuditoria5SEspecial({ ...control, semana5S: undefined })).toBe(true)
  })
  it('conserva la identidad semanal al sincronizar y no agrega campos a históricos', () => {
    expect(controlProgramadoSGOFromRow(controlProgramadoSGOToRow(control))).toMatchObject(control)
    expect(controlProgramadoSGOToRow({ ...control, semana5S: undefined })).not.toHaveProperty('semana_5s')
  })
})
