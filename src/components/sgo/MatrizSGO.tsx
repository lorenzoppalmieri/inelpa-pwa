import type { AccionSGO, AreaSGOId, EventoSGO, PilarSGO } from '../../sgo/types'
import { AREAS_SGO, PILARES_SGO } from '../../sgo/types'
import { estadoIndicador, type IndicadorSGO } from '../../sgo/indicadores'

function accionVencida(a: AccionSGO) {
  return !['verificada', 'cancelada'].includes(a.estado) && a.fechaCompromiso < new Date().toISOString().slice(0, 10)
}

export default function MatrizSGO({ eventos, acciones, indicadores, onSelect }: {
  eventos: EventoSGO[]
  acciones: AccionSGO[]
  indicadores: IndicadorSGO[]
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
          const kpis = indicadores.filter((i) => i.activo && i.areaId === area.id && i.pilar === pilar.id)
          const estados = kpis.map(estadoIndicador)
          const kpiRojo = estados.includes('rojo'), kpiAmarillo = estados.includes('amarillo')
          const kpiSinDato = kpis.length === 0 || estados.includes('sin_dato')
          const estado = vencidas || criticos || kpiRojo ? 'rojo'
            : ev.length || kpiAmarillo ? 'amarillo'
              : kpiSinDato ? 'sin_dato' : 'verde'
          const paleta = {
            rojo: { color: '#dc2626', fondo: '#fee2e2' }, amarillo: { color: '#b45309', fondo: '#fef3c7' },
            verde: { color: '#15803d', fondo: '#dcfce7' }, sin_dato: { color: '#64748b', fondo: '#f1f5f9' },
          }[estado]
          const rango = { rojo: 3, amarillo: 2, sin_dato: 1, verde: 0 }
          const principal = [...kpis].sort((a, b) => rango[estadoIndicador(b)] - rango[estadoIndicador(a)])[0]
          return <td key={pilar.id} style={{ padding: 0 }}>
            <button onClick={() => onSelect(area.id, pilar.id)} title={`${area.label} · ${pilar.label}: ${kpis.length} KPI, ${ev.length} eventos abiertos`}
              style={{ width: '100%', minHeight: 58, border: `1px solid ${paleta.color}`, borderRadius: 7, background: paleta.fondo, color: paleta.color, cursor: 'pointer', fontWeight: 800, padding: 4 }}>
              {principal?.valorActual !== undefined ? <><span>{principal.valorActual.toLocaleString('es-AR')} {principal.unidad}</span><span style={{ display: 'block', fontSize: '.6rem' }}>meta {principal.meta.toLocaleString('es-AR')}{kpis.length > 1 ? ` · ${kpis.length} KPI` : ''}</span></> : <span style={{ fontSize: '.68rem' }}>{kpis.length ? 'Sin valor' : 'Sin KPI'}</span>}
              {ev.length > 0 && <span style={{ display: 'block', fontSize: '.62rem' }}>{ev.length} evento(s){vencidas ? ` · ${vencidas} venc.` : ''}</span>}
            </button>
          </td>
        })}
      </tr>)}</tbody>
    </table>
    <div className="meta" style={{ marginTop: 8 }}>🟢 KPI cumplido y sin desvíos · 🟡 KPI en alerta o evento abierto · 🔴 KPI incumplido, evento alto/crítico o acción vencida · ⚪ Sin KPI/valor</div>
  </div>
}
