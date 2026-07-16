import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { SECTORES, materialLabel, esSectorBobinado, BOBINADO_SECTORES, type LineaProduccion, type SectorId, type Tarea } from '../../types'
import { exportarProgramacionCSV, hayDatosProgramacion } from '../../lib/export'
import GanttOperativo from './GanttOperativo'
import ColaMaterial from './ColaMaterial'
import LogisticaTareas from './LogisticaTareas'
import LogisticaReportes from './LogisticaReportes'

// ============================================================
// Vista LOGISTICA. Dos pestañas:
//  - Gantt de planta (solo lectura) con los MISMOS filtros que el planificador + export.
//  - Organizador de tareas logisticas (crear/asignar/finalizar).
// La alerta de espera de material queda arriba, siempre visible.
// ============================================================
export default function LogisticaView() {
  const [pestania, setPestania] = useState<'gantt' | 'tareas' | 'reportes'>('gantt')
  return (
    <div>
      <div className="section-title" style={{ margin: '4px 0 12px' }}>Logística · cola de pedidos de material</div>
      <ColaMaterial />

      <div className="tabs no-print" style={{ marginTop: 12 }}>
        <button className={'tab' + (pestania === 'gantt' ? ' active' : '')} onClick={() => setPestania('gantt')}>Gantt de planta</button>
        <button className={'tab' + (pestania === 'tareas' ? ' active' : '')} onClick={() => setPestania('tareas')}>📋 Tareas logísticas</button>
        <button className={'tab' + (pestania === 'reportes' ? ' active' : '')} onClick={() => setPestania('reportes')}>📊 Reportes</button>
      </div>

      {pestania === 'gantt' ? <LogisticaGantt /> : pestania === 'tareas' ? <LogisticaTareas /> : <LogisticaReportes />}
    </div>
  )
}

// ---------- Gantt de planta (solo lectura) con filtros + export ----------
function LogisticaGantt() {
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), []) ?? []
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), []) ?? []

  const [linea, setLinea] = useState<'todas' | LineaProduccion>('todas')
  const [sectorFiltro, setSectorFiltro] = useState<'todos' | SectorId>('todos')
  const [agrupar, setAgrupar] = useState<'sector' | 'maquina' | 'operario'>('maquina')

  const sectorPasa = useMemo(() => (sid: SectorId) => {
    if (sectorFiltro !== 'todos' && sid !== sectorFiltro) return false
    if (linea !== 'todas') {
      const sec = SECTORES.find((s) => s.id === sid)
      if (sec && sec.linea !== linea && sec.linea !== 'general') return false
    }
    return true
  }, [linea, sectorFiltro])

  const filtradas = useMemo(() => tareas.filter((t) => sectorPasa(t.sectorId)), [tareas, sectorPasa])
  const maquinasVis = useMemo(() => maquinas.filter((m) => m.activo && (
    sectorPasa(m.sectorId) || (esSectorBobinado(m.sectorId) && BOBINADO_SECTORES.some(sectorPasa))
  )), [maquinas, sectorPasa])
  const operarios = useMemo(() => usuarios.filter((u) => u.rol === 'operario' && (u.sectores ?? []).some(sectorPasa)).map((u) => ({ id: u.id, nombre: u.nombre })), [usuarios, sectorPasa])

  const nombreMaquina = useMemo(() => { const m = new Map(maquinas.map((x) => [x.id, x.nombre])); return (id: string) => m.get(id) ?? id }, [maquinas])
  const nombreOperario = useMemo(() => { const m = new Map(usuarios.map((u) => [u.id, u.nombre])); return (id: string) => m.get(id) ?? id }, [usuarios])
  const materialTarea = useMemo(() => {
    const m = new Map(ordenes.map((o) => [o.id, o.material]))
    return (t: Tarea) => { const mat = t.ordenId ? m.get(t.ordenId) : undefined; return mat ? materialLabel(mat) : '-' }
  }, [ordenes])

  const puedeExportar = hayDatosProgramacion(filtradas)

  return (
    <>
      <div className="filtros no-print">
        <select className="select" value={linea} onChange={(e) => setLinea(e.target.value as 'todas' | LineaProduccion)}>
          <option value="todas">Todas las lineas</option>
          <option value="distribucion">Distribucion</option>
          <option value="rural">Rural</option>
        </select>
        <select className="select" value={sectorFiltro} onChange={(e) => setSectorFiltro(e.target.value as 'todos' | SectorId)}>
          <option value="todos">Todos los sectores</option>
          {SECTORES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className="select" value={agrupar} onChange={(e) => setAgrupar(e.target.value as typeof agrupar)}>
          <option value="maquina">Agrupar por estacion</option>
          <option value="sector">Agrupar por sector</option>
          <option value="operario">Agrupar por colaborador</option>
        </select>
      </div>
      <div className="export-bar no-print">
        <button className="btn btn-primary" disabled={!puedeExportar}
          title={puedeExportar ? 'Descargar la programacion en CSV (Excel)' : 'No hay tareas para exportar'}
          onClick={() => exportarProgramacionCSV(filtradas, new Date().toISOString(), nombreMaquina, nombreOperario, materialTarea)}
        >⬇ Exportar programación (Excel)</button>
      </div>

      <GanttOperativo
        tareas={filtradas}
        agrupar={agrupar}
        maquinas={maquinasVis}
        operarios={operarios}
        nombreOperario={nombreOperario}
        nombreMaquina={nombreMaquina}
        soloLectura
      />
    </>
  )
}
