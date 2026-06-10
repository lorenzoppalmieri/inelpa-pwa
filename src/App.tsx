import { useAuth } from './auth/AuthContext'
import Login from './components/Login'
import Layout from './components/Layout'
import OperarioView from './components/operario/OperarioView'
import DashboardView from './components/dashboard/DashboardView'

// Ruteo por rol: el operario ve su panel de planta; encargado y planificador
// ven el dashboard (Gantt + KPIs) con alcance segun sus sectores.
export default function App() {
  const { usuario, cargando } = useAuth()

  if (cargando) return <div className="login-wrap"><div className="meta">Cargando...</div></div>
  if (!usuario) return <Login />

  return (
    <Layout>
      {usuario.rol === 'operario' ? <OperarioView /> : <DashboardView />}
    </Layout>
  )
}
