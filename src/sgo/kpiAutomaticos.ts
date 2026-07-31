import { CAUSAS_PARADA, SECTORES, type SectorId, type Tarea, type TareaLaboratorio, type TareaLogistica } from '../types'
import { sumarMinutosLaborables } from '../lib/calendario'
import { fechaLocalISO, periodoLocalISO } from '../lib/time'
import type { AccionSGO, AreaSGOId, EventoSGO } from './types'
import { mesesFrecuenciaKPI, normalizarPeriodoKPI, periodoKPIEtiquetaCorta, rangoPeriodoKPI, type ClaveCalculoKPI, type FrecuenciaKPI, type IndicadorSGO, type MedicionIndicadorSGO } from './indicadores'

export interface DatosKPIAutomaticos {
  tareas: Tarea[]
  laboratorio: TareaLaboratorio[]
  tareasLogistica: TareaLogistica[]
  eventos: EventoSGO[]
  acciones: AccionSGO[]
  mediciones?: MedicionIndicadorSGO[]
}

export interface RegistroDetalleKPI {
  id: string
  fecha?: string
  referencia: string
  detalle: string
  resultado: 'cumple' | 'no_cumple' | 'informativo'
}

export interface DetalleKPIAutomatico {
  formula: string
  numerador?: number
  denominador?: number
  registros: RegistroDetalleKPI[]
  evolucion: { periodo: string; etiqueta: string; valor?: number }[]
}

const SECTOR_A_AREA: Partial<Record<SectorId, AreaSGOId>> = {
  bob_dist_at: 'bobinado_distribucion', bob_dist_bt: 'bobinado_distribucion',
  bob_rural_at: 'bobinado_rural', bob_rural_bt: 'bobinado_rural',
  montaje_pa_dist: 'montaje_distribucion', montaje_po_dist: 'montaje_distribucion',
  montaje_pa_rural: 'montaje_rural', montaje_po_rural: 'montaje_rural',
  corte_conformado: 'herreria_pintura', soldadura_dist: 'herreria_pintura',
  soldadura_rural: 'herreria_pintura', lavado_pintura: 'herreria_pintura',
  laboratorio: 'laboratorio',
}

const enPeriodo = (fecha: string | undefined, periodo: string, frecuencia: FrecuenciaKPI = 'mensual') => {
  if (!fecha) return false
  const { inicio, finExclusivo } = rangoPeriodoKPI(periodo, frecuencia)
  const mes = fecha.slice(0, 7)
  return mes >= inicio && mes < finExclusivo
}
const redondear = (n: number) => Math.round(n * 10) / 10
const sectorLabel = (id: SectorId) => SECTORES.find((s) => s.id === id)?.nombre ?? id

function periodosHasta(periodo: string, frecuencia: FrecuenciaKPI = 'mensual', cantidad = 6): string[] {
  const normalizado = normalizarPeriodoKPI(periodo, frecuencia)
  const [anio, mes] = normalizado.split('-').map(Number)
  if (!anio || !mes) return [periodo]
  const paso = mesesFrecuenciaKPI(frecuencia)
  return Array.from({ length: cantidad }, (_, indice) => {
    const fecha = new Date(Date.UTC(anio, mes - 1 - (cantidad - 1 - indice) * paso, 1))
    return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

function calcular(clave: ClaveCalculoKPI, area: AreaSGOId, periodo: string, d: DatosKPIAutomaticos, frecuencia: FrecuenciaKPI = 'mensual'): number | undefined {
  const ahora = new Date().toISOString()
  if (clave === 'produccion_cumplimiento') {
    const finPlanificado = (t: Tarea) => t.inicioPlanificado ? sumarMinutosLaborables(t.inicioPlanificado, Math.max(0, t.tiempoEstandarMin)) : undefined
    const base = d.tareas.filter((t) => {
      const fin = finPlanificado(t)
      return SECTOR_A_AREA[t.sectorId] === area && t.tipo !== 'reparacion' &&
        enPeriodo(t.inicioPlanificado, periodo, frecuencia) && !!fin && fin <= ahora
    })
    const enFecha = base.filter((t) => t.estado === 'finalizada' && !!t.finReal && t.finReal <= (finPlanificado(t) ?? '')).length
    return base.length ? redondear(enFecha / base.length * 100) : undefined
  }
  if (clave === 'produccion_retrabajos') {
    const tareasArea = d.tareas.filter((t) => SECTOR_A_AREA[t.sectorId] === area)
    return new Set(tareasArea.filter((t) =>
      (t.tipo === 'reparacion' && enPeriodo(t.finReal ?? t.inicioReal ?? t.creada, periodo, frecuencia)) ||
      t.paradas.some((p) => enPeriodo(p.inicio, periodo, frecuencia) && CAUSAS_PARADA.find((c) => c.id === p.causa)?.categoria === 'calidad'),
    ).map((t) => t.id)).size
  }
  if (clave === 'laboratorio_fpy') {
    const base = d.laboratorio.filter((t) => t.estado === 'finalizada' && enPeriodo(t.finalizada, periodo, frecuencia))
    return base.length ? redondear(base.filter((t) => t.resultado === 'aprobado' && !(t.reaperturas?.length)).length / base.length * 100) : undefined
  }
  if (clave === 'logistica_cumplimiento') {
    const hoyDia = fechaLocalISO()
    const base = d.tareasLogistica.filter((t) => t.origen !== 'despacho' && enPeriodo(t.fechaProgramada, periodo, frecuencia) && (t.fechaProgramada ?? '') <= hoyDia)
    const aTiempo = base.filter((t) => t.estado === 'finalizada' && !!t.finalizada && t.finalizada.slice(0, 10) <= (t.fechaProgramada ?? '')).length
    return base.length ? redondear(aTiempo / base.length * 100) : undefined
  }
  if (clave === 'costo_no_calidad') {
    const base = d.eventos.filter((e) => (e.areaOrigenId ?? e.areaId) === area && enPeriodo(e.detectadoEn, periodo, frecuencia))
    return redondear(base.reduce((s, e) => s + (e.costoEstimado ?? 0), 0))
  }
  if (clave === 'acciones_en_fecha') {
    const eventosArea = new Set(d.eventos.filter((e) => (e.areaOrigenId ?? e.areaId) === area).map((e) => e.id))
    const hoyDia = fechaLocalISO()
    const base = d.acciones.filter((a) => eventosArea.has(a.eventoId) && enPeriodo(a.fechaCompromiso, periodo, frecuencia) && a.fechaCompromiso <= hoyDia)
    const aTiempo = base.filter((a) => {
      const cierre = a.completadaEn ?? a.verificadaEn
      return !!cierre && cierre.slice(0, 10) <= a.fechaCompromiso
    }).length
    return base.length ? redondear(aTiempo / base.length * 100) : undefined
  }
  return undefined
}

export function resolverKPIAutomaticos(indicadores: IndicadorSGO[], datos: DatosKPIAutomaticos): IndicadorSGO[] {
  return indicadores.map((i) => i.origen === 'automatico' && i.claveCalculo
    ? { ...i, valorActual: calcular(i.claveCalculo, i.areaId, i.periodo, datos, i.frecuencia) }
    : i)
}

export function detalleKPIAutomatico(indicador: IndicadorSGO, d: DatosKPIAutomaticos): DetalleKPIAutomatico {
  const { areaId: area, periodo, claveCalculo: clave } = indicador
  const frecuencia = indicador.frecuencia ?? 'mensual'
  const evolucion = periodosHasta(periodo, frecuencia).map((p) => ({ periodo: p, etiqueta: periodoKPIEtiquetaCorta(p, frecuencia), valor: clave ? calcular(clave, area, p, d, frecuencia) : undefined }))
  if (indicador.origen !== 'automatico' || !clave) {
    const historico = (d.mediciones ?? []).filter((m) => m.indicadorId === indicador.id)
      .sort((a, b) => a.periodo.localeCompare(b.periodo)).slice(-6)
      .map((m) => ({ periodo: m.periodo, etiqueta: periodoKPIEtiquetaCorta(m.periodo, frecuencia), valor: m.valor }))
    return { formula: 'Valor ingresado manualmente por el responsable del indicador.', registros: [], evolucion: historico.length ? historico : [{ periodo, etiqueta: periodoKPIEtiquetaCorta(periodo, frecuencia), valor: indicador.valorActual }] }
  }
  const ahora = new Date().toISOString()
  if (clave === 'produccion_cumplimiento') {
    const finPlanificado = (t: Tarea) => t.inicioPlanificado ? sumarMinutosLaborables(t.inicioPlanificado, Math.max(0, t.tiempoEstandarMin)) : undefined
    const base = d.tareas.filter((t) => {
      const fin = finPlanificado(t)
      return SECTOR_A_AREA[t.sectorId] === area && t.tipo !== 'reparacion' &&
        enPeriodo(t.inicioPlanificado, periodo, frecuencia) && !!fin && fin <= ahora
    })
    const cumple = (t: Tarea) => t.estado === 'finalizada' && !!t.finReal && t.finReal <= (finPlanificado(t) ?? '')
    const cumplidas = base.filter(cumple).length
    return {
      formula: 'Tareas finalizadas antes del fin planificado ÷ tareas cuyo fin planificado ya venció × 100.', numerador: cumplidas, denominador: base.length, evolucion,
      registros: base.map((t) => ({ id: t.id, fecha: t.inicioPlanificado, referencia: t.nroTransformador || t.modelo || t.id,
        detalle: `${sectorLabel(t.sectorId)} · ${t.estado.replace('_', ' ')}`, resultado: cumple(t) ? 'cumple' : 'no_cumple' })),
    }
  }
  if (clave === 'produccion_retrabajos') {
    const tareasArea = d.tareas.filter((t) => SECTOR_A_AREA[t.sectorId] === area)
    const registros: RegistroDetalleKPI[] = tareasArea.flatMap((t) => {
      const esReparacion = t.tipo === 'reparacion' && enPeriodo(t.finReal ?? t.inicioReal ?? t.creada, periodo, frecuencia)
      const paradas = t.paradas.filter((p) => enPeriodo(p.inicio, periodo, frecuencia) && CAUSAS_PARADA.find((c) => c.id === p.causa)?.categoria === 'calidad')
      if (!esReparacion && paradas.length === 0) return []
      return [{
        id: t.id, fecha: paradas[0]?.inicio ?? t.finReal ?? t.inicioReal ?? t.creada,
        referencia: t.nroTransformador || t.modelo || t.id,
        detalle: `${esReparacion ? 'Reparación' : 'Desvío de calidad'} · ${sectorLabel(t.sectorId)}${paradas.length ? ` · ${paradas.length} parada(s)` : ''}`,
        resultado: 'no_cumple' as const,
      }]
    })
    return { formula: 'Cantidad de tareas únicas con reparación o al menos una parada de Calidad.', numerador: registros.length, registros, evolucion }
  }
  if (clave === 'laboratorio_fpy') {
    const base = d.laboratorio.filter((t) => t.estado === 'finalizada' && enPeriodo(t.finalizada, periodo, frecuencia))
    const aprobados = base.filter((t) => t.resultado === 'aprobado' && !(t.reaperturas?.length)).length
    return {
      formula: 'Ensayos aprobados a primera pasada ÷ ensayos finalizados × 100.', numerador: aprobados, denominador: base.length, evolucion,
      registros: base.map((t) => ({ id: t.id, fecha: t.finalizada, referencia: t.nroSerie || t.ot || t.modelo,
        detalle: `${t.modelo} · ${t.resultado === 'aprobado' && !(t.reaperturas?.length) ? 'Aprobado a primera pasada' : 'Con retrabajo/reapertura'}`, resultado: t.resultado === 'aprobado' && !(t.reaperturas?.length) ? 'cumple' : 'no_cumple' })),
    }
  }
  if (clave === 'logistica_cumplimiento') {
    const hoyDia = fechaLocalISO()
    const base = d.tareasLogistica.filter((t) => t.origen !== 'despacho' && enPeriodo(t.fechaProgramada, periodo, frecuencia) && (t.fechaProgramada ?? '') <= hoyDia)
    const cumple = (t: TareaLogistica) => t.estado === 'finalizada' && !!t.finalizada && t.finalizada.slice(0, 10) <= (t.fechaProgramada ?? '')
    return {
      formula: 'Tareas terminadas hasta la fecha programada ÷ tareas logísticas vencidas del período × 100.', numerador: base.filter(cumple).length, denominador: base.length, evolucion,
      registros: base.map((t) => ({ id: t.id, fecha: t.fechaProgramada, referencia: t.titulo,
        detalle: `${t.responsable || 'Sin responsable'} · ${t.estado.replace('_', ' ')}`, resultado: cumple(t) ? 'cumple' : 'no_cumple' })),
    }
  }
  if (clave === 'costo_no_calidad') {
    const base = d.eventos.filter((e) => (e.areaOrigenId ?? e.areaId) === area && enPeriodo(e.detectadoEn, periodo, frecuencia))
    const total = redondear(base.reduce((s, e) => s + (e.costoEstimado ?? 0), 0))
    return {
      formula: 'Suma del costo estimado de los eventos SGO originados en el área durante el período.', numerador: total, evolucion,
      registros: base.map((e) => ({ id: e.id, fecha: e.detectadoEn, referencia: `${e.codigo} · ${e.titulo}`,
        detalle: `$${(e.costoEstimado ?? 0).toLocaleString('es-AR')} · ${e.estado.replace('_', ' ')}`, resultado: 'informativo' })),
    }
  }
  const eventosArea = new Map(d.eventos.filter((e) => (e.areaOrigenId ?? e.areaId) === area).map((e) => [e.id, e]))
  const hoyDia = fechaLocalISO()
  const base = d.acciones.filter((a) => eventosArea.has(a.eventoId) && enPeriodo(a.fechaCompromiso, periodo, frecuencia) && a.fechaCompromiso <= hoyDia)
  const cumple = (a: AccionSGO) => {
    const cierre = a.completadaEn ?? a.verificadaEn
    return !!cierre && cierre.slice(0, 10) <= a.fechaCompromiso
  }
  return {
    formula: 'Acciones cerradas hasta su fecha compromiso ÷ acciones cuyo compromiso ya venció en el período × 100.', numerador: base.filter(cumple).length, denominador: base.length, evolucion,
    registros: base.map((a) => ({ id: a.id, fecha: a.fechaCompromiso, referencia: eventosArea.get(a.eventoId)?.codigo ?? a.eventoId,
      detalle: `${a.descripcion} · ${a.responsable || 'Sin responsable'}`, resultado: cumple(a) ? 'cumple' : 'no_cumple' })),
  }
}

function plantilla(areaId: AreaSGOId, clave: ClaveCalculoKPI, nombre: string, pilar: IndicadorSGO['pilar'], unidad: string, direccion: IndicadorSGO['direccion'], meta: number, amarillo: number, usuario: string): IndicadorSGO {
  return { id: `auto_${areaId}_${clave}`, areaId, pilar, nombre, unidad, direccion, meta, umbralAmarillo: amarillo,
    origen: 'automatico', claveCalculo: clave, periodo: periodoLocalISO(), frecuencia: 'mensual', activo: true,
    actualizadoEn: new Date().toISOString(), actualizadoPor: usuario }
}

export function plantillasKPIAutomaticos(usuario: string): IndicadorSGO[] {
  const areasProduccion: AreaSGOId[] = ['bobinado_rural', 'bobinado_distribucion', 'montaje_distribucion', 'montaje_rural', 'herreria_pintura']
  const out: IndicadorSGO[] = []
  for (const area of areasProduccion) {
    out.push(plantilla(area, 'produccion_cumplimiento', 'Cumplimiento del fin planificado', 'entrega', '%', 'mayor_mejor', 90, 75, usuario))
    out.push(plantilla(area, 'produccion_retrabajos', 'Tareas con retrabajo o desvío de calidad', 'calidad', 'cantidad', 'menor_mejor', 0, 2, usuario))
  }
  out.push(plantilla('laboratorio', 'laboratorio_fpy', 'Aprobación de ensayos a primera pasada', 'calidad', '%', 'mayor_mejor', 95, 85, usuario))
  out.push(plantilla('logistica_operativa', 'logistica_cumplimiento', 'Tareas logísticas completadas en fecha', 'entrega', '%', 'mayor_mejor', 90, 75, usuario))
  const todas: AreaSGOId[] = ['bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural','herreria_pintura','laminado','administracion','logistica_operativa','logistica_administrativa','mantenimiento','automatismo','it','planificacion_produccion','laboratorio','gerencia_directorio','diseno']
  for (const area of todas) {
    out.push(plantilla(area, 'costo_no_calidad', 'Costo de no calidad registrado', 'costos', '$', 'menor_mejor', 0, 100000, usuario))
    out.push(plantilla(area, 'acciones_en_fecha', 'Acciones cerradas en fecha', 'mejora', '%', 'mayor_mejor', 90, 75, usuario))
  }
  return out
}
