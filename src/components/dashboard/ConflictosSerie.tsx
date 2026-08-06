import { useMemo, useState } from 'react'
import type { DespachoTrafo } from '../../types'
import { estadoDespachoLabel, seriesDespacho, DEPOSITO_PLANTA } from '../../types'
import { eliminarDespacho } from '../../sync/syncEngine'
import { fechaCorta } from '../../lib/time'
import { conflictosDeSerie } from '../../lib/conflictosSerie'
import { tituloTrafo } from '../../lib/modeloTrafo'

// ============================================================
// CONFLICTOS DE N° DE SERIE (v1.73) — alerta roja para Logística.
//
// Dos transformadores no pueden compartir serie: se rompe la trazabilidad y ante
// un reclamo no hay forma de saber cuál unidad es cuál. Cuando pasa, esto lo
// muestra arriba de todo con las DOS fichas enfrentadas y deja borrar la que
// corresponda — la que salió de Laboratorio o la que ya estaba guardada.
//
// NO bloquea el trabajo: el embalaje y el despacho siguen normales. Frenar la
// producción por un error de carga sería peor que el error.
// ============================================================

export default function ConflictosSerie({ despachos, soloLectura = false, onFicha }: {
  despachos: DespachoTrafo[]
  soloLectura?: boolean
  onFicha?: (d: DespachoTrafo) => void
}) {
  const conflictos = useMemo(() => conflictosDeSerie(despachos), [despachos])
  const [borrando, setBorrando] = useState<string>()

  if (conflictos.length === 0) return null

  async function borrar(d: DespachoTrafo, serie: string) {
    const ok = window.confirm(
      `¿Borrar esta ficha del transformador con serie ${serie}?\n\n` +
      `${tituloTrafo(d.modelo, d.nroSerie)}\n` +
      `Estado: ${estadoDespachoLabel(d.estado)}${d.deposito ? ` · ${d.deposito}` : ''}\n` +
      `Cliente: ${d.cliente || 'Stock'} · OT ${d.ot || '—'}\n\n` +
      'Se elimina el registro de Despacho (no el ensayo de Laboratorio). Esta acción no se puede deshacer.',
    )
    if (!ok) return
    setBorrando(d.id)
    await eliminarDespacho(d)
    setBorrando(undefined)
  }

  return (
    <div className="card" style={{ borderLeft: '5px solid var(--rojo)', marginBottom: 14 }}>
      <div className="section-title" style={{ marginTop: 0, color: 'var(--rojo)' }}>
        ⚠ N° de serie duplicado ({conflictos.length})
      </div>
      <div className="meta" style={{ marginBottom: 12 }}>
        Dos transformadores no pueden tener la misma serie. Revisá cuál es el correcto y borrá la ficha que sobra.
        El trabajo no está bloqueado: se puede seguir embalando y despachando.
      </div>

      {conflictos.map((c) => (
        <div key={c.serie} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Serie {c.serie} · {c.unidades.length} fichas</div>
          {c.unidades.map((d, i) => (
            <div key={d.id} className="pareto-row" style={{ marginBottom: 6, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <strong>{tituloTrafo(d.modelo, seriesDespacho(d).join(', ') || d.nroSerie)}</strong>
                <div className="meta">
                  {i === 0 ? '① La que ya estaba' : '② La más nueva'} · {estadoDespachoLabel(d.estado)}
                  {d.deposito ? ` · ${d.deposito}` : (d.estado === 'embalado' ? ` · ${DEPOSITO_PLANTA}` : '')}
                  {' · '}cliente <strong>{d.cliente || 'Stock'}</strong>{d.ot ? ` · OT ${d.ot}` : ''}
                  {' · '}ingresó {fechaCorta(d.fechaIngreso)}
                  {d.laboratorioId ? ' · viene de Laboratorio' : ' · cargada a mano'}
                </div>
                {d.observaciones ? <div className="meta" style={{ fontStyle: 'italic' }}>📝 {d.observaciones}</div> : null}
              </div>
              {onFicha && <button className="btn" onClick={() => onFicha(d)}>👁 Ficha</button>}
              {!soloLectura && (
                <button className="btn btn-rojo" disabled={borrando === d.id} onClick={() => void borrar(d, c.serie)}>
                  {borrando === d.id ? 'Borrando…' : '🗑 Borrar esta'}
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
