import { useEffect, useState } from 'react'
import Sidebar, { MENU_ADMIN, type ModuloAdmin } from './Sidebar'
import DashboardView from '../dashboard/DashboardView'
import LogisticaView from '../dashboard/LogisticaView'
import LaboratorioView from '../laboratorio/LaboratorioView'
import DespachoView from '../dashboard/DespachoView'
import SGOView from '../sgo/SGOView'

// ============================================================
// LAYOUT DE ERP (v1.43) — solo Planificación/Gerencia (super admin).
//
// Menú lateral fijo + contenedor dinámico a la derecha. Cada ítem RENDERIZA EL
// MISMO COMPONENTE que usa el responsable del área, sin duplicar código:
//   Planificación -> DashboardView   (la vista de siempre de Lorenzo)
//   Logística     -> LogisticaView   (la de Giuliano: cola de material, tareas, reportes)
//   Laboratorio   -> LaboratorioView (la del laboratorista)
//   Despacho      -> DespachoView    (la de Melany)
//
// Los permisos DENTRO de cada módulo los resuelve `esSuperAdmin` en auth/roles.ts
// (LogisticaTareas y DespachoView ya lo contemplan), así que Lorenzo opera con los
// mismos permisos que el encargado del área: crear, editar y eliminar.
//
// Quién ve esto se decide en App.tsx: si NO es super admin, ni se monta.
// ============================================================
const CLAVE_MODULO = 'inelpa_admin_modulo'
const CLAVE_COLAPSO = 'inelpa_admin_colapsado'

export default function AdminLayout() {
  // Se recuerda el último módulo abierto y el estado del menú entre recargas.
  const [modulo, setModulo] = useState<ModuloAdmin>(() => {
    const g = localStorage.getItem(CLAVE_MODULO) as ModuloAdmin | null
    return g && MENU_ADMIN.some((i) => i.id === g) ? g : 'planificacion'
  })
  const [colapsado, setColapsado] = useState(() => localStorage.getItem(CLAVE_COLAPSO) === '1')

  // El shell general (.content) está limitado a 1400px y centrado, pensado para
  // lectura. En modo ERP eso desperdicia media pantalla, así que marcamos el body
  // y liberamos el ancho completo (ver "LAYOUT DE ERP" en index.css). Pensado para
  // monitores grandes / pantalla de Dirección.
  useEffect(() => {
    document.body.classList.add('admin-mode')
    return () => document.body.classList.remove('admin-mode')
  }, [])

  function seleccionar(m: ModuloAdmin) {
    setModulo(m)
    localStorage.setItem(CLAVE_MODULO, m)
  }
  function alternar() {
    setColapsado((c) => {
      localStorage.setItem(CLAVE_COLAPSO, c ? '0' : '1')
      return !c
    })
  }

  const item = MENU_ADMIN.find((i) => i.id === modulo)

  return (
    <div className="admin-shell">
      <Sidebar activo={modulo} onSelect={seleccionar} colapsado={colapsado} onToggle={alternar} />
      <section className="admin-main">
        {/* Encabezado del módulo: deja claro en qué área está parado. */}
        {modulo !== 'planificacion' && (
          <div className="admin-crumb no-print">
            <span>{item?.icono} <strong>{item?.label}</strong></span>
            <span className="meta">Estás viendo el módulo de {item?.label} con permisos de gerencia.</span>
          </div>
        )}
        {modulo === 'planificacion' ? <DashboardView />
          : modulo === 'logistica' ? <LogisticaView />
          : modulo === 'laboratorio' ? <LaboratorioView />
          : modulo === 'despacho' ? <DespachoView />
          : <SGOView />}
      </section>
    </div>
  )
}
