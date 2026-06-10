import type { Tarea } from '../../types'
import { paretoDemoras } from '../../lib/kpi'
import { fmtDur } from '../../lib/time'

export default function ParetoDemoras({ tareas }: { tareas: Tarea[] }) {
  const items = paretoDemoras(tareas)
  if (items.length === 0) return <div className="card"><div className="empty">Sin paradas registradas.</div></div>
  const max = items[0].minutos

  return (
    <div className="card">
      {items.map((it) => (
        <div key={it.causa} className="pareto-row">
          <div className="pareto-lbl">{it.label}<div className="sub meta">{it.eventos} evento(s)</div></div>
          <div className="pareto-bar-wrap">
            <div className="pareto-bar" style={{ width: `${(it.minutos / max) * 100}%` }}>{fmtDur(it.minutos)}</div>
          </div>
          <div style={{ width: 90, textAlign: 'right' }} className="meta">
            {(it.pct * 100).toFixed(0)}% · acum {(it.acum * 100).toFixed(0)}%
          </div>
        </div>
      ))}
    </div>
  )
}
