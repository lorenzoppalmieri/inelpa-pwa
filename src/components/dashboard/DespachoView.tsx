import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import type { DespachoTrafo, EstadoDespacho, LineaProduccion } from '../../types'
import {
  ESTADOS_DESPACHO, estadoDespachoLabel, RESPONSABLES_DESPACHO, MOTIVOS_DEMORA_DESPACHO,
  checklistCompleto, checklistFaltantes,
} from '../../types'
import { guardarDespacho, eliminarDespacho } from '../../sync/syncEngine'
import { fmtDur, minutosEntre, fechaCorta, hhmm } from '../../lib/time'
import FichaDespacho from './FichaDespacho'
import DespachoReportes from './DespachoReportes'
import AlertasDespacho from './AlertasDespacho'
import FletesInternos from './FletesInternos'

// ============================================================
// TABLERO DE DESPACHO Y EMBALAJE (v1.27) — sector Melany. Fase 1: seguimiento de
// cada transformador por estado, tiempos de embalaje, checklist que bloquea el
// despacho, demoras con causa, y la ficha (pantalla única).
// ============================================================

function color(e: EstadoDespacho): string { return ESTADOS_DESPACHO.find((x) => x.id === e)?.color ?? 'var(--texto-tenue)' }

export default function DespachoView() {
  const { usuario } = useAuth()
  // Melany = supervisora del sector: solo ella puede eliminar despachos. El equipo
  // (cuenta 'despacho') opera normalmente (crear, embalar, despachar) pero no borra.
  const esSupervisora = usuario?.usuario === 'melany'
  const [vista, setVista] = useState<'operativo' | 'reportes'>('operativo')
  const [busqueda, setBusqueda] = useState('')
  const despachos = useLiveQuery(() => db.despachos.toArray(), []) ?? []

  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(id) }, [])
  const ahoraISO = new Date(ahora).toISOString()

  // Alta.
  const [ot, setOt] = useState('')
  const [cliente, setCliente] = useState('')
  const [nroSerie, setNroSerie] = useState('')
  const [potencia, setPotencia] = useState('')
  const [tipo, setTipo] = useState('')
  const [linea, setLinea] = useState<LineaProduccion>('distribucion')
  const [msg, setMsg] = useState('')

  // Modales.
  const [ficha, setFicha] = useState<DespachoTrafo | null>(null)
  const [iniciando, setIniciando] = useState<DespachoTrafo | null>(null)
  const [operarioSel, setOperarioSel] = useState('')
  const [demorando, setDemorando] = useState<DespachoTrafo | null>(null)
  const [causaSel, setCausaSel] = useState(MOTIVOS_DEMORA_DESPACHO[0])
  const [despachando, setDespachando] = useState<DespachoTrafo | null>(null)

  // --- tiempos ---
  function minsDemora(d: DespachoTrafo): number {
    return (d.minutosDemora ?? 0) + (d.demoraEnCurso ? minutosEntre(d.demoraEnCurso, ahoraISO) : 0)
  }
  function minsEmbalaje(d: DespachoTrafo): number {
    if (!d.embalajeInicio) return 0
    const fin = d.embalajeFin ?? ahoraISO
    return Math.max(0, minutosEntre(d.embalajeInicio, fin) - minsDemora(d))
  }

  async function crear() {
    if (!ot.trim() || !cliente.trim() || !nroSerie.trim()) { setMsg('Completá OT, cliente y N° de serie.'); return }
    const d: DespachoTrafo = {
      id: crypto.randomUUID(),
      ot: ot.trim(), cliente: cliente.trim(), nroSerie: nroSerie.trim(),
      potencia: potencia.trim() || undefined, tipo: tipo.trim() || undefined,
      linea, fechaIngreso: new Date().toISOString(),
      estado: 'esperando_embalaje',
      creada: new Date().toISOString(), creadaPor: usuario?.usuario,
    }
    await guardarDespacho(d)
    setOt(''); setCliente(''); setNroSerie(''); setPotencia(''); setTipo(''); setLinea('distribucion')
    setMsg(`Trafo ${d.nroSerie} ingresado a despacho.`)
  }

  // Iniciar embalaje: se pide la operaria.
  function abrirIniciar(d: DespachoTrafo) { setIniciando(d); setOperarioSel(d.operario ?? RESPONSABLES_DESPACHO[0]) }
  async function confirmarIniciar() {
    if (!iniciando || !operarioSel) return
    await guardarDespacho({ ...iniciando, estado: 'embalando', operario: operarioSel, embalajeInicio: new Date().toISOString() })
    setIniciando(null)
  }
  // Demora.
  function abrirDemora(d: DespachoTrafo) { setDemorando(d); setCausaSel(MOTIVOS_DEMORA_DESPACHO[0]) }
  async function confirmarDemora() {
    if (!demorando) return
    const now = new Date().toISOString()
    const demoras = [...(demorando.demoras ?? []), { causa: causaSel, inicio: now }]
    await guardarDespacho({ ...demorando, estado: 'demorado', demoraEnCurso: now, demoras })
    setDemorando(null)
  }
  function cerrarDemoraAbierta(dm: DespachoTrafo['demoras'], finISO: string): DespachoTrafo['demoras'] {
    if (!dm?.length) return dm
    return dm.map((x, i) => (i === dm.length - 1 && !x.fin) ? { ...x, fin: finISO } : x)
  }
  async function reanudar(d: DespachoTrafo) {
    const now = new Date().toISOString()
    const acum = (d.minutosDemora ?? 0) + (d.demoraEnCurso ? minutosEntre(d.demoraEnCurso, now) : 0)
    await guardarDespacho({ ...d, estado: 'embalando', demoraEnCurso: undefined, minutosDemora: acum, demoras: cerrarDemoraAbierta(d.demoras, now) })
  }
  async function marcarEmbalado(d: DespachoTrafo) {
    const now = new Date().toISOString()
    const acum = (d.minutosDemora ?? 0) + (d.demoraEnCurso ? minutosEntre(d.demoraEnCurso, now) : 0)
    await guardarDespacho({ ...d, estado: 'embalado', demoraEnCurso: undefined, minutosDemora: acum, demoras: cerrarDemoraAbierta(d.demoras, now), embalajeFin: now })
  }
  async function marcarEntregado(d: DespachoTrafo) {
    await guardarDespacho({ ...d, estado: 'entregado', entregadaEn: new Date().toISOString() })
  }
  async function borrar(d: DespachoTrafo) {
    if (!window.confirm(`¿Eliminar el despacho del trafo ${d.nroSerie}?`)) return
    await eliminarDespacho(d)
  }

  // --- agrupamiento por estado (las secciones se filtran por la búsqueda) ---
  const g = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const match = (d: DespachoTrafo) => !q || `${d.nroSerie} ${d.ot} ${d.cliente}`.toLowerCase().includes(q)
    const by = (e: EstadoDespacho | EstadoDespacho[]) => {
      const arr = Array.isArray(e) ? e : [e]
      return despachos.filter((d) => arr.includes(d.estado) && match(d)).sort((a, b) => (a.fechaIngreso < b.fechaIngreso ? -1 : 1))
    }
    const finalizados = despachos.filter((d) => d.embalajeFin)
    const tiempos = finalizados.map((d) => Math.max(0, minutosEntre(d.embalajeInicio, d.embalajeFin) - (d.minutosDemora ?? 0))).filter((m) => m > 0)
    const prom = tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0
    const hoy = new Date().toLocaleDateString('en-CA')
    const despHoy = despachos.filter((d) => d.fechaDespacho && d.fechaDespacho.slice(0, 10) === hoy).length
    return {
      esperando: by('esperando_embalaje'), proceso: by(['embalando', 'demorado']),
      embalado: by('embalado'), despachado: by('despachado'), entregado: by('entregado'),
      prom, despHoy,
    }
  }, [despachos, ahora, busqueda])

  const chip = (e: EstadoDespacho) => <span className="estado-chip" style={{ background: color(e) }}>{estadoDespachoLabel(e)}</span>
  const cab = (d: DespachoTrafo) => (
    <div className="meta">
      {d.linea === 'rural' ? '🚜 Rural' : '🏭 Distribución'} · OT <strong>{d.ot}</strong> · {d.cliente}
      {d.potencia ? <> · {d.potencia}</> : null}{d.tipo ? <> · {d.tipo}</> : null}
    </div>
  )

  function Tarjeta({ d, children }: { d: DespachoTrafo; children: ReactNode }) {
    return (
      <div className="card logi-tarea" key={d.id} style={{ borderLeft: `5px solid ${color(d.estado)}` }}>
        <div className="card-header">
          <div>
            <h3>Serie {d.nroSerie || '—'}</h3>
            {cab(d)}
          </div>
          {chip(d.estado)}
        </div>
        <div className="row-actions">
          {children}
          <button className="btn" onClick={() => setFicha(d)}>👁 Ficha</button>
          {esSupervisora && <button className="btn btn-rojo" onClick={() => void borrar(d)}>🗑</button>}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Sub-pestañas: el tablero operativo lo ve todo el equipo; los Reportes, solo Melany */}
      {esSupervisora && (
        <div className="tabs no-print" style={{ marginBottom: 10 }}>
          <button className={'tab' + (vista === 'operativo' ? ' active' : '')} onClick={() => setVista('operativo')}>🚚 Operativo</button>
          <button className={'tab' + (vista === 'reportes' ? ' active' : '')} onClick={() => setVista('reportes')}>📊 Reportes</button>
        </div>
      )}

      {esSupervisora && vista === 'reportes' ? <DespachoReportes despachos={despachos} /> : (
      <>
      {/* Búsqueda rápida por N° de serie / OT / cliente */}
      <input
        className="input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
        placeholder="🔍 Buscar por N° de serie, OT o cliente…" style={{ marginBottom: 12 }}
      />

      {/* Alertas automáticas (arriba de todo, visibles para el equipo) */}
      <AlertasDespacho despachos={despachos} />

      {/* Indicadores */}
      <div className="logi-kpis">
        <div className="logi-kpi"><div className="n">{g.esperando.length}</div><div className="l">Esperando embalaje</div></div>
        <div className="logi-kpi"><div className="n" style={{ color: 'var(--estado-proceso)' }}>{g.proceso.length}</div><div className="l">En proceso</div></div>
        <div className="logi-kpi"><div className="n" style={{ color: 'var(--azul-claro)' }}>{g.embalado.length}</div><div className="l">Embalados (listos)</div></div>
        <div className="logi-kpi"><div className="n" style={{ color: 'var(--naranja)' }}>{g.despHoy}</div><div className="l">Despachados hoy</div></div>
        <div className="logi-kpi"><div className="n">{g.prom ? fmtDur(g.prom) : '—'}</div><div className="l">Tiempo prom. embalaje</div></div>
      </div>

      {/* Alta — solo Melany crea/envía tareas de embalaje; el equipo las ejecuta */}
      {esSupervisora && (
      <div className="card">
        <div className="section-title">Ingresar transformador a despacho (tarea de embalaje)</div>
        <div className="form-grid">
          <div className="field"><label>OT</label><input className="input" value={ot} onChange={(e) => setOt(e.target.value)} placeholder="OT-1234" /></div>
          <div className="field"><label>Cliente</label><input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} /></div>
          <div className="field"><label>N° de serie</label><input className="input" value={nroSerie} onChange={(e) => setNroSerie(e.target.value)} placeholder="M10-0581" /></div>
          <div className="field"><label>Potencia</label><input className="input" value={potencia} onChange={(e) => setPotencia(e.target.value)} placeholder="315 kVA" /></div>
          <div className="field"><label>Tipo</label><input className="input" value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Trifásico / Monoposte…" /></div>
          <div className="field"><label>Línea</label>
            <select className="input" value={linea} onChange={(e) => setLinea(e.target.value as LineaProduccion)}>
              <option value="distribucion">Distribución</option>
              <option value="rural">Rural</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary btn-bloque" style={{ marginTop: 10 }} onClick={crear}>＋ Ingresar a despacho</button>
        {msg && <div className="meta" style={{ marginTop: 8 }}>{msg}</div>}
      </div>
      )}

      {/* Fletes internos del día — solo Melany los organiza */}
      {esSupervisora && <FletesInternos esSupervisora={esSupervisora} />}

      {/* Esperando embalaje */}
      <div className="section-title">Esperando embalaje ({g.esperando.length})</div>
      {g.esperando.length === 0 ? <div className="empty">Nada esperando embalaje.</div> : g.esperando.map((d) => (
        <Tarjeta d={d} key={d.id}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => abrirIniciar(d)}>▶ Iniciar embalaje</button>
        </Tarjeta>
      ))}

      {/* En proceso (embalando + demorado) */}
      <div className="section-title">En proceso ({g.proceso.length})</div>
      {g.proceso.length === 0 ? <div className="empty">Nada en proceso.</div> : g.proceso.map((d) => {
        const demorado = d.estado === 'demorado'
        const ultimaDemora = d.demoras && d.demoras.length ? d.demoras[d.demoras.length - 1] : undefined
        return (
          <div className="card logi-tarea" key={d.id} style={{ borderLeft: `5px solid ${color(d.estado)}` }}>
            <div className="card-header">
              <div>
                <h3>Serie {d.nroSerie || '—'}</h3>
                {cab(d)}
                <div className="meta" style={{ marginTop: 3 }}>
                  Operaria <strong>{d.operario ?? '—'}</strong> · <strong style={{ color: 'var(--naranja)' }}>embalando {fmtDur(minsEmbalaje(d))}</strong>
                  {demorado ? <> · <strong style={{ color: 'var(--rojo)' }}>demorado hace {fmtDur(minutosEntre(d.demoraEnCurso ?? ahoraISO, ahoraISO))}</strong></> : (d.minutosDemora ? <> · demoras: {fmtDur(d.minutosDemora)}</> : null)}
                </div>
                {demorado && ultimaDemora ? <div className="meta" style={{ color: 'var(--rojo)' }}>⛔ {ultimaDemora.causa}</div> : null}
              </div>
              {chip(d.estado)}
            </div>
            <div className="row-actions">
              <button className="btn btn-verde" style={{ flex: 1 }} onClick={() => void marcarEmbalado(d)}>✓ Marcar embalado</button>
              {demorado
                ? <button className="btn btn-primary" onClick={() => void reanudar(d)}>▶ Reanudar</button>
                : <button className="btn btn-rojo" onClick={() => abrirDemora(d)}>⛔ Demora</button>}
              <button className="btn" onClick={() => setFicha(d)}>👁 Ficha</button>
              {esSupervisora && <button className="btn btn-rojo" onClick={() => void borrar(d)}>🗑</button>}
            </div>
          </div>
        )
      })}

      {/* Embalado (listo para despachar) */}
      <div className="section-title">Embalado · listo para despachar ({g.embalado.length})</div>
      {g.embalado.length === 0 ? <div className="empty">Nada embalado esperando despacho.</div> : g.embalado.map((d) => {
        const listo = checklistCompleto(d.checklist)
        const faltan = checklistFaltantes(d.checklist)
        return (
          <div className="card logi-tarea" key={d.id} style={{ borderLeft: `5px solid ${color(d.estado)}` }}>
            <div className="card-header">
              <div>
                <h3>Serie {d.nroSerie || '—'}</h3>
                {cab(d)}
                <div className="meta" style={{ marginTop: 3, color: listo ? 'var(--estado-fin)' : 'var(--naranja)' }}>
                  {listo ? '✓ Checklist completo' : `Checklist incompleto — faltan: ${faltan.join(', ')}`}
                </div>
              </div>
              {chip(d.estado)}
            </div>
            <div className="row-actions">
              {esSupervisora
                ? <button className="btn btn-verde" style={{ flex: 1 }} disabled={!listo} onClick={() => setDespachando(d)}>
                    {listo ? '🚚 Despachar' : '🔒 Completá el checklist'}
                  </button>
                : <div className="meta" style={{ flex: 1, alignSelf: 'center', color: listo ? 'var(--estado-fin)' : 'var(--naranja)' }}>
                    {listo ? '✓ Listo — Melany organiza el despacho' : `🔒 Completá el checklist (faltan: ${faltan.join(', ')})`}
                  </div>}
              <button className="btn" onClick={() => setFicha(d)}>👁 Ficha / Checklist</button>
              {esSupervisora && <button className="btn btn-rojo" onClick={() => void borrar(d)}>🗑</button>}
            </div>
          </div>
        )
      })}

      {/* Despachado */}
      <div className="section-title">Despachado ({g.despachado.length})</div>
      {g.despachado.length === 0 ? <div className="empty">Nada despachado pendiente de entrega.</div> : g.despachado.map((d) => (
        <Tarjeta d={d} key={d.id}>
          {esSupervisora
            ? <button className="btn btn-verde" style={{ flex: 1 }} onClick={() => void marcarEntregado(d)}>✓ Marcar entregado</button>
            : <div className="meta" style={{ flex: 1, alignSelf: 'center' }}>Despachado — a la espera de entrega (Melany)</div>}
        </Tarjeta>
      ))}

      {/* Entregado */}
      <div className="section-title">Entregado ({g.entregado.length})</div>
      {g.entregado.length === 0 ? <div className="empty">Aún no hay entregas.</div> : g.entregado.slice(0, 20).map((d) => (
        <div className="card" key={d.id} style={{ borderLeft: `5px solid ${color(d.estado)}` }}>
          <div className="card-header">
            <div>
              <h3>Serie {d.nroSerie || '—'}</h3>
              {cab(d)}
              <div className="meta" style={{ marginTop: 3 }}>{d.transportista ? <>Transporte {d.transportista} · {d.patente} · Remito {d.remito}</> : null}{d.entregadaEn ? <> · Entregado {fechaCorta(d.entregadaEn)}</> : null}</div>
            </div>
            {chip(d.estado)}
          </div>
          <div className="row-actions">
            <button className="btn" onClick={() => setFicha(d)}>👁 Ficha</button>
            {esSupervisora && <button className="btn btn-rojo" onClick={() => void borrar(d)}>🗑</button>}
          </div>
        </div>
      ))}
      </>
      )}

      {/* --- Modales --- */}
      {ficha && <FichaDespacho despacho={despachos.find((x) => x.id === ficha.id) ?? ficha} onClose={() => setFicha(null)} />}

      {iniciando && (
        <div className="modal-overlay" onClick={() => setIniciando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-title" style={{ marginTop: 0 }}>▶ Iniciar embalaje</div>
            <div className="meta" style={{ marginBottom: 10 }}>Serie {iniciando.nroSerie}</div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>¿Quién embala?</label>
              <select className="input" value={operarioSel} onChange={(e) => setOperarioSel(e.target.value)} style={{ width: '100%' }}>
                {RESPONSABLES_DESPACHO.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setIniciando(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => void confirmarIniciar()}>▶ Iniciar</button>
            </div>
          </div>
        </div>
      )}

      {demorando && (
        <div className="modal-overlay" onClick={() => setDemorando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-title" style={{ marginTop: 0 }}>⛔ Registrar demora</div>
            <div className="meta" style={{ marginBottom: 10 }}>Serie {demorando.nroSerie}</div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Causa</label>
              <select className="input" value={causaSel} onChange={(e) => setCausaSel(e.target.value)} style={{ width: '100%' }}>
                {MOTIVOS_DEMORA_DESPACHO.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDemorando(null)}>Cancelar</button>
              <button className="btn btn-rojo" onClick={() => void confirmarDemora()}>⛔ Marcar demorado</button>
            </div>
          </div>
        </div>
      )}

      {despachando && (
        <ModalDespachar despacho={despachando} onClose={() => setDespachando(null)} />
      )}
    </>
  )
}

// ---------- Modal de despacho (datos de transporte) ----------
function ModalDespachar({ despacho: d, onClose }: { despacho: DespachoTrafo; onClose: () => void }) {
  const [transportista, setTransportista] = useState(d.transportista ?? '')
  const [patente, setPatente] = useState(d.patente ?? '')
  const [remito, setRemito] = useState(d.remito ?? '')
  const [destino, setDestino] = useState(d.destino ?? '')
  const [redespacho, setRedespacho] = useState(!!d.redespacho)
  const [transportista2, setTransportista2] = useState(d.transportista2 ?? '')
  const [patente2, setPatente2] = useState(d.patente2 ?? '')

  async function confirmar() {
    if (!transportista.trim() || !remito.trim()) return
    await guardarDespacho({
      ...d, estado: 'despachado', fechaDespacho: new Date().toISOString(),
      transportista: transportista.trim(), patente: patente.trim() || undefined,
      remito: remito.trim(), destino: destino.trim() || undefined,
      redespacho: redespacho || undefined,
      transportista2: redespacho ? (transportista2.trim() || undefined) : undefined,
      patente2: redespacho ? (patente2.trim() || undefined) : undefined,
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: '96%' }}>
        <div className="section-title" style={{ marginTop: 0 }}>🚚 Despachar · Serie {d.nroSerie}</div>
        <div className="field" style={{ marginBottom: 10 }}><label>Transportista *</label><input className="input" value={transportista} onChange={(e) => setTransportista(e.target.value)} style={{ width: '100%' }} /></div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div className="field" style={{ flex: 1 }}><label>Patente</label><input className="input" value={patente} onChange={(e) => setPatente(e.target.value)} style={{ width: '100%' }} /></div>
          <div className="field" style={{ flex: 1 }}><label>Remito *</label><input className="input" value={remito} onChange={(e) => setRemito(e.target.value)} style={{ width: '100%' }} /></div>
        </div>
        <div className="field" style={{ marginBottom: 10 }}><label>Destino</label><input className="input" value={destino} onChange={(e) => setDestino(e.target.value)} style={{ width: '100%' }} /></div>
        <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <input type="checkbox" checked={redespacho} onChange={(e) => setRedespacho(e.target.checked)} /> Redespacho (2° transporte)
        </label>
        {redespacho && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div className="field" style={{ flex: 1 }}><label>2° transportista</label><input className="input" value={transportista2} onChange={(e) => setTransportista2(e.target.value)} style={{ width: '100%' }} /></div>
            <div className="field" style={{ flex: 1 }}><label>2° patente</label><input className="input" value={patente2} onChange={(e) => setPatente2(e.target.value)} style={{ width: '100%' }} /></div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-verde" disabled={!transportista.trim() || !remito.trim()} onClick={() => void confirmar()}>🚚 Confirmar despacho</button>
        </div>
      </div>
    </div>
  )
}
