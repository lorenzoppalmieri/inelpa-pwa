import { useState } from 'react'
import MapaEditor from './MapaEditor'
import ActivosLista from './ActivosLista'
import FichaEquipo from './FichaEquipo'
import TableroOT from './TableroOT'
import PanelKPIs from './PanelKPIs'

// ============================================================
// VISTA DEL MODULO DE MANTENIMIENTO (v1.62/v1.63)
// Contenedor con navegacion INTERNA por estado (la app no usa router;
// sigue el mismo patron de vistas por estado del resto de los modulos):
//   - Solapas "Mapa | Activos".
//   - fichaId != null -> FichaEquipo a pantalla completa con "Volver".
//     Se llega desde el pin del mapa ("Ver ficha completa"), desde una
//     fila del listado, o desde un chip de dependencia dentro de otra
//     ficha. Al volver se conserva la solapa de origen.
// ============================================================

type Solapa = 'mapa' | 'tablero' | 'activos' | 'kpis'

const SOLAPAS: { id: Solapa; label: string }[] = [
  { id: 'mapa', label: '🗺️ Mapa' },
  { id: 'tablero', label: '📝 Tablero OT' },
  { id: 'activos', label: '⚙️ Activos' },
  { id: 'kpis', label: '📊 KPIs' },
]

export default function MantenimientoView() {
  const [solapa, setSolapa] = useState<Solapa>('mapa')
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
      {solapa === 'mapa' && <MapaEditor onVerFicha={verFicha} />}
      {solapa === 'tablero' && <TableroOT onVerFicha={verFicha} />}
      {solapa === 'activos' && <ActivosLista onVerFicha={verFicha} />}
      {solapa === 'kpis' && <PanelKPIs onVerFicha={verFicha} />}
    </div>
  )
}
