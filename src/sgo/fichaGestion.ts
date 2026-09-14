import { fechaLocalISO } from '../lib/time'
import { detalleKPIAutomatico, resolverKPIAutomaticos, type DatosKPIAutomaticos } from './kpiAutomaticos'
import { mesesFrecuenciaKPI, normalizarPeriodoKPI, type IndicadorSGO } from './indicadores'
import type { AccionSGO, EventoSGO } from './types'

export function diasAtraso(fecha: string, hoy = fechaLocalISO()): number {
  const diferencia = Date.parse(hoy.slice(0, 10) + 'T12:00:00Z') - Date.parse(fecha.slice(0, 10) + 'T12:00:00Z')
  return Number.isFinite(diferencia) ? Math.max(0, Math.floor(diferencia / 86400000)) : 0
}

export function accionPendiente(a: AccionSGO): boolean {
  return !['verificada', 'cancelada'].includes(a.estado)
}

export function ordenarAcciones(acciones: AccionSGO[], eventos: EventoSGO[]): AccionSGO[] {
  const gravedad = new Map(eventos.map(e => [e.id, e.severidad === 'critica' ? 3 : e.severidad === 'alta' ? 2 : e.severidad === 'media' ? 1 : 0]))
  return [...acciones].sort((a, b) => (gravedad.get(b.eventoId) ?? 0) - (gravedad.get(a.eventoId) ?? 0)
    || a.fechaCompromiso.localeCompare(b.fechaCompromiso) || a.id.localeCompare(b.id))
}

// Consulta histórica: nunca reutilizar un valor manual de otro período.
export function indicadorEnPeriodo(i: IndicadorSGO, mes: string, datos: DatosKPIAutomaticos): IndicadorSGO {
  const periodo = normalizarPeriodoKPI(mes, i.frecuencia)
  const medicion = datos.mediciones?.find(m => m.indicadorId === i.id && m.periodo === periodo)
  return resolverKPIAutomaticos([{ ...i, periodo, valorActual: medicion?.valor ??
    (periodo === normalizarPeriodoKPI(i.periodo, i.frecuencia) ? i.valorActual : undefined) }], datos)[0]
}

export function comparacionIndicador(i: IndicadorSGO, datos: DatosKPIAutomaticos) {
  const [anio, mes] = normalizarPeriodoKPI(i.periodo, i.frecuencia).split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1 - mesesFrecuenciaKPI(i.frecuencia), 1))
  const periodo = fecha.toISOString().slice(0, 7)
  const anterior = indicadorEnPeriodo(i, periodo, datos).valorActual
  const diferencia = anterior === undefined || i.valorActual === undefined ? undefined : Math.round((i.valorActual - anterior) * 10) / 10
  return { periodo, anterior, diferencia, mejora: diferencia === undefined || diferencia === 0 ? undefined : i.direccion === 'mayor_mejor' ? diferencia > 0 : diferencia < 0 }
}

export function evidenciaIndicador(i: IndicadorSGO, datos: DatosKPIAutomaticos): string {
  if (i.origen === 'automatico' && i.claveCalculo) return `Calculado desde registros · ${detalleKPIAutomatico(i, datos).registros.length} registros fuente`
  const m = datos.mediciones?.find(m => m.indicadorId === i.id && m.periodo === normalizarPeriodoKPI(i.periodo, i.frecuencia))
  return m?.evidencia ? `Carga manual · Evidencia: ${m.evidencia}` : 'Carga manual · Sin evidencia vinculada'
}

export function evolucionIndicador(i: IndicadorSGO, datos: DatosKPIAutomaticos) {
  if (i.origen === 'automatico' && i.claveCalculo) return detalleKPIAutomatico(i, datos).evolucion
  const valores = (datos.mediciones ?? []).filter(m => m.indicadorId === i.id && m.periodo <= i.periodo)
    .map(m => ({ periodo: m.periodo, etiqueta: m.periodo, valor: m.valor as number | undefined }))
  if (!valores.some(v => v.periodo === i.periodo)) valores.push({ periodo: i.periodo, etiqueta: i.periodo, valor: i.valorActual })
  return valores.sort((a, b) => a.periodo.localeCompare(b.periodo)).slice(-6)
}
