import { useMemo, useState } from 'react'
import type { Tarea } from '../../types'
import { esReparacion } from '../../types'
import { fmtDur, fechaCorta, hhmm } from '../../lib/time'
import {
  desglosePausas, tiempoRealHasta, tiempoEstimadoMin, minutosParada,
  minutosNoProductivos, demoraSinJustificarHasta,
} from '../../lib/kpi'

// ============================================================
// DIAGNÓSTICO DE TIEMPOS (v1.68)
//
// Para cuando un número no cierra. Muestra, tarea por tarea, EXACTAMENTE lo que
// la app tiene guardado: cuántas paradas registró el operario, cuánto suma cada
// una y cómo se arma la demora sin justificar.
//
// Sirve para distinguir de una los dos casos que se confunden:
//   A) La tarea NO tiene paradas guardadas -> problema de DATOS (no se
//      registraron, o no llegaron a la nube). El cálculo está bien.
//   B) La tarea SÍ tiene paradas pero el número no cierra -> problema de
//      CÁLCULO, y acá se ve en qué paso se va.
// ============================================================
export default function DiagnosticoTiempos({ tareas, nombreOperario }: {
  tareas: Tarea[]
  nombreOperario: (id: string) => string
}) {
  const [abierto, setAbierto] = useState(false)
  const [soloProblemas, setSoloProblemas] = useState(true)

  const filas = useMemo(() => {
    const ahoraISO = new Date().toISOString()
    return tareas
      .filter((t) => !esReparacion(t) && t.inicioReal)
      .map((t) => {
        const corte = t.estado === 'finalizada' ? t.finReal : ahoraISO
        const pausas = desglosePausas(t, corte)
        const just = minutosParada(t, corte)
        const noProd = minutosNoProductivos(t, corte)
        const real = tiempoRealHasta(t, corte)
        const est = tiempoEstimadoMin(t)
        const dsj = demoraSinJustificarHasta(t, corte)
        // Señal de alarma: mucha demora sin justificar y NINGUNA parada cargada.
        // Es el patrón típico de "las paradas no llegaron".
        const sospechosa = dsj >= 60 && pausas.length === 0
        return { t, pausas, just, noProd, real, est, dsj, sospechosa }
      })
      .sort((a, b) => b.dsj - a.dsj)
  }, [tareas])

  const visibles = soloProblemas ? filas.filter((f) => f.dsj > 0) : filas
  const sinParadas = filas.filter((f) => f.sospechosa).length

  if (!abierto) {
    return (
      <button className="btn no-print" style={{ marginBottom: 12 }} onClick={() => setAbierto(true)}>
        🔍 Diagnóstico de tiempos{sinParadas > 0 ? ` · ${sinParadas} tarea(s) sin paradas cargadas` : ''}
      </button>
    )
  }

  return (
    <div className="card no-print" style={{ marginBottom: 12 }}>
      <div className="card-header">
        <div>
          <h3>🔍 Diagnóstico de tiempos</h3>
          <div className="meta">Lo que la app tiene guardado de cada tarea, paso por paso.</div>
        </div>
        <button className="btn" onClick={() => setAbierto(false)}>✕ Cerrar</button>
      </div>

      {sinParadas > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--rojo)', marginBottom: 10 }}>
          <div className="meta" style={{ color: 'var(--rojo)', fontWeight: 700 }}>
            ⚠ {sinParadas} tarea(s) con demora ≥ 1h y CERO paradas guardadas.
          </div>
          <div className="meta" style={{ marginTop: 4 }}>
            Si el operario sí las cargó, entonces las paradas no llegaron a la nube: el problema es
            de datos, no del cálculo. Revisá el semáforo de sincronización en la tablet.
          </div>
        </div>
      )}

      <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <input type="checkbox" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.target.checked)} />
        Ver solo las que tienen demora sin justificar
      </label>

      {visibles.length === 0 ? <div className="empty">Sin tareas para mostrar.</div> : visibles.slice(0, 40).map((f) => (
        <div key={f.t.id} className="card" style={{ borderLeft: `4px solid ${f.sospechosa ? 'var(--rojo)' : 'var(--borde)'}` }}>
          <div className="meta" style={{ fontWeight: 700 }}>
            {f.t.modelo}{f.t.nroTransformador ? ` · ${f.t.nroTransformador}` : ''}
            {f.t.operarioId ? ` · ${nombreOperario(f.t.operarioId)}` : ''}
          </div>
          <div className="meta">
            {f.t.estado} · {f.t.inicioReal ? `${fechaCorta(f.t.inicioReal)} ${hhmm(f.t.inicioReal)}` : '—'}
            {f.t.finReal ? ` → ${fechaCorta(f.t.finReal)} ${hhmm(f.t.finReal)}` : ' → (en curso)'}
          </div>

          {/* La cuenta, en el mismo orden en que la hace el motor. */}
          <div className="meta" style={{ marginTop: 6, fontFamily: 'var(--mono, monospace)' }}>
            Real {fmtDur(f.real)} − Estimado {fmtDur(f.est)} − Justificada {fmtDur(f.just)}
            {' = '}<strong style={{ color: f.dsj > 0 ? 'var(--rojo)' : 'var(--estado-fin)' }}>{fmtDur(f.dsj)}</strong>
          </div>

          <div className="meta" style={{ marginTop: 6 }}>
            <strong>Paradas guardadas: {f.pausas.length}</strong>
            {f.noProd > 0 ? ` · almuerzo/pausas ${fmtDur(f.noProd)} (descontado del real)` : ''}
          </div>
          {f.pausas.length === 0 ? (
            <div className="meta" style={{ color: 'var(--rojo)' }}>
              ✗ Esta tarea NO tiene ninguna parada guardada en la app.
            </div>
          ) : (
            <div style={{ marginTop: 4 }}>
              {f.pausas.map((x) => (
                <div key={x.id} className="meta">
                  • {x.label} — {hhmm(x.inicio)}{x.abierta ? ' (SIN CERRAR)' : `–${hhmm(x.fin)}`} ·{' '}
                  <strong>{fmtDur(x.minutos)}</strong> · {x.productiva ? 'cuenta como justificada' : 'no productiva'}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {visibles.length > 40 && <div className="meta">…y {visibles.length - 40} más.</div>}
    </div>
  )
}
