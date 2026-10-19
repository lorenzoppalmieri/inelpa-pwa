import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import type { SolicitudEpp } from '../../types'
import { guardarSolicitudEpp } from '../../sync/syncEngine'
import { fechaCorta, hhmm } from '../../lib/time'
import { puestoEppPorId } from '../../epp/catalogo'
import { entregadasEn } from '../../epp/types'

// ============================================================
// APROBACIÓN DE REPOSICIONES EXTRAORDINARIAS DE EPP (v1.83) — para HyS.
//
// Es el equivalente digital de la "Firma del controlador de HyS" al pie de la
// planilla R.I.T 7.1.2 06. Pañol no puede entregar un EPP fuera de cupo hasta
// que alguien de acá lo autorice.
//
// Cada aprobación habilita UNA unidad: al entregarla queda 'usada'. Si hiciera
// falta otra, hay que pedir de nuevo. Así una autorización no se convierte en
// un permiso permanente para ese EPP.
// ============================================================

export default function AprobacionesEpp() {
  const { usuario } = useAuth()
  const solicitudes = useLiveQuery(() => db.solicitudesEpp.toArray(), []) ?? []
  const colaboradores = useLiveQuery(() => db.colaboradoresEpp.toArray(), []) ?? []
  const entregas = useLiveQuery(() => db.entregasEpp.toArray(), []) ?? []

  const [resolviendo, setResolviendo] = useState<{ s: SolicitudEpp; aprobar: boolean } | null>(null)
  const [comentario, setComentario] = useState('')
  const [verHistorial, setVerHistorial] = useState(false)

  const pendientes = useMemo(
    () => solicitudes.filter((s) => s.estado === 'pendiente').sort((a, b) => (a.pedidaEn < b.pedidaEn ? -1 : 1)),
    [solicitudes],
  )
  const resueltas = useMemo(
    () => solicitudes.filter((s) => s.estado !== 'pendiente')
      .sort((a, b) => ((b.resueltaEn ?? '') < (a.resueltaEn ?? '') ? -1 : 1)).slice(0, 30),
    [solicitudes],
  )

  // Contexto para que HyS decida con dato, no a ciegas.
  function detalle(s: SolicitudEpp) {
    const col = colaboradores.find((c) => c.id === s.colaboradorId)
    const puesto = puestoEppPorId(col?.puestoId)
    const def = puesto?.epps.find((e) => e.key === s.eppKey)
    const consumidas = entregadasEn(entregas, s.colaboradorId, s.eppKey, s.anio)
    return { col, puesto, def, consumidas }
  }

  async function confirmar() {
    if (!resolviendo) return
    const { s, aprobar } = resolviendo
    await guardarSolicitudEpp({
      ...s,
      estado: aprobar ? 'aprobada' : 'rechazada',
      resueltaEn: new Date().toISOString(),
      resueltaPor: usuario?.usuario,
      comentarioHys: comentario.trim() || undefined,
    })
    setResolviendo(null); setComentario('')
  }

  if (pendientes.length === 0 && resueltas.length === 0) return null

  return (
    <div className="card" style={{ borderLeft: `5px solid ${pendientes.length ? 'var(--naranja)' : 'var(--borde)'}`, marginBottom: 14 }}>
      <div className="section-title" style={{ marginTop: 0, color: pendientes.length ? 'var(--naranja)' : undefined }}>
        🦺 Reposiciones de EPP fuera de cupo ({pendientes.length})
      </div>

      {pendientes.length === 0
        ? <div className="meta">Nada pendiente de autorizar.</div>
        : pendientes.map((s) => {
          const { col, puesto, def, consumidas } = detalle(s)
          return (
            <div key={s.id} className="pareto-row" style={{ marginBottom: 10, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <strong>{col?.nombre ?? 'colaborador borrado'} · {def?.nombre ?? s.eppKey}</strong>
                <div className="meta">
                  {puesto?.nombre ?? '—'} · cupo {s.anio}: <strong>{consumidas} de {def?.limite ?? '—'}</strong> ({def?.frecuencia})
                  {' · '}pedido {fechaCorta(s.pedidaEn)} {hhmm(s.pedidaEn)}{s.pedidaPor ? ` por ${s.pedidaPor}` : ''}
                </div>
                <div className="meta texto-libre" style={{ fontStyle: 'italic' }}>📝 {s.motivo}</div>
              </div>
              <div className="row-actions">
                <button className="btn btn-verde" onClick={() => { setResolviendo({ s, aprobar: true }); setComentario('') }}>✓ Autorizar</button>
                <button className="btn btn-rojo" onClick={() => { setResolviendo({ s, aprobar: false }); setComentario('') }}>✕ Rechazar</button>
              </div>
            </div>
          )
        })}

      {resueltas.length > 0 && (
        <>
          <button className="btn" style={{ marginTop: 8 }} onClick={() => setVerHistorial((v) => !v)}>
            {verHistorial ? '▲ Ocultar' : `▼ Ver historial (${resueltas.length})`}
          </button>
          {verHistorial && resueltas.map((s) => {
            const { col, def } = detalle(s)
            return (
              <div className="meta" key={s.id} style={{ marginTop: 6 }}>
                · <strong>{col?.nombre ?? '—'}</strong> — {def?.nombre ?? s.eppKey} ·{' '}
                <span style={{ color: s.estado === 'rechazada' ? 'var(--rojo)' : 'var(--estado-fin)' }}>
                  {s.estado === 'rechazada' ? 'rechazada' : s.estado === 'usada' ? 'autorizada y entregada' : 'autorizada'}
                </span>
                {s.resueltaPor ? ` por ${s.resueltaPor}` : ''}{s.resueltaEn ? ` · ${fechaCorta(s.resueltaEn)}` : ''}
                {s.comentarioHys ? <div className="texto-libre">HyS: {s.comentarioHys}</div> : null}
              </div>
            )
          })}
        </>
      )}

      {/* Confirmación con comentario (queda como la firma de la planilla) */}
      {resolviendo && (
        <div className="modal-overlay" onClick={() => setResolviendo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-title" style={{ marginTop: 0 }}>
              {resolviendo.aprobar ? '✓ Autorizar reposición' : '✕ Rechazar pedido'}
            </div>
            {(() => {
              const { col, def, consumidas } = detalle(resolviendo.s)
              return (
                <div className="meta" style={{ marginBottom: 12 }}>
                  <strong>{col?.nombre}</strong> · {def?.nombre} · lleva {consumidas} de {def?.limite ?? '—'} en {resolviendo.s.anio}.
                  <div className="texto-libre" style={{ fontStyle: 'italic', marginTop: 4 }}>📝 {resolviendo.s.motivo}</div>
                </div>
              )
            })()}
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Comentario {resolviendo.aprobar ? '(opcional)' : '— por qué se rechaza'}</label>
              <textarea className="input" rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className="meta" style={{ marginBottom: 12 }}>
              {resolviendo.aprobar
                ? 'Habilita UNA unidad. Al entregarla queda consumida; si necesita otra hay que volver a pedir.'
                : 'Pañol no va a poder entregar ese EPP hasta que haya una autorización.'}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setResolviendo(null)}>Cancelar</button>
              <button
                className={resolviendo.aprobar ? 'btn btn-verde' : 'btn btn-rojo'}
                disabled={!resolviendo.aprobar && !comentario.trim()}
                onClick={() => void confirmar()}
              >{resolviendo.aprobar ? '✓ Autorizar' : '✕ Rechazar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
