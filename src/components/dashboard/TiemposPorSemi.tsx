import { useMemo, useState } from 'react'
import type { Tarea, AreaDemora } from '../../types'
import { tiemposPorSemielaborado } from '../../lib/tiemposPorSemi'
import { descargarCSV } from '../../lib/export'
import { fmtDur } from '../../lib/time'

// ============================================================
// TIEMPOS REALES POR SEMIELABORADO (v2.14)
//
// "¿Cuánto tarda realmente cada bobina, cada parte activa?" — todas, no solo las
// que necesitan ajuste de estándar (eso es el asistente de estándares).
//
// Se muestran MEDIANA y PROMEDIO juntos a propósito. La mediana es el número en
// el que hay que confiar: una sola tarea mal cerrada o que quedó abierta un fin
// de semana arrastra el promedio y deja la mediana intacta. Cuando los dos
// números están lejos, eso mismo es la señal de que ese grupo tiene datos sucios.
// ============================================================
type Filtro = 'todas' | AreaDemora

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todas', label: 'Bobinado y Montaje' },
  { id: 'bobinado', label: 'Solo Bobinado' },
  { id: 'montaje', label: 'Solo Montaje' },
]

export default function TiemposPorSemi({ tareas }: { tareas: Tarea[] }) {
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [q, setQ] = useState('')

  const filas = useMemo(() => {
    const areas: AreaDemora[] = filtro === 'todas' ? ['bobinado', 'montaje'] : [filtro]
    const base = tiemposPorSemielaborado(tareas, areas)
    const t = q.trim().toLowerCase()
    return t
      ? base.filter((f) => `${f.semielaborado} ${f.modelo} ${f.sector} ${f.codigo ?? ''}`.toLowerCase().includes(t))
      : base
  }, [tareas, filtro, q])

  function exportar() {
    const cab = ['Semielaborado', 'Codigo', 'Modelo', 'Sector', 'Muestras',
      'Mediana (min)', 'Promedio (min)', 'Minimo (min)', 'Maximo (min)',
      'Estandar (min)', 'Desvio %']
    const filasCsv = filas.map((f) => [
      f.semielaborado, f.codigo ?? '', f.modelo, f.sector, f.muestras,
      f.medianaMin, f.promedioMin, f.minMin, f.maxMin, f.estandarMin,
      Math.round(f.desvioPct * 100),
    ])
    descargarCSV(`Tiempos_por_semielaborado_${new Date().toISOString().slice(0, 10)}.csv`,
      [['Tiempos reales por semielaborado - INELPA'],
        ['Tiempo NETO (real menos demoras justificadas), en minutos habiles'],
        [], cab, ...filasCsv])
  }

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div className="filtros" style={{ marginBottom: 10 }}>
        <select className="select" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
          {FILTROS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <input className="input" style={{ flex: 1, minWidth: 200 }} value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Buscar semielaborado, modelo o sector…" />
        <button className="btn btn-primary" disabled={filas.length === 0} onClick={exportar}>
          ⬇ Exportar (Excel)
        </button>
      </div>

      <div className="meta" style={{ marginBottom: 10 }}>
        Tiempo <strong>neto</strong>: lo que llevó hacer la pieza, ya descontadas las
        demoras justificadas, las noches, los fines de semana y el almuerzo.
        <br />
        Mirá la <strong>mediana</strong>, no el promedio: una sola tarea mal cerrada
        mueve el promedio y deja la mediana quieta. Si los dos números están lejos,
        ese grupo tiene datos para revisar.
      </div>

      {filas.length === 0
        ? <div className="empty">No hay tareas finalizadas para esa selección.</div>
        : (
          <table className="tabla-detalle tabla-cards">
            <thead>
              <tr>
                <th>Semielaborado</th><th>Sector</th>
                <th className="num">Tareas</th>
                <th className="num">Mediana</th><th className="num">Promedio</th>
                <th className="num">Mín</th><th className="num">Máx</th>
                <th className="num">Estándar</th><th className="num">Desvío</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                // Mediana y promedio muy separados = el grupo tiene un outlier.
                const disperso = f.medianaMin > 0 && Math.abs(f.promedioMin - f.medianaMin) / f.medianaMin > 0.25
                return (
                  <tr key={f.id}>
                    <td data-label="Semielaborado">
                      {f.semielaborado}
                      <div className="sub meta">{f.modelo}{f.codigo ? ` · ${f.codigo}` : ''}</div>
                    </td>
                    <td data-label="Sector">{f.sector}</td>
                    <td className="num" data-label="Tareas">{f.muestras}</td>
                    <td className="num" data-label="Mediana"><strong>{fmtDur(f.medianaMin)}</strong></td>
                    <td className="num" data-label="Promedio"
                      style={{ color: disperso ? 'var(--naranja)' : undefined }}
                      title={disperso ? 'Lejos de la mediana: probablemente haya una tarea mal cerrada en este grupo.' : undefined}>
                      {fmtDur(f.promedioMin)}{disperso ? ' ⚠' : ''}
                    </td>
                    <td className="num" data-label="Mín">{fmtDur(f.minMin)}</td>
                    <td className="num" data-label="Máx">{fmtDur(f.maxMin)}</td>
                    <td className="num" data-label="Estándar">{fmtDur(f.estandarMin)}</td>
                    <td className="num" data-label="Desvío"
                      style={{ fontWeight: 800, color: f.desvioPct > 0.1 ? 'var(--rojo)' : f.desvioPct < -0.1 ? 'var(--estado-fin)' : undefined }}>
                      {f.desvioPct > 0 ? '+' : ''}{Math.round(f.desvioPct * 100)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
    </div>
  )
}
