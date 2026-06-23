import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import { isoWeek } from '../../lib/time'
import type { EstadoTarea, Tarea } from '../../types'
import { sectorById, TIPO_ESTACION_LABEL, maquinaSirveSector, esSectorBobinado } from '../../types'
import TareaCard from './TareaCard'
import AndonView from '../dashboard/AndonView'

const ORDEN: Record<EstadoTarea, number> = { pausada: 0, en_proceso: 1, pendiente: 2, finalizada: 3 }
const FILTROS: { id: 'activas' | 'pendientes' | 'finalizadas'; label: string }[] = [
  { id: 'activas', label: 'En curso' },
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'finalizadas', label: 'Finalizadas' },
]

// Clave de persistencia de la estacion elegida (por usuario), para que sobreviva al reload.
function lsKey(uid: string) { return `inelpa_maquina_${uid}` }

export default function OperarioView() {
  const { usuario } = useAuth()
  const semana = isoWeek(new Date())

  // Estacion de trabajo elegida hoy (persistida en localStorage por usuario).
  const [maquinaId, setMaquinaId] = useState<string>(() =>
    usuario ? localStorage.getItem(lsKey(usuario.id)) ?? '' : '')

  function elegir(id: string) {
    setMaquinaId(id)
    if (usuario) localStorage.setItem(lsKey(usuario.id), id)
  }
  function cambiar() {
    setMaquinaId('')
    if (usuario) localStorage.removeItem(lsKey(usuario.id))
  }

  // v1.10: el operario alterna entre su trabajo y el tablero ANDON (premios).
  // OJO: el estado va aca, pero el "return" condicional debe ir DESPUES de todos
  // los hooks (Reglas de Hooks), si no React crashea (pantalla en blanco).
  const [pantalla, setPantalla] = useState<'trabajo' | 'andon'>('trabajo')

  // Estaciones disponibles para el operario: las de sus sectores. Para bobinado,
  // el pool de 30 bobinadoras sirve a cualquiera de sus sectores de bobinado.
  const maquinas = useLiveQuery(
    () => db.maquinas.filter((m) => m.activo && (usuario?.sectores ?? []).some((s) => maquinaSirveSector(m, s))).toArray(),
    [usuario?.id],
  )

  // Cola de tareas de la estacion elegida, semana corriente (offline-first).
  const tareas = useLiveQuery(
    () => maquinaId
      ? db.tareas.where('maquinaId').equals(maquinaId).and((t) => t.semana === semana).toArray()
      : Promise.resolve([] as Tarea[]),
    [maquinaId, semana],
  )

  const [filtro, setFiltro] = useState<'activas' | 'pendientes' | 'finalizadas'>('activas')

  // Barra de pestañas Mi trabajo / Andon (ya pasaron todos los hooks).
  const tabsTop = (
    <div className="tabs">
      <button className={'tab' + (pantalla === 'trabajo' ? ' active' : '')} onClick={() => setPantalla('trabajo')}>Mi trabajo</button>
      <button className={'tab' + (pantalla === 'andon' ? ' active' : '')} onClick={() => setPantalla('andon')}>🏆 Andon</button>
    </div>
  )
  if (pantalla === 'andon') return <div>{tabsTop}<AndonView /></div>

  if (!maquinas) return <div className="meta">Cargando estaciones...</div>

  // --- Paso 1: elegir estacion de trabajo ---
  if (!maquinaId) {
    return (
      <div>
        {tabsTop}
        <div className="section-title">¿En qué estación vas a trabajar hoy?</div>
        {maquinas.length === 0
          ? <div className="empty">No tenés estaciones asignadas. Avisá a tu encargado.</div>
          : maquinas.map((m) => (
              <button key={m.id} className="btn btn-bloque" style={{ justifyContent: 'space-between', marginBottom: 10 }} onClick={() => elegir(m.id)}>
                <span>{m.nombre}</span>
                <span className="rol-badge">{esSectorBobinado(m.sectorId) ? 'Bobinado · cualquier formato' : sectorById(m.sectorId).nombre}</span>
              </button>
            ))}
      </div>
    )
  }

  const maquina = maquinas.find((m) => m.id === maquinaId)

  if (!tareas) return <div className="meta">Cargando tareas...</div>

  const orden = [...tareas].sort((a, b) => (ORDEN[a.estado] - ORDEN[b.estado]) || (a.prioridad - b.prioridad))
  const vis = orden.filter((t) =>
    filtro === 'activas' ? (t.estado === 'en_proceso' || t.estado === 'pausada')
      : filtro === 'pendientes' ? t.estado === 'pendiente'
      : t.estado === 'finalizada')

  const cuenta = {
    activas: tareas.filter((t) => t.estado === 'en_proceso' || t.estado === 'pausada').length,
    pendientes: tareas.filter((t) => t.estado === 'pendiente').length,
    finalizadas: tareas.filter((t) => t.estado === 'finalizada').length,
  }

  return (
    <div>
      {tabsTop}
      <div className="card-header" style={{ marginBottom: 12 }}>
        <div>
          <div className="section-title" style={{ margin: 0 }}>
            {maquina ? maquina.nombre : 'Estación'} · semana {semana.split('-W')[1]}
          </div>
          {maquina && <div className="meta">{TIPO_ESTACION_LABEL[maquina.tipo]} · {esSectorBobinado(maquina.sectorId) ? 'Bobinado · cualquier formato' : sectorById(maquina.sectorId).nombre}</div>}
        </div>
        <button className="btn" onClick={cambiar}>Cambiar estación</button>
      </div>

      <div className="tabs">
        {FILTROS.map((f) => (
          <button key={f.id} className={'tab' + (filtro === f.id ? ' active' : '')} onClick={() => setFiltro(f.id)}>
            {f.label} ({cuenta[f.id]})
          </button>
        ))}
      </div>

      {vis.length === 0
        ? <div className="empty">No hay tareas en esta vista.</div>
        : vis.map((t) => <TareaCard key={t.id} tarea={t} />)}
    </div>
  )
}
