import { useState } from 'react'
import DashboardView from '../dashboard/DashboardView'
import SGOView from '../sgo/SGOView'
import PlanosAdmin from '../planos/PlanosAdmin'

// ============================================================
// OFICINA DE DISEÑO (v2.39) — pantalla del rol 'diseno' (Martín Brusa).
//
//  - Producción: el mismo tablero de siempre (Gantt, KPIs, órdenes), en SOLO
//    LECTURA. Los permisos del rol (auth/roles.ts) ya esconden asignar, mover
//    y editar; es lo mismo que ve Logística.
//  - SGO: el módulo completo para CONSULTAR. Cualquier intento de guardar lo
//    corta el sync (setSoloLecturaSGO) y la base lo vuelve a impedir.
//  - Planos: lo único que Diseño escribe. Subir y reemplazar revisiones.
//
// Se reutilizan los componentes de cada área: no hay una segunda versión de
// ninguna pantalla.
// ============================================================
type Pestana = 'planos' | 'produccion' | 'sgo'

export default function DisenoView() {
  const [pestana, setPestana] = useState<Pestana>('planos')

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Módulos de Diseño">
        <button className={'tab' + (pestana === 'planos' ? ' active' : '')} onClick={() => setPestana('planos')}>📐 Planos</button>
        <button className={'tab' + (pestana === 'produccion' ? ' active' : '')} onClick={() => setPestana('produccion')}>🏭 Producción</button>
        <button className={'tab' + (pestana === 'sgo' ? ' active' : '')} onClick={() => setPestana('sgo')}>🛡️ SGO</button>
      </div>

      {pestana !== 'planos' && (
        <div className="meta" style={{ margin: '8px 0 12px' }}>
          👁 Solo lectura: podés consultar todo, pero no crear ni modificar registros.
        </div>
      )}

      {pestana === 'planos' ? <PlanosAdmin />
        : pestana === 'produccion' ? <DashboardView />
        : <SGOView />}
    </div>
  )
}
