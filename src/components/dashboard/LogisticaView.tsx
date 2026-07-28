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
import DespachoView from './DespachoView'

// ============================================================
// Vista LOGISTICA (v1.45) — el área se divide en DOS bloques con su propio título:
//
//   · LOGÍSTICA OPERATIVA (Giuliano)      — pañol, planta, pedidos de material.
//       Gantt de planta · Tareas logísticas · Reportes
//   · LOGÍSTICA ADMINISTRATIVA (Melany)   — salida del producto terminado.
//       Despacho y embalaje (con sus propias sub-pestañas: operativo, tareas,
//       reportes, fletes y stock de depósitos)
//
// AMBOS encargados ven los DOS bloques: si uno se toma vacaciones o falta, el
// otro lo cubre sin depender de que alguien le habilite permisos. Lo único que
// cambia según quién entra es en qué bloque arranca parado.
// ============================================================
type PestaniaLog = 'gantt' | 'tareas' | 'reportes' | 'despacho'

export default function LogisticaView() {
  const { usuario } = useAuth()
  // El equipo de logística (cuenta 'logistica_equipo') no ve Reportes ni Despacho.
  const esEquipoLog = usuario?.usuario === 'logistica_equipo'
  // Melany arranca en su bloque; el resto, en el operativo. Ninguno queda excluido.
  const esMelany = usuario?.usuario === 'melany'
  const [pestania, setPestania] = useState<PestaniaLog>(esMelany && !esEquipoLog ? 'despacho' : 'gantt')
  const enAdministrativa = pestania === 'despacho'

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

  // Título de bloque. Se atenúa el que no está activo para que se vea de un
  // vistazo en cuál de las dos áreas está parado el usuario.
  const Titulo = ({ activo, icono, texto, sub }: { activo: boolean; icono: string; texto: string; sub: string }) => (
    <div className="section-title" style={{ margin: '18px 0 8px', opacity: activo ? 1 : 0.6 }}>
      {icono} {texto}
      <span className="meta" style={{ fontWeight: 400 }}> · {sub}</span>
    </div>
  )

  return (
    <div>
      {/* ---------- BLOQUE 1: LOGÍSTICA OPERATIVA (Giuliano) ---------- */}
      <Titulo activo={!enAdministrativa} icono="🏭" texto="Logística Operativa" sub="pañol, planta y pedidos de material" />
      <div className="tabs no-print">
        <button className={'tab' + (pestania === 'gantt' ? ' active' : '')} onClick={() => setPestania('gantt')}>Gantt de planta</button>
        <button className={'tab' + (pestania === 'tareas' ? ' active' : '')} onClick={() => setPestania('tareas')}>📋 Tareas logísticas</button>
        {!esEquipoLog && <button className={'tab' + (pestania === 'reportes' ? ' active' : '')} onClick={() => setPestania('reportes')}>📊 Reportes</button>}
      </div>

      {/* ---------- BLOQUE 2: LOGÍSTICA ADMINISTRATIVA (Melany) ---------- */}
      {!esEquipoLog && (
        <>
          <Titulo activo={enAdministrativa} icono="📦" texto="Logística Administrativa" sub="despacho, embalaje, fletes y stock de depósitos" />
          <div className="tabs no-print">
            <button className={'tab' + (enAdministrativa ? ' active' : '')} onClick={() => setPestania('despacho')}>🚚 Despacho y embalaje</button>
          </div>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        {/* La cola de pedidos de material es del bloque operativo: no tiene por
            qué aparecer arriba de todo cuando se está mirando Despacho. */}
        {!enAdministrativa && (
          <>
            <div className="section-title" style={{ marginTop: 0 }}>Cola de pedidos de material</div>
            <ColaMaterial />
          </>
        )}

        {pestania === 'gantt' ? <LogisticaGantt />
          : pestania === 'tareas' ? <LogisticaTareas />
          : (!esEquipoLog && pestania === 'reportes') ? <LogisticaReportes />
          : (!esEquipoLog && pestania === 'despacho') ? <DespachoView />
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
