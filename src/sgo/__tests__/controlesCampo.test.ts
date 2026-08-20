import { describe, expect, it } from 'vitest'
import {
  PLANTILLA_5S_RIT_9_2_12, PLANTILLA_5S_RIT_9_2_12_V01, SECCIONES_5S, calcularPorcentajeCampo, calcularPorPilarCampo,
  agregarEvidenciasAuditoriaCampo, areas5SParaAuditor, controlCampoCompleto, itemsDeAuditoriaCampo, respuestaVacia, semaforoCampo,
  type AuditoriaCampoSGO, type RespuestaControlCampo,
} from '../controlesCampo'
import { tipoFotoDesdeArchivo } from '../evidenciasCampo'

describe('controles de campo 5S', () => {
  it('incluye las cinco S y conserva el encabezado documental', () => {
    expect(SECCIONES_5S.map((s) => s.id)).toEqual(['seiri', 'seiton', 'seiso', 'seiketsu', 'shitsuke'])
    expect(PLANTILLA_5S_RIT_9_2_12.documento.codigo).toBe('R.I.T. 9.2/12')
    expect(PLANTILLA_5S_RIT_9_2_12.version).toBe('02-digital')
    expect(PLANTILLA_5S_RIT_9_2_12.documento.version).toBe('02')
    expect(PLANTILLA_5S_RIT_9_2_12_V01.documento.version).toBe('01')
    expect(new Set(PLANTILLA_5S_RIT_9_2_12.items.map((i) => i.seccion))).toEqual(new Set(SECCIONES_5S.map((s) => s.id)))
  })

  it('agrega Ambiente y Seguridad en la S correspondiente sin preguntas duplicadas', () => {
    const items = PLANTILLA_5S_RIT_9_2_12.items
    expect(new Set(items.map((i) => i.pregunta)).size).toBe(items.length)
    expect(items.find((i) => i.id === '5s-seiri-06')).toMatchObject({ seccion: 'seiri', pilar: 'ambiente' })
    expect(items.find((i) => i.id === '5s-seiso-06')).toMatchObject({ seccion: 'seiso', pilar: 'ambiente', critico: true })
    expect(items.find((i) => i.id === '5s-seiketsu-08')).toMatchObject({ seccion: 'seiketsu', pilar: 'seguridad', critico: true })
    expect(items.find((i) => i.id === '5s-shitsuke-07')).toMatchObject({ seccion: 'shitsuke', pilar: 'seguridad', critico: true })
    expect(items.filter((i) => i.pregunta.toLocaleLowerCase('es').includes('derrames'))).toHaveLength(2)
    expect(items.find((i) => i.id === '5s-seiso-01')?.pregunta).not.toContain('derrames')
  })

  it('conserva las preguntas de auditorías históricas de la versión anterior', () => {
    const respuestas = PLANTILLA_5S_RIT_9_2_12_V01.items.map((i) => ({ itemId: i.id, puntaje: 2 as const }))
    const auditoria = {
      tipo: '5s', plantillaId: PLANTILLA_5S_RIT_9_2_12_V01.id, plantillaVersion: '01-digital',
      documento: PLANTILLA_5S_RIT_9_2_12_V01.documento, areaId: 'laminado', auditor: 'Lara', usuarioAcceso: 'lara',
      encargadoArea: 'Encargado', iniciadaEn: '', finalizadaEn: '', respuestas, porcentajeCumplimiento: 100, porcentajePorSeccion: {},
    } satisfies AuditoriaCampoSGO
    expect(itemsDeAuditoriaCampo(auditoria)).toEqual(PLANTILLA_5S_RIT_9_2_12_V01.items)
  })

  it('calcula resultados independientes de Seguridad y Medio Ambiente', () => {
    const respuestas = PLANTILLA_5S_RIT_9_2_12.items.map((i) => ({ itemId: i.id, puntaje: (i.pilar === 'ambiente' ? 0 : 2) as 0 | 2 }))
    expect(calcularPorPilarCampo(respuestas, 'seguridad')).toBe(100)
    expect(calcularPorPilarCampo(respuestas, 'ambiente')).toBe(0)
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

  it('permite anexar fotos después del cierre sin alterar respuestas ni puntajes', () => {
    const auditoria = {
      tipo: '5s', plantillaId: PLANTILLA_5S_RIT_9_2_12.id, plantillaVersion: PLANTILLA_5S_RIT_9_2_12.version,
      documento: PLANTILLA_5S_RIT_9_2_12.documento, areaId: 'laminado', auditor: 'Lara', usuarioAcceso: 'lara',
      encargadoArea: 'Encargado', iniciadaEn: '2026-08-20T10:00:00.000Z', finalizadaEn: '2026-08-20T11:00:00.000Z',
      respuestas: [{ itemId: '5s-seiri-01a', puntaje: 1 as const, observacion: 'Material fuera de lugar.', evidenciaPaths: ['foto-anterior.jpg'] }],
      porcentajeCumplimiento: 50, porcentajePorSeccion: { seiri: 50 },
    } satisfies AuditoriaCampoSGO
    const actualizada = agregarEvidenciasAuditoriaCampo(
      auditoria, { '5s-seiri-01a': ['foto-anterior.jpg', 'foto-nueva.jpg'] }, 'Lara', '2026-08-20T15:00:00.000Z',
    )
    expect(actualizada.respuestas[0]).toMatchObject({ puntaje: 1, observacion: 'Material fuera de lugar.' })
    expect(actualizada.respuestas[0].evidenciaPaths).toEqual(['foto-anterior.jpg', 'foto-nueva.jpg'])
    expect(actualizada.porcentajeCumplimiento).toBe(50)
    expect(actualizada.finalizadaEn).toBe(auditoria.finalizadaEn)
    expect(actualizada.evidenciasActualizaciones).toEqual([
      { actualizadoEn: '2026-08-20T15:00:00.000Z', actualizadoPor: 'Lara', cantidadAgregada: 1 },
    ])
  })

  it('reconoce fotos de tablet aunque el navegador no informe el tipo MIME', () => {
    expect(tipoFotoDesdeArchivo({ name: 'CAMARA_001.JPG', type: '' } as File)).toBe('image/jpeg')
    expect(tipoFotoDesdeArchivo({ name: 'IMG_002.HEIC', type: '' } as File)).toBe('image/heic')
    expect(tipoFotoDesdeArchivo({ name: 'documento.pdf', type: '' } as File)).toBeUndefined()
  })
})
