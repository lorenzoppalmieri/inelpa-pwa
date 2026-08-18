import { describe, expect, it } from 'vitest'
import { estadoProgramacionControl, proximaFechaControl, sumarFrecuenciaControl, tipoEventoDesdeControl, type ControlProgramadoSGO } from '../controles'

const base: ControlProgramadoSGO = {
  id: 'c1', titulo: 'Control', tipo: 'proceso_productivo', areaId: 'bobinado_rural', pilar: 'calidad',
  instrucciones: 'Verificar', responsable: 'Lara', frecuencia: 'mensual', proximaFecha: '2026-01-31',
  toleranciaDias: 0, activo: true, creadoEn: '', creadoPor: 'Azul', actualizadoEn: '', actualizadoPor: 'Azul',
}

describe('agenda de controles SGO', () => {
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

  it('mapea cada pilar al expediente compatible', () => {
    expect(tipoEventoDesdeControl('calidad')).toBe('no_conformidad')
    expect(tipoEventoDesdeControl('seguridad')).toBe('observacion_preventiva')
    expect(tipoEventoDesdeControl('ambiente')).toBe('incidente_ambiental')
  })
})
