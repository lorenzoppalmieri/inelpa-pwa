import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import type { TareaLogistica, PrioridadLog } from '../../types'
import { PRIORIDADES_LOG, RESPONSABLES_LOGISTICA } from '../../types'
import { guardarTareaLogistica, eliminarTareaLogistica } from '../../sync/syncEngine'
import { fmtDur, minutosEntre, fechaCorta, hhmm } from '../../lib/time'

const ORDEN_PRIO: Record<PrioridadLog, number> = { alta: 0, media: 1, baja: 2 }
const PRIO_LABEL: Record<PrioridadLog, string> = { alta: 'ALTA', media: 'MEDIA', baja: 'BAJA' }

export default function LogisticaTareas() {
  const { usuario } = useAuth()
  const esGiuliano = usuario?.usuario === 'giuliano_logistica' // encargado: crea/borra
  const tareas = useLiveQuery(() => db.tareasLogistica.toArray(), []) ?? []

  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(id) }, [])
  const ahoraISO = new Date(ahora).toISOString()

  // Formulario de alta (solo Giuliano).
  const [titulo, setTitulo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [responsable, setResponsable] = useState('')
  const [prioridad, setPrioridad] = useState<PrioridadLog>('media')
  const [msg, setMsg] = useState('')

  async function crear() {
    if (!titulo.trim() || !responsable) { setMsg('Completá el título y el responsable.'); return }
    const t: TareaLogistica = {
      id: crypto.randomUUID(),
      titulo: titulo.trim(),
      detalle: detalle.trim() || undefined,
      responsable,
      prioridad,
      estado: 'pendiente',
      creada: new Date().toISOString(),
      creadaPor: usuario?.usuario,
    }
    await guardarTareaLogistica(t)
    setTitulo(''); setDetalle(''); setResponsable(''); setPrioridad('media')
    setMsg(`Tarea creada y asignada a ${t.responsable}.`)
  }

  async function finalizar(t: TareaLogistica) {
    await guardarTareaLogistica({ ...t, estado: 'finalizada', finalizada: new Date().toISOString(), finalizadaPor: usuario?.usuario })
  }
  async function reabrir(t: TareaLogistica) {
    await guardarTareaLogistica({ ...t, estado: 'pendiente', finalizada: undefined, finalizadaPor: undefined })
  }
  async function borrar(t: TareaLogistica) {
    if (!window.confirm(`¿Eliminar la tarea "${t.titulo}"?`)) return
    await eliminarTareaLogistica(t)
  }

  const pendientes = useMemo(() => tareas.filter((t) => t.estado === 'pendiente')
    .sort((a, b) => (ORDEN_PRIO[a.prioridad] - ORDEN_PRIO[b.prioridad]) || (a.creada < b.creada ? -1 : 1)), [tareas])
  const finalizadas = useMemo(() => tareas.filter((t) => t.estado === 'finalizada')
    .sort((a, b) => ((b.finalizada ?? '') < (a.finalizada ?? '') ? -1 : 1)), [tareas])

  // Indicadores.
  const ind = useMemo(() => {
    const porPrio = (p: PrioridadLog) => pendientes.filter((t) => t.prioridad === p).length
    const tiempos = finalizadas.map((t) => minutosEntre(t.creada, t.finalizada)).filter((m) => m > 0)
    const prom = tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0
    return { pend: pendientes.length, alta: porPrio('alta'), media: porPrio('media'), baja: porPrio('baja'), fin: finalizadas.length, prom }
  }, [pendientes, finalizadas])

  return (
    <>
      {/* Indicadores */}
      <div className="logi-kpis">
        <div className="logi-kpi"><div className="n">{ind.pend}</div><div className="l">Pendientes</div></div>
        <div className="logi-kpi prio-alta"><div className="n">{ind.alta}</div><div className="l">Alta</div></div>
        <div className="logi-kpi prio-media"><div className="n">{ind.media}</div><div className="l">Media</div></div>
        <div className="logi-kpi prio-baja"><div className="n">{ind.baja}</div><div className="l">Baja</div></div>
        <div className="logi-kpi"><div className="n">{ind.fin}</div><div className="l">Finalizadas</div></div>
        <div className="logi-kpi"><div className="n">{ind.prom ? fmtDur(ind.prom) : '—'}</div><div className="l">Tiempo prom. resolución</div></div>
      </div>

      {/* Alta (solo Giuliano) */}
      {esGiuliano && (
        <div className="card">
          <div className="section-title">Nueva tarea logística</div>
          <div className="form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Título / pedido</label>
              <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ej. Llevar chapa 16/13 a Montaje PO Dist" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Detalle (opcional)</label>
              <input className="input" value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="cantidad, sector, observaciones…" />
            </div>
            <div className="field">
              <label>Responsable</label>
              <select className="input" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
                <option value="">— Selecciona —</option>
                {RESPONSABLES_LOGISTICA.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Prioridad</label>
              <select className="input" value={prioridad} onChange={(e) => setPrioridad(e.target.value as PrioridadLog)}>
                {PRIORIDADES_LOG.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-primary btn-bloque" style={{ marginTop: 10 }} onClick={crear}>＋ Crear tarea</button>
          {msg && <div className="meta" style={{ marginTop: 8 }}>{msg}</div>}
        </div>
      )}

      {/* Pendientes */}
      <div className="section-title">Pendientes ({pendientes.length})</div>
      {pendientes.length === 0 ? <div className="empty">Sin tareas pendientes.</div> : pendientes.map((t) => (
        <div className={'card logi-tarea ' + ('prio-' + t.prioridad)} key={t.id}>
          <div className="card-header">
            <div>
              <h3><span className={'prio-chip prio-' + t.prioridad}>{PRIO_LABEL[t.prioridad]}</span> {t.titulo}</h3>
              <div className="meta">
                Responsable <strong>{t.responsable}</strong> · Pedida {fechaCorta(t.creada)} {hhmm(t.creada)} · <strong style={{ color: 'var(--naranja)' }}>hace {fmtDur(minutosEntre(t.creada, ahoraISO))}</strong>
                {t.detalle ? <> · {t.detalle}</> : null}
              </div>
            </div>
          </div>
          <div className="row-actions">
            <button className="btn btn-verde" style={{ flex: 1 }} onClick={() => finalizar(t)}>✓ Marcar finalizada</button>
            {esGiuliano && <button className="btn btn-rojo" onClick={() => borrar(t)}>🗑</button>}
          </div>
        </div>
      ))}

      {/* Finalizadas */}
      <div className="section-title">Finalizadas ({finalizadas.length})</div>
      {finalizadas.length === 0 ? <div className="empty">Aún no hay tareas finalizadas.</div> : finalizadas.map((t) => (
        <div className="card" key={t.id}>
          <div className="card-header">
            <div>
              <h3><span className={'prio-chip prio-' + t.prioridad}>{PRIO_LABEL[t.prioridad]}</span> {t.titulo}</h3>
              <div className="meta">
                Responsable <strong>{t.responsable}</strong> · Pedida {fechaCorta(t.creada)} {hhmm(t.creada)} · Finalizada {t.finalizada ? `${fechaCorta(t.finalizada)} ${hhmm(t.finalizada)}` : '—'} · <strong style={{ color: 'var(--estado-fin)' }}>resuelta en {fmtDur(minutosEntre(t.creada, t.finalizada))}</strong>
              </div>
            </div>
            <span className="estado-chip e-finalizado">Finalizada</span>
          </div>
          <div className="row-actions">
            <button className="btn" onClick={() => reabrir(t)}>↩ Reabrir</button>
            {esGiuliano && <button className="btn btn-rojo" onClick={() => borrar(t)}>🗑</button>}
          </div>
        </div>
      ))}
    </>
  )
}
