import { useState } from 'react'
import MapaEditor from './MapaEditor'
import ActivosLista from './ActivosLista'
import FichaEquipo from './FichaEquipo'

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

type Solapa = 'mapa' | 'activos'

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

  return (
    <div className="mant-modulo">
      <div className="tabs no-print" style={{ marginBottom: 10 }}>
        <button
          className={'tab' + (solapa === 'mapa' ? ' active' : '')}
          onClick={() => setSolapa('mapa')}
          aria-current={solapa === 'mapa' ? 'page' : undefined}
        >🗺️ Mapa</button>
        <button
          className={'tab' + (solapa === 'activos' ? ' active' : '')}
          onClick={() => setSolapa('activos')}
          aria-current={solapa === 'activos' ? 'page' : undefined}
        >⚙️ Activos</button>
      </div>
      {solapa === 'mapa'
        ? <MapaEditor onVerFicha={(id) => setFichaId(id)} />
        : <ActivosLista onVerFicha={(id) => setFichaId(id)} />}
    </div>
  )
}
