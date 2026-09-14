import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { accionPendiente, comparacionIndicador, diasAtraso, evidenciaIndicador, evolucionIndicador, indicadorEnPeriodo, ordenarAcciones } from '../fichaGestion'
import { crearInformeFicha, type InformeFichaDatos } from '../../components/sgo/InformeFichaSGO'
import type { IndicadorSGO } from '../indicadores'
import type { AccionSGO, EventoSGO } from '../types'
import type { DatosKPIAutomaticos } from '../kpiAutomaticos'
vi.mock('../../sync/syncEngine', () => ({ eliminarIndicadorSGO: vi.fn() }))
import FichaCeldaSGO from '../../components/sgo/FichaCeldaSGO'
import MatrizSGO from '../../components/sgo/MatrizSGO'

const kpi: IndicadorSGO = { id: 'k', nombre: 'Cumplimiento de Seguridad en 5S', areaId: 'bobinado_rural', pilar: 'seguridad', periodo: '2026-09', valorActual: 100, meta: 90, umbralAmarillo: 75, unidad: '%', direccion: 'mayor_mejor', activo: true, origen: 'manual', actualizadoEn: '', actualizadoPor: 'lara' }
const evento: EventoSGO = { id: 'e', codigo: 'SGO-2026-DEMO', titulo: 'Hallazgos 5S · BOBINADO RURAL · Seguridad', tipo: 'hallazgo_auditoria', pilar: 'seguridad', areaId: 'bobinado_rural', descripcion: 'Verificar protección del aparejo y documentar el cierre.', severidad: 'alta', estado: 'abierto', responsable: 'Lara', detectadoEn: '2026-08-21T12:00:00Z', detectadoPor: 'Azul', creadoEn: '', actualizadoEn: '' }
const accion: AccionSGO = { id: 'a', eventoId: 'e', tipo: 'correctiva', descripcion: 'Instalar el final de carrera y verificar el funcionamiento seguro del aparejo.', responsable: 'Mantenimiento', fechaCompromiso: '2026-08-28', estado: 'pendiente', creadoEn: '', creadoPor: 'lara', actualizadoEn: '' }
const datos: DatosKPIAutomaticos = { tareas: [], laboratorio: [], tareasLogistica: [], eventos: [evento], acciones: [accion], mediciones: [{ id: 'm', indicadorId: 'k', periodo: '2026-08', valor: 92, cerrado: true, registradoEn: '', registradoPor: 'lara', actualizadoEn: '', actualizadoPor: 'lara', evidencia: 'Informe 5S agosto' }] }
const informe: InformeFichaDatos = { area: 'BOBINADO RURAL', pilar: 'Seguridad', periodo: 'septiembre de 2026', emitido: '14/9/2026, 10:00', kpis: [kpi], eventos: [evento], acciones: [accion], controles: [], datos }

describe('ficha de gestión y exportación aislada', () => {
  it('calcula atraso por días calendario y no marca futuro ni hoy', () => {
    expect(diasAtraso('2026-08-31', '2026-09-02')).toBe(2)
    expect(diasAtraso('2026-09-02', '2026-09-02')).toBe(0)
    expect(diasAtraso('2026-09-03', '2026-09-02')).toBe(0)
    expect(diasAtraso('', '2026-09-02')).toBe(0)
  })
  it('conserva las completadas pendientes de verificación pero no canceladas/verificadas', () => {
    expect(accionPendiente(accion)).toBe(true)
    expect(accionPendiente({ ...accion, estado: 'verificada' })).toBe(false)
    expect(accionPendiente({ ...accion, estado: 'cancelada' })).toBe(false)
  })
  it('prioriza riesgo antes de fecha, sin mutar las acciones originales', () => {
    const lista = [{ ...accion, id: 'b', eventoId: 'b', fechaCompromiso: '2020-01-01' }, accion]
    expect(ordenarAcciones(lista, [evento, { ...evento, id: 'b', severidad: 'baja' }])[0].id).toBe('a')
    expect(lista[0].id).toBe('b')
  })
  it('no reutiliza un valor de septiembre para un mes sin medición', () => {
    expect(indicadorEnPeriodo(kpi, '2026-07', datos).valorActual).toBeUndefined()
    expect(indicadorEnPeriodo(kpi, '2026-08', datos).valorActual).toBe(92)
    expect(indicadorEnPeriodo(kpi, '2026-09', datos).valorActual).toBe(100)
  })
  it('compara períodos consecutivos y respeta dirección y frecuencia', () => {
    expect(comparacionIndicador(kpi, datos)).toMatchObject({ anterior: 92, diferencia: 8, mejora: true })
    expect(comparacionIndicador({ ...kpi, direccion: 'menor_mejor' }, datos).mejora).toBe(false)
    expect(comparacionIndicador({ ...kpi, frecuencia: 'trimestral' }, datos).periodo).toBe('2026-04')
    expect(comparacionIndicador(kpi, { ...datos, mediciones: [] }).diferencia).toBeUndefined()
  })
  it('el histórico consultado no contiene meses futuros y conserva el valor actual', () => {
    expect(evolucionIndicador(kpi, datos).map(v => v.valor)).toEqual([92, 100])
    expect(evolucionIndicador(indicadorEnPeriodo(kpi, '2026-07', datos), datos)).toEqual([{ periodo: '2026-07', etiqueta: '2026-07', valor: undefined }])
  })
  it('distingue evidencia manual de registros automáticos', () => {
    expect(evidenciaIndicador(kpi, datos)).toContain('Sin evidencia vinculada')
    expect(evidenciaIndicador(indicadorEnPeriodo(kpi, '2026-08', datos), datos)).toContain('Informe 5S agosto')
  })
  it('escapa HTML de registros y no copia los estilos globales ni el resto de la aplicación', () => {
    const html = crearInformeFicha({ ...informe, area: '<script>alert(1)</script>' }, true)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('visibility:hidden')
    expect(html).not.toContain('modal-overlay')
    expect(html).not.toContain('<img')
    expect(html).toContain('Imprimir / Guardar como PDF')
    expect(html).toContain('SGO-2026-DEMO')
  })
  it('el resumen declara los recortes y el detallado conserva todas las filas', () => {
    const acciones = Array.from({ length: 80 }, (_, n) => ({ ...accion, id: String(n), descripcion: 'Acción única ' + n }))
    expect(crearInformeFicha({ ...informe, acciones }, false)).toContain('8 de 80 acciones')
    expect(crearInformeFicha({ ...informe, acciones }, true)).toContain('Acción única 79')
  })
  it('renderiza vacíos sin falsos resultados', () => {
    expect(crearInformeFicha({ ...informe, kpis: [], eventos: [], acciones: [] }, true)).toContain('Sin indicadores configurados')
  })
  it('muestra atención separada del KPI y reserva eliminar a Lorenzo', () => {
    const props = { areaId: kpi.areaId, pilarId: kpi.pilar, indicadores: [kpi], eventos: [evento], acciones: [accion], controles: [], datos, onClose: () => {}, onOpenEvento: () => {}, onOpenControl: () => {}, onFiltrarEventos: () => {} }
    const html = renderToStaticMarkup(<FichaCeldaSGO {...props} usuario="lara" />)
    expect(html).toContain('Requiere atención')
    expect(html).toContain('Conforme')
    expect(html).not.toContain('Eliminar KPI')
    expect(renderToStaticMarkup(<FichaCeldaSGO {...props} usuario="Lorenzo" />)).toContain('Eliminar KPI')
  })
  it('incluye todas las áreas y no cuenta una alerta como medición', () => {
    const html = renderToStaticMarkup(<MatrizSGO eventos={[evento]} acciones={[accion]} indicadores={[]} onSelect={() => {}} />)
    expect(html).toContain('CARPINTERÍA')
    expect(html).toContain('CORTE AISLACIÓN')
    expect(html).toContain('DESPACHO')
    expect(html).toContain('RECURSOS HUMANOS')
    expect(html).toContain('<strong>0%</strong>')
  })
})
