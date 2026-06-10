import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import { SECTORES, type LineaProduccion, type SectorId } from '../../types'
import { isoWeek } from '../../lib/time'
import GanttOperativo from './GanttOperativo'
import KpiPanel from './KpiPanel'
import PlanificacionView from '../planificador/PlanificacionView'

export default function DashboardView() {
  const { usuario, permisos } = useAuth()
  const [vista, setVista] = useState<'gantt' | 'kpis' | 'planificacion'>('gantt')
  const [linea, setLinea] = useState<'todas' | LineaProduccion>('todas')
  const [sectorFiltro, setSectorFiltro] = useState<'todos' | SectorId>('todos')
  const [agrupar, setAgrupar] = useState<'sector' | 'operario' | 'maquina'>('sector')
  const semana = isoWeek(new Date())

  // Alcance por rol: planificador ve todo; encargado solo sus sectores.
  const sectoresPermitidos = permisos?.verTodosSectores
    ? SECTORES.map((s) => s.id)
    : (usuario?.sectores ?? [])

  const tareas = useLiveQuery(() => db.tareas.where('semana').equals(semana).toArray(), [semana])
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), [])
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), [])

  const nombreOperario = useMemo(() => {
    const m = new Map((usuarios ?? []).map((u) => [u.id, u.nombre]))
    return (id: string) => m.get(id) ?? id
  }, [usuarios])

  const nombreMaquina = useMemo(() => {
    const m = new Map((maquinas ?? []).map((x) => [x.id, x.nombre]))
    return (id: string) => m.get(id) ?? id
  }, [maquinas])

  const sectoresVisibles = SECTORES.filter((s) => sectoresPermitidos.includes(s.id))

  const filtradas = useMemo(() => {
    return (tareas ?? []).filter((t) => {
      if (!sectoresPermitidos.includes(t.sectorId)) return false
      if (sectorFiltro !== 'todos' && t.sectorId !== sectorFiltro) return false
      if (linea !== 'todas') {
        const sec = SECTORES.find((s) => s.id === t.sectorId)!
        if (sec.linea !== linea && sec.linea !== 'general') return false
      }
      return true
    })
  }, [tareas, sectoresPermitidos, sectorFiltro, linea])

  if (!tareas || !usuarios) return <div className="meta">Cargando dashboard...</div>

  // Alertas rapidas (paradas en curso).
  const enParada = filtradas.filter((t) => t.estado === 'pausada').length

  return (
    <div>
      <div className="section-title">
        Tablero de control · {permisos?.verTodosSectores ? 'Planta completa' : 'Mis sectores'} · semana {semana.split('-W')[1]}
        {enParada > 0 && <span className="estado-chip e-pausa" style={{ marginLeft: 10 }}>{enParada} en parada</span>}
      </div>

      <div className="tabs">
        <button className={'tab' + (vista === 'gantt' ? ' active' : '')} onClick={() => setVista('gantt')}>Gantt operativo</button>
        <button className={'tab' + (vista === 'kpis' ? ' active' : '')} onClick={() => setVista('kpis')}>Eficiencia / KPIs</button>
        {permisos?.cargarProgramacion && (
          <button className={'tab' + (vista === 'planificacion' ? ' active' : '')} onClick={() => setVista('planificacion')}>Planificacion</button>
        )}
      </div>

      {vista === 'planificacion' && permisos?.cargarProgramacion
        ? <PlanificacionView />
        : <DashboardCuerpo
            vista={vista === 'planificacion' ? 'gantt' : vista}
            linea={linea} setLinea={setLinea}
            sectorFiltro={sectorFiltro} setSectorFiltro={setSectorFiltro}
            agrupar={agrupar} setAgrupar={setAgrupar}
            sectoresVisibles={sectoresVisibles}
            filtradas={filtradas} nombreOperario={nombreOperario} nombreMaquina={nombreMaquina}
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
  sectoresVisibles: typeof SECTORES
  filtradas: import('../../types').Tarea[]
  nombreOperario: (id: string) => string
  nombreMaquina: (id: string) => string
}) {
  const { vista, linea, setLinea, sectorFiltro, setSectorFiltro, agrupar, setAgrupar, sectoresVisibles, filtradas, nombreOperario, nombreMaquina } = props
  return (
    <>
      <div className="filtros">
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
      </div>

      {vista === 'gantt'
        ? <GanttOperativo tareas={filtradas} agrupar={agrupar} nombreOperario={nombreOperario} nombreMaquina={nombreMaquina} />
        : <KpiPanel tareas={filtradas} nombreOperario={nombreOperario} />}
    </>
  )
}
