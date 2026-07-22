import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import type { TareaLogistica, PrioridadLog } from '../../types'
import { PRIORIDADES_LOG, RESPONSABLES_LOGISTICA, MOTIVOS_BLOQUEO_LOG, responsablesDe } from '../../types'
import { guardarTareaLogistica, eliminarTareaLogistica } from '../../sync/syncEngine'
import { fmtDur, minutosEntre, fechaCorta, hhmm } from '../../lib/time'

const ORDEN_PRIO: Record<PrioridadLog, number> = { alta: 0, media: 1, baja: 2 }
const PRIO_LABEL: Record<PrioridadLog, string> = { alta: 'ALTA', media: 'MEDIA', baja: 'BAJA' }

// Fecha de hoy en formato 'YYYY-MM-DD' (hora local de la tablet).
function hoyLocal(): string { return new Date().toLocaleDateString('en-CA') }
// 'YYYY-MM-DD' -> 'DD/MM/AAAA' para mostrar.
function fmtFechaProg(iso?: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Textarea que crece hacia abajo a medida que se escribe (para ver todo el texto).
function AutoTextarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
  }, [value])
  return (
    <textarea
      ref={ref}
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      style={{ width: '100%', resize: 'none', overflow: 'hidden', minHeight: 46, fontFamily: 'inherit', lineHeight: 1.4 }}
    />
  )
}

// Selector de uno o varios colaboradores (chips que se marcan/desmarcan).
function SelectorResponsables({ seleccion, onChange, roster = RESPONSABLES_LOGISTICA }: { seleccion: string[]; onChange: (v: string[]) => void; roster?: string[] }) {
  const toggle = (r: string) => onChange(seleccion.includes(r) ? seleccion.filter((x) => x !== r) : [...seleccion, r])
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {roster.map((r) => {
        const on = seleccion.includes(r)
        return (
          <button
            type="button" key={r} onClick={() => toggle(r)}
            style={{
              padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: '.85rem',
              border: '1px solid ' + (on ? 'var(--azul-claro)' : 'var(--borde)'),
              background: on ? 'var(--azul-claro)' : 'transparent',
              color: on ? '#fff' : 'var(--texto)', fontWeight: on ? 700 : 500,
            }}
          >{on ? '✓ ' : ''}{r}</button>
        )
      })}
    </div>
  )
}

export default function LogisticaTareas({
  origen = 'logistica',
  roster = RESPONSABLES_LOGISTICA,
  esEncargado,
  tituloAlta = 'Nueva tarea logística',
}: {
  origen?: 'logistica' | 'despacho'
  roster?: string[]
  esEncargado?: boolean            // si se pasa, define quién crea/borra; si no, se infiere Giuliano
  tituloAlta?: string
} = {}) {
  const { usuario } = useAuth()
  // "Encargado" = quien puede crear/editar/borrar (Giuliano en logística, Melany en despacho).
  const esGiuliano = esEncargado ?? (usuario?.usuario === 'giuliano_logistica')
  // Solo las tareas del sector correspondiente (logística vs despacho).
  const todas = useLiveQuery(() => db.tareasLogistica.toArray(), []) ?? []
  const tareas = useMemo(() => todas.filter((t) => (t.origen ?? 'logistica') === origen), [todas, origen])

  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(id) }, [])
  const ahoraISO = new Date(ahora).toISOString()

  // Formulario de alta (solo Giuliano).
  const [titulo, setTitulo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [responsables, setResponsables] = useState<string[]>([])
  const [prioridad, setPrioridad] = useState<PrioridadLog>('media')
  const [fechaProg, setFechaProg] = useState<string>(hoyLocal)
  const [estimado, setEstimado] = useState<string>('')
  const [msg, setMsg] = useState('')

  // Edición de una tarea ya creada (solo Giuliano).
  const [editando, setEditando] = useState<TareaLogistica | null>(null)
  const [eTitulo, setETitulo] = useState('')
  const [eDetalle, setEDetalle] = useState('')
  const [eResponsables, setEResponsables] = useState<string[]>([])
  const [ePrioridad, setEPrioridad] = useState<PrioridadLog>('media')
  const [eFechaProg, setEFechaProg] = useState<string>('')
  const [eEstimado, setEEstimado] = useState<string>('')

  // Fase 2: bloqueo, reasignación rápida y confirmación de cierre.
  const [bloqueando, setBloqueando] = useState<TareaLogistica | null>(null)
  const [motivoBloq, setMotivoBloq] = useState<string>(MOTIVOS_BLOQUEO_LOG[0])
  const [reasignando, setReasignando] = useState<TareaLogistica | null>(null)
  const [reasignaResp, setReasignaResp] = useState<string[]>([])
  const [cerrando, setCerrando] = useState<TareaLogistica | null>(null)
  const [notaCierre, setNotaCierre] = useState<string>('')

  function abrirEdicion(t: TareaLogistica) {
    setEditando(t)
    setETitulo(t.titulo)
    setEDetalle(t.detalle ?? '')
    setEResponsables(responsablesDe(t))
    setEPrioridad(t.prioridad)
    setEFechaProg(t.fechaProgramada ?? hoyLocal())
    setEEstimado(t.estimadoMin ? String(t.estimadoMin) : '')
  }
  async function guardarEdicion() {
    if (!editando) return
    if (!eTitulo.trim()) return
    await guardarTareaLogistica({
      ...editando,
      titulo: eTitulo.trim(),
      detalle: eDetalle.trim() || undefined,
      responsable: eResponsables.join(', '),
      responsables: eResponsables,
      prioridad: ePrioridad,
      fechaProgramada: eFechaProg || hoyLocal(),
      estimadoMin: Number(eEstimado) > 0 ? Number(eEstimado) : undefined,
    })
    setEditando(null)
  }

  async function crear() {
    if (!titulo.trim()) { setMsg('Completá el título de la tarea.'); return }
    const t: TareaLogistica = {
      id: crypto.randomUUID(),
      origen,
      titulo: titulo.trim(),
      detalle: detalle.trim() || undefined,
      responsable: responsables.join(', '),   // '' si queda sin asignar
      responsables,
      prioridad,
      fechaProgramada: fechaProg || hoyLocal(),
      estimadoMin: Number(estimado) > 0 ? Number(estimado) : undefined,
      estado: 'pendiente',
      creada: new Date().toISOString(),
      creadaPor: usuario?.usuario,
    }
    await guardarTareaLogistica(t)
    setTitulo(''); setDetalle(''); setResponsables([]); setPrioridad('media'); setFechaProg(hoyLocal()); setEstimado('')
    setMsg(responsables.length ? `Tarea creada y asignada a ${t.responsable}.` : 'Tarea creada sin asignar — la puede tomar cualquiera.')
  }

  // Tomar una tarea SIN asignar: se pide el nombre de quien la toma.
  const [tomando, setTomando] = useState<TareaLogistica | null>(null)
  const [quienToma, setQuienToma] = useState<string[]>([])

  // ¿La tarea ya se puede empezar hoy? (sin fecha = disponible siempre).
  function disponibleHoy(t: TareaLogistica): boolean {
    return !t.fechaProgramada || t.fechaProgramada <= hoyLocal()
  }

  async function iniciar(t: TareaLogistica) {
    if (!disponibleHoy(t)) return // bloqueo: aún no llegó el día programado
    // Si no tiene responsable, primero pedimos quién la toma.
    if (responsablesDe(t).length === 0) { setTomando(t); setQuienToma([]); return }
    await guardarTareaLogistica({ ...t, estado: 'en_curso', iniciada: new Date().toISOString(), iniciadaPor: usuario?.usuario })
  }
  async function confirmarTomar() {
    if (!tomando || quienToma.length === 0) return
    await guardarTareaLogistica({
      ...tomando,
      responsable: quienToma.join(', '),
      responsables: quienToma,
      estado: 'en_curso',
      iniciada: new Date().toISOString(),
      iniciadaPor: usuario?.usuario,
    })
    setTomando(null); setQuienToma([])
  }
  async function pausar(t: TareaLogistica) {
    await guardarTareaLogistica({ ...t, estado: 'pausada', pausadaEn: new Date().toISOString() })
  }
  // Cierra el último bloqueo abierto del historial (le pone fin = ahora).
  function cerrarBloqueoAbierto(bloqueos: TareaLogistica['bloqueos'], finISO: string): TareaLogistica['bloqueos'] {
    if (!bloqueos?.length) return bloqueos
    return bloqueos.map((b, i) => (i === bloqueos.length - 1 && !b.fin) ? { ...b, fin: finISO } : b)
  }

  async function reanudar(t: TareaLogistica) {
    // Cierra la pausa/bloqueo vigente y lo acumula. Cierra el bloqueo en el historial.
    const ahoraStr = new Date().toISOString()
    const acum = (t.minutosPausada ?? 0) + (t.pausadaEn ? minutosEntre(t.pausadaEn, ahoraStr) : 0)
    await guardarTareaLogistica({ ...t, estado: 'en_curso', pausadaEn: undefined, minutosPausada: acum, bloqueoMotivo: undefined, bloqueos: cerrarBloqueoAbierto(t.bloqueos, ahoraStr) })
  }
  // BLOQUEAR: el operario marca la tarea como trabada por una causa externa.
  function bloquear(t: TareaLogistica) { setBloqueando(t); setMotivoBloq(MOTIVOS_BLOQUEO_LOG[0]) }
  async function confirmarBloqueo() {
    if (!bloqueando) return
    const ahoraStr = new Date().toISOString()
    const bloqueos = [...(bloqueando.bloqueos ?? []), { motivo: motivoBloq, inicio: ahoraStr }]
    await guardarTareaLogistica({ ...bloqueando, estado: 'bloqueada', pausadaEn: ahoraStr, bloqueoMotivo: motivoBloq, bloqueos })
    setBloqueando(null)
  }
  // FINALIZAR: abre el modal de confirmación (real vs estimado).
  function finalizar(t: TareaLogistica) { setCerrando(t); setNotaCierre('') }
  async function ejecutarCierre() {
    if (!cerrando) return
    const ahoraStr = new Date().toISOString()
    const acum = (cerrando.minutosPausada ?? 0) + (cerrando.pausadaEn ? minutosEntre(cerrando.pausadaEn, ahoraStr) : 0)
    await guardarTareaLogistica({
      ...cerrando, estado: 'finalizada', pausadaEn: undefined, minutosPausada: acum, bloqueoMotivo: undefined,
      bloqueos: cerrarBloqueoAbierto(cerrando.bloqueos, ahoraStr),
      finalizada: ahoraStr, finalizadaPor: usuario?.usuario,
      notaCierre: notaCierre.trim() || undefined,
    })
    setCerrando(null); setNotaCierre('')
  }
  // REASIGNAR rápido (Giuliano): cambia el/los responsables sin abrir la edición completa.
  function reasignar(t: TareaLogistica) { setReasignando(t); setReasignaResp(responsablesDe(t)) }
  async function confirmarReasignar() {
    if (!reasignando || reasignaResp.length === 0) return
    await guardarTareaLogistica({ ...reasignando, responsable: reasignaResp.join(', '), responsables: reasignaResp })
    setReasignando(null); setReasignaResp([])
  }
  async function reabrir(t: TareaLogistica) {
    // Reabre a "en curso" si ya se habia iniciado, o a "pendiente" si nunca arranco.
    await guardarTareaLogistica({ ...t, estado: t.iniciada ? 'en_curso' : 'pendiente', pausadaEn: undefined, bloqueoMotivo: undefined, finalizada: undefined, finalizadaPor: undefined })
  }

  // Minutos de pausa acumulados (incluye la pausa vigente si está pausada ahora).
  function minsPausa(t: TareaLogistica): number {
    return (t.minutosPausada ?? 0) + (t.pausadaEn ? minutosEntre(t.pausadaEn, ahoraISO) : 0)
  }
  // Tiempo activo real = transcurrido desde el inicio menos las pausas.
  function minsActivos(t: TareaLogistica): number {
    const fin = t.finalizada ?? ahoraISO
    return Math.max(0, minutosEntre(t.iniciada ?? t.creada, fin) - minsPausa(t))
  }
  // Etiqueta de responsable(s) o "sin asignar".
  function respTxt(t: TareaLogistica) {
    const r = responsablesDe(t)
    if (r.length === 0) return <em style={{ color: 'var(--azul-claro)' }}>Sin asignar · la puede tomar cualquiera</em>
    return <>{r.length > 1 ? 'Responsables' : 'Responsable'} <strong>{r.join(', ')}</strong></>
  }
  async function borrar(t: TareaLogistica) {
    if (!window.confirm(`¿Eliminar la tarea "${t.titulo}"?`)) return
    await eliminarTareaLogistica(t)
  }

  const pendientes = useMemo(() => tareas.filter((t) => t.estado === 'pendiente')
    .sort((a, b) => (ORDEN_PRIO[a.prioridad] - ORDEN_PRIO[b.prioridad]) || (a.creada < b.creada ? -1 : 1)), [tareas])
  // "En curso" incluye pausadas y bloqueadas (siguen abiertas, sólo detenidas).
  const enCurso = useMemo(() => tareas.filter((t) => t.estado === 'en_curso' || t.estado === 'pausada' || t.estado === 'bloqueada')
    .sort((a, b) => (ORDEN_PRIO[a.prioridad] - ORDEN_PRIO[b.prioridad]) || ((a.iniciada ?? '') < (b.iniciada ?? '') ? -1 : 1)), [tareas])
  const finalizadas = useMemo(() => tareas.filter((t) => t.estado === 'finalizada')
    .sort((a, b) => ((b.finalizada ?? '') < (a.finalizada ?? '') ? -1 : 1)), [tareas])

  // Indicadores. Las prioridades cuentan tareas abiertas (pendientes + en curso).
  // El tiempo de resolucion es tiempo ACTIVO (descontando pausas).
  const ind = useMemo(() => {
    const abiertas = [...pendientes, ...enCurso]
    const porPrio = (p: PrioridadLog) => abiertas.filter((t) => t.prioridad === p).length
    const tiempos = finalizadas.map((t) => Math.max(0, minutosEntre(t.iniciada ?? t.creada, t.finalizada) - (t.minutosPausada ?? 0))).filter((m) => m > 0)
    const prom = tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0
    return { pend: pendientes.length, curso: enCurso.length, alta: porPrio('alta'), media: porPrio('media'), baja: porPrio('baja'), fin: finalizadas.length, prom }
  }, [pendientes, enCurso, finalizadas])

  return (
    <>
      {/* Indicadores */}
      <div className="logi-kpis">
        <div className="logi-kpi"><div className="n">{ind.pend}</div><div className="l">Pendientes</div></div>
        <div className="logi-kpi"><div className="n" style={{ color: 'var(--naranja)' }}>{ind.curso}</div><div className="l">En curso</div></div>
        <div className="logi-kpi prio-alta"><div className="n">{ind.alta}</div><div className="l">Alta</div></div>
        <div className="logi-kpi prio-media"><div className="n">{ind.media}</div><div className="l">Media</div></div>
        <div className="logi-kpi prio-baja"><div className="n">{ind.baja}</div><div className="l">Baja</div></div>
        <div className="logi-kpi"><div className="n">{ind.fin}</div><div className="l">Finalizadas</div></div>
        <div className="logi-kpi"><div className="n">{ind.prom ? fmtDur(ind.prom) : '—'}</div><div className="l">Tiempo prom. resolución</div></div>
      </div>

      {/* Alta (solo Giuliano) */}
      {esGiuliano && (
        <div className="card">
          <div className="section-title">{tituloAlta}</div>
          <div className="form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Título / pedido</label>
              <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ej. Llevar chapa 16/13 a Montaje PO Dist" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Detalle (opcional)</label>
              <AutoTextarea value={detalle} onChange={setDetalle} placeholder="cantidad, sector, observaciones…" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Responsable(s) — podés elegir varios</label>
              <SelectorResponsables seleccion={responsables} onChange={setResponsables} roster={roster} />
            </div>
            <div className="field">
              <label>Prioridad</label>
              <select className="input" value={prioridad} onChange={(e) => setPrioridad(e.target.value as PrioridadLog)}>
                {PRIORIDADES_LOG.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Fecha de inicio programada</label>
              <input type="date" className="input" value={fechaProg} min={hoyLocal()} onChange={(e) => setFechaProg(e.target.value)} />
            </div>
            <div className="field">
              <label>Tiempo estimado (min, opcional)</label>
              <input type="number" min={1} className="input" value={estimado} onChange={(e) => setEstimado(e.target.value)} placeholder="ej. 45" />
            </div>
          </div>
          <button className="btn btn-primary btn-bloque" style={{ marginTop: 10 }} onClick={crear}>＋ Crear tarea</button>
          {msg && <div className="meta" style={{ marginTop: 8 }}>{msg}</div>}
        </div>
      )}

      {/* Pendientes — el colaborador todavia no la arranco */}
      <div className="section-title">Pendientes ({pendientes.length})</div>
      {pendientes.length === 0 ? <div className="empty">Sin tareas pendientes.</div> : pendientes.map((t) => {
        const disponible = disponibleHoy(t)
        return (
        <div className={'card logi-tarea ' + ('prio-' + t.prioridad)} key={t.id}>
          <div className="card-header">
            <div>
              <h3><span className={'prio-chip prio-' + t.prioridad}>{PRIO_LABEL[t.prioridad]}</span> {t.titulo}</h3>
              <div className="meta">
                {respTxt(t)} · Pedida {fechaCorta(t.creada)} {hhmm(t.creada)} · <strong style={{ color: 'var(--naranja)' }}>hace {fmtDur(minutosEntre(t.creada, ahoraISO))}</strong>
                {t.detalle ? <> · {t.detalle}</> : null}
              </div>
              {t.fechaProgramada && (
                <div className="meta" style={{ marginTop: 4 }}>
                  🗓 Programada para: <strong style={{ color: disponible ? 'var(--estado-fin)' : 'var(--naranja)' }}>{fmtFechaProg(t.fechaProgramada)}</strong>
                  {!disponible && <> · <em>disponible ese día</em></>}
                </div>
              )}
            </div>
          </div>
          <div className="row-actions">
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!disponible} onClick={() => iniciar(t)}>
              {!disponible ? `🔒 Disponible el ${fmtFechaProg(t.fechaProgramada)}` : (responsablesDe(t).length ? '▶ Iniciar tarea' : '▶ Tomar tarea')}
            </button>
            {esGiuliano && <button className="btn" onClick={() => reasignar(t)}>⇄ Reasignar</button>}
            {esGiuliano && <button className="btn" onClick={() => abrirEdicion(t)}>✎ Editar</button>}
            {esGiuliano && <button className="btn btn-rojo" onClick={() => borrar(t)}>🗑</button>}
          </div>
        </div>
      )})}

      {/* En curso — iniciada, pendiente de finalizar. Pueden convivir varias en simultaneo */}
      <div className="section-title">En curso ({enCurso.length})</div>
      {enCurso.length === 0 ? <div className="empty">Sin tareas en curso.</div> : enCurso.map((t) => {
        const pausada = t.estado === 'pausada'
        const bloqueada = t.estado === 'bloqueada'
        const detenida = pausada || bloqueada
        return (
        <div className={'card logi-tarea ' + ('prio-' + t.prioridad)} key={t.id}>
          <div className="card-header">
            <div>
              <h3><span className={'prio-chip prio-' + t.prioridad}>{PRIO_LABEL[t.prioridad]}</span> {t.titulo}</h3>
              <div className="meta">
                {respTxt(t)} · Iniciada {t.iniciada ? `${fechaCorta(t.iniciada)} ${hhmm(t.iniciada)}` : '—'} · <strong style={{ color: 'var(--naranja)' }}>activa {fmtDur(minsActivos(t))}</strong>
                {detenida ? <> · <strong style={{ color: 'var(--rojo)' }}>{bloqueada ? 'bloqueada' : 'en pausa'} hace {fmtDur(minutosEntre(t.pausadaEn ?? ahoraISO, ahoraISO))}</strong></>
                  : (t.minutosPausada ? <> · pausas: {fmtDur(t.minutosPausada)}</> : null)}
                {t.detalle ? <> · {t.detalle}</> : null}
              </div>
              {bloqueada && t.bloqueoMotivo && (
                <div className="meta" style={{ marginTop: 4, color: 'var(--rojo)' }}>⛔ Bloqueada: <strong>{t.bloqueoMotivo}</strong></div>
              )}
            </div>
            <span className="estado-chip" style={{ background: detenida ? 'var(--rojo)' : 'var(--estado-proceso)' }}>{bloqueada ? 'Bloqueada' : pausada ? 'Pausada' : 'En curso'}</span>
          </div>
          <div className="row-actions">
            <button className="btn btn-verde" style={{ flex: 1 }} onClick={() => finalizar(t)}>✓ Marcar finalizada</button>
            {detenida
              ? <button className="btn btn-primary" onClick={() => reanudar(t)}>▶ Reanudar</button>
              : <>
                  <button className="btn" onClick={() => pausar(t)}>⏸ Pausar</button>
                  <button className="btn btn-rojo" onClick={() => bloquear(t)}>⛔ Bloquear</button>
                </>}
            {esGiuliano && <button className="btn" onClick={() => reasignar(t)}>⇄ Reasignar</button>}
            {esGiuliano && <button className="btn" onClick={() => abrirEdicion(t)}>✎ Editar</button>}
            {esGiuliano && <button className="btn btn-rojo" onClick={() => borrar(t)}>🗑</button>}
          </div>
        </div>
      )})}

      {/* Finalizadas */}
      <div className="section-title">Finalizadas ({finalizadas.length})</div>
      {finalizadas.length === 0 ? <div className="empty">Aún no hay tareas finalizadas.</div> : finalizadas.map((t) => (
        <div className="card" key={t.id}>
          <div className="card-header">
            <div>
              <h3><span className={'prio-chip prio-' + t.prioridad}>{PRIO_LABEL[t.prioridad]}</span> {t.titulo}</h3>
              <div className="meta">
                {respTxt(t)} · Pedida {fechaCorta(t.creada)} {hhmm(t.creada)} · Finalizada {t.finalizada ? `${fechaCorta(t.finalizada)} ${hhmm(t.finalizada)}` : '—'} · <strong style={{ color: 'var(--estado-fin)' }}>resuelta en {fmtDur(minsActivos(t))}</strong>{t.estimadoMin ? <> · estimado {fmtDur(t.estimadoMin)}</> : null}{t.minutosPausada ? <> · pausas: {fmtDur(t.minutosPausada)}</> : null}{t.detalle ? <> · {t.detalle}</> : null}
              </div>
              {t.notaCierre && <div className="meta" style={{ marginTop: 4, fontStyle: 'italic' }}>📝 {t.notaCierre}</div>}
            </div>
            <span className="estado-chip e-finalizado">Finalizada</span>
          </div>
          <div className="row-actions">
            {esGiuliano && <button className="btn" onClick={() => reabrir(t)}>↩ Reabrir</button>}
            {esGiuliano && <button className="btn btn-rojo" onClick={() => borrar(t)}>🗑</button>}
          </div>
        </div>
      ))}

      {/* Modal "¿Quién toma esta tarea?" — al tomar una tarea sin asignar */}
      {tomando && (
        <div className="modal-overlay" onClick={() => setTomando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-title" style={{ marginTop: 0 }}>¿Quién toma esta tarea?</div>
            <div className="meta" style={{ marginBottom: 10 }}>{tomando.titulo}</div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Colaborador(es)</label>
              <SelectorResponsables seleccion={quienToma} onChange={setQuienToma} roster={roster} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setTomando(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={quienToma.length === 0} onClick={() => void confirmarTomar()}>▶ Tomar e iniciar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edición (solo Giuliano) */}
      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-title" style={{ marginTop: 0 }}>Editar tarea logística</div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Título / pedido</label>
              <input className="input" value={eTitulo} onChange={(e) => setETitulo(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Detalle (opcional)</label>
              <AutoTextarea value={eDetalle} onChange={setEDetalle} />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Responsable(s) — podés elegir varios</label>
              <SelectorResponsables seleccion={eResponsables} onChange={setEResponsables} roster={roster} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Prioridad</label>
                <select className="input" value={ePrioridad} onChange={(e) => setEPrioridad(e.target.value as PrioridadLog)} style={{ width: '100%' }}>
                  {PRIORIDADES_LOG.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Fecha de inicio programada</label>
                <input type="date" className="input" value={eFechaProg} onChange={(e) => setEFechaProg(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Tiempo estimado (min)</label>
                <input type="number" min={1} className="input" value={eEstimado} onChange={(e) => setEEstimado(e.target.value)} placeholder="opcional" style={{ width: '100%' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!eTitulo.trim()} onClick={() => void guardarEdicion()}>Guardar cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal BLOQUEAR — el operario marca la causa de la traba */}
      {bloqueando && (
        <div className="modal-overlay" onClick={() => setBloqueando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-title" style={{ marginTop: 0 }}>⛔ Bloquear tarea</div>
            <div className="meta" style={{ marginBottom: 10 }}>{bloqueando.titulo}</div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>¿Por qué se traba? (causa)</label>
              <select className="input" value={motivoBloq} onChange={(e) => setMotivoBloq(e.target.value)} style={{ width: '100%' }}>
                {MOTIVOS_BLOQUEO_LOG.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setBloqueando(null)}>Cancelar</button>
              <button className="btn btn-rojo" onClick={() => void confirmarBloqueo()}>⛔ Marcar bloqueada</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal REASIGNAR rápido (Giuliano) */}
      {reasignando && (
        <div className="modal-overlay" onClick={() => setReasignando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-title" style={{ marginTop: 0 }}>⇄ Reasignar tarea</div>
            <div className="meta" style={{ marginBottom: 10 }}>{reasignando.titulo}</div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Nuevo(s) responsable(s)</label>
              <SelectorResponsables seleccion={reasignaResp} onChange={setReasignaResp} roster={roster} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setReasignando(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={reasignaResp.length === 0} onClick={() => void confirmarReasignar()}>Reasignar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal CIERRE — confirmación de tiempo real vs estimado */}
      {cerrando && (() => {
        const real = minsActivos(cerrando)
        const est = cerrando.estimadoMin ?? 0
        const desvio = est > 0 ? real - est : 0
        return (
          <div className="modal-overlay" onClick={() => setCerrando(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="section-title" style={{ marginTop: 0 }}>✓ Confirmar cierre</div>
              <div className="meta" style={{ marginBottom: 10 }}>{cerrando.titulo}</div>
              <div className="card" style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                <div><div className="meta">Estimado</div><strong>{est > 0 ? fmtDur(est) : '—'}</strong></div>
                <div><div className="meta">Real (activo)</div><strong style={{ color: 'var(--naranja)' }}>{fmtDur(real)}</strong></div>
                {est > 0 && <div><div className="meta">Desvío</div><strong style={{ color: desvio > 0 ? 'var(--rojo)' : 'var(--estado-fin)' }}>{desvio > 0 ? '+' : ''}{fmtDur(Math.abs(desvio))}</strong></div>}
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Nota (opcional) — ¿tomó lo previsto? ¿por qué se desvió?</label>
                <AutoTextarea value={notaCierre} onChange={setNotaCierre} placeholder="ej. tardó más por espera de autoelevador" />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setCerrando(null)}>Cancelar</button>
                <button className="btn btn-verde" onClick={() => void ejecutarCierre()}>✓ Confirmar y finalizar</button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
