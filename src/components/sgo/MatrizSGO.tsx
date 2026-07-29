import type { AccionSGO, AreaSGOId, EventoSGO, PilarSGO } from '../../sgo/types'
import { AREAS_SGO, PILARES_SGO } from '../../sgo/types'

function accionVencida(a: AccionSGO) {
  return !['verificada', 'cancelada'].includes(a.estado) && a.fechaCompromiso < new Date().toISOString().slice(0, 10)
}

export default function MatrizSGO({ eventos, acciones, onSelect }: {
  eventos: EventoSGO[]
  acciones: AccionSGO[]
  onSelect: (area: AreaSGOId, pilar: PilarSGO) => void
}) {
  const abiertos = eventos.filter((e) => e.estado !== 'cerrado')

  return <div className="card" style={{ marginTop: 16, overflow: 'auto' }}>
    <div className="section-title" style={{ marginTop: 0 }}>Tablero matriz · Área × Pilares</div>
    <div className="meta" style={{ marginBottom: 10 }}>Seleccioná una celda para ver los eventos que explican el estado.</div>
    <table style={{ borderCollapse: 'separate', borderSpacing: 4, minWidth: 980, width: '100%' }}>
      <thead><tr><th style={{ textAlign: 'left', minWidth: 220 }}>Área</th>{PILARES_SGO.map((p) => <th key={p.id} style={{ fontSize: '.78rem' }}>{p.label}</th>)}</tr></thead>
      <tbody>{AREAS_SGO.map((area) => <tr key={area.id}>
        <th style={{ textAlign: 'left', fontSize: '.76rem' }}>{area.label}</th>
        {PILARES_SGO.map((pilar) => {
          const ev = abiertos.filter((e) => (e.areaOrigenId ?? e.areaId) === area.id && e.pilar === pilar.id)
          const ids = new Set(ev.map((e) => e.id))
          const vencidas = acciones.filter((a) => ids.has(a.eventoId) && accionVencida(a)).length
          const criticos = ev.filter((e) => ['alta', 'critica'].includes(e.severidad)).length
          const color = vencidas || criticos ? '#dc2626' : ev.length ? '#d97706' : '#16a34a'
          const fondo = vencidas || criticos ? '#fee2e2' : ev.length ? '#fef3c7' : '#dcfce7'
          return <td key={pilar.id} style={{ padding: 0 }}>
            <button onClick={() => onSelect(area.id, pilar.id)} title={`${area.label} · ${pilar.label}: ${ev.length} abiertos`}
              style={{ width: '100%', minHeight: 46, border: `1px solid ${color}`, borderRadius: 7, background: fondo, color, cursor: 'pointer', fontWeight: 800 }}>
              {ev.length}{vencidas ? <span style={{ display: 'block', fontSize: '.64rem' }}>{vencidas} venc.</span> : null}
            </button>
          </td>
        })}
      </tr>)}</tbody>
    </table>
    <div className="meta" style={{ marginTop: 8 }}>🟢 Sin eventos abiertos · 🟡 Con desvíos · 🔴 Evento alto/crítico o acción vencida</div>
  </div>
}
