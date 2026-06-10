import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [logoFallido, setLogoFallido] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const r = await login(usuario, password)
    if (!r.ok) setError(r.error ?? 'Error de acceso')
    setBusy(false)
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        {/* Logo corporativo: archivo en public/logo.png. Si el archivo no esta,
            cae a un marcador con el nombre para que la pantalla nunca quede vacia. */}
        {logoFallido ? (
          <div className="logo-fallback">INELPA</div>
        ) : (
          <img className="logo-corp" src="/logo.png" alt="INELPA Transformadores"
            onError={() => setLogoFallido(true)} />
        )}
        <h1>Control de Produccion</h1>
        <p className="sub">Sistema de Planificacion y Eficiencia</p>

        <div className="field">
          <label>Usuario</label>
          <input className="input" autoCapitalize="none" autoCorrect="off" value={usuario}
            onChange={(e) => setUsuario(e.target.value)} placeholder="usuario" />
        </div>
        <div className="field">
          <label>Contrasena</label>
          <input className="input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="contrasena" />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button className="btn btn-primary btn-bloque" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
