import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ROL_LABEL } from '../auth/roles'
import { onSync, type EstadoSync } from '../sync/syncEngine'

export default function Layout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth()
  const [sync, setSync] = useState<EstadoSync | null>(null)

  useEffect(() => onSync(setSync), [])

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <div className="brand">
          <svg className="logo" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0b3d6b"/><path d="M20 14h6v36h-6zM38 14h6v36h-6z" fill="#f59e0b"/><path d="M26 30h12v6H26z" fill="#f59e0b"/></svg>
          <span>INELPA</span>
        </div>
        <div className="user">
          {sync && (
            <span className="sync-pill" title={sync.backendActivo ? 'Backend en nube activo' : 'Modo demo local'}>
              <span className={'net-dot ' + (sync.online ? 'on' : 'off')} />
              {sync.online ? 'En linea' : 'Offline'}
              {sync.pendientes > 0 && ` · ${sync.pendientes} por sincronizar`}
            </span>
          )}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{usuario?.nombre}</div>
            <span className="rol-badge">{usuario ? ROL_LABEL[usuario.rol] : ''}</span>
          </div>
          <button className="btn" style={{ minHeight: 44, padding: '0 14px' }} onClick={logout}>Salir</button>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  )
}
