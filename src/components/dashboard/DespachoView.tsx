import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import { esSuperAdmin } from '../../auth/roles'
import type { DespachoTrafo, EstadoDespacho, LineaProduccion } from '../../types'
import {
  ESTADOS_DESPACHO, estadoDespachoLabel, RESPONSABLES_DESPACHO, MOTIVOS_DEMORA_DESPACHO,
  checklistCompleto, checklistFaltantes, seriesDespacho, UBICACIONES_DESPACHO,
  DEPOSITOS, DEPOSITOS_EXTERNOS, DEPOSITO_PLANTA, depositoActual, enStock,
  minutosDemoraAcotados,
} from '../../types'
import type { MovimientoDeposito } from '../../types'
import { guardarDespacho, eliminarDespacho } from '../../sync/syncEngine'
import { fmtDur, fechaCorta, hhmm } from '../../lib/time'
import { calcularTiempoProductivo } from '../../lib/calendario'
import { abrirProtocolo } from '../../lib/archivos'
import FichaDespacho from './FichaDespacho'
import DespachoReportes from './DespachoReportes'
import AlertasDespacho from './AlertasDespacho'
import ChipsInput from './ChipsInput'
import FletesInternos from './FletesInternos'
import LogisticaTareas from './LogisticaTareas'
import { PERIODOS_HISTORIAL, rangoReporte, enRango, type PeriodoReporte } from '../../lib/periodoReporte'
import { tituloTrafo } from '../../lib/modeloTrafo'
import StockDepositos from './StockDepositos'
import { purgarFotosVencidas } from '../../lib/purgaFotosRunner'

// ============================================================
// TABLERO DE DESPACHO Y EMBALAJE (v1.27) — sector Melany. Fase 1: seguimiento de
// cada transformador por estado, tiempos de embalaje, checklist que bloquea el
// despacho, demoras con causa, y la ficha (pantalla única).
// ============================================================

function color(e: EstadoDespacho): string { return ESTADOS_DESPACHO.find((x) => x.id === e)?.color ?? 'var(--texto-tenue)' }

// v1.45: sub-vistas del módulo. Se exportan porque LogisticaView puede pintar la
// barra de pestañas por su cuenta (modo controlado) y evitar así una pestaña
// intermedia "Despacho y embalaje" que no aportaba nada.
export type VistaDespacho = 'operativo' | 'tareas' | 'reportes' | 'fletes' | 'stock'
export const TABS_DESPACHO: { id: VistaDespacho; label: string; soloSupervisora?: boolean }[] = [
  { id: 'operativo', label: '🚚 Operativo' },
  { id: 'tareas', label: '📋 Tareas' },
  { id: 'reportes', label: '📊 Reportes', soloSupervisora: true },
  { id: 'fletes', label: '🚛 Fletes', soloSupervisora: true },
  { id: 'stock', label: '📦 Stock de transformadores' },
]
// Quién maneja el sector: Melany, el super admin y —para poder cubrirla cuando
// falta— Giuliano. La cuenta operativa 'despacho' no borra ni ve reportes.
export function esEncargadoDespacho(usuarioNombre?: string, superAdmin = false): boolean {
  return superAdmin || usuarioNombre === 'melany' || usuarioNombre === 'giuliano_logistica'
}

export default function DespachoView({ vista: vistaProp, onVista }: {
  vista?: VistaDespacho
  onVista?: (v: VistaDespacho) => void
} = {}) {
  const { usuario } = useAuth()
  // Melany = supervisora del sector: solo ella puede eliminar despachos. El equipo
  // (cuenta 'despacho') opera normalmente (crear, embalar, despachar) pero no borra.
  // v1.43: el super admin (Gerencia) entra con los mismos permisos que Melany.
  // v1.45: Giuliano también, para que puedan suplantarse entre encargados.
  const esSupervisora = esEncargadoDespacho(usuario?.usuario, esSuperAdmin(usuario))
  // v1.43: los fletes salieron del medio del operativo a su propia pestaña.
  // v1.45: si el padre controla la vista, no se pinta la barra propia.
  const controlado = !!onVista
  const [vistaLocal, setVistaLocal] = useState<VistaDespacho>('operativo')
  const vista = vistaProp ?? vistaLocal
  const setVista = onVista ?? setVistaLocal
  const [busqueda, setBusqueda] = useState('')
  // v1.43: período del historial (despachado / entregado). No toca los estados abiertos.
  const [periodoHist, setPeriodoHist] = useState<PeriodoReporte>('mes_actual')
  const [topeEnt, setTopeEnt] = useState(20)
  useEffect(() => { setTopeEnt(20) }, [periodoHist, busqueda])
  const despachos = useLiveQuery(() => db.despachos.toArray(), []) ?? []

  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(id) }, [])
  const ahoraISO = new Date(ahora).toISOString()

  // v1.46: limpieza de fotos vencidas (3 meses desde la entrega). Corre una vez
  // por día y solo la dispara un encargado, para que no compitan varias tablets.
  useEffect(() => {
    if (!esSupervisora) return
    void purgarFotosVencidas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esSupervisora])

  // Alta.
  const [ot, setOt] = useState('')
  const [cliente, setCliente] = useState('')
  const [numerosSerie, setNumerosSerie] = useState<string[]>([])
  const [cut, setCut] = useState('')
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
  // v1.44: mover a depósito + desplegables de stock y entregados.
  const [moviendo, setMoviendo] = useState<DespachoTrafo | null>(null)
  const [depositoSel, setDepositoSel] = useState<string>(DEPOSITOS_EXTERNOS[0])
  const [notaDep, setNotaDep] = useState('')
  const [verDeposito, setVerDeposito] = useState<string | null>(null)   // depósito abierto en el KPI
  const [verEntregados, setVerEntregados] = useState(false)

  // --- tiempos ---
  // v1.45: la demora VIGENTE se acota por el tope de su causa (el almuerzo son
  // 30': si nadie aprieta "Reanudar", el excedente no se descuenta del embalaje).
  function minsDemoraVigente(d: DespachoTrafo, hasta = ahoraISO): number {
    if (!d.demoraEnCurso) return 0
    const causa = d.demoras?.length ? d.demoras[d.demoras.length - 1].causa : ''
    return minutosDemoraAcotados(causa, calcularTiempoProductivo(d.demoraEnCurso, hasta))
  }
  function minsDemora(d: DespachoTrafo): number {
    return (d.minutosDemora ?? 0) + minsDemoraVigente(d)
  }
  function minsEmbalaje(d: DespachoTrafo): number {
    if (!d.embalajeInicio) return 0
    const fin = d.embalajeFin ?? ahoraISO
    return Math.max(0, calcularTiempoProductivo(d.embalajeInicio, fin) - minsDemora(d))
  }

  async function crear() {
    if (!ot.trim() || !cliente.trim() || numerosSerie.length === 0) { setMsg('Completá OT, cliente y al menos un N° de serie.'); return }
    const d: DespachoTrafo = {
      id: crypto.randomUUID(),
      ot: ot.trim(), cliente: cliente.trim(),
      nroSerie: numerosSerie.join(', '), numerosSerie,
      cut: cut.trim() || undefined,
      potencia: potencia.trim() || undefined, tipo: tipo.trim() || undefined,
      linea, fechaIngreso: new Date().toISOString(),
      estado: 'esperando_embalaje',
      creada: new Date().toISOString(), creadaPor: usuario?.usuario,
    }
    await guardarDespacho(d)
    setOt(''); setCliente(''); setNumerosSerie([]); setCut(''); setPotencia(''); setTipo(''); setLinea('distribucion')
    setMsg(`Despacho de ${numerosSerie.length} unidad(es) ingresado.`)
  }

  // Tilda/destilda una serie como cargada al camión.
  async function toggleCargado(d: DespachoTrafo, serie: string) {
    const set = d.cargados ?? []
    const cargados = set.includes(serie) ? set.filter((s) => s !== serie) : [...set, serie]
    await guardarDespacho({ ...d, cargados })
  }
  // v1.33: ubicación física donde se hace el embalaje (obligatoria para finalizar).
  async function setUbicacion(d: DespachoTrafo, u: string) {
    await guardarDespacho({ ...d, ubicacionDeposito: u })
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
    const acum = (d.minutosDemora ?? 0) + minsDemoraVigente(d, now)   // v1.45: acotado por causa
    await guardarDespacho({ ...d, estado: 'embalando', demoraEnCurso: undefined, minutosDemora: acum, demoras: cerrarDemoraAbierta(d.demoras, now) })
  }
  async function marcarEmbalado(d: DespachoTrafo) {
    const now = new Date().toISOString()
    const acum = (d.minutosDemora ?? 0) + minsDemoraVigente(d, now)   // v1.45: acotado por causa
    await guardarDespacho({ ...d, estado: 'embalado', demoraEnCurso: undefined, minutosDemora: acum, demoras: cerrarDemoraAbierta(d.demoras, now), embalajeFin: now })
  }
  async function marcarEntregado(d: DespachoTrafo) {
    await guardarDespacho({ ...d, estado: 'entregado', entregadaEn: new Date().toISOString() })
  }

  // ------------------------------------------------------------
  // v1.44: GUARDADO EN DEPÓSITO. Un trafo embalado no siempre sale directo al
  // cliente; puede quedar guardado un tiempo indefinido. El destino final sigue
  // siendo el cliente, así que NO se toca `cliente`: solo dónde está hoy.
  // ------------------------------------------------------------
  function abrirDeposito(d: DespachoTrafo) {
    setMoviendo(d)
    // Por defecto propone un depósito distinto al actual, para que mover sea un clic.
    setDepositoSel(DEPOSITOS_EXTERNOS.find((x) => x !== d.deposito) ?? DEPOSITOS_EXTERNOS[0])
    setNotaDep('')
  }
  async function confirmarDeposito() {
    if (!moviendo || !depositoSel) return
    const now = new Date().toISOString()
    const mov: MovimientoDeposito = {
      deposito: depositoSel,
      desde: moviendo.deposito ?? (moviendo.estado === 'embalado' ? DEPOSITO_PLANTA : undefined),
      fecha: now,
      usuario: usuario?.usuario,
      nota: notaDep.trim() || undefined,
    }
    await guardarDespacho({
      ...moviendo,
      estado: 'en_deposito',
      deposito: depositoSel,
      fechaDeposito: now,
      movimientos: [...(moviendo.movimientos ?? []), mov],
    })
    setMoviendo(null); setNotaDep('')
  }
  // Vuelve de un depósito externo a Lorenzatti (la planta): queda otra vez
  // "embalado, listo para despachar", sin `deposito` (la planta es el default).
  async function volverAPlanta(d: DespachoTrafo) {
    const now = new Date().toISOString()
    const mov: MovimientoDeposito = { deposito: DEPOSITO_PLANTA, desde: d.deposito, fecha: now, usuario: usuario?.usuario }
    await guardarDespacho({
      ...d, estado: 'embalado', deposito: undefined, fechaDeposito: undefined,
      movimientos: [...(d.movimientos ?? []), mov],
    })
  }
  // Días que lleva guardado en el depósito actual.
  function diasEnDeposito(d: DespachoTrafo): number {
    const desde = d.fechaDeposito ?? d.embalajeFin
    if (!desde) return 0
    return Math.floor((Date.parse(ahoraISO) - Date.parse(desde)) / 86400000)
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
    // v1.43: los estados cerrados (despachado / entregado) son historial y crecen
    // sin techo. Se recortan por período y se ordenan del más reciente al más viejo.
    // Los estados abiertos NO se filtran: el operativo del día tiene que verse entero.
    const r = rangoReporte(periodoHist)
    const byHist = (e: EstadoDespacho, ref: (d: DespachoTrafo) => string | undefined) =>
      despachos
        .filter((d) => d.estado === e && match(d) && enRango(ref(d) ?? d.fechaIngreso, r.desde, r.hasta))
        .sort((a, b) => ((ref(b) ?? '') < (ref(a) ?? '') ? -1 : 1))
    const finalizados = despachos.filter((d) => d.embalajeFin)
    const tiempos = finalizados.map((d) => Math.max(0, calcularTiempoProductivo(d.embalajeInicio, d.embalajeFin) - (d.minutosDemora ?? 0))).filter((m) => m > 0)
    const prom = tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : 0
    const hoy = new Date().toLocaleDateString('en-CA')
    const despHoy = despachos.filter((d) => d.fechaDespacho && d.fechaDespacho.slice(0, 10) === hoy).length
    // v1.44: STOCK GUARDADO por depósito. Cuenta los trafos embalados que todavía
    // no se despacharon, estén en planta o en un depósito externo. El total cierra
    // contra embalado + en_deposito, así no se "pierde" ninguno en el conteo.
    const enDeposito = by('en_deposito')
    const stockPorDeposito = DEPOSITOS.map((dep) => ({
      deposito: dep,
      items: despachos.filter((d) => enStock(d) && depositoActual(d) === dep && match(d))
        .sort((a, b) => ((a.fechaDeposito ?? a.embalajeFin ?? '') < (b.fechaDeposito ?? b.embalajeFin ?? '') ? -1 : 1)),
    }))
    const stockTotal = stockPorDeposito.reduce((s, x) => s + x.items.length, 0)

    // v1.44: ENTREGAS por período — mes actual vs mes anterior vs año.
    // La referencia es la fecha de entrega real; si falta, la de despacho.
    const refEntrega = (d: DespachoTrafo) => d.entregadaEn ?? d.fechaDespacho
    const entregados = despachos.filter((d) => d.estado === 'entregado')
    const cuenta = (p: PeriodoReporte) => {
      const rr = rangoReporte(p)
      return entregados.filter((d) => enRango(refEntrega(d), rr.desde, rr.hasta)).length
    }
    const rMes = rangoReporte('mes_actual')
    const entregasMes = cuenta('mes_actual')
    const entregasMesAnt = entregados.filter((d) => enRango(refEntrega(d), rMes.desdePrev, rMes.hastaPrev)).length
    const entregasAnual = cuenta('anual')

    return {
      esperando: by('esperando_embalaje'), proceso: by(['embalando', 'demorado']),
      embalado: by('embalado'), enDeposito,
      despachado: byHist('despachado', (d) => d.fechaDespacho),
      entregado: byHist('entregado', (d) => d.entregadaEn ?? d.fechaDespacho),
      // Totales sin recorte, para avisar cuándo el período está escondiendo cosas.
      totalDespachado: despachos.filter((d) => d.estado === 'despachado').length,
      totalEntregado: entregados.length,
      stockPorDeposito, stockTotal,
      entregasMes, entregasMesAnt, entregasAnual,
      prom, despHoy,
    }
  }, [despachos, ahora, busqueda, periodoHist])

  const chip = (e: EstadoDespacho) => <span className="estado-chip" style={{ background: color(e) }}>{estadoDespachoLabel(e)}</span>

  // Series del viaje como checkboxes: el operario tilda cada unidad que sube al camión.
  const seriesUI = (d: DespachoTrafo) => {
    const series = seriesDespacho(d)
    if (series.length === 0) return null
    const cargados = d.cargados ?? []
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {series.map((s) => {
          const on = cargados.includes(s)
          return (
            <button key={s} type="button" onClick={() => void toggleCargado(d, s)}
              style={{
                padding: '4px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '.82rem',
                border: '1px solid ' + (on ? 'var(--estado-fin)' : 'var(--borde)'),
                background: on ? 'var(--estado-fin)' : 'transparent', color: on ? '#05230f' : 'var(--texto)', fontWeight: on ? 800 : 600,
              }}>{on ? '☑' : '☐'} {s}</button>
          )
        })}
        {series.length > 1 && <span className="meta" style={{ alignSelf: 'center' }}>{cargados.filter((c) => series.includes(c)).length}/{series.length} cargados</span>}
      </div>
    )
  }

  // v1.43: el título muestra la descripción completa del modelo + la serie, igual
  // que en Laboratorio. Antes decía solo "Serie 24.563" y Melany no sabía qué
  // trafo era sin abrir la ficha.
  const tituloCard = (d: DespachoTrafo) => {
    const s = seriesDespacho(d)
    if (s.length > 1) return d.modelo ? `${d.modelo} · ${s.length} unidades` : `Despacho · ${s.length} unidades`
    return tituloTrafo(d.modelo, s[0] ?? d.nroSerie)
  }

  const cab = (d: DespachoTrafo) => (
    <>
      <div className="meta">
        {d.linea === 'rural' ? '🚜 Rural' : '🏭 Distribución'} · OT <strong>{d.ot}</strong> · Cliente <strong>{d.cliente}</strong>
        {d.potencia ? <> · {d.potencia}</> : null}{d.tipo ? <> · {d.tipo}</> : null}
        {d.cut ? <> · CUT <strong style={{ color: 'var(--naranja)' }}>{d.cut}</strong></> : null}
      </div>
      {seriesUI(d)}
    </>
  )

  function Tarjeta({ d, children }: { d: DespachoTrafo; children: ReactNode }) {
    return (
      <div className="card logi-tarea" key={d.id} style={{ borderLeft: `5px solid ${color(d.estado)}` }}>
        <div className="card-header">
          <div>
            <h3>{tituloCard(d)}</h3>
            {cab(d)}
          </div>
          {chip(d.estado)}
        </div>
        <div className="row-actions">
          {children}
          <button className="btn" onClick={() => setFicha(d)}>👁 Ficha</button>
                  {d.protocoloPath && <button className="btn" title="Descargar el protocolo de ensayo" onClick={() => void abrirProtocolo(d.protocoloPath)}>⬇ Protocolo</button>}
          {esSupervisora && <button className="btn btn-rojo" onClick={() => void borrar(d)}>🗑</button>}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Sub-pestañas propias. Si el padre las pinta (modo controlado), no se
          repiten acá — así no queda una barra de pestañas arriba de la otra. */}
      {!controlado && (
        <div className="tabs no-print" style={{ marginBottom: 10 }}>
          {TABS_DESPACHO.filter((t) => !t.soloSupervisora || esSupervisora).map((t) => (
            <button key={t.id} className={'tab' + (vista === t.id ? ' active' : '')} onClick={() => setVista(t.id)}>{t.label}</button>
          ))}
        </div>
      )}

      {vista === 'tareas'
        ? <LogisticaTareas origen="despacho" roster={RESPONSABLES_DESPACHO} esEncargado={esSupervisora} tituloAlta="Nueva tarea de despacho" />
        : esSupervisora && vista === 'reportes' ? <DespachoReportes despachos={despachos} />
        : esSupervisora && vista === 'fletes' ? <FletesInternos esSupervisora={esSupervisora} />
        : vista === 'stock' ? <StockDepositos despachos={despachos} /> : (
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

      {/* v1.44: STOCK GUARDADO — dónde está cada trafo embalado que no salió.
          Cada tarjeta abre el detalle de ese depósito. */}
      <div className="section-title">Stock guardado · {g.stockTotal} trafo(s) sin despachar</div>
      <div className="logi-kpis">
        {g.stockPorDeposito.map(({ deposito, items }) => {
          const abierto = verDeposito === deposito
          const esPlanta = deposito === DEPOSITO_PLANTA
          return (
            <button
              type="button" key={deposito} className="logi-kpi" disabled={items.length === 0}
              onClick={() => setVerDeposito(abierto ? null : deposito)}
              title={items.length ? 'Ver qué trafos hay acá' : 'Sin trafos en este depósito'}
              style={{
                font: 'inherit', color: 'inherit', textAlign: 'center',
                cursor: items.length ? 'pointer' : 'default',
                border: '1px solid ' + (abierto ? 'var(--azul-claro)' : 'var(--borde)'),
              }}
            >
              <div className="n" style={{ color: esPlanta ? 'var(--azul-claro)' : 'var(--naranja)' }}>{items.length}</div>
              <div className="l">{deposito}{items.length ? (abierto ? ' ▲' : ' ▼') : ''}</div>
            </button>
          )
        })}
      </div>

      {/* Detalle del depósito abierto */}
      {verDeposito && (() => {
        const grupo = g.stockPorDeposito.find((x) => x.deposito === verDeposito)
        if (!grupo || grupo.items.length === 0) return null
        return (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="section-title" style={{ marginTop: 0 }}>📦 {verDeposito} · {grupo.items.length} trafo(s)</div>
            {grupo.items.map((d) => {
              // v1.45: se puede despachar al cliente sin salir del desglose.
              // Sigue exigiendo el checklist completo, igual que en la lista.
              const listo = checklistCompleto(d.checklist)
              return (
                <div key={d.id} className="pareto-row" style={{ marginBottom: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <strong>{tituloCard(d)}</strong>
                    <div className="meta">
                      Cliente <strong>{d.cliente}</strong> · OT {d.ot}
                      {d.estado === 'en_deposito' ? ` · guardado hace ${diasEnDeposito(d)} día(s)` : ` · embalado en ${DEPOSITO_PLANTA}`}
                      {!listo ? <> · <span style={{ color: 'var(--naranja)' }}>checklist incompleto</span></> : null}
                    </div>
                  </div>
                  <button className="btn" onClick={() => setFicha(d)}>👁 Ficha</button>
                  {d.protocoloPath && <button className="btn" title="Descargar el protocolo de ensayo" onClick={() => void abrirProtocolo(d.protocoloPath)}>⬇ Protocolo</button>}
                  {esSupervisora && <button className="btn" onClick={() => abrirDeposito(d)}>📦 Mover</button>}
                  {esSupervisora && (
                    <button className="btn btn-verde" disabled={!listo} onClick={() => setDespachando(d)}
                      title={listo ? 'Despachar al cliente' : 'Completá el checklist en la ficha para poder despachar'}>
                      {listo ? '🚚 Despachar' : '🔒 Despachar'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* v1.44: ENTREGAS al cliente — mes actual contra mes anterior y año.
          La lista salió del operativo: se despliega desde acá. */}
      <div className="section-title">Entregas a clientes</div>
      <div className="logi-kpis">
        <div className="logi-kpi"><div className="n" style={{ color: 'var(--estado-fin)' }}>{g.entregasMes}</div><div className="l">Entregados este mes</div></div>
        <div className="logi-kpi"><div className="n">{g.entregasMesAnt}</div><div className="l">Mes anterior</div></div>
        <div className="logi-kpi">
          <div className="n" style={{ color: (g.entregasMes - g.entregasMesAnt) >= 0 ? 'var(--estado-fin)' : 'var(--rojo)' }}>
            {g.entregasMes - g.entregasMesAnt >= 0 ? '+' : ''}{g.entregasMes - g.entregasMesAnt}
          </div>
          <div className="l">Variación vs mes anterior</div>
        </div>
        <div className="logi-kpi"><div className="n">{g.entregasAnual}</div><div className="l">Acumulado del año</div></div>
        <button
          type="button" className="logi-kpi" disabled={g.totalEntregado === 0}
          onClick={() => setVerEntregados((v) => !v)}
          title={g.totalEntregado ? 'Ver el detalle de las entregas' : 'Todavía no hay entregas'}
          style={{
            font: 'inherit', color: 'inherit', textAlign: 'center',
            cursor: g.totalEntregado ? 'pointer' : 'default',
            border: '1px solid ' + (verEntregados ? 'var(--azul-claro)' : 'var(--borde)'),
          }}
        >
          <div className="n">{g.totalEntregado}</div>
          <div className="l">Histórico{g.totalEntregado ? (verEntregados ? ' ▲ ocultar' : ' ▼ ver detalle') : ''}</div>
        </button>
      </div>

      {/* Detalle de entregas — desplegable, ya no una lista infinita al pie */}
      {verEntregados && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="filtros" style={{ marginBottom: 10 }}>
            <span className="meta">Período:</span>
            <select className="select" value={periodoHist} onChange={(e) => setPeriodoHist(e.target.value as PeriodoReporte)}>
              {PERIODOS_HISTORIAL.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <span className="meta">{g.entregado.length} de {g.totalEntregado} entrega(s)</span>
          </div>
          {g.entregado.length === 0
            ? <div className="empty">Ninguna entrega en este período — hay {g.totalEntregado} en el histórico.</div>
            : <>
                {g.entregado.slice(0, topeEnt).map((d) => (
                  <div key={d.id} className="pareto-row" style={{ marginBottom: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <strong>{tituloCard(d)}</strong>
                      <div className="meta">
                        Cliente <strong>{d.cliente}</strong> · OT {d.ot}
                        {d.entregadaEn ? ` · entregado ${fechaCorta(d.entregadaEn)}` : ''}
                        {d.transportista ? ` · ${d.transportista}${d.patente ? ` (${d.patente})` : ''}` : ''}
                        {d.remito ? ` · remito ${d.remito}` : ''}
                      </div>
                    </div>
                    <button className="btn" onClick={() => setFicha(d)}>👁 Ficha</button>
                  {d.protocoloPath && <button className="btn" title="Descargar el protocolo de ensayo" onClick={() => void abrirProtocolo(d.protocoloPath)}>⬇ Protocolo</button>}
                    {esSupervisora && <button className="btn btn-rojo" onClick={() => void borrar(d)}>🗑</button>}
                  </div>
                ))}
                {g.entregado.length > topeEnt && (
                  <button className="btn btn-bloque" onClick={() => setTopeEnt((n) => n + 20)}>
                    ▼ Ver {Math.min(20, g.entregado.length - topeEnt)} más
                    <span className="meta"> (mostrando {topeEnt} de {g.entregado.length})</span>
                  </button>
                )}
              </>}
        </div>
      )}

      {/* Alta — solo Melany crea/envía tareas de embalaje; el equipo las ejecuta */}
      {esSupervisora && (
      <div className="card">
        <div className="section-title">Nuevo despacho · uno o varios transformadores para un mismo viaje</div>
        <div className="form-grid">
          <div className="field"><label>OT</label><input className="input" value={ot} onChange={(e) => setOt(e.target.value)} placeholder="OT-1234" /></div>
          <div className="field"><label>Cliente</label><input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>N° de serie (agregá cada unidad del viaje)</label>
            <ChipsInput valores={numerosSerie} onChange={setNumerosSerie} placeholder="ej. 24664 · Enter para agregar" />
          </div>
          <div className="field"><label>Potencia</label><input className="input" value={potencia} onChange={(e) => setPotencia(e.target.value)} placeholder="315 kVA" /></div>
          <div className="field"><label>Tipo</label><input className="input" value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Trifásico / Monoposte…" /></div>
          <div className="field"><label>CUT (opcional · solo EPE)</label><input className="input" value={cut} onChange={(e) => setCut(e.target.value)} placeholder="ej. 49078" /></div>
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
                <h3>{tituloCard(d)}</h3>
                {cab(d)}
                <div className="meta" style={{ marginTop: 3 }}>
                  Operaria <strong>{d.operario ?? '—'}</strong> · <strong style={{ color: 'var(--naranja)' }}>embalando {fmtDur(minsEmbalaje(d))}</strong>
                  {demorado ? <> · <strong style={{ color: 'var(--rojo)' }}>demorado hace {fmtDur(calcularTiempoProductivo(d.demoraEnCurso ?? ahoraISO, ahoraISO))}</strong></> : (d.minutosDemora ? <> · demoras: {fmtDur(d.minutosDemora)}</> : null)}
                </div>
                {demorado && ultimaDemora ? <div className="meta" style={{ color: 'var(--rojo)' }}>⛔ {ultimaDemora.causa}</div> : null}
              </div>
              {chip(d.estado)}
            </div>

            {/* Ubicación de trabajo — OBLIGATORIA para poder marcar embalado */}
            <div style={{ marginTop: 6 }}>
              <div className="meta" style={{ marginBottom: 6 }}>📍 Ubicación de trabajo <span style={{ color: 'var(--rojo)' }}>*</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {UBICACIONES_DESPACHO.map((u) => {
                  const on = d.ubicacionDeposito === u
                  return (
                    <button key={u} type="button" onClick={() => void setUbicacion(d, u)}
                      style={{
                        padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontSize: '.95rem', minHeight: 48,
                        border: '2px solid ' + (on ? 'var(--azul-claro)' : 'var(--borde)'),
                        background: on ? 'var(--azul-claro)' : 'transparent',
                        color: on ? '#fff' : 'var(--texto)', fontWeight: on ? 800 : 600,
                      }}>{on ? '● ' : '○ '}{u}</button>
                  )
                })}
              </div>
            </div>

            <div className="row-actions" style={{ marginTop: 8 }}>
              <button className="btn btn-verde" style={{ flex: 1 }} disabled={!d.ubicacionDeposito}
                onClick={() => void marcarEmbalado(d)}>
                {d.ubicacionDeposito ? '✓ Marcar embalado' : '🔒 Elegí la ubicación'}
              </button>
              {demorado
                ? <button className="btn btn-primary" onClick={() => void reanudar(d)}>▶ Reanudar</button>
                : <button className="btn btn-rojo" onClick={() => abrirDemora(d)}>⛔ Demora</button>}
              <button className="btn" onClick={() => setFicha(d)}>👁 Ficha</button>
                  {d.protocoloPath && <button className="btn" title="Descargar el protocolo de ensayo" onClick={() => void abrirProtocolo(d.protocoloPath)}>⬇ Protocolo</button>}
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
                <h3>{tituloCard(d)}</h3>
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
                    {listo ? '🚚 Despachar al cliente' : '🔒 Completá el checklist'}
                  </button>
                : <div className="meta" style={{ flex: 1, alignSelf: 'center', color: listo ? 'var(--estado-fin)' : 'var(--naranja)' }}>
                    {listo ? '✓ Listo — Melany organiza el despacho' : `🔒 Completá el checklist (faltan: ${faltan.join(', ')})`}
                  </div>}
              {/* v1.44: alternativa al despacho directo — guardarlo en un depósito.
                  No pide checklist: mover a depósito no es liberar al cliente. */}
              {esSupervisora && <button className="btn" onClick={() => abrirDeposito(d)}>📦 Enviar a depósito</button>}
              <button className="btn" onClick={() => setFicha(d)}>👁 Ficha / Checklist</button>
              {esSupervisora && <button className="btn btn-rojo" onClick={() => void borrar(d)}>🗑</button>}
            </div>
          </div>
        )
      })}

      {/* v1.44: En depósito — guardados, a la espera de que el cliente los pida */}
      <div className="section-title">En depósito ({g.enDeposito.length})</div>
      {g.enDeposito.length === 0 ? <div className="empty">Nada guardado en depósito.</div> : g.enDeposito.map((d) => {
        const listo = checklistCompleto(d.checklist)
        const dias = diasEnDeposito(d)
        return (
          <div className="card logi-tarea" key={d.id} style={{ borderLeft: `5px solid ${color(d.estado)}` }}>
            <div className="card-header">
              <div>
                <h3>{tituloCard(d)}</h3>
                {cab(d)}
                <div className="meta" style={{ marginTop: 3 }}>
                  📦 En <strong>{d.deposito}</strong> desde {d.fechaDeposito ? fechaCorta(d.fechaDeposito) : '—'}
                  {' · '}<strong style={{ color: dias > 60 ? 'var(--rojo)' : dias > 30 ? 'var(--naranja)' : undefined }}>{dias} día(s)</strong>
                </div>
              </div>
              {chip(d.estado)}
            </div>
            <div className="row-actions">
              {esSupervisora
                ? <button className="btn btn-verde" style={{ flex: 1 }} disabled={!listo} onClick={() => setDespachando(d)}>
                    {listo ? '🚚 Despachar al cliente' : '🔒 Completá el checklist'}
                  </button>
                : <div className="meta" style={{ flex: 1, alignSelf: 'center' }}>Guardado en {d.deposito}</div>}
              {esSupervisora && <button className="btn" onClick={() => abrirDeposito(d)}>⇄ Mover de depósito</button>}
              {esSupervisora && <button className="btn" onClick={() => void volverAPlanta(d)}>↩ Volver a {DEPOSITO_PLANTA}</button>}
              <button className="btn" onClick={() => setFicha(d)}>👁 Ficha</button>
                  {d.protocoloPath && <button className="btn" title="Descargar el protocolo de ensayo" onClick={() => void abrirProtocolo(d.protocoloPath)}>⬇ Protocolo</button>}
              {esSupervisora && <button className="btn btn-rojo" onClick={() => void borrar(d)}>🗑</button>}
            </div>
          </div>
        )
      })}

      {/* v1.43: período del historial cerrado. Los entregados ya no viven acá:
          se ven desde el desplegable de los KPIs de arriba. */}
      <div className="filtros no-print" style={{ marginTop: 18 }}>
        <span className="meta">Historial de despachos:</span>
        <select className="select" value={periodoHist} onChange={(e) => setPeriodoHist(e.target.value as PeriodoReporte)}>
          {PERIODOS_HISTORIAL.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <span className="meta">Lo operativo de arriba (esperando, en proceso, embalado, en depósito) se ve siempre completo.</span>
      </div>

      {/* Despachado */}
      <div className="section-title">
        Despachado ({g.despachado.length}{g.totalDespachado !== g.despachado.length ? ` de ${g.totalDespachado}` : ''})
      </div>
      {g.despachado.length === 0
        ? <div className="empty">{g.totalDespachado === 0 ? 'Nada despachado pendiente de entrega.' : `Ninguno en este período — hay ${g.totalDespachado} en el histórico.`}</div>
        : g.despachado.map((d) => (
        <Tarjeta d={d} key={d.id}>
          {esSupervisora
            ? <button className="btn btn-verde" style={{ flex: 1 }} onClick={() => void marcarEntregado(d)}>✓ Marcar entregado</button>
            : <div className="meta" style={{ flex: 1, alignSelf: 'center' }}>Despachado — a la espera de entrega (Melany)</div>}
        </Tarjeta>
      ))}

      </>
      )}

      {/* --- Modales --- */}
      {ficha && <FichaDespacho despacho={despachos.find((x) => x.id === ficha.id) ?? ficha} onClose={() => setFicha(null)} />}

      {/* v1.44: enviar / mover a depósito */}
      {moviendo && (
        <div className="modal-overlay" onClick={() => setMoviendo(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-title" style={{ marginTop: 0 }}>📦 {moviendo.estado === 'en_deposito' ? 'Mover de depósito' : 'Enviar a depósito'}</div>
            <div className="meta" style={{ marginBottom: 12 }}>
              {tituloCard(moviendo)} · cliente <strong>{moviendo.cliente}</strong>
              {moviendo.deposito ? <> · hoy está en <strong>{moviendo.deposito}</strong></> : null}
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>¿A qué depósito va?</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {DEPOSITOS_EXTERNOS.map((dep) => {
                  const on = depositoSel === dep
                  const actual = moviendo.deposito === dep
                  return (
                    <button
                      key={dep} type="button" disabled={actual} onClick={() => setDepositoSel(dep)}
                      title={actual ? 'Ya está en este depósito' : undefined}
                      style={{
                        padding: '10px 16px', borderRadius: 10, cursor: actual ? 'default' : 'pointer', minHeight: 46,
                        border: '2px solid ' + (on ? 'var(--azul-claro)' : 'var(--borde)'),
                        background: on ? 'var(--azul-claro)' : 'transparent',
                        color: on ? '#fff' : 'var(--texto)', fontWeight: on ? 800 : 600,
                        opacity: actual ? 0.45 : 1,
                      }}>{on ? '● ' : '○ '}{dep}</button>
                  )
                })}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Nota (opcional) — ¿por qué se guarda?</label>
              <input className="input" value={notaDep} onChange={(e) => setNotaDep(e.target.value)}
                placeholder="ej. el cliente lo retira en septiembre" style={{ width: '100%' }} />
            </div>
            <div className="meta" style={{ marginBottom: 12 }}>
              El trafo sigue asignado a <strong>{moviendo.cliente}</strong>. Guardarlo no lo despacha: queda en el stock del depósito hasta que lo mandes al cliente.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setMoviendo(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!depositoSel || depositoSel === moviendo.deposito} onClick={() => void confirmarDeposito()}>📦 Guardar en {depositoSel}</button>
            </div>
          </div>
        </div>
      )}

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
      // v1.45: al salir hacia el cliente deja de ocupar lugar en el depósito.
      // El historial de movimientos se conserva para la trazabilidad.
      deposito: undefined, fechaDeposito: undefined,
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
