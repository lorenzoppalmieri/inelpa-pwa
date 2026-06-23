import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

// Modal para que el usuario logueado cambie SU propia contrasena.
// Pensado para planta: campos grandes, mensajes claros, sin jerga.
export default function CambiarPassword({ onClose }: { onClose: () => void }) {
  const { cambiarPassword } = useAuth()
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setError('')
    if (nueva.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (nueva !== repetir) { setError('Las dos contraseñas no coinciden.'); return }
    setGuardando(true)
    const r = await cambiarPassword(nueva)
    setGuardando(false)
    if (r.ok) {
      setOk(true)
      setTimeout(onClose, 1600)
    } else {
      setError(r.error ?? 'No se pudo cambiar la contraseña.')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="section-title" style={{ marginTop: 0 }}>Cambiar mi contraseña</div>

        {ok ? (
          <div className="empty" style={{ color: 'var(--verde, #16a34a)' }}>
            ✓ Contraseña actualizada. La próxima vez ingresá con la nueva.
          </div>
        ) : (
          <>
            <label className="meta" style={{ display: 'block', marginBottom: 4 }}>Nueva contraseña</label>
            <input
              className="input"
              type={ver ? 'text' : 'password'}
              value={nueva}
              autoFocus
              onChange={(e) => setNueva(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              style={{ width: '100%', marginBottom: 10 }}
            />

            <label className="meta" style={{ display: 'block', marginBottom: 4 }}>Repetir contraseña</label>
            <input
              className="input"
              type={ver ? 'text' : 'password'}
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void guardar() }}
              placeholder="Volvé a escribirla"
              style={{ width: '100%', marginBottom: 10 }}
            />

            <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />
              Mostrar contraseña
            </label>

            {error && <div className="empty" style={{ color: 'var(--rojo, #dc2626)', marginBottom: 10 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={onClose} disabled={guardando}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
