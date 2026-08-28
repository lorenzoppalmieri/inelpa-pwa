import { describe, expect, it } from 'vitest'
import type { EjecucionControlSGO } from '../controles'
import { PLANTILLA_5S_RIT_9_2_12, type AuditoriaCampoSGO } from '../controlesCampo'
import { compararMeses5S, periodoAnterior5S, promedioGeneralAreas5S, resumirMes5S } from '../kpi5S'
import type { AreaSGOId } from '../types'

function ejecucion(id: string, areaId: AreaSGOId, fecha: string, fisico: number, premiable = fisico): EjecucionControlSGO {
  const item = PLANTILLA_5S_RIT_9_2_12.items[0]
  const puntaje = fisico >= 100 ? 2 : fisico >= 50 ? 1 : 0
  const auditoria: AuditoriaCampoSGO = {
    tipo: '5s', plantillaId: PLANTILLA_5S_RIT_9_2_12.id, plantillaVersion: PLANTILLA_5S_RIT_9_2_12.version,
    documento: PLANTILLA_5S_RIT_9_2_12.documento, areaId, auditor: 'Lara', usuarioAcceso: 'lara',
    encargadoArea: 'Encargado', iniciadaEn: fecha, finalizadaEn: fecha, items: [item],
    respuestas: [{ itemId: item.id, puntaje }], porcentajeCumplimiento: fisico, porcentajePorSeccion: {},
    porcentajePorPilar: { seguridad: fisico, ambiente: fisico },
    revisionesPuntaje: premiable !== fisico ? [{
      id: `rev-${id}`, itemId: item.id, puntajeOriginal: puntaje as 0 | 1, puntajePropuesto: 2,
      estado: 'aprobada', investigadaPor: 'Lara', resultadoInvestigacion: 'Comprobado', causaComprobada: 'Externa',
      areaResponsableId: 'mantenimiento', responsableReal: 'Mantenimiento', evidencia: 'OT', motivoAjuste: 'Corresponde',
      solicitadaEn: fecha, solicitadaPor: 'Lara', decididaEn: fecha, decididaPor: 'Lara', decisionComentario: 'Aprobada',
      mejoraEventoId: `mejora-${id}`,
    }] : undefined,
  }
  return {
    id, controlId: `control-${areaId}`, fechaProgramada: fecha.slice(0, 10), ejecutadoEn: fecha,
    ejecutadoPor: 'Lara', resultado: 'conforme', detalle: 'Auditoría 5S', auditoriaCampo: auditoria,
  }
}

describe('KPI mensual 5S', () => {
  it('calcula el promedio de todas las auditorías del mes por área', () => {
    const resumen = resumirMes5S([
      ejecucion('a', 'laminado', '2026-08-05T10:00:00.000Z', 50),
      ejecucion('b', 'laminado', '2026-08-12T10:00:00.000Z', 100),
      ejecucion('c', 'laminado', '2026-07-29T10:00:00.000Z', 0),
    ], '2026-08')
    expect(resumen).toEqual([expect.objectContaining({ areaId: 'laminado', auditorias: 2, promedioFisico: 75 })])
  })

  it('compara contra el mes anterior en puntos porcentuales', () => {
    const comparativo = compararMeses5S([
      ejecucion('jul', 'laboratorio', '2026-07-10T10:00:00.000Z', 50),
      ejecucion('ago', 'laboratorio', '2026-08-10T10:00:00.000Z', 100),
    ], '2026-08', ['laboratorio'])
    expect(comparativo[0]).toMatchObject({ areaId: 'laboratorio', variacionFisico: 50, variacionPremiable: 50 })
    expect(periodoAnterior5S('2026-01')).toBe('2025-12')
  })

  it('calcula el general como promedio de áreas y no de cantidad de auditorías', () => {
    const resumen = resumirMes5S([
      ejecucion('l1', 'laminado', '2026-08-05T10:00:00.000Z', 100),
      ejecucion('l2', 'laminado', '2026-08-12T10:00:00.000Z', 100),
      ejecucion('lab', 'laboratorio', '2026-08-12T10:00:00.000Z', 0),
    ], '2026-08')
    expect(promedioGeneralAreas5S(resumen, 'promedioFisico')).toBe(50)
  })
})
