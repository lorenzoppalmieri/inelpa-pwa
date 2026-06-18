import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import { SECTORES, materialLabel, type LineaProduccion, type SectorId, type Tarea, type Maquina } from '../../types'
import { isoWeek } from '../../lib/time'
import { filtrarPorRango } from '../../lib/kpi'
import {
  exportarKpisCSV, exportarProgramacionCSV, hayDatosKpi, hayDatosProgramacion,
} from '../../lib/export'
import GanttOperativo from './GanttOperativo'
import KpiPanel from './KpiPanel'
import PlanificacionView from '../planificador/PlanificacionView'

// Periodo de analisis del Dashboard de KPIs (v1.4). No borra datos: solo acota
// el rango de fechas que se procesa.
export type Periodo = 'mes_actual' | 'mes_anterior' | 'anual'
const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'mes_actual', label: 'Mes actual' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'anual', label: 'Acumulado anual' },
]
function rangoPeriodo(periodo: Periodo, now: Date): { desde: string; hasta: string } {
  const y = now.getFullYear(), m = now.getMonth()
  if (periodo === 'anual') {
    return { desde: new Date(y, 0, 1).toISOString(), hasta: new Date(y + 1, 0, 1).toISOString() }
  }
  const mm = periodo === 'mes_anterior' ? m - 1 : m
  return { desde: new Date(y, mm, 1).toISOString(), hasta: new Date(y, mm + 1, 1).toISOString() }
}

export default function DashboardView() {
  const { usuario, permisos } = useAuth()
  const [vista, setVista] = useState<'gantt' | 'kpis' | 'planificacion'>('gantt')
  const [linea, setLinea] = useState<'todas' | LineaProduccion>('todas')
  const [sectorFiltro, setSectorFiltro] = useState<'todos' | SectorId>('todos')
  const [agrupar, setAgrupar] = useState<'sector' | 'operario' | 'maquina'>('sector')
  const [periodo, setPeriodo] = useState<Periodo>('mes_actual')
  const semana = isoWeek(new Date())

  // Alcance por rol: planificador ve todo; encargado solo sus sectores.
  const sectoresPermitidos = permisos?.verTodosSectores
    ? SECTORES.map((s) => s.id)
    : (usuario?.sectores ?? [])

  const tareas = useLiveQuery(() => db.tareas.where('semana').equals(semana).toArray(), [semana])
  // Para KPIs el periodo puede abarcar mes/ano: necesitamos toda la tabla.
  const todasTareas = useLiveQuery(() => db.tareas.toArray(), [])
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), [])
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), [])
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), [])

  const nombreOperario = useMemo(() => {
    const m = new Map((usuarios ?? []).map((u) => [u.id, u.nombre]))
    return (id: string) => m.get(id) ?? id
  }, [usuarios])

  const nombreMaquina = useMemo(() => {
    const m = new Map((maquinas ?? []).map((x) => [x.id, x.nombre]))
    return (id: string) => m.get(id) ?? id
  }, [maquinas])

  // Material de una tarea: vive en su orden de fabricacion (no en la tarea).
  const materialTarea = useMemo(() => {
    const m = new Map((ordenes ?? []).map((o) => [o.id, o.material]))
    return (t: Tarea) => { const mat = t.ordenId ? m.get(t.ordenId) : undefined; return mat ? materialLabel(mat) : '-' }
  }, [ordenes])

  const sectoresVisibles = SECTORES.filter((s) => sectoresPermitidos.includes(s.id))

  // Predicado de SECTOR (alcance por rol) + linea + sector. Base de todos los filtros.
  const sectorPasa = useMemo(() => {
    const permitidos = new Set(sectoresPermitidos)
    return (sid: SectorId) => {
      if (!permitidos.has(sid)) return false
      if (sectorFiltro !== 'todos' && sid !== sectorFiltro) return false
      if (linea !== 'todas') {
        const sec = SECTORES.find((s) => s.id === sid)!
        if (sec.linea !== linea && sec.linea !== 'general') return false
      }
      return true
    }
  }, [sectoresPermitidos, sectorFiltro, linea])

  const pasaFiltros = useMemo(() => (t: Tarea) => sectorPasa(t.sectorId), [sectorPasa])

  // Carriles del Gantt (eje Y): maquinas activas y operarios dentro del alcance.
  const maquinasVisibles = useMemo(
    () => (maquinas ?? []).filter((m) => m.activo && sectorPasa(m.sectorId)),
    [maquinas, sectorPasa],
  )
  const operariosVisibles = useMemo(
    () => (usuarios ?? [])
      .filter((u) => u.rol === 'operario' && (u.sectores ?? []).some(sectorPasa))
      .map((u) => ({ id: u.id, nombre: u.nombre })),
    [usuarios, sectorPasa],
  )

  // Gantt: TODA la tabla (filtrada por rol/linea/sector). El propio Gantt recorta
  // por los dias visibles, asi que la vista "Dia" puede mostrar cualquier fecha
  // (anterior o posterior a la semana activa).
  const filtradas = useMemo(() => (todasTareas ?? []).filter(pasaFiltros), [todasTareas, pasaFiltros])

  // KPIs: tareas del periodo elegido (mes actual / anterior / acumulado anual).
  const kpiFiltradas = useMemo(() => {
    const { desde, hasta } = rangoPeriodo(periodo, new Date())
    return filtrarPorRango((todasTareas ?? []).filter(pasaFiltros), desde, hasta)
  }, [todasTareas, pasaFiltros, periodo])

  if (!tareas || !usuarios) return <div className="meta">Cargando dashboard...</div>

  // Alertas rapidas (paradas en curso).
  const enParada = filtradas.filter((t) => t.estado === 'pausada').length

  return (
    <div>
      <div className="section-title">
        Tablero de control · {permisos?.verTodosSectores ? 'Planta completa' : 'Mis sectores'} · semana {semana.split('-W')[1]}
        {enParada > 0 && <span className="estado-chip e-pausa" style={{ marginLeft: 10 }}>{enParada} en parada</span>}
      </div>

      <div className="tabs no-print">
        <button className={'tab' + (vista === 'gantt' ? ' active' : '')} onClick={() => setVista('gantt')}>Gantt operativo</button>
        <button className={'tab' + (vista === 'kpis' ? ' active' : '')} onClick={() => setVista('kpis')}>Eficiencia / KPIs</button>
        {(permisos?.cargarProgramacion || permisos?.crearReparacion) && (
          <button className={'tab' + (vista === 'planificacion' ? ' active' : '')} onClick={() => setVista('planificacion')}>Planificacion</button>
        )}
      </div>

      {vista === 'planificacion' && (permisos?.cargarProgramacion || permisos?.crearReparacion)
        ? <PlanificacionView />
        : <DashboardCuerpo
            vista={vista === 'planificacion' ? 'gantt' : vista}
            linea={linea} setLinea={setLinea}
            sectorFiltro={sectorFiltro} setSectorFiltro={setSectorFiltro}
            agrupar={agrupar} setAgrupar={setAgrupar}
            periodo={periodo} setPeriodo={setPeriodo}
            sectoresVisibles={sectoresVisibles}
            filtradas={filtradas} kpiFiltradas={kpiFiltradas}
            maquinasVisibles={maquinasVisibles} operariosVisibles={operariosVisibles}
            nombreOperario={nombreOperario} nombreMaquina={nombreMaquina}
            materialTarea={materialTarea}
            puedeMoverProduccion={!!permisos?.gestionProduccion}
          />}
    </div>
  )
}

function DashboardCuerpo(props: {
  vista: 'gantt' | 'kpis'
  linea: 'todas' | LineaProduccion
  setLinea: (v: 'todas' | LineaProduccion) => void
  sectorFiltro: 'todos' | SectorId
  setSectorFiltro: (v: 'todos' | SectorId) => void
  agrupar: 'sector' | 'operario' | 'maquina'
  setAgrupar: (v: 'sector' | 'operario' | 'maquina') => void
  periodo: Periodo
  setPeriodo: (v: Periodo) => void
  sectoresVisibles: typeof SECTORES
  filtradas: Tarea[]
  kpiFiltradas: Tarea[]
  maquinasVisibles: Maquina[]
  operariosVisibles: { id: string; nombre: string }[]
  nombreOperario: (id: string) => string
  nombreMaquina: (id: string) => string
  materialTarea: (t: Tarea) => string
  puedeMoverProduccion: boolean
}) {
  const { vista, linea, setLinea, sectorFiltro, setSectorFiltro, agrupar, setAgrupar, periodo, setPeriodo, sectoresVisibles, filtradas, kpiFiltradas, maquinasVisibles, operariosVisibles, nombreOperario, nombreMaquina, materialTarea, puedeMoverProduccion } = props

  const periodoLabel = PERIODOS.find((p) => p.id === periodo)?.label ?? ''
  const puedeKpi = hayDatosKpi(kpiFiltradas)
  const puedeProg = hayDatosProgramacion(filtradas)

  return (
    <>
      <div className="filtros no-print">
        <select className="select" value={linea} onChange={(e) => setLinea(e.target.value as any)}>
          <option value="todas">Todas las lineas</option>
          <option value="distribucion">Distribucion</option>
          <option value="rural">Rural</option>
        </select>
        <select className="select" value={sectorFiltro} onChange={(e) => setSectorFiltro(e.target.value as any)}>
          <option value="todos">Todos los sectores</option>
          {sectoresVisibles.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        {vista === 'gantt' && (
          <select className="select" value={agrupar} onChange={(e) => setAgrupar(e.target.value as any)}>
            <option value="sector">Agrupar por sector</option>
            <option value="maquina">Agrupar por estacion</option>
            <option value="operario">Agrupar por colaborador</option>
          </select>
        )}
        {vista === 'kpis' && (
          <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
            {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        )}
      </div>

      <div className="export-bar no-print">
        {vista === 'kpis' ? (
          <>
            <button
              className="btn btn-primary"
              disabled={!puedeKpi}
              title={puedeKpi ? 'Descargar KPIs/OEE del periodo en CSV (Excel)' : 'No hay tareas finalizadas en el periodo'}
              onClick={() => exportarKpisCSV(kpiFiltradas, nombreMaquina, periodoLabel)}
            >⬇ Exportar KPIs (Excel)</button>
            <button
              className="btn"
              disabled={!puedeKpi}
              title={puedeKpi ? 'Imprimir / guardar como PDF (vista A4)' : 'No hay datos para imprimir'}
              onClick={() => window.print()}
            >🖨 Imprimir reporte</button>
          </>
        ) : (
          <button
            className="btn btn-primary"
            disabled={!puedeProg}
            title={puedeProg ? 'Descargar la cola de programacion activa en CSV (Excel)' : 'No hay tareas en cola'}
            onClick={() => exportarProgramacionCSV(filtradas, new Date().toISOString(), nombreMaquina, nombreOperario, materialTarea)}
          >⬇ Exportar programación (Excel)</button>
        )}
        {((vista === 'kpis' && !puedeKpi) || (vista === 'gantt' && !puedeProg)) && (
          <span className="meta" style={{ alignSelf: 'center' }}>Sin datos para exportar en esta selección.</span>
        )}
      </div>

      {vista === 'gantt'
        ? <GanttOperativo tareas={filtradas} agrupar={agrupar} maquinas={maquinasVisibles} operarios={operariosVisibles} nombreOperario={nombreOperario} nombreMaquina={nombreMaquina} puedeMoverProduccion={puedeMoverProduccion} />
        : <KpiPanel tareas={kpiFiltradas} nombreOperario={nombreOperario} nombreMaquina={nombreMaquina} />}
    </>
  )
}
