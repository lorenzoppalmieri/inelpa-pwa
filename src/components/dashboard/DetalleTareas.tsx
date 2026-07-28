import { useMemo, useState } from 'react'
import type { Tarea } from '../../types'
import { esReparacion, nombreSemielaborado } from '../../types'
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
      const nombre = nombreSemielaborado(t, comp?.descripcion)
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

  // v1.44: TOTALES del acumulado. Se calculan SOLO sobre las filas que están
  // efectivamente en pantalla (ya filtradas por el buscador y el check de demora),
  // así al tipear el nombre de un colaborador se ve al instante su acumulado.
  const tot = useMemo(() => {
    const suma = (f: (r: (typeof filas)[number]) => number) => filas.reduce((a, r) => a + f(r), 0)
    const estimado = suma((r) => r.estimado)
    const real = suma((r) => r.real)
    const demorado = suma((r) => r.demorado)
    const justificada = suma((r) => r.justificada)
    const sinJust = suma((r) => r.sinJust)
    return {
      n: filas.length, estimado, real, demorado, justificada, sinJust,
      // % de exceso sobre lo estimado (cuánto se pasó del estándar en conjunto).
      desvioPct: estimado > 0 ? Math.round((demorado / estimado) * 100) : 0,
      // De todo lo que se demoró, cuánto quedó SIN justificar.
      sinJustPct: demorado > 0 ? Math.round((sinJust / demorado) * 100) : 0,
    }
  }, [filas])

  // ¿Hay algún filtro activo? Sirve para aclarar que el total es del subconjunto.
  const filtrado = q.trim().length > 0 || soloDemora

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

      {/* v1.44: acumulado de lo que se ve en pantalla (responde al buscador). */}
      {filas.length > 0 && (
        <div className="tot-wrap">
          <div className="tot-cab">
            Σ Acumulado{filtrado ? ' del filtro actual' : ''} · <strong>{tot.n}</strong> tarea(s)
            {q.trim() && <> · <strong style={{ color: 'var(--azul-claro)' }}>“{q.trim()}”</strong></>}
          </div>
          <div className="tot-cards">
            <div className="tot-card">
              <div className="l">Estimado</div>
              <div className="n">{fmtDur(tot.estimado)}</div>
            </div>
            <div className="tot-card">
              <div className="l">Real</div>
              <div className="n">{fmtDur(tot.real)}</div>
            </div>
            <div className="tot-card">
              <div className="l">Demorado</div>
              <div className="n" style={{ color: 'var(--naranja)' }}>{tot.demorado > 0 ? fmtDur(tot.demorado) : '—'}</div>
              {tot.estimado > 0 && <div className="s">+{tot.desvioPct}% sobre estimado</div>}
            </div>
            <div className="tot-card">
              <div className="l">Demora justif.</div>
              <div className="n">{tot.justificada > 0 ? fmtDur(tot.justificada) : '—'}</div>
            </div>
            <div className="tot-card destacada">
              <div className="l">Demora s/just.</div>
              <div className="n" style={{ color: tot.sinJust > 0 ? 'var(--rojo)' : 'var(--estado-fin)' }}>
                {tot.sinJust > 0 ? `+${fmtDur(tot.sinJust)}` : '—'}
              </div>
              {tot.demorado > 0 && <div className="s">{tot.sinJustPct}% de lo demorado</div>}
            </div>
          </div>
        </div>
      )}

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
          {/* Fila de totales fija al pie (misma sumatoria que las tarjetas). */}
          <tfoot>
            <tr className="fila-total">
              <td colSpan={3}>TOTAL · {tot.n} tarea(s){filtrado ? ' (filtrado)' : ''}</td>
              <td className="num">{fmtDur(tot.estimado)}</td>
              <td className="num">{fmtDur(tot.real)}</td>
              <td className="num" style={{ color: 'var(--naranja)' }}>{tot.demorado > 0 ? fmtDur(tot.demorado) : '—'}</td>
              <td className="num">{tot.justificada > 0 ? fmtDur(tot.justificada) : '—'}</td>
              <td className="num" style={{ color: tot.sinJust > 0 ? 'var(--rojo)' : 'var(--texto-tenue)' }}>
                {tot.sinJust > 0 ? `+${fmtDur(tot.sinJust)}` : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}
