import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import {
  SECTORES, sectorById, mensajeEsPara,
  type Mensaje, type MensajeDestinoTipo, type Usuario,
} from '../../types'
import { guardarMensaje, eliminarMensaje } from '../../sync/syncEngine'
import { fechaCorta, hhmm } from '../../lib/time'

// Destinatarios "reales" (los que pueden recibir): todos menos planificadores.
function esDestinatario(u: Usuario): boolean { return u.activo && u.rol !== 'planificador' }

// ============================================================
// MENSAJES — vista del PLANIFICADOR: redacta (a colaborador / sector / rol / todos)
// y ve los enviados con acuse de lectura ("leído por X de Y" + quiénes).
// ============================================================
export default function MensajesPlanificador() {
  const { usuario } = useAuth()
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const mensajes = useLiveQuery(() => db.mensajes.toArray(), []) ?? []
  const lecturas = useLiveQuery(() => db.mensajesLectura.toArray(), []) ?? []

  const [tipo, setTipo] = useState<MensajeDestinoTipo>('todos')
  const [destinoId, setDestinoId] = useState('')
  const [texto, setTexto] = useState('')
  const [msg, setMsg] = useState('')
  const [detalle, setDetalle] = useState<string | null>(null) // mensaje expandido (quién leyó)

  const destinatarios = useMemo(() => usuarios.filter(esDestinatario), [usuarios])
  const nombreUsuario = useMemo(() => new Map(usuarios.map((u) => [u.id, u.nombre])), [usuarios])

  // Cantidad de destinatarios esperados de un mensaje (para "X de Y").
  function esperados(m: Mensaje): Usuario[] {
    return destinatarios.filter((u) => mensajeEsPara(m, u))
  }
  // Lecturas de un mensaje.
  const lectPorMensaje = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const l of lecturas) { const s = map.get(l.mensajeId) ?? new Set<string>(); s.add(l.usuarioId); map.set(l.mensajeId, s) }
    return map
  }, [lecturas])

  async function enviar() {
    setMsg('')
    if (!usuario) return
    if (!texto.trim()) { setMsg('Escribí el mensaje.'); return }
    if (tipo !== 'todos' && !destinoId) { setMsg('Elegí el destinatario.'); return }
    const m: Mensaje = {
      id: crypto.randomUUID(),
      autorId: usuario.id,
      autorNombre: usuario.nombre,
      texto: texto.trim(),
      destinoTipo: tipo,
      destinoId: tipo === 'todos' ? undefined : destinoId,
      creado: new Date().toISOString(),
    }
    await guardarMensaje(m)
    setTexto(''); setMsg('Mensaje enviado.')
  }
  async function borrar(m: Mensaje) {
    if (!window.confirm('¿Eliminar este mensaje? Ya no lo verán los destinatarios.')) return
    await eliminarMensaje(m.id)
  }

  const enviados = useMemo(() => [...mensajes].sort((a, b) => (a.creado < b.creado ? 1 : -1)), [mensajes])

  return (
    <div>
      <div className="card">
        <div className="section-title">Nuevo mensaje</div>
        <div className="form-grid">
          <div className="field">
            <label>Enviar a</label>
            <select className="input" value={tipo} onChange={(e) => { setTipo(e.target.value as MensajeDestinoTipo); setDestinoId('') }}>
              <option value="todos">Toda la planta</option>
              <option value="rol">Un rol (todos los operarios / encargados)</option>
              <option value="sector">Un sector / línea</option>
              <option value="usuario">Un colaborador puntual</option>
            </select>
          </div>
          {tipo === 'rol' && (
            <div className="field">
              <label>Rol</label>
              <select className="input" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                <option value="">— Selecciona —</option>
                <option value="operario">Todos los operarios</option>
                <option value="encargado">Todos los encargados</option>
              </select>
            </div>
          )}
          {tipo === 'sector' && (
            <div className="field">
              <label>Sector</label>
              <select className="input" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                <option value="">— Selecciona —</option>
                {SECTORES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}
          {tipo === 'usuario' && (
            <div className="field">
              <label>Colaborador</label>
              <select className="input" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                <option value="">— Selecciona —</option>
                {destinatarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>Mensaje</label>
          <textarea className="input" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribí el aviso o la instrucción…" />
        </div>
        <button className="btn btn-primary btn-bloque" onClick={() => void enviar()} disabled={!texto.trim() || (tipo !== 'todos' && !destinoId)}>✉ Enviar mensaje</button>
        {msg && <div className="meta" style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div className="section-title">Enviados ({enviados.length})</div>
      {enviados.length === 0
        ? <div className="empty">Todavía no enviaste mensajes.</div>
        : enviados.map((m) => {
            const esp = esperados(m)
            const leidos = lectPorMensaje.get(m.id) ?? new Set<string>()
            const nLeidos = esp.filter((u) => leidos.has(u.id)).length
            const destTxt = m.destinoTipo === 'todos' ? 'Toda la planta'
              : m.destinoTipo === 'rol' ? (m.destinoId === 'encargado' ? 'Todos los encargados' : 'Todos los operarios')
              : m.destinoTipo === 'sector' ? sectorById(m.destinoId as Parameters<typeof sectorById>[0]).nombre
              : (nombreUsuario.get(m.destinoId ?? '') ?? 'Colaborador')
            return (
              <div className="card" key={m.id}>
                <div className="card-header">
                  <div>
                    <div style={{ fontWeight: 700 }}>Para: {destTxt}</div>
                    <div className="meta">{fechaCorta(m.creado)} {hhmm(m.creado)} · Leído por <strong>{nLeidos}</strong> de <strong>{esp.length}</strong></div>
                  </div>
                  <button className="btn btn-rojo" onClick={() => void borrar(m)}>🗑</button>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{m.texto}</div>
                <button className="btn" onClick={() => setDetalle(detalle === m.id ? null : m.id)}>
                  {detalle === m.id ? 'Ocultar' : 'Ver quién leyó'}
                </button>
                {detalle === m.id && (
                  <div className="meta" style={{ marginTop: 8 }}>
                    {esp.length === 0 ? 'Sin destinatarios.' : esp.map((u) => (
                      <div key={u.id}>{leidos.has(u.id) ? '✓' : '○'} {u.nombre}{leidos.has(u.id) ? '' : ' (sin leer)'}</div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
    </div>
  )
}
