import type { Tarea } from '../../types'
import { calcularOEE, desviosPorModelo, eficienciaPorOperario, pct } from '../../lib/kpi'
import { fmtDur } from '../../lib/time'
import ParetoDemoras from './ParetoDemoras'
import EstimadoVsRealizado from './EstimadoVsRealizado'
import DetalleTareas from './DetalleTareas'

function barColor(v: number): string {
  if (v >= 0.85) return 'var(--estado-fin)'
  if (v >= 0.6) return 'var(--naranja)'
  return 'var(--rojo)'
}

function KpiBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{pct(value)}</div>
      <div className="bar"><span style={{ width: pct(value), background: barColor(value) }} /></div>
    </div>
  )
}

export default function KpiPanel({ tareas, nombreOperario, nombreMaquina }: {
  tareas: Tarea[]
  nombreOperario: (id: string) => string
  nombreMaquina: (id: string) => string
}) {
  const oee = calcularOEE(tareas)
  const desvios = desviosPorModelo(tareas)
  const efic = [...eficienciaPorOperario(tareas).values()].sort((a, b) => b.eficiencia - a.eficiencia)

  return (
    <div>
      {/* OEE simplificado */}
      <div className="section-title">OEE de planta (sobre tareas finalizadas)</div>
      <div className="kpi-grid">
        <div className="kpi" style={{ borderColor: 'var(--azul-claro)' }}>
          <div className="label">OEE Global</div>
          <div className="value" style={{ color: barColor(oee.oee) }}>{pct(oee.oee)}</div>
          <div className="bar"><span style={{ width: pct(oee.oee), background: barColor(oee.oee) }} /></div>
        </div>
        <KpiBar label="Disponibilidad" value={oee.disponibilidad} />
        <KpiBar label="Rendimiento" value={oee.rendimiento} />
        <KpiBar label="Calidad" value={oee.calidad} />
      </div>

      {/* Tiempo estimado vs realizado (por maquina / modelo) */}
      <div className="section-title">Tiempo estimado vs realizado</div>
      <EstimadoVsRealizado tareas={tareas} nombreMaquina={nombreMaquina} />

      {/* Real vs Estandar por modelo */}
      <div className="section-title">Tiempos reales vs estandar por modelo</div>
      <div className="card">
        {desvios.length === 0 ? <div className="empty">Sin tareas finalizadas aun.</div> : desvios.map((d) => (
          <div key={d.modelo} className="pareto-row">
            <div className="pareto-lbl">{d.modelo}<div className="sub meta">{d.n} u.</div></div>
            <div className="pareto-bar-wrap">
              <div className="pareto-bar" style={{
                width: `${Math.min(100, (d.realNeto / Math.max(d.estandar, d.realNeto)) * 100)}%`,
                background: d.desvioPct > 0.1 ? 'var(--rojo)' : 'var(--estado-fin)',
                color: '#fff',
              }}>
                real {fmtDur(d.realNeto)} vs est {fmtDur(d.estandar)}
              </div>
            </div>
            <div style={{ width: 70, textAlign: 'right', fontWeight: 800, color: d.desvioPct > 0 ? 'var(--rojo)' : 'var(--estado-fin)' }}>
              {d.desvioPct > 0 ? '+' : ''}{(d.desvioPct * 100).toFixed(0)}%
            </div>
          </div>
        ))}
      </div>

      {/* v1.16: detalle por tarea con las 5 metricas canonicas (filtrable). */}
      <div className="section-title">Detalle por tarea (Estimado · Real · Demorado · Demora justificada · Demora sin justificar)</div>
      <DetalleTareas tareas={tareas} nombreOperario={nombreOperario} nombreMaquina={nombreMaquina} />

      {/* Pareto de demoras */}
      <div className="section-title">Pareto de demoras</div>
      <ParetoDemoras tareas={tareas} />

      {/* Eficiencia por operario */}
      <div className="section-title">Eficiencia por colaborador (activo vs parada)</div>
      <div className="card">
        {efic.length === 0 ? <div className="empty">Sin datos.</div> : efic.map((e) => (
          <div key={e.operarioId} className="pareto-row">
            <div className="pareto-lbl">{nombreOperario(e.operarioId)}</div>
            <div className="pareto-bar-wrap">
              <div className="pareto-bar" style={{ width: pct(e.eficiencia), background: barColor(e.eficiencia), color: '#fff' }}>
                {pct(e.eficiencia)} activo
              </div>
            </div>
            <div style={{ width: 90, textAlign: 'right' }} className="meta">parada {fmtDur(e.parada)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
