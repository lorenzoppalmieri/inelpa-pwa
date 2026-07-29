import { useMemo, useState } from 'react'

// ============================================================
// SIDEBAR del layout de ERP (v1.43) — solo para Planificación/Gerencia.
// Menú lateral fijo con buscador y navegación por módulos. El contenedor
// principal (AdminLayout) renderiza el módulo del ítem activo.
// ============================================================
export type ModuloAdmin = 'planificacion' | 'logistica' | 'laboratorio' | 'despacho' | 'sgo'

export interface ItemMenu {
  id: ModuloAdmin
  label: string
  icono: string
  sub: string           // descripción corta (también se usa para buscar)
}

export const MENU_ADMIN: ItemMenu[] = [
  { id: 'planificacion', label: 'Planificación', icono: '📋', sub: 'KPIs, Gantt, órdenes y tareas' },
  { id: 'logistica', label: 'Logística', icono: '🚛', sub: 'Pañol, pedidos de material y tareas' },
  { id: 'laboratorio', label: 'Laboratorio', icono: '🔬', sub: 'Ensayos y protocolos' },
  { id: 'despacho', label: 'Despacho', icono: '📦', sub: 'Embalaje, fletes y entregas' },
  { id: 'sgo', label: 'SGO INTEGRAL', icono: '🛡️', sub: 'Seis pilares, eventos y acciones' },
]

export default function Sidebar({ activo, onSelect, colapsado, onToggle }: {
  activo: ModuloAdmin
  onSelect: (m: ModuloAdmin) => void
  colapsado: boolean
  onToggle: () => void
}) {
  const [busqueda, setBusqueda] = useState('')

  const items = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return MENU_ADMIN
    return MENU_ADMIN.filter((i) => `${i.label} ${i.sub}`.toLowerCase().includes(q))
  }, [busqueda])

  return (
    <aside className={'admin-sidebar no-print' + (colapsado ? ' colapsado' : '')}>
      {/* Cabecera: buscador + botón de contraer en la MISMA fila (no roba alto). */}
      <div className="admin-head">
        {!colapsado && (
          <div className="admin-search">
            <input
              className="input"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="🔎 Buscar…"
              aria-label="Buscar módulo"
            />
          </div>
        )}
        <button
          className="admin-toggle"
          onClick={onToggle}
          title={colapsado ? 'Expandir menú' : 'Contraer menú'}
          aria-label={colapsado ? 'Expandir menú' : 'Contraer menú'}
        >{colapsado ? '»' : '«'}</button>
      </div>

      <nav className="admin-nav">
        {items.map((i) => (
          <button
            key={i.id}
            className={'admin-navitem' + (activo === i.id ? ' active' : '')}
            onClick={() => onSelect(i.id)}
            title={colapsado ? `${i.label} · ${i.sub}` : i.sub}
            aria-current={activo === i.id ? 'page' : undefined}
          >
            <span className="admin-ico">{i.icono}</span>
            {!colapsado && (
              <span className="admin-txt">
                <span className="admin-label">{i.label}</span>
                <span className="admin-sub">{i.sub}</span>
              </span>
            )}
          </button>
        ))}
        {items.length === 0 && !colapsado && (
          <div className="meta" style={{ padding: '10px 12px' }}>Sin módulos que coincidan.</div>
        )}
      </nav>

      {!colapsado && (
        <div className="admin-foot">
          <span className="rol-badge">Super Admin</span>
        </div>
      )}
    </aside>
  )
}
