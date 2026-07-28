import { useMemo, useState } from 'react'
import type { DespachoTrafo } from '../../types'
import { DEPOSITOS_EXTERNOS, seriesDespacho } from '../../types'
import { fechaCorta } from '../../lib/time'
import { tituloTrafo } from '../../lib/modeloTrafo'

// ============================================================
// STOCK DE TRANSFORMADORES (v1.44) — qué hay guardado en cada depósito externo.
// Una tabla por depósito: descripción completa del modelo, cliente, N° de serie
// y desde cuándo está guardado.
//
// Solo lista los depósitos EXTERNOS (Lorenzatti / Cerdán / 25 de Mayo). Lo que
// sigue embalado en planta no es "stock en depósito" y se ve en el operativo.
// ============================================================

function diasDesde(iso: string | undefined, ahora: number): number {
  if (!iso) return 0
  return Math.floor((ahora - Date.parse(iso)) / 86400000)
}

export default function StockDepositos({ despachos }: { despachos: DespachoTrafo[] }) {
  const [buscar, setBuscar] = useState('')
  const ahora = Date.now()

  const grupos = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    const match = (d: DespachoTrafo) =>
      !q || `${d.nroSerie} ${d.ot} ${d.cliente} ${d.modelo ?? ''}`.toLowerCase().includes(q)
    return DEPOSITOS_EXTERNOS.map((dep) => ({
      deposito: dep,
      items: despachos
        .filter((d) => d.estado === 'en_deposito' && d.deposito === dep && match(d))
        // Más antiguo primero: lo que lleva más tiempo guardado va arriba.
        .sort((a, b) => ((a.fechaDeposito ?? '') < (b.fechaDeposito ?? '') ? -1 : 1)),
    }))
  }, [despachos, buscar])

  const total = grupos.reduce((s, g) => s + g.items.length, 0)
  const hayAlgo = despachos.some((d) => d.estado === 'en_deposito')

  return (
    <>
      <div className="section-title" style={{ marginTop: 0 }}>
        📦 Stock de transformadores en depósito · {total} unidad(es)
      </div>

      <input
        className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)}
        placeholder="🔍 Buscar por modelo, N° de serie, OT o cliente…" style={{ marginBottom: 14 }}
      />

      {!hayAlgo && <div className="empty">Todavía no hay transformadores guardados en depósito.</div>}

      {grupos.map(({ deposito, items }) => (
        <div key={deposito} style={{ marginBottom: 18 }}>
          <div className="section-title">{deposito} ({items.length})</div>
          {items.length === 0
            ? <div className="empty">Sin transformadores en {deposito}.</div>
            : (
              <div className="card" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--borde)' }}>
                      <th style={{ padding: '8px 6px' }}>Transformador</th>
                      <th style={{ padding: '8px 6px' }}>Cliente</th>
                      <th style={{ padding: '8px 6px' }}>N° de serie</th>
                      <th style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>Enviado al depósito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((d) => {
                      const dias = diasDesde(d.fechaDeposito, ahora)
                      const series = seriesDespacho(d)
                      return (
                        <tr key={d.id} style={{ borderBottom: '1px solid var(--borde)' }}>
                          <td style={{ padding: '8px 6px' }}>
                            <strong>{d.modelo || tituloTrafo(d.modelo, series[0] ?? d.nroSerie)}</strong>
                            <div className="meta">
                              {d.linea === 'rural' ? '🚜 Rural' : '🏭 Distribución'} · OT {d.ot}
                              {d.potencia ? ` · ${d.potencia}` : ''}
                            </div>
                          </td>
                          <td style={{ padding: '8px 6px' }}>{d.cliente || <span className="meta">Stock</span>}</td>
                          <td style={{ padding: '8px 6px' }}>{series.length ? series.join(', ') : <span className="meta">—</span>}</td>
                          <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                            {d.fechaDeposito ? fechaCorta(d.fechaDeposito) : '—'}
                            <div className="meta" style={{ color: dias > 60 ? 'var(--rojo)' : dias > 30 ? 'var(--naranja)' : undefined }}>
                              {d.fechaDeposito ? `hace ${dias} día(s)` : ''}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      ))}
    </>
  )
}
