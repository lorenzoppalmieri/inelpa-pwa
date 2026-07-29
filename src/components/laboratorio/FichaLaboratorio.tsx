import { useRef, useState } from 'react'
import type { TareaLaboratorio, EnsayoEstado, DespachoTrafo } from '../../types'
import { ENSAYOS_LAB, estadoEnsayo, tieneRechazo } from '../../types'
import { useAuth } from '../../auth/AuthContext'
import { guardarLaboratorio } from '../../sync/syncEngine'
import { guardarDespacho } from '../../sync/syncEngine'
import { db } from '../../db/dexie'
import { datosModelo, buscarModelo } from '../../lib/modeloTrafo'
import { subirProtocolo, abrirProtocolo, MAX_PDF_MB } from '../../lib/archivos'

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
  // v1.47: PROTOCOLO DE ENSAYO (PDF). El archivo va a Supabase Storage; en la
  // tarea solo queda la ruta. Es OBLIGATORIO para liberar el trafo a despacho.
  const fileRef = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [errPdf, setErrPdf] = useState('')

  async function elegirPdf(file?: File | null) {
    if (!file) return
    setErrPdf(''); setSubiendo(true)
    const ref = (nroSerie.trim() || t.nroSerie || t.modelo || 'protocolo')
    const r = await subirProtocolo(file, ref, t.id)
    setSubiendo(false)
    if (fileRef.current) fileRef.current.value = ''   // permite re-elegir el mismo archivo
    if (!r.ok) { setErrPdf(r.error ?? 'No se pudo subir el archivo.'); return }
    await guardarLaboratorio({
      ...t,
      nroSerie: nroSerie.trim() || t.nroSerie,
      protocoloPath: r.path,
      protocoloNombre: r.nombre,
      protocoloSubido: new Date().toISOString(),
    })
  }
  async function verPdf() {
    const err = await abrirProtocolo(t.protocoloPath)
    if (err) setErrPdf(err)
  }

  // Cada toggle guarda el estado del ensayo al instante.
  async function setEnsayo(key: string, v: EnsayoEstado) {
    await guardarLaboratorio({ ...t, ensayos: { ...(t.ensayos ?? {}), [key]: v } })
  }
  async function guardarSerie() {
    if ((nroSerie.trim() || undefined) !== t.nroSerie) await guardarLaboratorio({ ...t, nroSerie: nroSerie.trim() || undefined })
  }

  const retrabajo = tieneRechazo(t)
  const faltaComentario = retrabajo && !comentario.trim()
  // Solo se exige el PDF cuando el trafo APRUEBA (es lo que se libera a despacho).
  // En retrabajo no se pide: el trafo no sale del sector.
  const faltaProtocolo = !retrabajo && !t.protocoloPath
  const noPuedeFinalizar = guardando || subiendo || faltaComentario || faltaProtocolo

  // Handler de finalización: evalúa el checklist y rutea el transformador.
  async function finalizarEnsayo() {
    if (faltaComentario || faltaProtocolo) return
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
      // v1.43: se hereda la DESCRIPCIÓN COMPLETA del modelo, no solo la serie.
      // Antes a Despacho le llegaba "Serie 24.563" y la ficha mostraba "—" en
      // Tipo y Potencia. El catálogo aporta tanque/montaje/potencia normalizados;
      // si el modelo no está (prototipos, catálogo sin sincronizar) se parsea el
      // nombre, que sigue la misma convención de SAP.
      const catalogo = await db.modelos.toArray()
      const dm = datosModelo(t.modelo, buscarModelo(t.modelo, catalogo))
      const d: DespachoTrafo = {
        id: crypto.randomUUID(),
        ot: t.ot ?? '',
        cliente: t.cliente || 'Stock',
        nroSerie: serie ?? '',
        numerosSerie: serie ? [serie] : undefined,
        modelo: dm.nombre || undefined,
        tipo: dm.tipo,
        potencia: dm.potencia,
        linea: t.linea ?? 'distribucion',
        fechaIngreso: now,
        estado: 'esperando_embalaje',
        // v1.47: el protocolo viaja a Despacho para que Melany lo exporte.
        protocoloPath: t.protocoloPath,
        protocoloNombre: t.protocoloNombre,
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

          {/* v1.47: PROTOCOLO DE ENSAYO en PDF. Obligatorio para liberar a despacho. */}
          {!retrabajo && (
            <>
              {seccion('Protocolo de ensayo (PDF)')}
              <div className="card" style={{ borderLeft: '4px solid ' + (t.protocoloPath ? 'var(--estado-fin)' : 'var(--rojo)') }}>
                {t.protocoloPath ? (
                  <>
                    <div className="meta" style={{ color: 'var(--estado-fin)', fontWeight: 700 }}>
                      ✓ Protocolo adjunto{t.protocoloNombre ? `: ${t.protocoloNombre}` : ''}
                    </div>
                    <div className="row-actions" style={{ marginTop: 8 }}>
                      <button className="btn" onClick={() => void verPdf()}>👁 Ver PDF</button>
                      <button className="btn" disabled={subiendo} onClick={() => fileRef.current?.click()}>
                        {subiendo ? 'Subiendo…' : '↻ Reemplazar'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="meta" style={{ color: 'var(--rojo)', fontWeight: 700 }}>
                      ✗ Falta adjuntar el protocolo — sin esto no se puede liberar a despacho.
                    </div>
                    <button className="btn btn-primary btn-bloque" style={{ marginTop: 8 }}
                      disabled={subiendo} onClick={() => fileRef.current?.click()}>
                      {subiendo ? 'Subiendo…' : '📎 Adjuntar protocolo (PDF)'}
                    </button>
                  </>
                )}
                <input
                  ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                  onChange={(e) => void elegirPdf(e.target.files?.[0])}
                />
                <div className="meta" style={{ marginTop: 6 }}>PDF de 1 página, hasta {MAX_PDF_MB} MB.</div>
                {errPdf && <div className="meta" style={{ marginTop: 6, color: 'var(--rojo)' }}>⚠ {errPdf}</div>}
              </div>
            </>
          )}

          <div className="meta" style={{ marginTop: 8, color: retrabajo ? 'var(--rojo)' : faltaProtocolo ? 'var(--naranja)' : 'var(--estado-fin)' }}>
            {retrabajo
              ? '⚠ Hay ensayos rechazados → al finalizar va a RETRABAJO (no se despacha).'
              : faltaProtocolo
                ? '📎 Adjuntá el protocolo para poder liberar el transformador a despacho.'
                : '✓ Sin rechazos y con protocolo → al finalizar se crea la tarea de despacho.'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12, flex: 'none' }}>
          <button className="btn" onClick={onClose} disabled={guardando}>Cerrar</button>
          <button className={'btn ' + (retrabajo ? 'btn-rojo' : 'btn-verde')} disabled={noPuedeFinalizar} onClick={() => void finalizarEnsayo()}
            title={faltaProtocolo ? 'Falta adjuntar el protocolo de ensayo (PDF)' : undefined}>
            {retrabajo ? '⚠ Finalizar → Retrabajo' : faltaProtocolo ? '🔒 Falta el protocolo' : '✓ Finalizar → Despacho'}
          </button>
        </div>
      </div>
    </div>
  )
}
