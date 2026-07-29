import { useRef, useState } from 'react'
import type { TareaLaboratorio, EnsayoEstado, DespachoTrafo } from '../../types'
import { ENSAYOS_LAB, estadoEnsayo, tieneRechazo, idDespachoDeLab } from '../../types'
import { useAuth } from '../../auth/AuthContext'
import { guardarLaboratorio } from '../../sync/syncEngine'
import { guardarDespacho } from '../../sync/syncEngine'
import { db } from '../../db/dexie'
import PanelEnsayo from './PanelEnsayo'
import { fechaCorta, hhmm } from '../../lib/time'
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
    if (!file || t.estado === 'finalizada') return
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
    if (t.estado === 'finalizada') return   // ficha cerrada: solo lectura
    await guardarLaboratorio({ ...t, ensayos: { ...(t.ensayos ?? {}), [key]: v } })
  }
  async function guardarSerie() {
    if (t.estado === 'finalizada') return
    if ((nroSerie.trim() || undefined) !== t.nroSerie) await guardarLaboratorio({ ...t, nroSerie: nroSerie.trim() || undefined })
  }

  // v1.48: una ficha FINALIZADA queda en SOLO LECTURA. Antes se podía reabrir
  // desde "Ver ensayo" y volver a finalizar, y cada pasada creaba un despacho
  // nuevo (id aleatorio) -> despachos duplicados para el mismo transformador.
  const finalizada = t.estado === 'finalizada'
  const [reabriendo, setReabriendo] = useState(false)

  // Reapertura EXPLÍCITA y auditada (queda quién y cuándo).
  async function reabrir() {
    if (!window.confirm('¿Reabrir este ensayo?\n\nQueda registrado quién y cuándo lo reabrió. Al volver a finalizarlo NO se crea un despacho nuevo: se actualiza el que ya existe.')) return
    setReabriendo(true)
    await guardarLaboratorio({
      ...t,
      estado: 'en_ensayo',
      reaperturas: [...(t.reaperturas ?? []), { en: new Date().toISOString(), por: usuario?.usuario }],
    })
    setReabriendo(false)
  }

  const retrabajo = tieneRechazo(t)
  const faltaComentario = retrabajo && !comentario.trim()
  // Solo se exige el PDF cuando el trafo APRUEBA (es lo que se libera a despacho).
  // En retrabajo no se pide: el trafo no sale del sector.
  const faltaProtocolo = !retrabajo && !t.protocoloPath
  const noPuedeFinalizar = guardando || subiendo || faltaComentario || faltaProtocolo || finalizada

  // Handler de finalización: evalúa el checklist y rutea el transformador.
  async function finalizarEnsayo() {
    if (faltaComentario || faltaProtocolo) return
    if (finalizada) return   // ya se liberó: no se vuelve a procesar
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
      // v1.48: ANTI-DUPLICADO. El id del despacho se DERIVA del id del ensayo,
      // así re-finalizar reescribe la misma fila en vez de crear otra. Además se
      // chequea antes si ya existe (por id o por vínculo) y, si existe, no se
      // pisa el trabajo que Melany ya haya hecho sobre él.
      const despId = idDespachoDeLab(t.id)
      const yaExiste = (await db.despachos.get(despId))
        ?? (await db.despachos.where('laboratorioId').equals(t.id).first())
      if (yaExiste) {
        // Solo se refrescan los datos que puede haber corregido el laboratorio.
        await guardarDespacho({
          ...yaExiste,
          nroSerie: serie ?? yaExiste.nroSerie,
          numerosSerie: serie ? [serie] : yaExiste.numerosSerie,
          protocoloPath: t.protocoloPath ?? yaExiste.protocoloPath,
          protocoloNombre: t.protocoloNombre ?? yaExiste.protocoloNombre,
          laboratorioId: t.id,
        })
        setGuardando(false)
        onClose()
        return
      }
      const catalogo = await db.modelos.toArray()
      const dm = datosModelo(t.modelo, buscarModelo(t.modelo, catalogo))
      const d: DespachoTrafo = {
        id: despId,
        laboratorioId: t.id,
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
        <div className="section-title" style={{ marginTop: 0, flex: 'none' }}>
          🔬 Ensayo de laboratorio{finalizada ? ' · CERRADO' : ''}
        </div>
        {finalizada && (
          <div className="card" style={{ flex: 'none', marginBottom: 10, borderLeft: '4px solid var(--estado-fin)' }}>
            <div className="meta" style={{ fontWeight: 700 }}>
              🔒 Ensayo finalizado{t.finalizada ? ` el ${fechaCorta(t.finalizada)} ${hhmm(t.finalizada)}` : ''}
              {t.finalizadaPor ? ` por ${t.finalizadaPor}` : ''} · solo lectura.
            </div>
            <div className="meta" style={{ marginTop: 4 }}>
              {t.resultado === 'retrabajo'
                ? 'Resultado: RETRABAJO (no se despachó).'
                : 'Resultado: APROBADO — el transformador ya fue liberado a despacho.'}
            </div>
            {t.reaperturas?.length ? (
              <div className="meta" style={{ marginTop: 4, color: 'var(--naranja)' }}>
                ↩ Reabierto {t.reaperturas.length} vez/veces · última: {fechaCorta(t.reaperturas[t.reaperturas.length - 1].en)} {hhmm(t.reaperturas[t.reaperturas.length - 1].en)}
                {t.reaperturas[t.reaperturas.length - 1].por ? ` por ${t.reaperturas[t.reaperturas.length - 1].por}` : ''}
              </div>
            ) : null}
          </div>
        )}

        <div style={{ overflow: 'auto', flex: 1, minHeight: 0, paddingRight: 4 }}>
          {seccion('Transformador')}
          <div className="meta">Modelo <strong>{t.modelo}</strong>{t.linea ? ` · ${t.linea === 'rural' ? 'Rural' : 'Distribución'}` : ''}</div>
          <div className="meta">Cliente <strong>{t.cliente || 'Stock'}</strong>{t.ot ? ` · OT ${t.ot}` : ''}</div>
          <div className="field" style={{ marginTop: 8, maxWidth: 260 }}>
            <label>N° de serie {t.nroSerie ? '' : '(cargalo si llegó vacío)'}</label>
            <input className="input" value={nroSerie} onChange={(e) => setNroSerie(e.target.value)} onBlur={() => void guardarSerie()} placeholder="ej. 24610" disabled={finalizada} style={{ width: '100%' }} />
          </div>

          {/* v1.54: valores garantizados del modelo + carga de valores medidos.
              El modelo y la serie ya vienen de Montaje, no se recargan. */}
          <PanelEnsayo tarea={t} soloLectura={finalizada} />

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
                      <button key={o.v} type="button" disabled={finalizada} onClick={() => void setEnsayo(e.key, o.v)}
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
            <textarea className="input" value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} disabled={finalizada}
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
                      {!finalizada && (
                        <button className="btn" disabled={subiendo} onClick={() => fileRef.current?.click()}>
                          {subiendo ? 'Subiendo…' : '↻ Reemplazar'}
                        </button>
                      )}
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

          {!finalizada && <div className="meta" style={{ marginTop: 8, color: retrabajo ? 'var(--rojo)' : faltaProtocolo ? 'var(--naranja)' : 'var(--estado-fin)' }}>
            {retrabajo
              ? '⚠ Hay ensayos rechazados → al finalizar va a RETRABAJO (no se despacha).'
              : faltaProtocolo
                ? '📎 Adjuntá el protocolo para poder liberar el transformador a despacho.'
                : '✓ Sin rechazos y con protocolo → al finalizar se crea la tarea de despacho.'}
          </div>}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12, flex: 'none' }}>
          <button className="btn" onClick={onClose} disabled={guardando}>Cerrar</button>
          {finalizada ? (
            <button className="btn" disabled={reabriendo} onClick={() => void reabrir()}
              title="Reabrir el ensayo para corregirlo. Queda auditado y NO genera un despacho nuevo.">
              ↩ Reabrir ensayo
            </button>
          ) : (
            <button className={'btn ' + (retrabajo ? 'btn-rojo' : 'btn-verde')} disabled={noPuedeFinalizar} onClick={() => void finalizarEnsayo()}
              title={faltaProtocolo ? 'Falta adjuntar el protocolo de ensayo (PDF)' : undefined}>
              {retrabajo ? '⚠ Finalizar → Retrabajo' : faltaProtocolo ? '🔒 Falta el protocolo' : '✓ Finalizar → Despacho'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
