import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { SECTORES, materialLabel, esSectorBobinado, BOBINADO_SECTORES, type LineaProduccion, type SectorId, type Tarea } from '../../types'
import { exportarProgramacionCSV, hayDatosProgramacion } from '../../lib/export'
import { useAuth } from '../../auth/AuthContext'
import GanttOperativo from './GanttOperativo'
import ColaMaterial from './ColaMaterial'
import LogisticaTareas from './LogisticaTareas'
import LogisticaReportes from './LogisticaReportes'
import DespachoView, { TABS_DESPACHO, esEncargadoDespacho, type VistaDespacho } from './DespachoView'
import { esSuperAdmin } from '../../auth/roles'
import CubicajeCarga from '../logistica/CubicajeCarga'

// ============================================================
// Vista LOGISTICA (v1.47) — UN SOLO módulo, "Logística", a cargo de Giuliano.
//
// En v1.45 el área estaba partida en "Logística Operativa" y "Logística
// Administrativa". El organigrama cambió: la administrativa desaparece y todo
// queda bajo Logística. Adentro siguen conviviendo los dos frentes de trabajo,
// pero ya como agrupación visual de pestañas, no como áreas distintas:
//
//   · Pañol y planta       — Gantt · Tareas logísticas · Reportes · Cubicaje
//   · Despacho y embalaje  — Operativo · Tareas · Reportes · Fletes · Stock
//
// Todos los encargados ven todo: si uno falta, el otro lo cubre sin que nadie
// tenga que habilitar permisos. Lo único que cambia según quién entra es en qué
// pestaña arranca parado.
// ============================================================
type PestaniaLog = 'gantt' | 'tareas' | 'reportes' | 'cubicaje' | 'despacho'

export default function LogisticaView() {
  const { usuario } = useAuth()
  // El equipo de logística (cuenta 'logistica_equipo') no ve Reportes ni Despacho.
  const esEquipoLog = usuario?.usuario === 'logistica_equipo'
  // Melany arranca en despacho, que es su frente; el resto en el pañol.
  const esMelany = usuario?.usuario === 'melany'
  const [pestania, setPestania] = useState<PestaniaLog>(esMelany && !esEquipoLog ? 'despacho' : 'gantt')
  const enDespacho = pestania === 'despacho'
  // Sub-vista del módulo de despacho, controlada desde acá (ver TABS_DESPACHO).
  const [vistaDespacho, setVistaDespacho] = useState<VistaDespacho>('operativo')
  const esEncargado = esEncargadoDespacho(usuario?.usuario, esSuperAdmin(usuario))

  // El equipo de despacho (cuenta 'despacho') ve SOLO el módulo de Despacho, sin
  // pestañas ni la cola de material: entran, toman tareas de embalaje y las cierran.
  if (usuario?.usuario === 'despacho') {
    return (
      <div>
        <div className="section-title" style={{ margin: '4px 0 12px' }}>🚚 Despacho y embalaje</div>
        <DespachoView />
      </div>
    )
  }

  // Etiqueta chica para separar los dos frentes dentro del mismo módulo. No es
  // un título de área: el área es una sola, "Logística".
  const Grupo = ({ texto }: { texto: string }) => (
    <div className="meta" style={{ margin: '14px 0 6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>{texto}</div>
  )

  return (
    <div>
      <div className="section-title" style={{ margin: '4px 0 2px' }}>
        🚚 Logística
        <span className="meta" style={{ fontWeight: 400 }}> · pañol, planta, despacho, embalaje, fletes y carga</span>
      </div>

      {/* Frente 1: el pañol y la planta */}
      <Grupo texto="Pañol y planta" />
      <div className="tabs no-print">
        <button className={'tab' + (pestania === 'gantt' ? ' active' : '')} onClick={() => setPestania('gantt')}>Gantt de planta</button>
        <button className={'tab' + (pestania === 'tareas' ? ' active' : '')} onClick={() => setPestania('tareas')}>📋 Tareas logísticas</button>
        {!esEquipoLog && <button className={'tab' + (pestania === 'reportes' ? ' active' : '')} onClick={() => setPestania('reportes')}>📊 Reportes</button>}
        {/* v1.47: llegó desde el módulo SGO. Es una herramienta operativa de
            carga, no una auditoría. */}
        <button className={'tab' + (pestania === 'cubicaje' ? ' active' : '')} onClick={() => setPestania('cubicaje')}>📐 Cubicaje y carga</button>
      </div>

      {/* Frente 2: la salida del producto terminado */}
      {!esEquipoLog && (
        <>
          <Grupo texto="Despacho y embalaje" />
          <div className="tabs no-print">
            {TABS_DESPACHO.filter((t) => !t.soloSupervisora || esEncargado).map((t) => (
              <button
                key={t.id}
                className={'tab' + (enDespacho && vistaDespacho === t.id ? ' active' : '')}
                onClick={() => { setVistaDespacho(t.id); setPestania('despacho') }}
              >{t.label}</button>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        {/* La cola de pedidos de material es del frente del pañol: no tiene por
            qué aparecer arriba de todo cuando se está mirando Despacho. */}
        {!enDespacho && pestania !== 'cubicaje' && (
          <>
            <div className="section-title" style={{ marginTop: 0 }}>Cola de pedidos de material</div>
            <ColaMaterial />
          </>
        )}

        {pestania === 'gantt' ? <LogisticaGantt />
          : pestania === 'tareas' ? <LogisticaTareas />
          : pestania === 'cubicaje' ? <CubicajeCarga />
          : (!esEquipoLog && pestania === 'reportes') ? <LogisticaReportes />
          : (!esEquipoLog && pestania === 'despacho') ? <DespachoView vista={vistaDespacho} onVista={setVistaDespacho} />
          : <LogisticaGantt />}
      </div>
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
