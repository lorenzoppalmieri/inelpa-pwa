import { useMemo, useState } from 'react'
import type { Tarea } from '../../types'
import { esReparacion } from '../../types'
import { tiempoRealMin } from '../../lib/kpi'

// ============================================================
// KPI Tiempo Estimado vs Realizado (sin librerias de graficos: divs + CSS).
//  - Solo tareas FINALIZADAS (excluye reparaciones: son tiempo no productivo).
//  - Estimado  = tiempoEstandarMin (teorico de planificacion).
//  - Realizado = tiempoDisponible(t): tiempo NETO de ejecucion ya descontando
//    almuerzo, noches y fines de semana (no altera la eficiencia real).
//  - Agrupable por Maquina (puestos con mas desvio) o por Modelo (estimacion).
// ============================================================
type Agrupar = 'maquina' | 'modelo'
interface Fila { clave: string; estimado: number; realizado: number; n: number }

// minutos -> "H:MM"
function hhmm(min: number): string {
  const m = Math.max(0, Math.round(min))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
function desvio(f: Fila): number {
  return f.estimado > 0 ? (f.realizado - f.estimado) / f.estimado : 0
}

export default function EstimadoVsRealizado({ tareas, nombreMaquina }: {
  tareas: Tarea[]
  nombreMaquina: (id: string) => string
}) {
  const [agrupar, setAgrupar] = useState<Agrupar>('maquina')

  const filas = useMemo<Fila[]>(() => {
    const fin = tareas.filter((t) => t.estado === 'finalizada' && !esReparacion(t))
    const map = new Map<string, Fila>()
    for (const t of fin) {
      const clave = agrupar === 'maquina' ? nombreMaquina(t.maquinaId) : t.modelo
      const cur = map.get(clave) ?? { clave, estimado: 0, realizado: 0, n: 0 }
      cur.estimado += t.tiempoEstandarMin
      cur.realizado += tiempoRealMin(t)
      cur.n++
      map.set(clave, cur)
    }
    // Peor desvio primero (lo que mas conviene mirar).
    return [...map.values()].sort((a, b) => desvio(b) - desvio(a))
  }, [tareas, agrupar, nombreMaquina])

  // Escala global (compara magnitudes entre filas y dentro de cada fila).
  const max = Math.max(1, ...filas.flatMap((f) => [f.estimado, f.realizado]))

  return (
    <div className="card">
      <div className="evr-head">
        <div className="seg">
          <button className={'seg-btn' + (agrupar === 'maquina' ? ' on' : '')} onClick={() => setAgrupar('maquina')}>Por máquina</button>
          <button className={'seg-btn' + (agrupar === 'modelo' ? ' on' : '')} onClick={() => setAgrupar('modelo')}>Por modelo</button>
        </div>
        <div className="evr-legend">
          <span><i style={{ background: 'var(--azul-claro)' }} /> Estimado</span>
          <span><i style={{ background: 'var(--estado-fin)' }} /> Realizado ≤ est.</span>
          <span><i style={{ background: 'var(--rojo)' }} /> Realizado &gt; est.</span>
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="empty">Sin tareas finalizadas en el período.</div>
      ) : filas.map((f) => {
        const d = desvio(f)
        const sobre = f.realizado > f.estimado
        return (
          <div className="evr-row" key={f.clave}>
            <div className="evr-lbl">
              <div>{f.clave}</div>
              <div className="sub meta">{f.n} u.</div>
            </div>
            <div className="evr-bars">
              <div className="evr-track">
                <div className="evr-bar evr-est" style={{ width: `${(f.estimado / max) * 100}%` }} />
                <span className="evr-val">{hhmm(f.estimado)}</span>
              </div>
              <div className="evr-track">
                <div className={'evr-bar ' + (sobre ? 'evr-over' : 'evr-ok')} style={{ width: `${(f.realizado / max) * 100}%` }} />
                <span className="evr-val">{hhmm(f.realizado)}</span>
              </div>
            </div>
            <div className={'evr-desvio ' + (sobre ? 'mal' : 'bien')} title="Desvío realizado vs estimado">
              {d > 0 ? '+' : ''}{(d * 100).toFixed(0)}%
            </div>
          </div>
        )
      })}
    </div>
  )
}
