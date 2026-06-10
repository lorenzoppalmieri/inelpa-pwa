import { useMemo } from 'react'
import type { Tarea, EstadoTarea } from '../../types'
import { sectorById } from '../../types'
import { hhmm, fmtDur } from '../../lib/time'

// Ventana horaria del Gantt (jornada de planta).
const H_INI = 6
const H_FIN = 19
const TOTAL_MIN = (H_FIN - H_INI) * 60

const COLOR: Record<EstadoTarea, string> = {
  pendiente: 'var(--estado-pendiente)',
  en_proceso: 'var(--estado-proceso)',
  pausada: 'var(--estado-pausa)',
  finalizada: 'var(--estado-fin)',
}

function minDelDia(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

// Calcula posicion (left%) y ancho (%) de una barra dentro de la ventana.
function geom(startMin: number, endMin: number) {
  const s = Math.max(H_INI * 60, Math.min(startMin, H_FIN * 60))
  const e = Math.max(s + 6, Math.min(endMin, H_FIN * 60))
  return {
    left: ((s - H_INI * 60) / TOTAL_MIN) * 100,
    width: ((e - s) / TOTAL_MIN) * 100,
  }
}

interface Barra {
  tarea: Tarea
  left: number
  width: number
  estimada: boolean
}

export default function GanttOperativo({ tareas, agrupar, nombreOperario, nombreMaquina }: {
  tareas: Tarea[]
  agrupar: 'sector' | 'operario' | 'maquina'
  nombreOperario: (id: string) => string
  nombreMaquina: (id: string) => string
}) {
  const ahoraMin = new Date().getHours() * 60 + new Date().getMinutes()

  const grupos = useMemo(() => {
    const map = new Map<string, Barra[]>()
    for (const t of tareas) {
      // Determinar inicio/fin (real o estimado por prioridad).
      let startMin: number, endMin: number, estimada = false
      if (t.inicioReal) {
        startMin = minDelDia(t.inicioReal)
        endMin = t.finReal ? minDelDia(t.finReal) : ahoraMin
      } else {
        // Estimado: secuencia simple a partir de las 8:00 segun prioridad.
        startMin = 8 * 60 + (t.prioridad - 1) * 60
        endMin = startMin + t.tiempoEstandarMin
        estimada = true
      }
      const g = geom(startMin, endMin)
      const key = agrupar === 'sector'
        ? sectorById(t.sectorId).nombre
        : agrupar === 'maquina'
          ? nombreMaquina(t.maquinaId)
          : (t.operarioId ? nombreOperario(t.operarioId) : 'Sin iniciar')
      const arr = map.get(key) ?? []
      arr.push({ tarea: t, left: g.left, width: g.width, estimada })
      map.set(key, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [tareas, agrupar, ahoraMin, nombreOperario, nombreMaquina])

  const horas = Array.from({ length: H_FIN - H_INI + 1 }, (_, i) => H_INI + i)
  const ahoraPct = ((ahoraMin - H_INI * 60) / TOTAL_MIN) * 100

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="gantt">
        <div className="gantt-inner">
          <div className="gantt-head">
            <div className="gantt-lblcol">{agrupar === 'sector' ? 'Sector' : agrupar === 'maquina' ? 'Estacion' : 'Colaborador'}</div>
            <div className="gantt-timeline">
              {horas.slice(0, -1).map((h) => (
                <div key={h} className="gantt-hcell">{String(h).padStart(2, '0')}:00</div>
              ))}
            </div>
          </div>

          {grupos.map(([key, barras]) => (
            <div className="gantt-row" key={key}>
              <div className="gantt-rowlbl">
                <div>{key}</div>
                <div className="sub">{barras.length} tarea(s)</div>
              </div>
              <div className="gantt-track">
                {/* lineas de grilla */}
                {horas.slice(1, -1).map((h, i) => (
                  <div key={h} className="gantt-grid-line" style={{ left: `${((i + 1) / (H_FIN - H_INI)) * 100}%` }} />
                ))}
                {/* linea "ahora" */}
                {ahoraPct >= 0 && ahoraPct <= 100 && (
                  <div className="gantt-grid-line" style={{ left: `${ahoraPct}%`, background: 'var(--rojo)', width: 2 }} />
                )}
                {barras.map((b, i) => (
                  <div
                    key={b.tarea.id + i}
                    className="gantt-bar"
                    style={{
                      left: `${b.left}%`, width: `${b.width}%`,
                      background: COLOR[b.tarea.estado],
                      opacity: b.estimada ? 0.5 : 1,
                      border: b.estimada ? '1px dashed rgba(255,255,255,.5)' : 'none',
                      color: b.tarea.estado === 'pausada' ? '#1a1206' : '#fff',
                    }}
                    title={`${b.tarea.modelo} · ${b.tarea.estado}${b.tarea.inicioReal ? ` · inicio ${hhmm(b.tarea.inicioReal)}` : ` · estimado ${fmtDur(b.tarea.tiempoEstandarMin)}`}`}
                  >
                    {b.tarea.modelo}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {grupos.length === 0 && <div className="empty">Sin tareas para los filtros seleccionados.</div>}
        </div>
      </div>
      <div className="legend" style={{ padding: '12px 16px' }}>
        <span><i style={{ background: 'var(--estado-pendiente)' }} /> Estimado/Pendiente</span>
        <span><i style={{ background: 'var(--estado-proceso)' }} /> En proceso</span>
        <span><i style={{ background: 'var(--estado-pausa)' }} /> Pausado por demora</span>
        <span><i style={{ background: 'var(--estado-fin)' }} /> Finalizado</span>
        <span><i style={{ background: 'var(--rojo)', width: 3 }} /> Ahora</span>
      </div>
    </div>
  )
}
