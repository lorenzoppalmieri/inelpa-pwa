import { useState } from 'react'
import MapaScadaEditor from './MapaScadaEditor'
import MapaEditor from './MapaEditor'
import ActivosLista from './ActivosLista'
import FichaEquipo from './FichaEquipo'
import TableroOT from './TableroOT'
import PanelKPIs from './PanelKPIs'

// ============================================================
// VISTA DEL MODULO DE MANTENIMIENTO (v1.62/v1.63/v1.65)
// Contenedor con navegacion INTERNA por estado (la app no usa router):
//   - Solapas: SCADA | Mapa | Tablero OT | Activos | KPIs.
//     SCADA = mapa de estado en vivo con layout editable (bloques +
//     dibujo); la EDICION solo la ve el admin (dentro del componente).
//   - fichaId != null -> FichaEquipo a pantalla completa con "Volver".
// ============================================================

type Solapa = 'scada' | 'mapa' | 'tablero' | 'activos' | 'kpis'

const SOLAPAS: { id: Solapa; label: string }[] = [
  { id: 'scada', label: '🛰️ SCADA' },
  { id: 'mapa', label: '🗺️ Mapa' },
  { id: 'tablero', label: '📝 Tablero OT' },
  { id: 'activos', label: '⚙️ Activos' },
  { id: 'kpis', label: '📊 KPIs' },
]

export default function MantenimientoView() {
  const [solapa, setSolapa] = useState<Solapa>('scada')
  const [fichaId, setFichaId] = useState<string | null>(null)

  if (fichaId) {
    return (
      <FichaEquipo
        activoId={fichaId}
        onVolver={() => setFichaId(null)}
        onVerActivo={(id) => setFichaId(id)}
      />
    )
  }

  const verFicha = (id: string) => setFichaId(id)

  return (
    <div className="mant-modulo">
      <div className="tabs no-print" style={{ marginBottom: 10 }}>
        {SOLAPAS.map((s) => (
          <button
            key={s.id}
            className={'tab' + (solapa === s.id ? ' active' : '')}
            onClick={() => setSolapa(s.id)}
            aria-current={solapa === s.id ? 'page' : undefined}
          >{s.label}</button>
        ))}
      </div>
      {solapa === 'scada' && <MapaScadaEditor onVerFicha={verFicha} />}
      {solapa === 'mapa' && <MapaEditor onVerFicha={verFicha} />}
      {solapa === 'tablero' && <TableroOT onVerFicha={verFicha} />}
      {solapa === 'activos' && <ActivosLista onVerFicha={verFicha} />}
      {solapa === 'kpis' && <PanelKPIs onVerFicha={verFicha} />}
    </div>
  )
}
