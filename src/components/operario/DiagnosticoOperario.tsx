import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { Tarea, Usuario } from '../../types'
import { estadoPuestaAlDia, ponerseAlDiaTareas, type EstadoPuestaAlDia } from '../../sync/ponerseAlDia'
import { estadoTiempoRealSync } from '../../sync/syncEngine'
import { VERSION_APP } from '../../version'

// ============================================================
// DIAGNÓSTICO DE "MI TRABAJO" (v2.63)
//
// Reclamo que no se pudo reproducir desde afuera (24/11/2026, mazza.alexander):
// la base tenía sus 6 tareas bien asignadas (su perfil, su sector, su estación)
// y la pantalla no las mostraba. Sin ver el equipo del operario solo se podía
// adivinar. Este panel muestra, en SU pantalla, todo lo que hace falta para
// saber dónde se corta: qué versión corre, con qué perfil entró, si el servidor
// le devuelve tareas, cuántas tiene guardadas el equipo y en qué estación están.
//
// Va plegado al pie de la pantalla: no molesta en el uso diario.
// ============================================================

const hora = (iso?: string) => (iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—')

export default function DiagnosticoOperario({ usuario, maquinaId, nombreMaquina }: {
  usuario: Usuario
  maquinaId: string
  nombreMaquina: (id: string) => string
}) {
  const [abierto, setAbierto] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [puesta, setPuesta] = useState<EstadoPuestaAlDia>(() => estadoPuestaAlDia())

  const datos = useLiveQuery(async () => {
    if (!abierto) return null
    const total = await db.tareas.count()
    const mias = await db.tareas.where('operarioId').equals(usuario.id).toArray()
    const sinSubir = await db.syncQueue.filter((o) => !o.sincronizado).count()
    return { total, mias, sinSubir }
  }, [abierto, usuario.id])

  async function buscarAhora() {
    setBuscando(true)
    try { await ponerseAlDiaTareas('diagnóstico', true) } finally {
      setPuesta(estadoPuestaAlDia())
      setBuscando(false)
    }
  }

  if (!abierto) {
    return (
      <div style={{ textAlign: 'center', marginTop: 18 }}>
        <button className="btn" style={{ fontSize: '.8rem', opacity: 0.8 }} onClick={() => { setPuesta(estadoPuestaAlDia()); setAbierto(true) }}>
          ¿No ves una tarea? Diagnóstico · {VERSION_APP}
        </button>
      </div>
    )
  }

  const abiertas = (datos?.mias ?? []).filter((t) => t.estado !== 'finalizada')
  const tr = estadoTiempoRealSync()
  const fila = (k: string, v: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', borderBottom: '1px solid var(--borde)' }}>
      <span className="meta">{k}</span><strong style={{ textAlign: 'right' }}>{v}</strong>
    </div>
  )
  const porEstacion = (ts: Tarea[]) => {
    const m = new Map<string, Tarea[]>()
    for (const t of ts) m.set(t.maquinaId, [...(m.get(t.maquinaId) ?? []), t])
    return [...m.entries()]
  }

  return (
    <div className="card" style={{ marginTop: 18, fontSize: '.85rem' }}>
      <div className="card-header">
        <strong>Diagnóstico de Mi trabajo</strong>
        <button className="btn" onClick={() => setAbierto(false)}>Cerrar</button>
      </div>
      {fila('Versión de la app', VERSION_APP)}
      {fila('Usuario', `${usuario.nombre} · ${usuario.usuario}`)}
      {fila('Id de perfil', usuario.id)}
      {fila('Rol / sectores', `${usuario.rol} · ${usuario.sectores.join(', ') || 'ninguno'}`)}
      {fila('Estación elegida', maquinaId ? nombreMaquina(maquinaId) : 'ninguna')}
      {fila('Conexión', navigator.onLine ? 'con red' : 'SIN RED')}
      {fila('Tiempo real', `${tr.estado}${tr.en ? ` (${hora(tr.en)})` : ''}`)}
      {fila('Última búsqueda en el servidor', puesta.en ? `${hora(puesta.en)} · ${puesta.motivo ?? ''}` : 'todavía no')}
      {fila('Tareas abiertas que devolvió el servidor', puesta.delServidor ?? '—')}
      {puesta.error && fila('Error', <span style={{ color: 'var(--rojo)' }}>{puesta.error}</span>)}
      {fila('Tareas guardadas en este equipo', datos?.total ?? '…')}
      {fila('Cambios sin subir', datos?.sinSubir ?? '…')}
      {fila('Mis tareas abiertas en este equipo', abiertas.length)}
      {abiertas.length > 0 && (
        <div style={{ margin: '8px 0' }}>
          {porEstacion(abiertas).map(([id, ts]) => (
            <div key={id} className="meta">
              • {nombreMaquina(id)}{id === maquinaId ? ' (la elegida)' : ''}: {ts.map((t) => t.estado).join(', ')}
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-primary btn-bloque" style={{ marginTop: 10 }} disabled={buscando} onClick={() => void buscarAhora()}>
        {buscando ? 'Buscando…' : 'Buscar mis tareas en el servidor ahora'}
      </button>
      <div className="meta" style={{ marginTop: 6 }}>Si algo no cierra, sacale una captura a este panel y mandásela a Lorenzo.</div>
    </div>
  )
}
