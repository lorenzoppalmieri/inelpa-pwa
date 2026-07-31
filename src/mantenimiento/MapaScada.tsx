import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { esSuperAdmin } from '../auth/roles'
import { fechaCorta, hhmm, sumarDiasLocalISO } from '../lib/time'
import { SimboloActivo } from './simbolos'
import { OT_ABIERTAS } from './types'
import type { Criticidad, MantActivo, MantAviso, MantOT, MantPlanta, MantRegistro, MantSector, OtPrioridad, OtTipo } from './types'

// ============================================================
// MAPA SCADA — MANTENIMIENTO (vista operativa en tiempo real)
// Plano oscuro con indicadores luminosos por activo. El color del
// indicador se deriva EN VIVO de avisos y OT abiertas:
//   rojo     -> aviso de falla (nuevo/en_ot) u OT de emergencia abierta
//   amarillo -> OT preventiva que vence en <= 7 dias u OT correctiva abierta
//   verde    -> operativo, sin pendientes
// Realtime: canal sobre mant_avisos + mant_ordenes_trabajo; ante cualquier
// cambio se recargan las listas abiertas y el semaforo se recalcula (mismo
// patron que TableroOT). Un aviso creado en otra tablet pone el pin rojo
// en vivo.
// Zoom (rueda al cursor + botones) y pan (arrastrar fondo), mismo patron
// de interaccion que MapaEditor. Click en un indicador -> panel lateral
// flotante con estado, ultimas intervenciones, avisos/OT y alta de OT.
// ============================================================

// Plano local de respaldo cuando la planta no tiene plano_url en la base.
const PLANO_FALLBACK: Record<string, string> = {
  cerdan_n1: '/mantenimiento/planos/cerdan_n1.png',
}

const ZOOM_MIN = 0.08
const ZOOM_MAX = 14
const ZOOM_ETIQUETAS = 0.5

type Nivel = 'rojo' | 'amarillo' | 'verde'
interface EstadoScada { nivel: Nivel; motivo: string }

const NIVEL_INFO: Record<Nivel, { label: string; color: string; resumen: string }> = {
  rojo: { label: 'Falla / parada', color: '#ef4444', resumen: 'en falla' },
  amarillo: { label: 'Advertencia', color: '#f59e0b', resumen: 'con advertencia' },
  verde: { label: 'Operativo', color: '#22c55e', resumen: 'operativos' },
}

const CRIT_LABEL: Record<Criticidad, string> = { A: 'A · Crítica', B: 'B · Importante', C: 'C · Menor' }

interface Vista { k: number; x: number; y: number }

interface OtForm { tipo: OtTipo; prioridad: OtPrioridad; descripcion: string; fecha: string; responsable: string }

// "hace 12 min" / "hace 3 h" / "hace 2 d" para el motivo del estado.
function hace(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

export default function MapaScada({ onVerFicha }: { onVerFicha?: (id: string) => void }) {
  const { usuario } = useAuth()
  // Alta de OT: equipo de mantenimiento (jefe + tecnicos) o super admin,
  // mismo criterio que la RLS app_es_equipo_mant().
  const puedeCrearOT = !!usuario && (usuario.rol === 'mantenimiento' || usuario.rol === 'mant_tecnico' || esSuperAdmin(usuario))

  const [plantas, setPlantas] = useState<MantPlanta[]>([])
  const [sectores, setSectores] = useState<MantSector[]>([])
  const [activos, setActivos] = useState<MantActivo[]>([])
  const [plantaId, setPlantaId] = useState('')
  const [avisos, setAvisos] = useState<MantAviso[]>([])
  const [ots, setOts] = useState<MantOT[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [filtroNivel, setFiltroNivel] = useState<Nivel | null>(null)
  const [verSinUbicar, setVerSinUbicar] = useState(false)

  // Panel: ultimas intervenciones + formulario de nueva OT.
  const [registros, setRegistros] = useState<MantRegistro[]>([])
  const [otForm, setOtForm] = useState<OtForm | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [panelAviso, setPanelAviso] = useState('')
  const [errForm, setErrForm] = useState('')

  // Vista del plano (zoom + pan).
  const [vista, setVista] = useState<Vista>({ k: 1, x: 0, y: 0 })
  const [imgTam, setImgTam] = useState<{ w: number; h: number } | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const vistaRef = useRef<Vista>(vista)
  const panRef = useRef<{ x0: number; y0: number; vx: number; vy: number; movio: boolean } | null>(null)
  useEffect(() => { vistaRef.current = vista }, [vista])

  const planta = useMemo(() => plantas.find((p) => p.id === plantaId) ?? null, [plantas, plantaId])
  const sectorPorId = useMemo(() => new Map(sectores.map((s) => [s.id, s])), [sectores])
  const planoSrc = planta ? (planta.plano_url ?? PLANO_FALLBACK[planta.id] ?? null) : null
  const ancho = planta?.plano_ancho_px ?? imgTam?.w ?? 0
  const alto = planta?.plano_alto_px ?? imgTam?.h ?? 0

  const ubicados = useMemo(() => activos.filter((a) => a.activo && a.x_pct != null && a.y_pct != null), [activos])
  const sinUbicar = useMemo(
    () => activos.filter((a) => a.activo && (a.x_pct == null || a.y_pct == null)).sort((a, b) => (a.id < b.id ? -1 : 1)),
    [activos],
  )
  const seleccion = useMemo(() => activos.find((a) => a.id === seleccionId) ?? null, [activos, seleccionId])

  // ------------------------------------------------------------
  // Catalogos + activos de la planta.
  // ------------------------------------------------------------
  useEffect(() => {
    if (!supabase) { setCargando(false); return }
    let vivo = true
    ;(async () => {
      const [{ data: ps, error: e1 }, { data: ss }] = await Promise.all([
        supabase.from('mant_plantas').select('*').eq('activa', true).order('orden'),
        supabase.from('mant_sectores').select('*').order('orden'),
      ])
      if (!vivo) return
      if (e1) { setError('No se pudieron cargar las plantas. Revisá la conexión.'); setCargando(false); return }
      setPlantas((ps ?? []) as MantPlanta[])
      setSectores((ss ?? []) as MantSector[])
      const lista = (ps ?? []) as MantPlanta[]
      const inicial = lista.find((p) => p.id === 'cerdan_n1') ?? lista[0]
      if (inicial) setPlantaId(inicial.id)
      else setCargando(false)
    })()
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (!supabase || !plantaId) return
    let vivo = true
    setSeleccionId(null)
    setImgTam(null)
    ;(async () => {
      const { data, error: e } = await supabase
        .from('mant_activos')
        .select('id, nombre, sector_id, planta_id, subarea, tipo, simbolo, criticidad, x_pct, y_pct, activo')
        .eq('planta_id', plantaId).order('id')
      if (!vivo) return
      if (e) { setError('No se pudieron cargar los activos de la planta.'); return }
      setActivos((data ?? []) as MantActivo[])
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [plantaId])

  // ------------------------------------------------------------
  // Datos VIVOS: avisos y OT abiertas. Se recargan enteros ante
  // cualquier postgres_changes de las dos tablas (son listas chicas).
  // ------------------------------------------------------------
  const cargarVivo = useCallback(async () => {
    if (!supabase) return
    const [{ data: av }, { data: ot }] = await Promise.all([
      supabase.from('mant_avisos').select('*').in('estado', ['nuevo', 'en_ot']).order('creado_en', { ascending: false }),
      supabase.from('mant_ordenes_trabajo').select('*').in('estado', OT_ABIERTAS).order('creado_en', { ascending: false }),
    ])
    setAvisos((av ?? []) as MantAviso[])
    setOts((ot ?? []) as MantOT[])
  }, [])

  useEffect(() => { void cargarVivo() }, [cargarVivo])

  useEffect(() => {
    const sb = supabase
    if (!sb) return
    const canal = sb.channel('mant-scada')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mant_avisos' }, () => { void cargarVivo() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mant_ordenes_trabajo' }, () => { void cargarVivo() })
      .subscribe()
    return () => { void sb.removeChannel(canal) }
  }, [cargarVivo])

  // ------------------------------------------------------------
  // Semaforo por activo (logica SCADA de 3 niveles).
  // ------------------------------------------------------------
  const estados = useMemo(() => {
    const avisosPor = new Map<string, MantAviso[]>()
    for (const a of avisos) {
      const arr = avisosPor.get(a.activo_id) ?? []
      arr.push(a); avisosPor.set(a.activo_id, arr)
    }
    const otsPor = new Map<string, MantOT[]>()
    for (const o of ots) {
      const arr = otsPor.get(o.activo_id) ?? []
      arr.push(o); otsPor.set(o.activo_id, arr)
    }
    const limitePrev = sumarDiasLocalISO(7)
    const mapa = new Map<string, EstadoScada>()
    for (const a of activos) {
      const avs = avisosPor.get(a.id) ?? []
      const abiertas = otsPor.get(a.id) ?? []
      const otEmerg = abiertas.find((o) => o.tipo === 'emergencia')
      const otPrev = abiertas
        .filter((o) => o.tipo === 'preventiva' && o.fecha_objetivo && o.fecha_objetivo <= limitePrev)
        .sort((x, y) => ((x.fecha_objetivo ?? '') < (y.fecha_objetivo ?? '') ? -1 : 1))[0]
      const otCorr = abiertas.find((o) => o.tipo === 'correctiva')
      let est: EstadoScada
      if (avs.length > 0) est = { nivel: 'rojo', motivo: `Aviso de falla — ${hace(avs[0].creado_en)}` }
      else if (otEmerg) est = { nivel: 'rojo', motivo: `OT de emergencia N° ${otEmerg.numero}` }
      else if (otPrev) est = { nivel: 'amarillo', motivo: `OT preventiva vence ${fechaCorta(otPrev.fecha_objetivo ?? '')}` }
      else if (otCorr) est = { nivel: 'amarillo', motivo: `OT correctiva abierta N° ${otCorr.numero}` }
      else est = { nivel: 'verde', motivo: 'Operativo — sin pendientes' }
      mapa.set(a.id, est)
    }
    return mapa
  }, [activos, avisos, ots])

  const resumen = useMemo(() => {
    const c: Record<Nivel, number> = { rojo: 0, amarillo: 0, verde: 0 }
    for (const a of ubicados) c[estados.get(a.id)?.nivel ?? 'verde'] += 1
    return c
  }, [ubicados, estados])

  // ------------------------------------------------------------
  // Zoom al cursor + pan (mismo patron que MapaEditor).
  // ------------------------------------------------------------
  function aplicarVista(v: Vista) {
    vistaRef.current = v
    setVista(v)
  }
  const zoomPunto = useCallback((factor: number, cx: number, cy: number) => {
    const v = vistaRef.current
    const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.k * factor))
    const f = k / v.k
    aplicarVista({ k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f })
  }, [])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const r = el.getBoundingClientRect()
      zoomPunto(ev.deltaY < 0 ? 1.18 : 1 / 1.18, ev.clientX - r.left, ev.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomPunto, planoSrc])

  const zoomCentro = useCallback((factor: number) => {
    const el = stageRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    zoomPunto(factor, r.width / 2, r.height / 2)
  }, [zoomPunto])

  const ajustar = useCallback(() => {
    const el = stageRef.current
    if (!el || !ancho || !alto) return
    const r = el.getBoundingClientRect()
    const k = Math.min(r.width / ancho, r.height / alto) * 0.97
    aplicarVista({ k, x: (r.width - ancho * k) / 2, y: (r.height - alto * k) / 2 })
  }, [ancho, alto])

  useEffect(() => {
    const id = requestAnimationFrame(() => ajustar())
    return () => cancelAnimationFrame(id)
  }, [ajustar, plantaId, planoSrc])

  function downStage(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    panRef.current = { x0: e.clientX, y0: e.clientY, vx: vistaRef.current.x, vy: vistaRef.current.y, movio: false }
  }
  function moveStage(e: React.PointerEvent<HTMLDivElement>) {
    const p = panRef.current
    if (!p) return
    const dx = e.clientX - p.x0
    const dy = e.clientY - p.y0
    if (!p.movio && Math.hypot(dx, dy) < 4) return
    p.movio = true
    aplicarVista({ ...vistaRef.current, x: p.vx + dx, y: p.vy + dy })
  }
  function upStage() {
    const p = panRef.current
    panRef.current = null
    // Click en el fondo (sin arrastre): cierra el panel flotante.
    if (p && !p.movio) setSeleccionId(null)
  }

  // ------------------------------------------------------------
  // Panel: intervenciones recientes + cierre con ESC.
  // ------------------------------------------------------------
  useEffect(() => {
    if (!supabase || !seleccionId) { setRegistros([]); return }
    let vivo = true
    ;(async () => {
      const { data } = await supabase.from('mant_registros').select('*')
        .eq('activo_id', seleccionId).order('fecha', { ascending: false }).limit(5)
      if (vivo) setRegistros((data ?? []) as MantRegistro[])
    })()
    return () => { vivo = false }
  }, [seleccionId])

  useEffect(() => {
    if (!seleccionId) return
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setSeleccionId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [seleccionId])

  // Al cambiar de activo se cierra el formulario y los avisos del panel.
  useEffect(() => {
    setOtForm(null)
    setPanelAviso('')
    setErrForm('')
  }, [seleccionId])

  // ------------------------------------------------------------
  // Alta manual de OT desde el panel.
  // ------------------------------------------------------------
  function abrirFormOT() {
    setErrForm('')
    setPanelAviso('')
    setOtForm({ tipo: 'correctiva', prioridad: 'media', descripcion: '', fecha: '', responsable: usuario?.usuario ?? '' })
  }

  async function crearOT() {
    if (!supabase || !seleccion || !otForm) return
    if (!otForm.descripcion.trim()) { setErrForm('La descripción es obligatoria.'); return }
    setGuardando(true)
    setErrForm('')
    const { data, error: e } = await supabase.from('mant_ordenes_trabajo').insert({
      tipo: otForm.tipo,
      prioridad: otForm.prioridad,
      estado: 'creada',
      activo_id: seleccion.id,
      origen: 'manual',
      descripcion: otForm.descripcion.trim(),
      fecha_objetivo: otForm.fecha || null,
      responsable: otForm.responsable.trim() || null,
      creado_por: usuario?.usuario ?? null,
    }).select('numero').single()
    setGuardando(false)
    if (e) { setErrForm(`No se pudo crear la OT: ${e.message}`); return }
    setOtForm(null)
    setPanelAviso(`OT N° ${data?.numero ?? '—'} creada para ${seleccion.id}.`)
    void cargarVivo() // el semaforo se actualiza al instante (y por realtime)
  }

  if (!supabase) return <div className="empty">Supabase no está configurado (faltan credenciales en .env).</div>

  const selEstado = seleccion ? estados.get(seleccion.id) ?? { nivel: 'verde' as Nivel, motivo: 'Operativo — sin pendientes' } : null
  const selAvisos = seleccion ? avisos.filter((a) => a.activo_id === seleccion.id) : []
  const selOts = seleccion ? ots.filter((o) => o.activo_id === seleccion.id) : []

  return (
    <div className="mant-scada">
      {/* ---------- Barra superior: titulo + planta + resumen ---------- */}
      <div className="mant-scada-top no-print">
        <div className="section-title" style={{ margin: 0, color: '#e2e8f0' }}>🛰️ SCADA · Estado de planta</div>
        <select className="select" value={plantaId} onChange={(e) => setPlantaId(e.target.value)} aria-label="Planta">
          {plantas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <div className="mant-scada-resumen" role="group" aria-label="Resumen por estado">
          {(['verde', 'amarillo', 'rojo'] as Nivel[]).map((n) => (
            <button
              key={n}
              className={'mant-scada-chip' + (filtroNivel === n ? ' activo' : '')}
              style={{ ['--c' as string]: NIVEL_INFO[n].color }}
              onClick={() => setFiltroNivel((f) => (f === n ? null : n))}
              title={filtroNivel === n ? 'Quitar filtro' : `Ver solo ${NIVEL_INFO[n].resumen}`}
            >
              <i />{resumen[n]} {NIVEL_INFO[n].resumen}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-msg" style={{ textAlign: 'left', margin: '0 0 8px' }}>{error}</div>}

      {/* ---------- Escenario ---------- */}
      <div
        ref={stageRef}
        className="mant-scada-stage"
        onPointerDown={downStage}
        onPointerMove={moveStage}
        onPointerUp={upStage}
        onPointerCancel={upStage}
      >
        {!planoSrc ? (
          <div className="empty">Esta planta no tiene plano cargado todavía.</div>
        ) : ancho > 0 && alto > 0 ? (
          <div
            className="mant-scada-capa"
            style={{ width: ancho, height: alto, transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.k})` }}
          >
            <img
              src={planoSrc}
              alt={`Plano de ${planta?.nombre ?? 'la planta'}`}
              width={ancho}
              height={alto}
              draggable={false}
              onLoad={(e) => {
                const im = e.currentTarget
                if (!planta?.plano_ancho_px || !planta?.plano_alto_px) setImgTam({ w: im.naturalWidth, h: im.naturalHeight })
              }}
              onError={() => setError('No se pudo cargar la imagen del plano.')}
            />
            {ubicados.map((a) => {
              const est = estados.get(a.id) ?? { nivel: 'verde' as Nivel, motivo: '' }
              const apagado = filtroNivel != null && est.nivel !== filtroNivel
              const clases = ['mant-scada-dot', 'n-' + est.nivel]
              if (est.nivel === 'rojo') clases.push('pulsa')
              if (apagado) clases.push('apagado')
              if (a.id === seleccionId) clases.push('sel')
              return (
                <div
                  key={a.id}
                  className={clases.join(' ')}
                  style={{ left: `${a.x_pct}%`, top: `${a.y_pct}%`, transform: `translate(-50%, -50%) scale(${1 / vista.k})` }}
                  title={`${a.id} · ${a.nombre} — ${NIVEL_INFO[est.nivel].label}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setSeleccionId(a.id)}
                >
                  <span className="mant-scada-punto" />
                  {vista.k >= ZOOM_ETIQUETAS && <span className="mant-scada-label">{a.id}</span>}
                </div>
              )
            })}
          </div>
        ) : (
          !cargando && <div className="empty">Cargando plano…</div>
        )}

        {/* Controles de zoom */}
        {planoSrc && (
          <div className="mant-zoom no-print">
            <button className="mant-zoom-btn" onClick={() => zoomCentro(1.3)} title="Acercar" aria-label="Acercar">＋</button>
            <button className="mant-zoom-btn" onClick={() => zoomCentro(1 / 1.3)} title="Alejar" aria-label="Alejar">－</button>
            <button className="mant-zoom-btn" onClick={ajustar} title="Ajustar plano a la pantalla" aria-label="Ajustar">⌂</button>
            <span className="mant-zoom-pct">{Math.round(vista.k * 100)}%</span>
          </div>
        )}

        {/* Tira colapsable de activos sin ubicar */}
        {sinUbicar.length > 0 && (
          <div className={'mant-scada-strip no-print' + (verSinUbicar ? ' abierto' : '')}>
            <button className="mant-scada-strip-cab" onClick={() => setVerSinUbicar((v) => !v)} aria-expanded={verSinUbicar}>
              {verSinUbicar ? '▾' : '▸'} Sin ubicar ({sinUbicar.length})
            </button>
            {verSinUbicar && (
              <div className="mant-scada-strip-items">
                {sinUbicar.map((a) => {
                  const est = estados.get(a.id) ?? { nivel: 'verde' as Nivel, motivo: '' }
                  return (
                    <button key={a.id} className="mant-scada-strip-item" onClick={() => setSeleccionId(a.id)} title={a.nombre}>
                      <i style={{ background: NIVEL_INFO[est.nivel].color }} />{a.id}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ---------- Panel flotante del activo ---------- */}
        {seleccion && selEstado && (
          <aside
            className="mant-scada-panel no-print"
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="mant-scada-panel-cab">
              <span className="mant-scada-panel-simbolo" style={{ color: sectorPorId.get(seleccion.sector_id)?.color ?? '#94a3b8' }}>
                <SimboloActivo simbolo={seleccion.simbolo} size={26} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mant-scada-panel-codigo">{seleccion.id}</div>
                <div className="mant-scada-panel-nombre">{seleccion.nombre}</div>
              </div>
              <button className="mant-scada-panel-cerrar" onClick={() => setSeleccionId(null)} aria-label="Cerrar panel">✕</button>
            </div>

            <div className="mant-scada-panel-chips">
              <span className="mant-chip"><i style={{ background: sectorPorId.get(seleccion.sector_id)?.color ?? '#94a3b8' }} />{sectorPorId.get(seleccion.sector_id)?.nombre ?? seleccion.sector_id}</span>
              <span className={`mant-chip-crit mant-crit-${seleccion.criticidad}`} title={CRIT_LABEL[seleccion.criticidad]}>{seleccion.criticidad}</span>
            </div>

            <div className={'mant-scada-estado e-' + selEstado.nivel}>
              <i />
              <div>
                <strong>{NIVEL_INFO[selEstado.nivel].label}</strong>
                <div className="mant-scada-estado-motivo">{selEstado.motivo}</div>
              </div>
            </div>

            {panelAviso && <div className="mant-aviso" style={{ margin: '0 0 10px' }}>{panelAviso}</div>}

            {otForm ? (
              /* ---------- Formulario: nueva OT ---------- */
              <div className="mant-scada-form">
                <div className="mant-scada-panel-sec">📝 Nueva OT · {seleccion.id}</div>
                <div className="field">
                  <label>Tipo</label>
                  <select className="input" style={{ minHeight: 44 }} value={otForm.tipo} onChange={(e) => setOtForm({ ...otForm, tipo: e.target.value as OtTipo })}>
                    <option value="correctiva">Correctiva</option>
                    <option value="preventiva">Preventiva</option>
                    <option value="emergencia">Emergencia</option>
                  </select>
                </div>
                <div className="field">
                  <label>Prioridad</label>
                  <select className="input" style={{ minHeight: 44 }} value={otForm.prioridad} onChange={(e) => setOtForm({ ...otForm, prioridad: e.target.value as OtPrioridad })}>
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
                <div className="field">
                  <label>Descripción *</label>
                  <textarea className="input" style={{ minHeight: 76, padding: '10px 14px' }} value={otForm.descripcion}
                    onChange={(e) => setOtForm({ ...otForm, descripcion: e.target.value })} placeholder="Qué hay que hacer" />
                </div>
                <div className="field">
                  <label>Fecha objetivo</label>
                  <input className="input" style={{ minHeight: 44 }} type="date" value={otForm.fecha} onChange={(e) => setOtForm({ ...otForm, fecha: e.target.value })} />
                </div>
                <div className="field">
                  <label>Responsable</label>
                  <input className="input" style={{ minHeight: 44 }} value={otForm.responsable} onChange={(e) => setOtForm({ ...otForm, responsable: e.target.value })} />
                </div>
                {errForm && <div className="error-msg" style={{ textAlign: 'left' }}>{errForm}</div>}
                <div className="row-actions" style={{ marginTop: 6 }}>
                  <button className="btn btn-verde" style={{ flex: 1, minHeight: 44 }} disabled={guardando} onClick={() => void crearOT()}>✔ Crear OT</button>
                  <button className="btn" style={{ minHeight: 44 }} onClick={() => setOtForm(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                {/* ---------- Avisos y OT abiertas ---------- */}
                {selAvisos.length > 0 && (
                  <>
                    <div className="mant-scada-panel-sec">🔴 Avisos abiertos</div>
                    {selAvisos.map((av) => (
                      <div key={av.id} className="mant-scada-item">
                        <div className="mant-scada-item-top">
                          <span className="estado-chip mant-hist-corr">{av.estado === 'nuevo' ? 'Nuevo' : 'En OT'}</span>
                          <span className="meta">{fechaCorta(av.creado_en)} {hhmm(av.creado_en)} · {av.emisor}</span>
                        </div>
                        <div>{av.sintoma}</div>
                      </div>
                    ))}
                  </>
                )}
                {selOts.length > 0 && (
                  <>
                    <div className="mant-scada-panel-sec">📝 OT abiertas</div>
                    {selOts.map((o) => (
                      <div key={o.id} className="mant-scada-item">
                        <div className="mant-scada-item-top">
                          <span className="estado-chip e-proceso">OT {o.numero} · {o.tipo}</span>
                          <span className="meta">
                            {o.estado}{o.fecha_objetivo ? ` · objetivo ${fechaCorta(o.fecha_objetivo)}` : ''}{o.responsable ? ` · ${o.responsable}` : ''}
                          </span>
                        </div>
                        <div>{o.descripcion}</div>
                      </div>
                    ))}
                  </>
                )}

                {/* ---------- Ultimas intervenciones ---------- */}
                <div className="mant-scada-panel-sec">🧰 Últimas intervenciones</div>
                {registros.length === 0 ? (
                  <div className="meta" style={{ marginBottom: 10 }}>Sin intervenciones registradas.</div>
                ) : registros.map((r) => (
                  <div key={r.id} className="mant-scada-item">
                    <div className="mant-scada-item-top">
                      <span className={`estado-chip ${r.tipo === 'correctivo' ? 'mant-hist-corr' : 'mant-hist-prev'}`}>
                        {r.tipo === 'correctivo' ? 'Correctivo' : 'Preventivo'}
                      </span>
                      <span className="meta">{fechaCorta(r.fecha)}{r.colaborador ? ` · ${r.colaborador}` : ''}</span>
                    </div>
                    {r.trabajo && <div className="mant-scada-item-trabajo">{r.trabajo}</div>}
                  </div>
                ))}

                {/* ---------- Acciones ---------- */}
                <div className="row-actions" style={{ marginTop: 12, flexDirection: 'column' }}>
                  {puedeCrearOT ? (
                    <button className="btn btn-naranja btn-bloque" style={{ minHeight: 44 }} onClick={abrirFormOT}>📝 Registrar nueva OT</button>
                  ) : (
                    <button className="btn btn-bloque" style={{ minHeight: 44 }} disabled
                      title="Solo el equipo de mantenimiento (jefe y técnicos) puede registrar OT">
                      📝 Registrar nueva OT (solo mantenimiento)
                    </button>
                  )}
                  {onVerFicha && (
                    <button className="btn btn-primary btn-bloque" style={{ minHeight: 44 }} onClick={() => onVerFicha(seleccion.id)}>📄 Ver ficha completa</button>
                  )}
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
