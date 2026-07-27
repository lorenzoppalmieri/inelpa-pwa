import { useAuth } from './auth/AuthContext'
import { esSuperAdmin } from './auth/roles'
import Login from './components/Login'
import Layout from './components/Layout'
import OperarioView from './components/operario/OperarioView'
import DashboardView from './components/dashboard/DashboardView'
import LogisticaView from './components/dashboard/LogisticaView'
import LaboratorioView from './components/laboratorio/LaboratorioView'
import AdminLayout from './components/admin/AdminLayout'

// Ruteo por rol: operario ve su panel de planta; logistica ve la vista de solo
// lectura (Gantt + alertas de material); encargado y planificador ven el dashboard.
// v1.43: Planificación/Gerencia (super admin) ve el layout de ERP con menú lateral
// para navegar entre los módulos de las demás áreas. El resto NO lo ve.
export default function App() {
  const { usuario, cargando } = useAuth()

  if (cargando) return <div className="login-wrap"><div className="meta">Cargando...</div></div>
  if (!usuario) return <Login />

  // Super admin: layout de ERP (sidebar + contenedor dinámico).
  if (esSuperAdmin(usuario)) {
    return <Layout><AdminLayout /></Layout>
  }

  return (
    <Layout>
      {usuario.rol === 'operario' ? <OperarioView />
        : usuario.rol === 'logistica' ? <LogisticaView />
        : usuario.rol === 'laboratorio' ? <LaboratorioView />
        : <DashboardView />}
    </Layout>
  )
}
