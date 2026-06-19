import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import GanttOperativo from './GanttOperativo'
import AlertaMaterial from './AlertaMaterial'

// ============================================================
// Vista LOGISTICA (Fase 1, solo lectura). El equipo de logistica:
//  - ve una alerta roja cuando una tarea queda 'pausada' por espera de material,
//  - ve el Gantt de toda la planta (sin poder editar) para anticipar consumos.
// ============================================================
export default function LogisticaView() {
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), []) ?? []
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const [agrupar, setAgrupar] = useState<'maquina' | 'sector' | 'operario'>('maquina')

  const nombreMaquina = useMemo(() => { const m = new Map(maquinas.map((x) => [x.id, x.nombre])); return (id: string) => m.get(id) ?? id }, [maquinas])
  const nombreOperario = useMemo(() => { const m = new Map(usuarios.map((u) => [u.id, u.nombre])); return (id: string) => m.get(id) ?? id }, [usuarios])
  const operarios = useMemo(() => usuarios.filter((u) => u.rol === 'operario').map((u) => ({ id: u.id, nombre: u.nombre })), [usuarios])
  const maquinasActivas = useMemo(() => maquinas.filter((m) => m.activo), [maquinas])

  return (
    <div>
      <div className="section-title" style={{ margin: '4px 0 12px' }}>Logística · vista de planta (solo lectura)</div>

      {/* ---- Alerta de material ---- */}
      <AlertaMaterial />

      {/* ---- Gantt solo lectura ---- */}
      <div className="filtros no-print" style={{ marginTop: 14 }}>
        <select className="select" value={agrupar} onChange={(e) => setAgrupar(e.target.value as typeof agrupar)}>
          <option value="maquina">Agrupar por estación</option>
          <option value="sector">Agrupar por sector</option>
          <option value="operario">Agrupar por colaborador</option>
        </select>
      </div>
      <GanttOperativo
        tareas={tareas}
        agrupar={agrupar}
        maquinas={maquinasActivas}
        operarios={operarios}
        nombreOperario={nombreOperario}
        nombreMaquina={nombreMaquina}
        soloLectura
      />
    </div>
  )
}
