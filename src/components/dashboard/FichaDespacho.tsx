import type { DespachoTrafo, ChecklistDespacho } from '../../types'
import {
  estadoDespachoLabel, ESTADOS_DESPACHO, CHECKLIST_DESPACHO_ITEMS, checklistCompleto,
} from '../../types'
import { fmtDur, minutosEntre, fechaCorta, hhmm } from '../../lib/time'
import { guardarDespacho } from '../../sync/syncEngine'

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

  async function toggleCheck(key: keyof ChecklistDespacho) {
    const base: ChecklistDespacho = d.checklist ?? {
      pintura: false, limpieza: false, placa: false, accesorios: false, manual: false, fechas: false, etiquetas: false, fotos: false,
    }
    await guardarDespacho({ ...d, checklist: { ...base, [key]: !base[key] } })
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
            <Dato label="Línea" valor={d.linea === 'rural' ? 'Rural' : 'Distribución'} />
            <Dato label="Ingreso a stock" valor={`${fechaCorta(d.fechaIngreso)} ${hhmm(d.fechaIngreso)}`} />
          </div>

          {seccion('Embalaje')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <Dato label="Operario" valor={d.operario} />
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
              return (
                <button
                  key={it.key} type="button" onClick={() => void toggleCheck(it.key)}
                  style={{
                    padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: '.85rem',
                    border: '1px solid ' + (on ? 'var(--estado-fin)' : 'var(--borde)'),
                    background: on ? 'var(--estado-fin)' : 'transparent',
                    color: on ? '#05230f' : 'var(--texto)', fontWeight: on ? 800 : 500,
                  }}
                >{on ? '✓ ' : '○ '}{it.label}</button>
              )
            })}
          </div>
          <div className="meta" style={{ marginTop: 6, color: checklistCompleto(d.checklist) ? 'var(--estado-fin)' : 'var(--naranja)' }}>
            {checklistCompleto(d.checklist) ? '✓ Checklist completo — habilitado para despachar' : 'Checklist incompleto — no se puede despachar hasta completarlo'}
          </div>

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
