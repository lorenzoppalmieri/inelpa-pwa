import { useMemo, useState } from 'react'
import type { Tarea } from '../../types'
import { esReparacion } from '../../types'
import { componentePorCodigo } from '../../data/catalogo'
import { fmtDur } from '../../lib/time'
import {
  tiempoEstimadoMin, tiempoRealMin, totalDemoradoMin, demoraSinJustificarMin,
} from '../../lib/kpi'
import { exportarDetalleTareasCSV } from '../../lib/export'

// ============================================================
// DETALLE POR TAREA — tabla filtrable de tareas finalizadas. Columnas (v1.18):
//   Estimado | Real | Demorado (=Real-Estimado, exceso total sobre el estandar)
//   | Demora justificada (=suma de paradas registradas) | Demora sin justificar
//   (=Demorado - Demora justificada = tiempo perdido sin motivo reportado).
// ============================================================
export default function DetalleTareas({ tareas, nombreOperario, nombreMaquina }: {
  tareas: Tarea[]
  nombreOperario: (id: string) => string
  nombreMaquina: (id: string) => string
}) {
  const [q, setQ] = useState('')
  const [soloDemora, setSoloDemora] = useState(false)

  const filas = useMemo(() => {
    const fin = tareas.filter((t) => t.estado === 'finalizada' && !esReparacion(t))
    const txt = q.trim().toLowerCase()
    return fin.map((t) => {
      const comp = componentePorCodigo(t.componenteCodigo)
      const nombre = comp ? comp.descripcion : t.modelo
      return {
        t,
        id: t.id,
        nombre,
        nro: t.nroTransformador ?? '',
        operario: t.operarioId ? nombreOperario(t.operarioId) : '—',
        maquina: nombreMaquina(t.maquinaId),
        estimado: tiempoEstimadoMin(t),
        real: tiempoRealMin(t),
        demorado: Math.max(0, tiempoRealMin(t) - tiempoEstimadoMin(t)), // exceso total sobre estandar
        justificada: totalDemoradoMin(t),                               // suma de paradas registradas
        sinJust: demoraSinJustificarMin(t),                             // = Demorado - justificada
      }
    })
      .filter((r) => !txt || `${r.nombre} ${r.nro} ${r.operario} ${r.maquina}`.toLowerCase().includes(txt))
      .filter((r) => !soloDemora || r.sinJust > 0)
      .sort((a, b) => b.sinJust - a.sinJust)
  }, [tareas, q, soloDemora, nombreOperario, nombreMaquina])

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div className="filtros no-print" style={{ marginBottom: 10 }}>
        <input className="input" placeholder="Buscar por semielaborado, colaborador o máquina…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
        <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={soloDemora} onChange={(e) => setSoloDemora(e.target.checked)} />
          Solo con demora sin justificar
        </label>
        <button
          className="btn btn-primary"
          disabled={filas.length === 0}
          title={filas.length === 0 ? 'No hay tareas para exportar' : 'Descargar la tabla filtrada en Excel (CSV)'}
          onClick={() => exportarDetalleTareasCSV(filas.map((r) => r.t), nombreOperario, nombreMaquina, 'detalle')}
        >⬇ Exportar (Excel)</button>
      </div>

      {filas.length === 0 ? <div className="empty">Sin tareas finalizadas en la selección.</div> : (
        <table className="tabla-detalle">
          <thead>
            <tr>
              <th>Tarea</th><th>Colaborador</th><th>Estación</th>
              <th className="num">Estimado</th><th className="num">Real</th>
              <th className="num">Demorado</th><th className="num">Demora justif.</th>
              <th className="num">Demora s/just.</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => (
              <tr key={r.id} className={r.sinJust > 0 ? 'fila-demora' : ''}>
                <td>{r.nombre}{r.nro ? ` · ${r.nro}` : ''}</td>
                <td>{r.operario}</td>
                <td>{r.maquina}</td>
                <td className="num">{fmtDur(r.estimado)}</td>
                <td className="num">{fmtDur(r.real)}</td>
                <td className="num">{r.demorado > 0 ? fmtDur(r.demorado) : '—'}</td>
                <td className="num">{r.justificada > 0 ? fmtDur(r.justificada) : '—'}</td>
                <td className="num" style={{ fontWeight: 800, color: r.sinJust > 0 ? 'var(--rojo)' : 'var(--texto-tenue)' }}>
                  {r.sinJust > 0 ? `+${fmtDur(r.sinJust)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
