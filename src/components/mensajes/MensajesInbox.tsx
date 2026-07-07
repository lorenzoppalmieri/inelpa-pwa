import { useEffect, useMemo, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import { mensajeEsPara, sectorById, type Mensaje, type MensajeLectura } from '../../types'
import { marcarMensajeLeido } from '../../sync/syncEngine'
import { fechaCorta, hhmm } from '../../lib/time'

// Hook: cantidad de mensajes NO leídos para el usuario logueado (para el badge).
export function useMensajesNoLeidos(): number {
  const { usuario } = useAuth()
  const mensajes = useLiveQuery(() => db.mensajes.toArray(), []) ?? []
  const lecturas = useLiveQuery(() => usuario ? db.mensajesLectura.where('usuarioId').equals(usuario.id).toArray() : Promise.resolve([] as MensajeLectura[]), [usuario?.id]) ?? []
  if (!usuario) return 0
  const leidos = new Set(lecturas.map((l) => l.mensajeId))
  return mensajes.filter((m) => mensajeEsPara(m, usuario) && !leidos.has(m.id)).length
}

function destinoTxt(m: Mensaje): string {
  switch (m.destinoTipo) {
    case 'todos': return 'Toda la planta'
    case 'rol': return m.destinoId === 'encargado' ? 'Todos los encargados' : 'Todos los operarios'
    case 'sector': return m.destinoId ? sectorById(m.destinoId as Parameters<typeof sectorById>[0]).nombre : 'Sector'
    case 'usuario': return 'Personal'
    default: return ''
  }
}

// ============================================================
// BANDEJA DE ENTRADA (operario / encargado). Muestra los mensajes dirigidos a mí
// y los marca leídos al abrir la pestaña. Solo lectura (comunicación de ida).
// ============================================================
export default function MensajesInbox() {
  const { usuario } = useAuth()
  const mensajes = useLiveQuery(() => db.mensajes.toArray(), []) ?? []
  const lecturas = useLiveQuery(() => usuario ? db.mensajesLectura.where('usuarioId').equals(usuario.id).toArray() : Promise.resolve([] as MensajeLectura[]), [usuario?.id]) ?? []

  const leidos = useMemo(() => new Set(lecturas.map((l) => l.mensajeId)), [lecturas])
  const mios = useMemo(
    () => (usuario ? mensajes.filter((m) => mensajeEsPara(m, usuario)) : []).sort((a, b) => (a.creado < b.creado ? 1 : -1)),
    [mensajes, usuario],
  )

  // "Nuevo": capturamos los no leídos al abrir (para que el badge no desaparezca al instante).
  const nuevosRef = useRef<Set<string>>(new Set())
  const capturadoRef = useRef(false)
  useEffect(() => {
    if (!usuario || mios.length === 0) return
    if (!capturadoRef.current) {
      mios.forEach((m) => { if (!leidos.has(m.id)) nuevosRef.current.add(m.id) })
      capturadoRef.current = true
    }
    // Marca leídos los que aún no lo estén (acuse de recibo).
    mios.forEach((m) => { if (!leidos.has(m.id)) void marcarMensajeLeido(m.id, usuario.id) })
  }, [usuario, mios, leidos])

  return (
    <div>
      <div className="section-title">Mensajes recibidos</div>
      {mios.length === 0
        ? <div className="empty">No tenés mensajes.</div>
        : mios.map((m) => (
            <div className={'card' + (nuevosRef.current.has(m.id) ? ' card-foco' : '')} key={m.id}>
              <div className="card-header">
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {m.autorNombre}
                    {nuevosRef.current.has(m.id) && <span className="rol-badge" style={{ background: 'var(--azul-claro)', color: '#fff', marginLeft: 8 }}>NUEVO</span>}
                  </div>
                  <div className="meta">Para: {destinoTxt(m)} · {fechaCorta(m.creado)} {hhmm(m.creado)}</div>
                </div>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{m.texto}</div>
            </div>
          ))}
    </div>
  )
}
