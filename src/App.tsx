import { useAuth } from './auth/AuthContext'
import Login from './components/Login'
import Layout from './components/Layout'
import OperarioView from './components/operario/OperarioView'
import DashboardView from './components/dashboard/DashboardView'
import LogisticaView from './components/dashboard/LogisticaView'
import LaboratorioView from './components/laboratorio/LaboratorioView'

// Ruteo por rol: operario ve su panel de planta; logistica ve la vista de solo
// lectura (Gantt + alertas de material); encargado y planificador ven el dashboard.
export default function App() {
  const { usuario, cargando } = useAuth()

  if (cargando) return <div className="login-wrap"><div className="meta">Cargando...</div></div>
  if (!usuario) return <Login />

  return (
    <Layout>
      {usuario.rol === 'operario' ? <OperarioView />
        : usuario.rol === 'logistica' ? <LogisticaView />
        : usuario.rol === 'laboratorio' ? <LaboratorioView />
        : <DashboardView />}
    </Layout>
  )
}
