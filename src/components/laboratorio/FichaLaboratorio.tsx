import { useState } from 'react'
import type { TareaLaboratorio, EnsayoEstado, DespachoTrafo } from '../../types'
import { ENSAYOS_LAB, estadoEnsayo, tieneRechazo } from '../../types'
import { useAuth } from '../../auth/AuthContext'
import { guardarLaboratorio } from '../../sync/syncEngine'
import { guardarDespacho } from '../../sync/syncEngine'

// ============================================================
// FICHA DE LABORATORIO (v1.37) — el laboratorista corre el protocolo de ensayos.
// N° de serie EDITABLE. Cada ensayo tiene 3 estados (sin / aprobado / rechazado),
// todos OPCIONALES. Al finalizar:
//   - sin rechazos -> crea el despacho (a Melany).
//   - con ≥1 rechazo -> retrabajo (queda el registro + comentario para el planificador).
// ============================================================

const OPCIONES: { v: EnsayoEstado; label: string; bg: string; fg: string }[] = [
  { v: 'sin', label: 'Sin ensayar', bg: 'transparent', fg: 'var(--texto)' },
  { v: 'aprobado', label: 'Aprobado', bg: 'var(--estado-fin)', fg: '#05230f' },
  { v: 'rechazado', label: 'No pasa', bg: 'var(--rojo)', fg: '#fff' },
]

export default function FichaLaboratorio({ tarea: t, onClose }: { tarea: TareaLaboratorio; onClose: () => void }) {
  const { usuario } = useAuth()
  const [nroSerie, setNroSerie] = useState(t.nroSerie ?? '')
  const [comentario, setComentario] = useState(t.comentario ?? '')
  const [guardando, setGuardando] = useState(false)

  // Cada toggle guarda el estado del ensayo al instante.
  async function setEnsayo(key: string, v: EnsayoEstado) {
    await guardarLaboratorio({ ...t, ensayos: { ...(t.ensayos ?? {}), [key]: v } })
  }
  async function guardarSerie() {
    if ((nroSerie.trim() || undefined) !== t.nroSerie) await guardarLaboratorio({ ...t, nroSerie: nroSerie.trim() || undefined })
  }

  const retrabajo = tieneRechazo(t)
  const faltaComentario = retrabajo && !comentario.trim()

  // Handler de finalización: evalúa el checklist y rutea el transformador.
  async function finalizarEnsayo() {
    if (faltaComentario) return
    setGuardando(true)
    const now = new Date().toISOString()
    const serie = nroSerie.trim() || t.nroSerie
    await guardarLaboratorio({
      ...t,
      nroSerie: serie,
      comentario: comentario.trim() || undefined,
      estado: 'finalizada',
      resultado: retrabajo ? 'retrabajo' : 'aprobado',
      finalizada: now,
      finalizadaPor: usuario?.usuario,
    })
    if (!retrabajo) {
      // CAMINO A: aprobado -> crea la tarea de despacho para Melany.
      const d: DespachoTrafo = {
        id: crypto.randomUUID(),
        ot: t.ot ?? '',
        cliente: t.cliente || 'Stock',
        nroSerie: serie ?? '',
        numerosSerie: serie ? [serie] : undefined,
        linea: t.linea ?? 'distribucion',
        fechaIngreso: now,
        estado: 'esperando_embalaje',
        creada: now, creadaPor: usuario?.usuario,
      }
      await guardarDespacho(d)
    }
    // CAMINO B (retrabajo): no se despacha; el registro queda con resultado
    // 'retrabajo' + comentario y lo ve el planificador en su panel de retrabajos.
    setGuardando(false)
    onClose()
  }

  const seccion = (x: string) => <div className="section-title" style={{ margin: '14px 0 8px' }}>{x}</div>

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, width: '96%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="section-title" style={{ marginTop: 0, flex: 'none' }}>🔬 Ensayo de laboratorio</div>

        <div style={{ overflow: 'auto', flex: 1, minHeight: 0, paddingRight: 4 }}>
          {seccion('Transformador')}
          <div className="meta">Modelo <strong>{t.modelo}</strong>{t.linea ? ` · ${t.linea === 'rural' ? 'Rural' : 'Distribución'}` : ''}</div>
          <div className="meta">Cliente <strong>{t.cliente || 'Stock'}</strong>{t.ot ? ` · OT ${t.ot}` : ''}</div>
          <div className="field" style={{ marginTop: 8, maxWidth: 260 }}>
            <label>N° de serie {t.nroSerie ? '' : '(cargalo si llegó vacío)'}</label>
            <input className="input" value={nroSerie} onChange={(e) => setNroSerie(e.target.value)} onBlur={() => void guardarSerie()} placeholder="ej. 24610" style={{ width: '100%' }} />
          </div>

          {seccion('Protocolo de ensayos (marcá solo los que hiciste)')}
          {ENSAYOS_LAB.map((e) => {
            const cur = estadoEnsayo(t, e.key)
            return (
              <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200, fontSize: '.9rem' }}>{e.label}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {OPCIONES.map((o) => {
                    const on = cur === o.v
                    return (
                      <button key={o.v} type="button" onClick={() => void setEnsayo(e.key, o.v)}
                        style={{
                          padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '.82rem', minHeight: 40,
                          border: '1px solid ' + (on ? (o.v === 'rechazado' ? 'var(--rojo)' : o.v === 'aprobado' ? 'var(--estado-fin)' : 'var(--azul-claro)') : 'var(--borde)'),
                          background: on ? o.bg : 'transparent', color: on ? o.fg : 'var(--texto)', fontWeight: on ? 800 : 500,
                        }}>{o.label}</button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div style={{ marginTop: 10 }}>
            <label className="meta">Comentario / posible solución {retrabajo ? <span style={{ color: 'var(--rojo)' }}>* (obligatorio si hay rechazos)</span> : '(opcional)'}</label>
            <textarea className="input" value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3}
              placeholder="ej. Falla de aislación en BT — revisar bobinado" style={{ width: '100%', resize: 'vertical' }} />
          </div>

          <div className="meta" style={{ marginTop: 8, color: retrabajo ? 'var(--rojo)' : 'var(--estado-fin)' }}>
            {retrabajo
              ? '⚠ Hay ensayos rechazados → al finalizar va a RETRABAJO (no se despacha).'
              : '✓ Sin rechazos → al finalizar se crea la tarea de despacho.'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12, flex: 'none' }}>
          <button className="btn" onClick={onClose} disabled={guardando}>Cerrar</button>
          <button className={'btn ' + (retrabajo ? 'btn-rojo' : 'btn-verde')} disabled={guardando || faltaComentario} onClick={() => void finalizarEnsayo()}>
            {retrabajo ? '⚠ Finalizar → Retrabajo' : '✓ Finalizar → Despacho'}
          </button>
        </div>
      </div>
    </div>
  )
}
