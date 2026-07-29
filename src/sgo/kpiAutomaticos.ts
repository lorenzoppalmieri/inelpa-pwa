import { CAUSAS_PARADA, type SectorId, type Tarea, type TareaLaboratorio, type TareaLogistica } from '../types'
import type { AccionSGO, AreaSGOId, EventoSGO } from './types'
import type { ClaveCalculoKPI, IndicadorSGO } from './indicadores'

export interface DatosKPIAutomaticos {
  tareas: Tarea[]
  laboratorio: TareaLaboratorio[]
  tareasLogistica: TareaLogistica[]
  eventos: EventoSGO[]
  acciones: AccionSGO[]
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

const enPeriodo = (fecha: string | undefined, periodo: string) => !!fecha && fecha.slice(0, 7) === periodo
const redondear = (n: number) => Math.round(n * 10) / 10

function calcular(clave: ClaveCalculoKPI, area: AreaSGOId, periodo: string, d: DatosKPIAutomaticos): number | undefined {
  const hoy = new Date().toISOString()
  if (clave === 'produccion_cumplimiento') {
    const base = d.tareas.filter((t) => SECTOR_A_AREA[t.sectorId] === area && t.tipo !== 'reparacion' && enPeriodo(t.inicioPlanificado, periodo) && (t.inicioPlanificado ?? '') <= hoy)
    return base.length ? redondear(base.filter((t) => t.estado === 'finalizada').length / base.length * 100) : undefined
  }
  if (clave === 'produccion_retrabajos') {
    const tareasArea = d.tareas.filter((t) => SECTOR_A_AREA[t.sectorId] === area)
    const reparaciones = tareasArea.filter((t) => t.tipo === 'reparacion' && enPeriodo(t.finReal ?? t.inicioReal ?? t.creada, periodo)).length
    const paradasCalidad = tareasArea.reduce((n, t) => n + t.paradas.filter((p) => enPeriodo(p.inicio, periodo) && CAUSAS_PARADA.find((c) => c.id === p.causa)?.categoria === 'calidad').length, 0)
    return reparaciones + paradasCalidad
  }
  if (clave === 'laboratorio_fpy') {
    const base = d.laboratorio.filter((t) => t.estado === 'finalizada' && enPeriodo(t.finalizada, periodo))
    return base.length ? redondear(base.filter((t) => t.resultado === 'aprobado').length / base.length * 100) : undefined
  }
  if (clave === 'logistica_cumplimiento') {
    const hoyDia = hoy.slice(0, 10)
    const base = d.tareasLogistica.filter((t) => t.origen !== 'despacho' && !!t.fechaProgramada && t.fechaProgramada.startsWith(periodo) && t.fechaProgramada <= hoyDia)
    const aTiempo = base.filter((t) => t.estado === 'finalizada' && !!t.finalizada && t.finalizada.slice(0, 10) <= (t.fechaProgramada ?? '')).length
    return base.length ? redondear(aTiempo / base.length * 100) : undefined
  }
  if (clave === 'costo_no_calidad') {
    const base = d.eventos.filter((e) => (e.areaOrigenId ?? e.areaId) === area && enPeriodo(e.detectadoEn, periodo))
    return base.length ? redondear(base.reduce((s, e) => s + (e.costoEstimado ?? 0), 0)) : undefined
  }
  if (clave === 'acciones_en_fecha') {
    const eventosArea = new Set(d.eventos.filter((e) => (e.areaOrigenId ?? e.areaId) === area).map((e) => e.id))
    const hoyDia = hoy.slice(0, 10)
    const base = d.acciones.filter((a) => eventosArea.has(a.eventoId) && a.fechaCompromiso.startsWith(periodo) && a.fechaCompromiso <= hoyDia)
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
    ? { ...i, valorActual: calcular(i.claveCalculo, i.areaId, i.periodo, datos) }
    : i)
}

function plantilla(areaId: AreaSGOId, clave: ClaveCalculoKPI, nombre: string, pilar: IndicadorSGO['pilar'], unidad: string, direccion: IndicadorSGO['direccion'], meta: number, amarillo: number, usuario: string): IndicadorSGO {
  return { id: `auto_${areaId}_${clave}`, areaId, pilar, nombre, unidad, direccion, meta, umbralAmarillo: amarillo,
    origen: 'automatico', claveCalculo: clave, periodo: new Date().toISOString().slice(0, 7), activo: true,
    actualizadoEn: new Date().toISOString(), actualizadoPor: usuario }
}

export function plantillasKPIAutomaticos(usuario: string): IndicadorSGO[] {
  const areasProduccion: AreaSGOId[] = ['bobinado_rural', 'bobinado_distribucion', 'montaje_distribucion', 'montaje_rural', 'herreria_pintura']
  const out: IndicadorSGO[] = []
  for (const area of areasProduccion) {
    out.push(plantilla(area, 'produccion_cumplimiento', 'Cumplimiento de tareas planificadas', 'entrega', '%', 'mayor_mejor', 90, 75, usuario))
    out.push(plantilla(area, 'produccion_retrabajos', 'Retrabajos registrados', 'calidad', 'cantidad', 'menor_mejor', 0, 2, usuario))
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
