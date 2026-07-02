import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ROL_LABEL } from '../auth/roles'
import { onSync, purgarColaSync, reintentarErroresSync, type EstadoSync } from '../sync/syncEngine'
import CambiarPassword from './CambiarPassword'

// ============================================================
// Semaforo de conexion (header). 4 estados pensados para planta (7.000 m2 con
// cortes de Wi-Fi entre sectores). Le asegura al operario que puede seguir
// picando tareas: sus cambios quedan a salvo en Dexie hasta que vuelva la red.
//   verde    -> en linea y todo al dia
//   amarillo -> sincronizando (subiendo la cola de cambios)
//   naranja  -> sin senal PERO con cambios guardados localmente (a salvo)
//   rojo     -> sin senal y base local al dia (nada pendiente)
// ============================================================
function semaforoEstado(s: EstadoSync): { clase: string; label: string; detalle: string } {
  if (s.sincronizando || (s.online && s.pendientes > 0)) {
    return { clase: 'sem-sync', label: 'Sincronizando', detalle: s.pendientes > 0 ? `Subiendo ${s.pendientes} cambio(s) a la nube…` : 'Procesando cola de cambios…' }
  }
  if (s.online) {
    return { clase: 'sem-online', label: 'En línea', detalle: 'Conectado y datos al día.' }
  }
  if (s.pendientes > 0) {
    return { clase: 'sem-offcambios', label: 'Sin conexión', detalle: `Sin Wi-Fi. ${s.pendientes} cambio(s) guardado(s) a salvo en este equipo; se subirán solos al volver la red.` }
  }
  return { clase: 'sem-desco', label: 'Sin conexión', detalle: 'Sin Wi-Fi. No hay cambios pendientes; la base local está al día.' }
}

export default function Layout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth()
  const [sync, setSync] = useState<EstadoSync | null>(null)
  const [verCambioClave, setVerCambioClave] = useState(false)
  // v1.18: escape hatch. 5 clics en el semaforo revelan el panel de emergencia.
  const [verAdminSync, setVerAdminSync] = useState(false)
  const clicksRef = useRef<{ n: number; t: number }>({ n: 0, t: 0 })

  useEffect(() => onSync(setSync), [])

  function clickSemaforo() {
    const ahora = Date.now()
    const c = clicksRef.current
    c.n = ahora - c.t < 1200 ? c.n + 1 : 1
    c.t = ahora
    if (c.n >= 5) { setVerAdminSync(true); c.n = 0 }
  }

  async function purgar() {
    if (!window.confirm('EMERGENCIA: purgar la cola de sincronización trabada.\n\nSe descartan los cambios locales que no se pudieron subir. Usar solo si la sync quedó bloqueada. ¿Continuar?')) return
    const n = await purgarColaSync()
    window.alert(`Cola purgada: ${n} operación(es) descartada(s). La app vuelve a sincronizar normal.`)
    setVerAdminSync(false)
  }
  async function reintentar() {
    const n = await reintentarErroresSync()
    window.alert(n > 0 ? `Reintentando ${n} operación(es) con error…` : 'No hay operaciones con error para reintentar.')
  }

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <div className="brand">
          <svg className="logo" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0b3d6b"/><path d="M36 6 L16 36 H28 L26 58 L48 26 H34 L38 6 Z" fill="#f59e0b"/></svg>
          <span>INELPA</span>
        </div>
        <div className="user">
          {sync && (() => {
            const e = semaforoEstado(sync)
            const det = e.detalle + (sync.errores ? ` · ${sync.errores} con error (descartadas)` : '') + (sync.sesionInvalida ? ' · sesión vencida, reingresá' : '')
            return (
              <span className={'sync-pill ' + e.clase} title={det + ' · (5 clics = panel de emergencia)'} onClick={clickSemaforo} style={{ cursor: 'pointer' }} aria-label={`Estado de conexion: ${e.label}. ${det}`}>
                <span className="sem-dot" />
                <span className="sem-label">{e.label}</span>
                {sync.pendientes > 0 && <span className="sem-badge">{sync.pendientes}</span>}
                {!!sync.errores && sync.errores > 0 && <span className="sem-badge" style={{ background: 'var(--rojo)' }}>⛔{sync.errores}</span>}
              </span>
            )
          })()}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{usuario?.nombre}</div>
            <span className="rol-badge">{usuario ? ROL_LABEL[usuario.rol] : ''}</span>
          </div>
          <button className="btn" style={{ minHeight: 44, padding: '0 14px' }} onClick={() => setVerCambioClave(true)} title="Cambiar mi contraseña">🔑 Clave</button>
          <button className="btn" style={{ minHeight: 44, padding: '0 14px' }} onClick={logout}>Salir</button>
        </div>
      </header>
      <main className="content">{children}</main>
      {verCambioClave && <CambiarPassword onClose={() => setVerCambioClave(false)} />}

      {verAdminSync && (
        <div className="modal-overlay" onClick={() => setVerAdminSync(false)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="section-title" style={{ marginTop: 0 }}>🛠 Sincronización — emergencia</div>
            <div className="meta" style={{ marginBottom: 12 }}>
              Pendientes: <strong>{sync?.pendientes ?? 0}</strong> · Con error: <strong>{sync?.errores ?? 0}</strong>
              {sync?.sesionInvalida ? <> · <span style={{ color: 'var(--rojo)' }}>sesión vencida (reingresá)</span></> : null}
            </div>
            <p className="meta" style={{ marginBottom: 14 }}>
              Usá esto solo si la sincronización quedó trabada en un número que no baja. "Reintentar" es seguro;
              "Purgar" descarta los cambios locales que no se pudieron subir.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn" onClick={reintentar}>↻ Reintentar operaciones con error</button>
              <button className="btn btn-rojo" onClick={purgar}>🧹 Purgar cola de sincronización trabada</button>
              <button className="btn" onClick={() => setVerAdminSync(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
