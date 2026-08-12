import { describe, expect, it } from 'vitest'
import {
  PLANTILLA_5S_RIT_9_2_12, SECCIONES_5S, calcularPorcentajeCampo,
  areas5SParaAuditor, controlCampoCompleto, respuestaVacia, semaforoCampo, type RespuestaControlCampo,
} from '../controlesCampo'

describe('controles de campo 5S', () => {
  it('incluye las cinco S y conserva el encabezado documental', () => {
    expect(SECCIONES_5S.map((s) => s.id)).toEqual(['seiri', 'seiton', 'seiso', 'seiketsu', 'shitsuke'])
    expect(PLANTILLA_5S_RIT_9_2_12.documento.codigo).toBe('R.I.T. 9.2/12')
    expect(new Set(PLANTILLA_5S_RIT_9_2_12.items.map((i) => i.seccion))).toEqual(new Set(SECCIONES_5S.map((s) => s.id)))
  })

  it('calcula el porcentaje excluyendo no aplica y pendiente', () => {
    const respuestas: RespuestaControlCampo[] = [
      { itemId: PLANTILLA_5S_RIT_9_2_12.items[0].id, puntaje: 2 },
      { itemId: PLANTILLA_5S_RIT_9_2_12.items[1].id, puntaje: 1 },
      { itemId: PLANTILLA_5S_RIT_9_2_12.items[2].id, puntaje: 'na', justificacionNoAplica: 'No existe equipo.' },
      { itemId: PLANTILLA_5S_RIT_9_2_12.items[3].id, puntaje: 'pendiente' },
    ]
    expect(calcularPorcentajeCampo(respuestas, PLANTILLA_5S_RIT_9_2_12.items.slice(0, 4))).toBe(75)
  })

  it('exige trazabilidad completa para hallazgos y justificación para no aplica', () => {
    const respuestas: RespuestaControlCampo[] = PLANTILLA_5S_RIT_9_2_12.items.map((i) => ({ ...respuestaVacia(i.id), puntaje: 2 }))
    expect(controlCampoCompleto(respuestas)).toBe(true)
    respuestas[0] = { itemId: respuestas[0].itemId, puntaje: 0, observacion: 'Pasillo bloqueado.' }
    expect(controlCampoCompleto(respuestas)).toBe(false)
    respuestas[0] = {
      ...respuestas[0], accion: 'Retirar material.', responsable: 'Encargado', fechaCompromiso: '2026-08-13', evidenciaReferencia: 'Foto 1',
    }
    expect(controlCampoCompleto(respuestas)).toBe(true)
  })

  it('aplica los umbrales 90/75', () => {
    expect(semaforoCampo(90)).toBe('verde')
    expect(semaforoCampo(75)).toBe('amarillo')
    expect(semaforoCampo(74.9)).toBe('rojo')
  })

  it('separa logística y agrega las nuevas áreas productivas', () => {
    expect(areas5SParaAuditor('Nicolás')).toEqual(['logistica_operativa', 'logistica_despacho'])
    expect(areas5SParaAuditor('Lara')).toContain('carpinteria')
    expect(areas5SParaAuditor('Lara')).toContain('corte_aislacion')
  })
})
