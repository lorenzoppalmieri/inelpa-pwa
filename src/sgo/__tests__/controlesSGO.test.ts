import { describe, expect, it } from 'vitest'
import { estadoProgramacionControl, proximaFechaControl, retirarControlDeAgenda, sumarFrecuenciaControl, tipoEventoDesdeControl, type ControlProgramadoSGO } from '../controles'

const base: ControlProgramadoSGO = {
  id: 'c1', titulo: 'Control', tipo: 'proceso_productivo', areaId: 'bobinado_rural', pilar: 'calidad',
  instrucciones: 'Verificar', responsable: 'Lara', frecuencia: 'mensual', proximaFecha: '2026-01-31',
  toleranciaDias: 0, activo: true, creadoEn: '', creadoPor: 'Azul', actualizadoEn: '', actualizadoPor: 'Azul',
}

describe('agenda de controles SGO', () => {
  it('Lorenzo puede retirar la programación sin borrar ni cambiar su historia o fecha', () => {
    const retirado = retirarControlDeAgenda(base, ' LORENZO ', '2026-09-15T13:00:00Z')
    expect(retirado).toEqual({ ...base, activo: false, actualizadoEn: '2026-09-15T13:00:00Z', actualizadoPor: 'lorenzo' })
    expect(base.activo).toBe(true)
    expect(estadoProgramacionControl(retirado, '2026-09-15')).toBe('inactivo')
  })

  it.each(['lara', 'azul', 'nicolas.sgo', 'gestionsgo', 'otro', ''])('no permite retirar a %s', (usuario) => {
    expect(() => retirarControlDeAgenda(base, usuario)).toThrow('Solo el usuario Lorenzo')
  })
  it('conserva el fin de mes al sumar frecuencia mensual', () => {
    expect(sumarFrecuenciaControl('2026-01-31', 'mensual')).toBe('2026-02-28')
  })

  it('salta períodos atrasados y devuelve la próxima fecha futura', () => {
    expect(proximaFechaControl(base, '2026-04-10')).toBe('2026-04-28')
  })

  it('clasifica un control vencido considerando tolerancia', () => {
    expect(estadoProgramacionControl({ ...base, proximaFecha: '2026-07-20', toleranciaDias: 2 }, '2026-07-23')).toBe('vencido')
  })

  it('no vence las auditorías logísticas aunque la fecha orientativa haya pasado', () => {
    expect(estadoProgramacionControl({ ...base, tipo: 'auditoria_logistica', proximaFecha: '2026-07-20', toleranciaDias: 0 }, '2026-08-18')).toBe('programado')
  })

  it('clasifica como para hoy mientras permanece dentro de la tolerancia', () => {
    expect(estadoProgramacionControl({ ...base, proximaFecha: '2026-07-20', toleranciaDias: 3 }, '2026-07-22')).toBe('hoy')
  })

  it('desactiva la recurrencia de una sola vez', () => {
    expect(proximaFechaControl({ ...base, frecuencia: 'unico' }, '2026-01-31')).toBeUndefined()
  })

  it('una auditoría semanal realizada tarde avanza a futuro sin depender del cierre de hallazgos', () => {
    const control = { ...base, tipo: 'auditoria_campo' as const, frecuencia: 'semanal' as const, proximaFecha: '2026-09-12', toleranciaDias: 1 }
    expect(estadoProgramacionControl(control, '2026-09-15')).toBe('vencido')
    const siguiente = proximaFechaControl(control, '2026-09-15')!
    expect(siguiente).toBe('2026-09-19')
    expect(estadoProgramacionControl({ ...control, proximaFecha: siguiente }, '2026-09-15')).toBe('proximo')
    // El simple paso del tiempo no acredita una ejecución ni oculta vencimientos.
    expect(estadoProgramacionControl(control, '2026-09-16')).toBe('vencido')
  })

  it('mapea cada pilar al expediente compatible', () => {
    expect(tipoEventoDesdeControl('calidad')).toBe('no_conformidad')
    expect(tipoEventoDesdeControl('seguridad')).toBe('observacion_preventiva')
    expect(tipoEventoDesdeControl('ambiente')).toBe('incidente_ambiental')
  })
})
