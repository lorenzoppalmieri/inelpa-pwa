import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { PlantillaRecurrente, PrioridadLog } from '../../types'
import { PRIORIDADES_LOG, RESPONSABLES_LOGISTICA, DIAS_SEMANA, diasLabel } from '../../types'
import { guardarPlantilla, eliminarPlantilla } from '../../sync/syncEngine'

// Selector de días L→D (mismo look que las chips de la app).
export function SelectorDias({ seleccion, onChange }: { seleccion: number[]; onChange: (v: number[]) => void }) {
  const toggle = (d: number) => onChange(seleccion.includes(d) ? seleccion.filter((x) => x !== d) : [...seleccion, d])
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {DIAS_SEMANA.map((d) => {
        const on = seleccion.includes(d.dow)
        return (
          <button
            type="button" key={d.dow} title={d.larga} onClick={() => toggle(d.dow)}
            style={{
              width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', fontWeight: 700,
              border: '1px solid ' + (on ? 'var(--azul-claro)' : 'var(--borde)'),
              background: on ? 'var(--azul-claro)' : 'transparent', color: on ? '#fff' : 'var(--texto)',
            }}
          >{d.corta}</button>
        )
      })}
    </div>
  )
}

function SelectorResp({ seleccion, onChange, roster }: { seleccion: string[]; onChange: (v: string[]) => void; roster: string[] }) {
  const toggle = (r: string) => onChange(seleccion.includes(r) ? seleccion.filter((x) => x !== r) : [...seleccion, r])
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {roster.map((r) => {
        const on = seleccion.includes(r)
        return (
          <button type="button" key={r} onClick={() => toggle(r)}
            style={{
              padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: '.85rem',
              border: '1px solid ' + (on ? 'var(--azul-claro)' : 'var(--borde)'),
              background: on ? 'var(--azul-claro)' : 'transparent', color: on ? '#fff' : 'var(--texto)', fontWeight: on ? 700 : 500,
            }}
          >{on ? '✓ ' : ''}{r}</button>
        )
      })}
    </div>
  )
}

// ============================================================
// PANEL "TAREAS REPETITIVAS" (v1.39) — gestión de plantillas de Giuliano/Melany.
// Lista las plantillas activas y pausadas; editar (días/horario/responsables),
// pausar/reactivar, saltear una fecha (feriado) y eliminar.
// ============================================================
export default function PlantillasRecurrentes({
  origen = 'logistica', roster = RESPONSABLES_LOGISTICA,
}: { origen?: 'logistica' | 'despacho'; roster?: string[] } = {}) {
  const todas = useLiveQuery(() => db.plantillasRecurrentes.toArray(), []) ?? []
  const plantillas = useMemo(
    () => todas.filter((p) => (p.origen ?? 'logistica') === origen).sort((a, b) => (a.creada < b.creada ? 1 : -1)),
    [todas, origen],
  )

  const [editando, setEditando] = useState<PlantillaRecurrente | null>(null)
  const [titulo, setTitulo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [responsables, setResponsables] = useState<string[]>([])
  const [prioridad, setPrioridad] = useState<PrioridadLog>('media')
  const [estimado, setEstimado] = useState('')
  const [dias, setDias] = useState<number[]>([])
  const [hora, setHora] = useState('')
  const [salteoFecha, setSalteoFecha] = useState('')

  function abrir(p: PlantillaRecurrente) {
    setEditando(p)
    setTitulo(p.titulo); setDetalle(p.detalle ?? ''); setResponsables(p.responsables ?? [])
    setPrioridad(p.prioridad); setEstimado(p.estimadoMin ? String(p.estimadoMin) : '')
    setDias(p.dias); setHora(p.hora ?? ''); setSalteoFecha('')
  }
  async function guardar() {
    if (!editando || !titulo.trim() || dias.length === 0) return
    await guardarPlantilla({
      ...editando,
      titulo: titulo.trim(), detalle: detalle.trim() || undefined,
      responsables: responsables.length ? responsables : undefined,
      prioridad, estimadoMin: Number(estimado) > 0 ? Number(estimado) : undefined,
      dias, hora: hora || undefined,
    })
    setEditando(null)
  }
  async function togglePausa(p: PlantillaRecurrente) {
    await guardarPlantilla({ ...p, activa: !p.activa })
  }
  async function eliminar(p: PlantillaRecurrente) {
    if (!window.confirm(`¿Eliminar la recurrencia "${p.titulo}"? (no borra las tareas ya generadas)`)) return
    await eliminarPlantilla(p)
  }
  async function agregarSalteo() {
    if (!editando || !salteoFecha) return
    const salteos = [...(editando.salteos ?? [])]
    if (!salteos.includes(salteoFecha)) salteos.push(salteoFecha)
    const upd = { ...editando, salteos }
    await guardarPlantilla(upd)
    setEditando(upd); setSalteoFecha('')
  }
  async function quitarSalteo(f: string) {
    if (!editando) return
    const upd = { ...editando, salteos: (editando.salteos ?? []).filter((x) => x !== f) }
    await guardarPlantilla(upd)
    setEditando(upd)
  }

  return (
    <>
      <div className="section-title">🔁 Tareas repetitivas ({plantillas.length})</div>
      <div className="meta" style={{ marginBottom: 12 }}>
        Cada plantilla genera automáticamente la tarea del día en la tablet, una a la vez (no se acumulan a futuro).
      </div>

      {plantillas.length === 0
        ? <div className="empty">Todavía no hay tareas repetitivas. Creá una con el botón “🔁 Repetir” de cualquier tarea.</div>
        : plantillas.map((p) => (
          <div className={'card logi-tarea prio-' + p.prioridad} key={p.id} style={{ opacity: p.activa ? 1 : 0.6 }}>
            <div className="card-header">
              <div>
                <h3>{p.titulo}</h3>
                <div className="meta">
                  📅 <strong style={{ color: 'var(--azul-claro)' }}>{diasLabel(p.dias) || '—'}</strong>
                  {p.hora ? <> · 🕗 {p.hora}</> : null}
                  {' · '}{(p.responsables && p.responsables.length) ? p.responsables.join(', ') : <em>sin asignar</em>}
                  {p.detalle ? <> · {p.detalle}</> : null}
                </div>
                {p.salteos && p.salteos.length > 0 && (
                  <div className="meta" style={{ marginTop: 4, color: 'var(--naranja)' }}>⛔ Salteos: {p.salteos.join(', ')}</div>
                )}
              </div>
              <span className="estado-chip" style={{ background: p.activa ? 'var(--estado-proceso)' : 'var(--texto-tenue)' }}>
                {p.activa ? 'Activa' : 'Pausada'}
              </span>
            </div>
            <div className="row-actions">
              <button className="btn" onClick={() => void togglePausa(p)}>{p.activa ? '⏸ Pausar' : '▶ Reactivar'}</button>
              <button className="btn" onClick={() => abrir(p)}>✎ Editar</button>
              <button className="btn btn-rojo" onClick={() => void eliminar(p)}>🗑 Eliminar</button>
            </div>
          </div>
        ))}

      {/* Modal edición de plantilla */}
      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-title" style={{ marginTop: 0 }}>Editar tarea repetitiva</div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Título / pedido</label>
              <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Detalle (opcional)</label>
              <input className="input" value={detalle} onChange={(e) => setDetalle(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Días de la semana</label>
              <SelectorDias seleccion={dias} onChange={setDias} />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Responsable(s)</label>
              <SelectorResp seleccion={responsables} onChange={setResponsables} roster={roster} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Prioridad</label>
                <select className="input" value={prioridad} onChange={(e) => setPrioridad(e.target.value as PrioridadLog)} style={{ width: '100%' }}>
                  {PRIORIDADES_LOG.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Hora sugerida</label>
                <input type="time" className="input" value={hora} onChange={(e) => setHora(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Estimado (min)</label>
                <input type="number" min={1} className="input" value={estimado} onChange={(e) => setEstimado(e.target.value)} placeholder="opcional" style={{ width: '100%' }} />
              </div>
            </div>

            {/* Saltear fechas puntuales (feriados) */}
            <div className="card" style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 700 }}>Saltear una fecha (feriado / excepción)</label>
              <div className="meta" style={{ marginBottom: 8 }}>Ese día NO se generará la tarea, sin tocar el resto de la rutina.</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="date" className="input" value={salteoFecha} onChange={(e) => setSalteoFecha(e.target.value)} />
                <button className="btn" disabled={!salteoFecha} onClick={() => void agregarSalteo()}>＋ Saltear</button>
              </div>
              {editando.salteos && editando.salteos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {editando.salteos.map((f) => (
                    <button key={f} className="btn" onClick={() => void quitarSalteo(f)} style={{ fontSize: '.8rem' }}>{f} ✕</button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setEditando(null)}>Cerrar</button>
              <button className="btn btn-primary" disabled={!titulo.trim() || dias.length === 0} onClick={() => void guardar()}>Guardar cambios</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
