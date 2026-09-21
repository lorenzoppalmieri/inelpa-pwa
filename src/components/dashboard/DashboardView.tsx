import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import { SECTORES, materialLabel, esSectorBobinado, BOBINADO_SECTORES, type LineaProduccion, type SectorId, type Tarea, type Maquina } from '../../types'
import { isoWeek } from '../../lib/time'
import { filtrarPorRango } from '../../lib/kpi'
import { minutosHuecoPorTarea } from '../../lib/huecos'
import { rangoPeriodo, labelPeriodo, type Periodo } from '../../lib/periodos'
import FiltroPeriodo from '../ui/FiltroPeriodo'
import {
  exportarKpisCSV, exportarProgramacionCSV, hayDatosKpi, hayDatosProgramacion,
} from '../../lib/export'
import GanttOperativo from './GanttOperativo'
import KpiPanel from './KpiPanel'
import AndonView from './AndonView'
import AlertaMaterial from './AlertaMaterial'
import AlertaParadas from './AlertaParadas'
import CuellosView from './CuellosView'
import SugerenciasEstandar from './SugerenciasEstandar'
import PlanificacionView from '../planificador/PlanificacionView'
import AlertaRetrabajos, { useRetrabajosPendientes } from './AlertaRetrabajos'
import MensajesPlanificador from '../mensajes/MensajesPlanificador'
import MensajesInbox, { useMensajesNoLeidos } from '../mensajes/MensajesInbox'

// Periodo de analisis del Dashboard de KPIs (v1.4). No borra datos: solo acota
// el rango de fechas que se procesa.
// v2.07: el tipo, las opciones y el cálculo del rango salieron de acá y viven en
// `lib/periodos.ts`, compartidos con el listado de "Asignar tareas". Se re-exporta
// `Periodo` porque `DashboardCuerpo` lo usa en sus props.
export type { Periodo }

export default function DashboardView() {
  const { usuario, permisos } = useAuth()
  // v1.97: 'cuellos' — OEE por estación y cuellos de botella. La MISMA pantalla
  // se monta también en SGO (un solo componente, no dos copias).
  const [vista, setVista] = useState<'gantt' | 'kpis' | 'planificacion' | 'andon' | 'mensajes' | 'cuellos'>('gantt')
  // v1.73: contador de retrabajos para el badge de la pestaña Planificación.
  const nRetrabajos = useRetrabajosPendientes().length
  // v1.18: mensajes. El planificador redacta; el encargado recibe (bandeja).
  const esCompositor = !!permisos?.cargarProgramacion
  const noLeidos = useMensajesNoLeidos()
  const [linea, setLinea] = useState<'todas' | LineaProduccion>('todas')
  const [sectorFiltro, setSectorFiltro] = useState<'todos' | SectorId>('todos')
  const [agrupar, setAgrupar] = useState<'sector' | 'operario' | 'maquina'>('sector')
  const [periodo, setPeriodo] = useState<Periodo>('mes_actual')
  // v1.16: filtros extra de la pestaña KPIs (maquina, colaborador, dia puntual).
  const [kpiMaquina, setKpiMaquina] = useState<'todas' | string>('todas')
  const [kpiOperario, setKpiOperario] = useState<'todos' | string>('todos')
  const [kpiFecha, setKpiFecha] = useState<string>(() => new Date().toLocaleDateString('en-CA'))
  // v1.22: rango personalizado de fechas para KPIs. Por defecto: del 1° del mes a hoy.
  const [kpiDesde, setKpiDesde] = useState<string>(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1).toLocaleDateString('en-CA') })
  const [kpiHasta, setKpiHasta] = useState<string>(() => new Date().toLocaleDateString('en-CA'))
  // v1.17: al clickear una barra del Gantt, saltamos a Planificacion enfocando esa tarea.
  const [focoTareaId, setFocoTareaId] = useState<string | null>(null)
  const irATarea = (t: Tarea) => { setFocoTareaId(t.id); setVista('planificacion') }
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

  // v2.03 — TIEMPO MUERTO entre tareas (solo Bobinado). Se calcula UNA vez acá,
  // sobre `todasTareas`, porque es el único lugar que tiene la planta completa:
  // el hueco necesita la tarea anterior del MISMO operario, sea del sector que
  // sea. Si se calculara adentro de los componentes de KPI —que reciben la
  // lista ya filtrada— un bobinador que se fue a ayudar a herrería aparecería
  // como si hubiera estado sin hacer nada. Ver `lib/huecos.ts`.
  const huecos = useMemo(() => minutosHuecoPorTarea(todasTareas ?? []), [todasTareas])

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
    () => (maquinas ?? []).filter((m) => m.activo && (
      sectorPasa(m.sectorId) || (esSectorBobinado(m.sectorId) && BOBINADO_SECTORES.some(sectorPasa))
    )),
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

  // KPIs: tareas del periodo elegido (dia / mes actual / anterior / anual) +
  // filtros extra por maquina y colaborador (para analisis y toma de decisiones).
  const kpiFiltradas = useMemo(() => {
    let base = (todasTareas ?? []).filter(pasaFiltros)
    if (kpiMaquina !== 'todas') base = base.filter((t) => t.maquinaId === kpiMaquina)
    if (kpiOperario !== 'todos') base = base.filter((t) => t.operarioId === kpiOperario)
    const { desde, hasta } = rangoPeriodo(periodo, new Date(), kpiFecha, kpiDesde, kpiHasta)
    return filtrarPorRango(base, desde, hasta)
  }, [todasTareas, pasaFiltros, periodo, kpiMaquina, kpiOperario, kpiFecha, kpiDesde, kpiHasta])

  if (!tareas || !usuarios) return <div className="meta">Cargando dashboard...</div>

  // Alertas rapidas (paradas en curso).
  const enParada = filtradas.filter((t) => t.estado === 'pausada').length

  return (
    <div>
      <div className="section-title">
        Tablero de control · {permisos?.verTodosSectores ? 'Planta completa' : 'Mis sectores'} · semana {semana.split('-W')[1]}
        {enParada > 0 && <span className="estado-chip e-pausa" style={{ marginLeft: 10 }}>{enParada} en parada</span>}
      </div>

      {/* v1.11: alerta de espera de material visible para encargado/planificador. */}
      <AlertaMaterial compacto />

      {/* v2.17: el resto de las paradas abiertas (ayuda en el sector, falta de
          herramienta, calidad...). Va SEPARADO del cartel de logística porque
          ese tiene un destinatario concreto; éstas se resuelven en el sector.
          Antes el chip "N en parada" del título era el único indicio y había que
          ir a "Asignar tareas" a filtrar por pausadas para ver cuáles eran. */}
      <AlertaParadas compacto />

      {/* v1.73: retrabajos de laboratorio. Se ve desde CUALQUIER pestaña: antes
          vivía solo dentro de Planificación y se perdía si el planificador
          estaba parado en Gantt o KPIs. */}
      {permisos?.cargarProgramacion && <AlertaRetrabajos onIr={() => setVista('planificacion')} />}

      <div className="tabs tabs-nav no-print">
        <button className={'tab' + (vista === 'gantt' ? ' active' : '')} onClick={() => setVista('gantt')}><span className="nav-ico" aria-hidden="true">📈</span><span className="nav-txt-largo">Gantt operativo</span><span className="nav-txt-corto">Gantt</span></button>
        {/* v2.23: el Andon muestra cumplimiento individual por colaborador, así
            que deja de ser visible para los operarios. `verDashboard` es false
            en ese rol. El guard de verdad está dentro de AndonView. */}
        {permisos?.verDashboard && (
          <button className={'tab' + (vista === 'andon' ? ' active' : '')} onClick={() => setVista('andon')}><span className="nav-ico" aria-hidden="true">🏆</span><span className="nav-txt-largo">🏆 Andon</span><span className="nav-txt-corto">Andon</span></button>
        )}
        <button className={'tab' + (vista === 'kpis' ? ' active' : '')} onClick={() => setVista('kpis')}><span className="nav-ico" aria-hidden="true">📊</span><span className="nav-txt-largo">Eficiencia / KPIs</span><span className="nav-txt-corto">KPIs</span></button>
        <button className={'tab' + (vista === 'cuellos' ? ' active' : '')} onClick={() => setVista('cuellos')}><span className="nav-ico" aria-hidden="true">🔎</span><span className="nav-txt-largo">Cuellos / OEE</span><span className="nav-txt-corto">Cuellos</span></button>
        {(permisos?.cargarProgramacion || permisos?.crearReparacion) && (
          <button className={'tab' + (vista === 'planificacion' ? ' active' : '')} onClick={() => setVista('planificacion')}><span className="nav-ico" aria-hidden="true">🗂</span><span className="nav-txt-largo">Planificacion{nRetrabajos > 0 ? ` (${nRetrabajos})` : ''}</span><span className="nav-txt-corto">Planificar{nRetrabajos > 0 ? ` (${nRetrabajos})` : ''}</span></button>
        )}
        {/* v1.98: se retiró la pestaña "📊 Dirección". No aportaba información
            accionable y su lugar lo ocupa "Cuellos / OEE", que sí responde
            preguntas de gestión. El componente DireccionView.tsx queda en el
            repo sin montar, por si se quiere retomar. */}
        <button className={'tab' + (vista === 'mensajes' ? ' active' : '')} onClick={() => setVista('mensajes')}>
          <span className="nav-ico" aria-hidden="true">💬</span>
          <span className="nav-txt-largo">💬 Mensajes{!esCompositor && noLeidos > 0 ? ` (${noLeidos})` : ''}</span>
          <span className="nav-txt-corto">Mensajes{!esCompositor && noLeidos > 0 ? ` (${noLeidos})` : ''}</span>
        </button>
      </div>

      {vista === 'mensajes'
        ? (esCompositor ? <MensajesPlanificador /> : <MensajesInbox />)
        : vista === 'cuellos'
        ? <CuellosView />
        : vista === 'andon'
        ? <AndonView />
        : vista === 'planificacion' && (permisos?.cargarProgramacion || permisos?.crearReparacion)
        ? <PlanificacionView focoTareaId={focoTareaId} onFocoConsumido={() => setFocoTareaId(null)} />
        : <DashboardCuerpo
            vista={vista === 'gantt' || vista === 'kpis' ? vista : 'gantt'}
            linea={linea} setLinea={setLinea}
            sectorFiltro={sectorFiltro} setSectorFiltro={setSectorFiltro}
            agrupar={agrupar} setAgrupar={setAgrupar}
            periodo={periodo} setPeriodo={setPeriodo}
            kpiMaquina={kpiMaquina} setKpiMaquina={setKpiMaquina}
            kpiOperario={kpiOperario} setKpiOperario={setKpiOperario}
            kpiFecha={kpiFecha} setKpiFecha={setKpiFecha}
            kpiDesde={kpiDesde} setKpiDesde={setKpiDesde}
            kpiHasta={kpiHasta} setKpiHasta={setKpiHasta}
            sectoresVisibles={sectoresVisibles}
            filtradas={filtradas} kpiFiltradas={kpiFiltradas}
            maquinasVisibles={maquinasVisibles} operariosVisibles={operariosVisibles}
            nombreOperario={nombreOperario} nombreMaquina={nombreMaquina}
            materialTarea={materialTarea}
            huecos={huecos}
            puedeMoverProduccion={!!permisos?.gestionProduccion}
            onTareaClick={permisos?.cargarProgramacion ? irATarea : undefined}
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
  kpiMaquina: 'todas' | string
  setKpiMaquina: (v: 'todas' | string) => void
  kpiOperario: 'todos' | string
  setKpiOperario: (v: 'todos' | string) => void
  kpiFecha: string
  setKpiFecha: (v: string) => void
  kpiDesde: string
  setKpiDesde: (v: string) => void
  kpiHasta: string
  setKpiHasta: (v: string) => void
  sectoresVisibles: typeof SECTORES
  filtradas: Tarea[]
  kpiFiltradas: Tarea[]
  maquinasVisibles: Maquina[]
  operariosVisibles: { id: string; nombre: string }[]
  nombreOperario: (id: string) => string
  nombreMaquina: (id: string) => string
  materialTarea: (t: Tarea) => string
  /** v2.03 — tiempo muerto por tarea, calculado arriba sobre TODAS las tareas. */
  huecos: Map<string, number>
  puedeMoverProduccion: boolean
  onTareaClick?: (t: Tarea) => void
}) {
  const { vista, linea, setLinea, sectorFiltro, setSectorFiltro, agrupar, setAgrupar, periodo, setPeriodo, kpiMaquina, setKpiMaquina, kpiOperario, setKpiOperario, kpiFecha, setKpiFecha, kpiDesde, setKpiDesde, kpiHasta, setKpiHasta, sectoresVisibles, filtradas, kpiFiltradas, maquinasVisibles, operariosVisibles, nombreOperario, nombreMaquina, materialTarea, huecos, puedeMoverProduccion, onTareaClick } = props

  const periodoLabel = periodo === 'rango'
    ? `Rango ${kpiDesde} a ${kpiHasta}`
    : labelPeriodo(periodo)
  const puedeKpi = hayDatosKpi(kpiFiltradas)
  const puedeProg = hayDatosProgramacion(filtradas)
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)

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
          <>
            <select className="select" value={kpiMaquina} onChange={(e) => setKpiMaquina(e.target.value)}>
              <option value="todas">Todas las estaciones</option>
              {maquinasVisibles.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <select className="select" value={kpiOperario} onChange={(e) => setKpiOperario(e.target.value)}>
              <option value="todos">Todos los colaboradores</option>
              {operariosVisibles.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
            {/* v2.07: mismo componente que usa "Asignar tareas". Sin 'Todas':
                comparar KPIs contra toda la historia no dice nada. */}
            <FiltroPeriodo
              periodo={periodo} setPeriodo={setPeriodo}
              dia={kpiFecha} setDia={setKpiFecha}
              desde={kpiDesde} setDesde={setKpiDesde}
              hasta={kpiHasta} setHasta={setKpiHasta}
            />
          </>
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
            <button
              className="btn"
              disabled={!puedeKpi}
              title={puedeKpi ? 'Comparar tiempos reales vs estándar y sugerir ajustes' : 'No hay tareas finalizadas en el periodo'}
              onClick={() => setMostrarSugerencias(true)}
            >🎯 Sugerir Ajuste de Estándares</button>
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
        ? <GanttOperativo tareas={filtradas} agrupar={agrupar} maquinas={maquinasVisibles} operarios={operariosVisibles} nombreOperario={nombreOperario} nombreMaquina={nombreMaquina} puedeMoverProduccion={puedeMoverProduccion} onTareaClick={onTareaClick} />
        : <KpiPanel tareas={kpiFiltradas} nombreOperario={nombreOperario} nombreMaquina={nombreMaquina} huecos={huecos} />}

      {/* v2.20: ya no recibe `tareas`. El modal lee TODO el historial de
          finalizadas desde Dexie: un estándar se afina con todo lo producido,
          no con el período que el usuario tenga filtrado en pantalla. */}
      {mostrarSugerencias && (
        <SugerenciasEstandar nombreMaquina={nombreMaquina} onClose={() => setMostrarSugerencias(false)} />
      )}
    </>
  )
}
