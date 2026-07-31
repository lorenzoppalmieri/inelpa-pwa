import { useState } from 'react'
import MapaScada from './MapaScada'
import MapaEditor from './MapaEditor'
import ActivosLista from './ActivosLista'
import FichaEquipo from './FichaEquipo'
import TableroOT from './TableroOT'
import PanelKPIs from './PanelKPIs'

// ============================================================
// VISTA DEL MODULO DE MANTENIMIENTO (v1.62/v1.63)
// Contenedor con navegacion INTERNA por estado (la app no usa router;
// sigue el mismo patron de vistas por estado del resto de los modulos):
//   - Solapas "SCADA | Mapa | Tablero OT | Activos | KPIs". La solapa por
//     defecto es SCADA: la vista operativa en vivo del estado de planta.
//   - fichaId != null -> FichaEquipo a pantalla completa con "Volver".
//     Se llega desde el pin del mapa ("Ver ficha completa"), desde el
//     panel SCADA, desde una fila del listado o desde un chip de
//     dependencia dentro de otra ficha. Al volver se conserva la solapa.
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
      {solapa === 'scada' && <MapaScada onVerFicha={verFicha} />}
      {solapa === 'mapa' && <MapaEditor onVerFicha={verFicha} />}
      {solapa === 'tablero' && <TableroOT onVerFicha={verFicha} />}
      {solapa === 'activos' && <ActivosLista onVerFicha={verFicha} />}
      {solapa === 'kpis' && <PanelKPIs onVerFicha={verFicha} />}
    </div>
  )
}
