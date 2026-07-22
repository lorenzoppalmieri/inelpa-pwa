import { useState } from 'react'
import type { DespachoTrafo, ChecklistDespacho } from '../../types'
import {
  estadoDespachoLabel, ESTADOS_DESPACHO, CHECKLIST_DESPACHO_ITEMS, checklistCompleto,
} from '../../types'
import { fmtDur, minutosEntre, fechaCorta, hhmm } from '../../lib/time'
import { guardarDespacho } from '../../sync/syncEngine'
import { supabase } from '../../lib/supabaseClient'

// Bucket de Supabase Storage donde viven las fotos de los transformadores.
export const BUCKET_FOTOS = 'despacho-fotos'

// ============================================================
// PANTALLA ÚNICA POR TRANSFORMADOR (v1.27) — ficha con TODO lo del trafo:
// datos generales, estado, tiempos de embalaje, checklist (editable), demoras y
// datos de despacho. Es la "pantalla única" que pidió Melany (prioridad 4).
// ============================================================

// Tiempo de demora acumulado (incluye la demora vigente si está demorado).
function minsDemora(d: DespachoTrafo, ahoraISO: string): number {
  return (d.minutosDemora ?? 0) + (d.demoraEnCurso ? minutosEntre(d.demoraEnCurso, ahoraISO) : 0)
}
// Tiempo activo de embalaje = transcurrido desde el inicio menos las demoras.
function minsEmbalaje(d: DespachoTrafo, ahoraISO: string): number {
  if (!d.embalajeInicio) return 0
  const fin = d.embalajeFin ?? ahoraISO
  return Math.max(0, minutosEntre(d.embalajeInicio, fin) - minsDemora(d, ahoraISO))
}

function Dato({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div className="meta">{label}</div>
      <div><strong>{valor && valor.trim() ? valor : '—'}</strong></div>
    </div>
  )
}

export default function FichaDespacho({ despacho: d, onClose }: { despacho: DespachoTrafo; onClose: () => void }) {
  const ahoraISO = new Date().toISOString()
  const color = ESTADOS_DESPACHO.find((e) => e.id === d.estado)?.color ?? 'var(--texto-tenue)'
  const [subiendo, setSubiendo] = useState(false)
  const [errFoto, setErrFoto] = useState('')

  const baseChecklist: ChecklistDespacho = d.checklist ?? {
    pintura: false, limpieza: false, placa: false, accesorios: false, manual: false, etiquetas: false, fotos: false, numeroSerie: false, cutColocado: false, rotulo: false,
  }
  async function toggleCheck(key: keyof ChecklistDespacho) {
    await guardarDespacho({ ...d, checklist: { ...baseChecklist, [key]: !baseChecklist[key] } })
  }

  // Sube una o varias fotos a Supabase Storage y guarda sus URLs en el trafo.
  // Marca automáticamente el ítem "fotos" del checklist. Requiere conexión.
  async function subirFotos(files: FileList | null) {
    if (!files || files.length === 0) return
    if (!supabase) { setErrFoto('Storage no disponible.'); return }
    setSubiendo(true); setErrFoto('')
    try {
      const nuevas: string[] = []
      for (const file of Array.from(files)) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${d.id}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from(BUCKET_FOTOS).upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })
        if (up.error) throw up.error
        nuevas.push(supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path).data.publicUrl)
      }
      await guardarDespacho({ ...d, fotos: [...(d.fotos ?? []), ...nuevas], checklist: { ...baseChecklist, fotos: true } })
    } catch {
      setErrFoto('No se pudieron subir las fotos (revisá la conexión o que exista el bucket "despacho-fotos").')
    } finally {
      setSubiendo(false)
    }
  }
  async function quitarFoto(url: string) {
    await guardarDespacho({ ...d, fotos: (d.fotos ?? []).filter((u) => u !== url) })
  }

  const seccion = (t: string) => <div className="section-title" style={{ margin: '14px 0 8px' }}>{t}</div>

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, width: '96%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <div className="section-title" style={{ margin: 0, flex: 1 }}>Ficha · {d.nroSerie || d.ot}</div>
          <span className="estado-chip" style={{ background: color }}>{estadoDespachoLabel(d.estado)}</span>
        </div>

        <div style={{ overflow: 'auto', flex: 1, minHeight: 0, paddingRight: 4 }}>
          {seccion('Datos generales')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <Dato label="OT" valor={d.ot} />
            <Dato label="Cliente" valor={d.cliente} />
            <Dato label="N° serie" valor={d.nroSerie} />
            <Dato label="Potencia" valor={d.potencia} />
            <Dato label="Tipo" valor={d.tipo} />
            <Dato label="CUT (EPE)" valor={d.cut} />
            <Dato label="Línea" valor={d.linea === 'rural' ? 'Rural' : 'Distribución'} />
            <Dato label="Ingreso a stock" valor={`${fechaCorta(d.fechaIngreso)} ${hhmm(d.fechaIngreso)}`} />
          </div>

          {seccion('Embalaje')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <Dato label="Operario" valor={d.operario} />
            <Dato label="Ubicación" valor={d.ubicacionDeposito} />
            <Dato label="Inicio" valor={d.embalajeInicio ? `${fechaCorta(d.embalajeInicio)} ${hhmm(d.embalajeInicio)}` : undefined} />
            <Dato label="Fin" valor={d.embalajeFin ? `${fechaCorta(d.embalajeFin)} ${hhmm(d.embalajeFin)}` : undefined} />
            <Dato label="Tiempo activo" valor={d.embalajeInicio ? fmtDur(minsEmbalaje(d, ahoraISO)) : undefined} />
            <Dato label="Demoras" valor={d.minutosDemora || d.demoraEnCurso ? fmtDur(minsDemora(d, ahoraISO)) : undefined} />
            <Dato label="Tipo de embalaje" valor={d.tipoEmbalaje} />
          </div>
          {d.observaciones && <div className="meta" style={{ marginTop: 6, fontStyle: 'italic' }}>📝 {d.observaciones}</div>}

          {seccion('Checklist de liberación')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CHECKLIST_DESPACHO_ITEMS.map((it) => {
              const on = !!d.checklist?.[it.key]
              // Verde si está marcado. Si NO está: opcional -> ROJO "✗ Sin X" (alerta
              // visual para Melany); obligatorio -> neutro (○), es lo que falta cargar.
              const rojo = !on && it.opcional
              const fondo = on ? 'var(--estado-fin)' : rojo ? 'var(--rojo)' : 'transparent'
              const borde = on ? 'var(--estado-fin)' : rojo ? 'var(--rojo)' : 'var(--borde)'
              const texto = (on || rojo) ? '#fff' : 'var(--texto)'
              return (
                <button
                  key={it.key} type="button" onClick={() => void toggleCheck(it.key)}
                  style={{
                    padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: '.85rem',
                    border: '1px solid ' + borde, background: fondo,
                    color: on ? '#05230f' : texto, fontWeight: on || rojo ? 800 : 500,
                  }}
                >{on ? `✓ ${it.label}` : rojo ? `✗ Sin ${it.label}` : `○ ${it.label}`}</button>
              )
            })}
          </div>
          <div className="meta" style={{ marginTop: 6, color: checklistCompleto(d.checklist) ? 'var(--estado-fin)' : 'var(--naranja)' }}>
            {checklistCompleto(d.checklist) ? '✓ Checklist completo — habilitado para despachar' : 'Checklist incompleto — no se puede despachar hasta completarlo'}
          </div>

          {seccion(`Fotos${d.fotos?.length ? ` (${d.fotos.length})` : ''}`)}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {(d.fotos ?? []).map((url) => (
              <div key={url} style={{ position: 'relative' }}>
                <a href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt="foto trafo" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--borde)' }} />
                </a>
                <button title="Quitar" onClick={() => void quitarFoto(url)}
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--rojo)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '20px', padding: 0 }}>✕</button>
              </div>
            ))}
            {(d.fotos ?? []).length === 0 && <div className="meta">Sin fotos todavía.</div>}
          </div>
          <label className="btn btn-primary" style={{ display: 'inline-block', cursor: subiendo ? 'default' : 'pointer', opacity: subiendo ? 0.6 : 1 }}>
            {subiendo ? 'Subiendo…' : '📷 Agregar fotos'}
            <input type="file" accept="image/*" multiple disabled={subiendo} style={{ display: 'none' }} onChange={(e) => void subirFotos(e.target.files)} />
          </label>
          {errFoto && <div className="meta" style={{ color: 'var(--rojo)', marginTop: 6 }}>{errFoto}</div>}

          {d.demoras && d.demoras.length > 0 && <>
            {seccion('Demoras registradas')}
            {d.demoras.map((dm, i) => (
              <div key={i} className="meta" style={{ marginBottom: 3 }}>
                • <strong>{dm.causa}</strong>: {hhmm(dm.inicio)}{dm.fin ? `–${hhmm(dm.fin)} (${fmtDur(minutosEntre(dm.inicio, dm.fin))})` : ' · en curso'}
              </div>
            ))}
          </>}

          {(d.estado === 'despachado' || d.estado === 'entregado') && <>
            {seccion('Despacho')}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              <Dato label="Fecha despacho" valor={d.fechaDespacho ? `${fechaCorta(d.fechaDespacho)} ${hhmm(d.fechaDespacho)}` : undefined} />
              <Dato label="Transportista" valor={d.transportista} />
              <Dato label="Patente" valor={d.patente} />
              <Dato label="Remito" valor={d.remito} />
              <Dato label="Destino" valor={d.destino} />
              {d.redespacho && <Dato label="2° transporte" valor={`${d.transportista2 ?? '—'} · ${d.patente2 ?? '—'}`} />}
              {d.entregadaEn && <Dato label="Entregado" valor={`${fechaCorta(d.entregadaEn)} ${hhmm(d.entregadaEn)}`} />}
            </div>
          </>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, flex: 'none' }}>
          <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
