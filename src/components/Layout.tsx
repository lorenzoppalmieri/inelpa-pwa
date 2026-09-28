import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ROL_LABEL } from '../auth/roles'
import {
  onSync, purgarColaSync, reintentarErroresSync, listarErroresSync, exportarColaPendiente,
  type EstadoSync, type OpConError,
} from '../sync/syncEngine'
import CambiarPassword from './CambiarPassword'
import BotonFullscreen from './ui/BotonFullscreen'

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

  // v2.31: estado del panel de emergencia. Antes todo era `window.alert` y el
  // resultado de reintentar nunca se sabía (se disparaba y no se esperaba).
  const [errores, setErrores] = useState<OpConError[]>([])
  const [trabajando, setTrabajando] = useState<'' | 'reintentar' | 'respaldo' | 'purgar'>('')
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  // Cada vez que se abre el panel (y cada vez que cambia el contador) se
  // recarga la lista de errores con su MOTIVO. Sin el motivo no hay forma de
  // saber si reintentar tiene sentido.
  useEffect(() => {
    if (!verAdminSync) return
    void listarErroresSync().then(setErrores)
  }, [verAdminSync, sync?.errores, sync?.pendientes])

  async function purgar() {
    // v2.31: tercer resguardo. Hay que escribir la palabra: el confirm solo se
    // aceptaba de memoria y así se perdieron tareas terminadas en las tablets.
    const escrito = window.prompt(
      'EMERGENCIA — PURGAR LA COLA\n\n' +
      'Se BORRAN de este equipo los cambios que no se pudieron subir (por ejemplo, tareas que un operario marcó como terminadas).\n\n' +
      'Antes de borrar se va a descargar un archivo de RESPALDO con todo. Guardalo: es lo único que permite recuperar ese trabajo.\n\n' +
      'Para confirmar, escribí PURGAR:',
    )
    if ((escrito ?? '').trim().toUpperCase() !== 'PURGAR') return
    setTrabajando('purgar'); setResultado(null)
    try {
      const r = await purgarColaSync()
      setResultado({ ok: true, texto: `Cola purgada: ${r.purgadas} operación(es). Se descargó el respaldo con ${r.respaldadas}. Guardá ese archivo.` })
    } catch (e) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : 'No se pudo purgar.' })
    } finally {
      setTrabajando('')
    }
  }

  async function respaldar() {
    setTrabajando('respaldo'); setResultado(null)
    const n = await exportarColaPendiente()
    setTrabajando('')
    setResultado({ ok: true, texto: n > 0 ? `Respaldo descargado: ${n} operación(es) sin subir.` : 'No hay nada sin subir: no hace falta respaldo.' })
  }

  async function reintentar() {
    setTrabajando('reintentar'); setResultado(null)
    try {
      const r = await reintentarErroresSync()
      if (r.reintentadas === 0) {
        setResultado({ ok: true, texto: 'No hay operaciones con error para reintentar.' })
      } else if (r.sinConexion) {
        setResultado({ ok: false, texto: `Sin conexión: ${r.reintentadas} operación(es) quedan en cola y se subirán solas al volver la red. No se pierden.` })
      } else if (r.sesionInvalida) {
        setResultado({ ok: false, texto: 'La sesión está vencida. Salí y volvé a ingresar: las operaciones siguen guardadas y suben solas al reingresar.' })
      } else {
        const partes = [`Subieron ${r.subieron} de ${r.reintentadas}.`]
        if (r.enEspera) partes.push(`${r.enEspera} en espera (se reintentan solas).`)
        if (r.siguenConError) partes.push(`${r.siguenConError} volvieron a fallar: el motivo está abajo. Reintentar no las va a arreglar — pasale el motivo a sistemas y NO purgues.`)
        setResultado({ ok: r.siguenConError === 0, texto: partes.join(' ') })
      }
    } finally {
      setTrabajando('')
    }
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
            // v2.31: "descartadas" era falso y asustaba: las operaciones con error
            // quedan GUARDADAS en el equipo, sin subir. Nada se borra salvo purgando.
            const det = e.detalle + (sync.errores ? ` · ${sync.errores} sin subir por error` : '') + (sync.sesionInvalida ? ' · sesión vencida, reingresá' : '')
            return (
              <span className={'sync-pill ' + e.clase} title={det + ' · (5 clics = panel de emergencia)'} onClick={clickSemaforo} style={{ cursor: 'pointer' }} aria-label={`Estado de conexion: ${e.label}. ${det}`}>
                <span className="sem-dot" />
                <span className="sem-label">{e.label}</span>
                {sync.pendientes > 0 && <span className="sem-badge">{sync.pendientes}</span>}
                {/* v2.31: antes era "⛔3". En la tablet el ⛔ se dibuja como un
                    círculo rojo con una raya blanca y, pegado al número, se leía
                    "−3": el reporte de "contador negativo". Nunca fue negativo. */}
                {!!sync.errores && sync.errores > 0 && <span className="sem-badge" style={{ background: 'var(--rojo)' }}>⚠ {sync.errores}</span>}
              </span>
            )
          })()}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{usuario?.nombre}</div>
            <span className="rol-badge">{usuario ? ROL_LABEL[usuario.rol] : ''}</span>
          </div>
          {/* v1.57: pantalla completa. Va antes de "Clave" para que quede a mano
              en la tablet de planta sin competir con los botones de texto. */}
          <BotonFullscreen />
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
              {/* Math.max por las dudas: son conteos y no pueden ser negativos. */}
              Pendientes: <strong>{Math.max(0, sync?.pendientes ?? 0)}</strong> · Con error: <strong>{Math.max(0, sync?.errores ?? 0)}</strong>
              {sync?.sesionInvalida ? <> · <span style={{ color: 'var(--rojo)' }}>sesión vencida (reingresá)</span></> : null}
            </div>

            {/* v2.31: el MOTIVO de cada error, en pantalla. Antes solo iba a la
                consola y nadie podía saber si reintentar tenía sentido. */}
            {errores.length > 0 && (
              <div style={{ marginBottom: 12, maxHeight: 180, overflowY: 'auto', fontSize: '.82rem' }}>
                {errores.map((er) => (
                  <div key={er.id} style={{ padding: '6px 8px', marginBottom: 4, background: 'rgba(239,68,68,.12)', borderRadius: 8 }}>
                    <strong>{er.entidad}</strong> · {er.tipo} · <span className="meta">{new Date(er.ts).toLocaleString('es-AR')}</span>
                    <div style={{ color: '#fca5a5', wordBreak: 'break-word' }}>{er.motivo}</div>
                  </div>
                ))}
              </div>
            )}

            {resultado && (
              <div style={{
                marginBottom: 12, padding: '8px 10px', borderRadius: 8, fontSize: '.88rem',
                background: resultado.ok ? 'rgba(34,197,94,.14)' : 'rgba(245,158,11,.14)',
                color: resultado.ok ? '#bbf7d0' : '#fde68a',
              }}>{resultado.texto}</div>
            )}

            <p className="meta" style={{ marginBottom: 14 }}>
              Los cambios sin subir están <strong>guardados en este equipo</strong> y no se pierden solos.
              "Reintentar" y "Descargar respaldo" son seguros. <strong>"Purgar" los borra</strong>: usalo solo
              si sistemas lo indica, y guardá el respaldo que se descarga.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn" disabled={!!trabajando} onClick={() => void reintentar()}>
                {trabajando === 'reintentar' ? '⏳ Reintentando… (puede tardar unos segundos)' : '↻ Reintentar operaciones con error'}
              </button>
              <button className="btn" disabled={!!trabajando} onClick={() => void respaldar()}>
                {trabajando === 'respaldo' ? '⏳ Generando…' : '💾 Descargar respaldo de lo que no subió'}
              </button>
              <button className="btn btn-rojo" disabled={!!trabajando} onClick={() => void purgar()}>
                {trabajando === 'purgar' ? '⏳ Respaldando y purgando…' : '🧹 Purgar cola (descarga respaldo antes)'}
              </button>
              <button className="btn" disabled={trabajando === 'purgar'} onClick={() => { setVerAdminSync(false); setResultado(null) }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
