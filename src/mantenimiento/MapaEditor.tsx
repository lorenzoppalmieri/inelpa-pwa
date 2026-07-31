import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { esSuperAdmin } from '../auth/roles'
import { SIMBOLOS, SimboloActivo, simboloLabel, simboloValido } from './simbolos'
import type { Criticidad, MantActivo, MantPlanta, MantSector } from './types'

// ============================================================
// EDITOR DE MAPA DE ACTIVOS — MANTENIMIENTO (v1.62)
// Plano de la planta con zoom (rueda + botones, zoom al cursor) y pan
// (arrastrar el fondo). Los activos se dibujan como pins con el color
// de su sector y un simbolo SVG segun mant_activos.simbolo.
//   - Vista: cualquier usuario autenticado (RLS de lectura es amplia).
//   - Edicion: solo rol 'mantenimiento' o el super admin (lorenzo).
//     Arrastrar un pin (o un activo de la bandeja "Sin ubicar") guarda
//     x_pct/y_pct en Supabase; Realtime refleja los cambios de otros.
// ============================================================

// Plano local de respaldo cuando la planta no tiene plano_url en la base
// (el PNG viaja en el bundle de la PWA, carpeta public/mantenimiento/planos).
const PLANO_FALLBACK: Record<string, string> = {
  cerdan_n1: '/mantenimiento/planos/cerdan_n1.png',
}

const CRITICIDADES: { id: Criticidad; label: string }[] = [
  { id: 'A', label: 'A · Crítica' },
  { id: 'B', label: 'B · Importante' },
  { id: 'C', label: 'C · Menor' },
]

// Zoom min/max y umbral a partir del cual se muestran las etiquetas de los pins.
const ZOOM_MIN = 0.08
const ZOOM_MAX = 14
const ZOOM_ETIQUETAS = 0.45

interface Vista { k: number; x: number; y: number }
interface Punto { x: number; y: number }   // porcentajes 0-100 sobre el plano

interface FormNuevo {
  codigo: string
  nombre: string
  sector_id: string
  subarea: string
  tipo: string
  simbolo: string
  criticidad: Criticidad
}

const FORM_VACIO: FormNuevo = { codigo: '', nombre: '', sector_id: '', subarea: '', tipo: '', simbolo: 'maquina', criticidad: 'C' }

export default function MapaEditor({ onVerFicha }: { onVerFicha?: (id: string) => void }) {
  const { usuario } = useAuth()
  // Edicion: jefe de mantenimiento o super admin (mismo criterio que la RLS).
  const puedeEditar = !!usuario && (usuario.rol === 'mantenimiento' || esSuperAdmin(usuario))

  const [plantas, setPlantas] = useState<MantPlanta[]>([])
  const [sectores, setSectores] = useState<MantSector[]>([])
  const [activos, setActivos] = useState<MantActivo[]>([])
  const [plantaId, setPlantaId] = useState<string>('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const [editando, setEditando] = useState(false)
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [verNuevo, setVerNuevo] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Vista del plano (escala + desplazamiento) y tamanio natural de la imagen.
  const [vista, setVista] = useState<Vista>({ k: 1, x: 0, y: 0 })
  const [imgTam, setImgTam] = useState<{ w: number; h: number } | null>(null)
  // Pin en arrastre (posicion provisoria hasta soltar) y arrastre desde la bandeja.
  const [borrador, setBorrador] = useState<{ id: string } & Punto | null>(null)
  const [fantasma, setFantasma] = useState<{ id: string; cx: number; cy: number } | null>(null)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const capaRef = useRef<HTMLDivElement | null>(null)
  const vistaRef = useRef<Vista>(vista)
  const activosRef = useRef<MantActivo[]>(activos)
  const panRef = useRef<{ x0: number; y0: number; vx: number; vy: number; movio: boolean } | null>(null)
  const pinDragRef = useRef<{ id: string; x0: number; y0: number; movio: boolean } | null>(null)
  const trayDragRef = useRef<{ id: string; x0: number; y0: number; activo: boolean } | null>(null)
  useEffect(() => { vistaRef.current = vista }, [vista])
  useEffect(() => { activosRef.current = activos }, [activos])

  const planta = useMemo(() => plantas.find((p) => p.id === plantaId) ?? null, [plantas, plantaId])
  const sectorPorId = useMemo(() => new Map(sectores.map((s) => [s.id, s])), [sectores])
  const planoSrc = planta ? (planta.plano_url ?? PLANO_FALLBACK[planta.id] ?? null) : null
  // Dimensiones de referencia del plano: las declaradas en la base; si faltan,
  // las naturales de la imagen. Los % de los pins son relativos a estas.
  const ancho = planta?.plano_ancho_px ?? imgTam?.w ?? 0
  const alto = planta?.plano_alto_px ?? imgTam?.h ?? 0

  const ubicados = useMemo(() => activos.filter((a) => a.activo && a.x_pct != null && a.y_pct != null), [activos])
  const sinUbicar = useMemo(
    () => activos.filter((a) => a.activo && (a.x_pct == null || a.y_pct == null))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    [activos],
  )
  const seleccion = useMemo(() => activos.find((a) => a.id === seleccionId) ?? null, [activos, seleccionId])

  // ------------------------------------------------------------
  // Carga inicial: plantas activas + sectores (catalogos chicos).
  // ------------------------------------------------------------
  useEffect(() => {
    if (!supabase) { setCargando(false); return }
    let vivo = true
    ;(async () => {
      const [{ data: ps, error: e1 }, { data: ss, error: e2 }] = await Promise.all([
        supabase.from('mant_plantas').select('*').eq('activa', true).order('orden'),
        supabase.from('mant_sectores').select('*').order('orden'),
      ])
      if (!vivo) return
      if (e1 || e2) { setError('No se pudieron cargar plantas/sectores. Revisá la conexión.'); setCargando(false); return }
      setPlantas((ps ?? []) as MantPlanta[])
      setSectores((ss ?? []) as MantSector[])
      // Planta por defecto: Cerdan Nave 1 si esta, si no la primera activa.
      const lista = (ps ?? []) as MantPlanta[]
      const inicial = lista.find((p) => p.id === 'cerdan_n1') ?? lista[0]
      if (inicial) setPlantaId(inicial.id)
      else setCargando(false)
    })()
    return () => { vivo = false }
  }, [])

  // ------------------------------------------------------------
  // Activos de la planta seleccionada.
  // ------------------------------------------------------------
  const cargarActivos = useCallback(async (pid: string) => {
    if (!supabase) return
    const { data, error: e } = await supabase
      .from('mant_activos')
      .select('id, nombre, sector_id, planta_id, subarea, tipo, simbolo, criticidad, x_pct, y_pct, iit_ref, notas, activo, actualizado_por')
      .eq('planta_id', pid)
      .order('id')
    if (e) { setError('No se pudieron cargar los activos de la planta.'); return }
    setActivos((data ?? []) as MantActivo[])
  }, [])

  useEffect(() => {
    if (!plantaId) return
    setSeleccionId(null)
    setImgTam(null)
    setCargando(true)
    void cargarActivos(plantaId).finally(() => setCargando(false))
  }, [plantaId, cargarActivos])

  // ------------------------------------------------------------
  // Realtime: posiciones/fichas actualizadas en vivo entre usuarios.
  // (mant_activos esta en la publication supabase_realtime, ver v1.62.)
  // ------------------------------------------------------------
  useEffect(() => {
    // Alias local: el narrowing no sobrevive dentro del cleanup porque
    // `supabase` es un binding importado (potencialmente mutable para TS).
    const sb = supabase
    if (!sb || !plantaId) return
    const canal = sb
      .channel('mant-mapa-activos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mant_activos' }, (p) => {
        if (p.eventType === 'DELETE') {
          const viejo = p.old as { id?: string }
          if (viejo.id) setActivos((prev) => prev.filter((a) => a.id !== viejo.id))
          return
        }
        const fila = p.new as MantActivo
        setActivos((prev) => {
          // Si la fila paso a otra planta, se quita de esta vista.
          if (fila.planta_id !== plantaId) return prev.filter((a) => a.id !== fila.id)
          const i = prev.findIndex((a) => a.id === fila.id)
          if (i < 0) return [...prev, fila].sort((a, b) => (a.id < b.id ? -1 : 1))
          const copia = prev.slice()
          copia[i] = fila
          return copia
        })
      })
      .subscribe()
    return () => { void sb.removeChannel(canal) }
  }, [plantaId])

  // ------------------------------------------------------------
  // Vista: zoom al cursor (rueda, listener no-pasivo), botones y ajuste.
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

  // Encuadra el plano completo en el escenario.
  const ajustar = useCallback(() => {
    const el = stageRef.current
    if (!el || !ancho || !alto) return
    const r = el.getBoundingClientRect()
    const k = Math.min(r.width / ancho, r.height / alto) * 0.97
    aplicarVista({ k, x: (r.width - ancho * k) / 2, y: (r.height - alto * k) / 2 })
  }, [ancho, alto])

  // Reencuadre al cambiar de planta o cuando se conocen las dimensiones.
  useEffect(() => {
    const id = requestAnimationFrame(() => ajustar())
    return () => cancelAnimationFrame(id)
  }, [ajustar, plantaId, planoSrc])

  // ------------------------------------------------------------
  // Pan: arrastrar el fondo del escenario.
  // ------------------------------------------------------------
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
    // Clic en el fondo (sin arrastre): cierra la ficha de detalle.
    if (p && !p.movio) setSeleccionId(null)
  }

  // Punto del plano (% 0-100) bajo un punto de pantalla. La capa lleva el
  // transform aplicado, asi que su bounding rect ya esta en px de pantalla.
  function posDeEvento(cx: number, cy: number): Punto {
    const capa = capaRef.current
    if (!capa) return { x: 50, y: 50 }
    const r = capa.getBoundingClientRect()
    const px = r.width > 0 ? ((cx - r.left) / r.width) * 100 : 50
    const py = r.height > 0 ? ((cy - r.top) / r.height) * 100 : 50
    const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n * 100) / 100))
    return { x: clamp(px), y: clamp(py) }
  }

  // ------------------------------------------------------------
  // Persistencia de posicion (drop de pin o de item de la bandeja).
  // ------------------------------------------------------------
  async function guardarPosicion(a: MantActivo, x: number, y: number) {
    if (!supabase) return
    setError('')
    // Optimista: se ve el pin en su lugar sin esperar la red.
    setActivos((prev) => prev.map((p) => (p.id === a.id ? { ...p, x_pct: x, y_pct: y } : p)))
    const { error: e } = await supabase
      .from('mant_activos')
      .update({ x_pct: x, y_pct: y, actualizado_en: new Date().toISOString(), actualizado_por: usuario?.usuario ?? null })
      .eq('id', a.id)
    if (e) {
      setError(`No se pudo guardar la posición de ${a.id}. Se recargan los activos.`)
      void cargarActivos(plantaId)
    } else {
      setAviso(`${a.id} ubicado en (${x.toFixed(1)}%, ${y.toFixed(1)}%).`)
    }
  }

  // ------------------------------------------------------------
  // Drag de pins (solo modo edicion). Click corto = abrir ficha.
  // ------------------------------------------------------------
  function downPin(e: React.PointerEvent<HTMLDivElement>, a: MantActivo) {
    e.stopPropagation()
    if (!editando) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pinDragRef.current = { id: a.id, x0: e.clientX, y0: e.clientY, movio: false }
  }
  function movePin(e: React.PointerEvent<HTMLDivElement>, a: MantActivo) {
    const d = pinDragRef.current
    if (!d || d.id !== a.id) return
    if (!d.movio && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return
    d.movio = true
    const p = posDeEvento(e.clientX, e.clientY)
    setBorrador({ id: a.id, x: p.x, y: p.y })
  }
  function upPin(e: React.PointerEvent<HTMLDivElement>, a: MantActivo) {
    const d = pinDragRef.current
    pinDragRef.current = null
    if (editando && d && d.id === a.id && d.movio) {
      const p = posDeEvento(e.clientX, e.clientY)
      setBorrador(null)
      void guardarPosicion(a, p.x, p.y)
    } else {
      setBorrador(null)
      setSeleccionId(a.id)
    }
  }

  // ------------------------------------------------------------
  // Drag desde la bandeja "Sin ubicar" hacia el plano (listeners de
  // documento porque el puntero sale del item; funciona con touch).
  // ------------------------------------------------------------
  function downTray(e: React.PointerEvent<HTMLDivElement>, a: MantActivo) {
    if (!editando) return
    e.preventDefault()
    trayDragRef.current = { id: a.id, x0: e.clientX, y0: e.clientY, activo: false }
  }
  useEffect(() => {
    function move(ev: PointerEvent) {
      const d = trayDragRef.current
      if (!d) return
      if (!d.activo && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 5) return
      d.activo = true
      setFantasma({ id: d.id, cx: ev.clientX, cy: ev.clientY })
    }
    function up(ev: PointerEvent) {
      const d = trayDragRef.current
      trayDragRef.current = null
      setFantasma(null)
      if (!d || !d.activo) return
      const el = stageRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return
      const a = activosRef.current.find((x) => x.id === d.id)
      if (a) {
        const p = posDeEvento(ev.clientX, ev.clientY)
        void guardarPosicion(a, p.x, p.y)
        setSeleccionId(a.id)
      }
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantaId])

  // ------------------------------------------------------------
  // Ficha del activo seleccionado (edicion de datos basicos).
  // ------------------------------------------------------------
  const [ficha, setFicha] = useState<{ nombre: string; criticidad: Criticidad; simbolo: string; notas: string } | null>(null)
  useEffect(() => {
    setFicha(seleccion
      ? { nombre: seleccion.nombre, criticidad: seleccion.criticidad, simbolo: simboloValido(seleccion.simbolo), notas: seleccion.notas ?? '' }
      : null)
    // Solo se reinicia al cambiar de activo; los updates realtime no pisan la edicion en curso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionId])

  async function guardarFicha() {
    if (!supabase || !seleccion || !ficha) return
    setGuardando(true)
    setError('')
    const patch = {
      nombre: ficha.nombre.trim() || seleccion.nombre,
      criticidad: ficha.criticidad,
      simbolo: ficha.simbolo,
      notas: ficha.notas.trim() || null,
      actualizado_en: new Date().toISOString(),
      actualizado_por: usuario?.usuario ?? null,
    }
    const { error: e } = await supabase.from('mant_activos').update(patch).eq('id', seleccion.id)
    setGuardando(false)
    if (e) { setError(`No se pudo guardar la ficha de ${seleccion.id}.`); return }
    setActivos((prev) => prev.map((p) => (p.id === seleccion.id ? { ...p, ...patch } : p)))
    setAviso(`Ficha de ${seleccion.id} guardada.`)
  }

  async function quitarDelMapa() {
    if (!supabase || !seleccion) return
    if (!window.confirm(`¿Quitar ${seleccion.id} del mapa? El activo se conserva y pasa a la bandeja "Sin ubicar".`)) return
    const { error: e } = await supabase
      .from('mant_activos')
      .update({ x_pct: null, y_pct: null, actualizado_en: new Date().toISOString(), actualizado_por: usuario?.usuario ?? null })
      .eq('id', seleccion.id)
    if (e) { setError(`No se pudo quitar ${seleccion.id} del mapa.`); return }
    setActivos((prev) => prev.map((p) => (p.id === seleccion.id ? { ...p, x_pct: null, y_pct: null } : p)))
    setAviso(`${seleccion.id} pasó a "Sin ubicar".`)
  }

  // ------------------------------------------------------------
  // Alta de activo (INSERT; queda sin posicion -> aparece en la bandeja).
  // ------------------------------------------------------------
  const [form, setForm] = useState<FormNuevo>(FORM_VACIO)
  const [errNuevo, setErrNuevo] = useState('')

  async function crearActivo() {
    if (!supabase || !plantaId) return
    const codigo = form.codigo.trim().toUpperCase()
    if (!codigo) { setErrNuevo('El código es obligatorio (ej. HER-SOLD-10).'); return }
    if (!form.nombre.trim()) { setErrNuevo('El nombre es obligatorio.'); return }
    if (!form.sector_id) { setErrNuevo('Elegí un sector.'); return }
    setGuardando(true)
    setErrNuevo('')
    const fila = {
      id: codigo,
      nombre: form.nombre.trim(),
      sector_id: form.sector_id,
      planta_id: plantaId,
      subarea: form.subarea.trim() || null,
      tipo: form.tipo.trim() || null,
      simbolo: form.simbolo,
      criticidad: form.criticidad,
      x_pct: null,
      y_pct: null,
      actualizado_por: usuario?.usuario ?? null,
    }
    const { error: e } = await supabase.from('mant_activos').insert(fila)
    setGuardando(false)
    if (e) {
      setErrNuevo(/duplicate|23505/i.test(e.message) ? `Ya existe un activo con el código ${codigo}.` : `No se pudo crear el activo: ${e.message}`)
      return
    }
    setActivos((prev) => [...prev, { ...fila, iit_ref: null, notas: null, activo: true } as MantActivo]
      .sort((a, b) => (a.id < b.id ? -1 : 1)))
    setVerNuevo(false)
    setForm(FORM_VACIO)
    setAviso(`${codigo} creado. Arrastralo desde "Sin ubicar" para ubicarlo en el plano.`)
  }

  // Leyenda: sectores presentes en la planta con conteo (ubicados/total).
  const leyenda = useMemo(() => {
    const mapa = new Map<string, { sector: MantSector; total: number; ubicados: number }>()
    for (const a of activos) {
      if (!a.activo) continue
      const s = sectorPorId.get(a.sector_id)
      if (!s) continue
      const e = mapa.get(s.id) ?? { sector: s, total: 0, ubicados: 0 }
      e.total += 1
      if (a.x_pct != null && a.y_pct != null) e.ubicados += 1
      mapa.set(s.id, e)
    }
    return [...mapa.values()].sort((a, b) => a.sector.orden - b.sector.orden)
  }, [activos, sectorPorId])

  // Aviso efimero de confirmacion (se limpia solo).
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  if (!supabase) {
    return <div className="empty">Supabase no está configurado (faltan credenciales en .env).</div>
  }

  return (
    <div className="mant-mapa">
      {/* ---------- Barra superior ---------- */}
      <div className="mant-mapa-top no-print">
        <div className="section-title" style={{ margin: 0 }}>🛠️ Mantenimiento · Mapa de activos</div>
        <select
          className="select"
          value={plantaId}
          onChange={(e) => setPlantaId(e.target.value)}
          aria-label="Planta"
        >
          {plantas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {puedeEditar && (
          <button
            className={'btn' + (editando ? ' btn-naranja' : '')}
            style={{ minHeight: 48, padding: '0 16px' }}
            onClick={() => setEditando((v) => !v)}
            title={editando ? 'Salir del modo edición' : 'Entrar al modo edición'}
          >{editando ? '✏️ Editando' : '👁 Solo lectura'}</button>
        )}
        {puedeEditar && editando && (
          <button
            className="btn btn-primary"
            style={{ minHeight: 48, padding: '0 16px' }}
            onClick={() => { setForm(FORM_VACIO); setErrNuevo(''); setVerNuevo(true) }}
          >＋ Nuevo activo</button>
        )}
        <span className="meta" style={{ marginLeft: 'auto' }}>
          {ubicados.length} ubicados · {sinUbicar.length} sin ubicar
        </span>
      </div>

      {error && <div className="error-msg" style={{ textAlign: 'left', margin: '0 0 8px' }}>{error}</div>}
      {aviso && <div className="mant-aviso no-print">{aviso}</div>}

      <div className="mant-mapa-body">
        {/* ---------- Escenario del plano ---------- */}
        <div
          ref={stageRef}
          className={'mant-mapa-stage' + (editando ? ' editando' : '')}
          onPointerDown={downStage}
          onPointerMove={moveStage}
          onPointerUp={upStage}
          onPointerCancel={upStage}
        >
          {!planoSrc ? (
            <div className="empty">Esta planta no tiene plano cargado todavía.</div>
          ) : ancho > 0 && alto > 0 ? (
            <div
              ref={capaRef}
              className="mant-mapa-capa"
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
                  if (!planta?.plano_ancho_px || !planta?.plano_alto_px) {
                    setImgTam({ w: im.naturalWidth, h: im.naturalHeight })
                  }
                }}
                onError={() => setError('No se pudo cargar la imagen del plano.')}
              />
              {ubicados.map((a) => {
                const sec = sectorPorId.get(a.sector_id)
                const pos = borrador && borrador.id === a.id ? borrador : { x: a.x_pct ?? 0, y: a.y_pct ?? 0 }
                const clases = ['mant-pin']
                if (a.criticidad === 'A') clases.push('mant-pin-crit-a')
                if (a.id === seleccionId) clases.push('mant-pin-sel')
                if (editando) clases.push('mant-pin-editable')
                return (
                  <div
                    key={a.id}
                    className={clases.join(' ')}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%`, color: sec?.color ?? '#94a3b8', transform: `translate(-50%, -50%) scale(${1 / vista.k})` }}
                    title={`${a.id} · ${a.nombre}`}
                    onPointerDown={(e) => downPin(e, a)}
                    onPointerMove={(e) => movePin(e, a)}
                    onPointerUp={(e) => upPin(e, a)}
                    onPointerCancel={(e) => upPin(e, a)}
                  >
                    <div className="mant-pin-caja">
                      <SimboloActivo simbolo={a.simbolo} size={26} />
                    </div>
                    {vista.k >= ZOOM_ETIQUETAS && <span className="mant-pin-label">{a.id}</span>}
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
        </div>

        {/* ---------- Panel lateral ---------- */}
        <aside className="mant-mapa-side">
          {seleccion && ficha ? (
            <div className="mant-ficha">
              <div className="card-header" style={{ marginBottom: 6 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{seleccion.id}</h3>
                  <div className="meta">
                    {sectorPorId.get(seleccion.sector_id)?.nombre ?? seleccion.sector_id}
                    {seleccion.subarea ? ` · ${seleccion.subarea}` : ''}
                  </div>
                </div>
                <button className="btn" style={{ minHeight: 36, padding: '0 10px' }} onClick={() => setSeleccionId(null)} aria-label="Cerrar ficha">✕</button>
              </div>

              {editando ? (
                <>
                  <div className="field">
                    <label>Nombre</label>
                    <input className="input" style={{ minHeight: 44 }} value={ficha.nombre} onChange={(e) => setFicha({ ...ficha, nombre: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Criticidad</label>
                    <select className="input" style={{ minHeight: 44 }} value={ficha.criticidad} onChange={(e) => setFicha({ ...ficha, criticidad: e.target.value as Criticidad })}>
                      {CRITICIDADES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Símbolo</label>
                    <select className="input" style={{ minHeight: 44 }} value={ficha.simbolo} onChange={(e) => setFicha({ ...ficha, simbolo: e.target.value })}>
                      {SIMBOLOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Notas</label>
                    <textarea className="input" style={{ minHeight: 80, padding: '10px 14px' }} value={ficha.notas} onChange={(e) => setFicha({ ...ficha, notas: e.target.value })} />
                  </div>
                  <div className="row-actions">
                    <button className="btn btn-verde" style={{ flex: 1, minHeight: 44 }} disabled={guardando} onClick={() => void guardarFicha()}>💾 Guardar</button>
                    {seleccion.x_pct != null && (
                      <button className="btn" style={{ flex: 1, minHeight: 44 }} onClick={() => void quitarDelMapa()}>📤 Quitar del mapa</button>
                    )}
                  </div>
                </>
              ) : (
                <div className="meta" style={{ lineHeight: 1.7 }}>
                  <div><strong>{seleccion.nombre}</strong></div>
                  {seleccion.tipo && <div>Tipo: <strong>{seleccion.tipo}</strong></div>}
                  <div>Criticidad: <strong>{CRITICIDADES.find((c) => c.id === seleccion.criticidad)?.label ?? seleccion.criticidad}</strong></div>
                  <div>Símbolo: <strong>{simboloLabel(seleccion.simbolo)}</strong></div>
                  {seleccion.iit_ref && <div>IIT: <strong>{seleccion.iit_ref}</strong></div>}
                  {seleccion.x_pct != null && <div>Posición: <strong>{Number(seleccion.x_pct).toFixed(1)}%, {Number(seleccion.y_pct ?? 0).toFixed(1)}%</strong></div>}
                  {seleccion.notas && <div style={{ marginTop: 6 }}><em>{seleccion.notas}</em></div>}
                  {seleccion.actualizado_por && <div style={{ marginTop: 6 }}>Última edición: {seleccion.actualizado_por}</div>}
                </div>
              )}
              {onVerFicha && (
                <div className="row-actions" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary btn-bloque" style={{ minHeight: 44 }} onClick={() => onVerFicha(seleccion.id)}>📄 Ver ficha completa</button>
                </div>
              )}
            </div>
          ) : (
            <div className="mant-ficha">
              <div className="section-title" style={{ margin: '0 0 8px', fontSize: '1rem' }}>Sectores</div>
              <div className="mant-leyenda">
                {leyenda.map(({ sector, total, ubicados: ub }) => (
                  <span key={sector.id} className="mant-chip" title={`${ub} de ${total} ubicados`}>
                    <i style={{ background: sector.color }} />
                    {sector.nombre} · {total}
                  </span>
                ))}
                {leyenda.length === 0 && <span className="meta">Sin activos en esta planta.</span>}
              </div>
              <div className="meta" style={{ marginTop: 8 }}>
                Los activos de criticidad <strong>A</strong> llevan aro naranja.
                {editando ? ' Arrastrá los pins para moverlos.' : ' Tocá un pin para ver su ficha.'}
              </div>
            </div>
          )}

          <div className="mant-bandeja">
            <div className="section-title" style={{ margin: '0 0 8px', fontSize: '1rem' }}>Sin ubicar ({sinUbicar.length})</div>
            {sinUbicar.length === 0 ? (
              <div className="meta">Todos los activos están en el plano. ✅</div>
            ) : (
              <>
                {editando && <div className="meta" style={{ marginBottom: 8 }}>Arrastrá un activo al plano para ubicarlo.</div>}
                {sinUbicar.map((a) => {
                  const sec = sectorPorId.get(a.sector_id)
                  return (
                    <div
                      key={a.id}
                      className={'mant-bandeja-item' + (editando ? ' arrastrable' : '')}
                      style={{ color: sec?.color ?? '#94a3b8' }}
                      onPointerDown={(e) => downTray(e, a)}
                      onClick={() => setSeleccionId(a.id)}
                      title={`${a.id} · ${a.nombre}`}
                    >
                      <SimboloActivo simbolo={a.simbolo} size={22} />
                      <span className="mant-bandeja-txt">
                        <strong>{a.id}</strong>
                        <span className="meta">{a.nombre}</span>
                      </span>
                      {a.criticidad === 'A' && <span className="mant-chip-a" title="Criticidad A">A</span>}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Fantasma del arrastre desde la bandeja */}
      {fantasma && (() => {
        const a = activos.find((x) => x.id === fantasma.id)
        if (!a) return null
        const sec = sectorPorId.get(a.sector_id)
        return (
          <div className="mant-fantasma" style={{ left: fantasma.cx, top: fantasma.cy, color: sec?.color ?? '#94a3b8' }}>
            <div className="mant-pin-caja"><SimboloActivo simbolo={a.simbolo} size={26} /></div>
          </div>
        )
      })()}

      {/* ---------- Modal: nuevo activo ---------- */}
      {verNuevo && (
        <div className="modal-overlay" onClick={() => setVerNuevo(false)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <h2>Nuevo activo · {planta?.nombre}</h2>
            <div className="field">
              <label>Código (único)</label>
              <input className="input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="HER-SOLD-10" />
            </div>
            <div className="field">
              <label>Nombre</label>
              <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Soldadora MIG 10" />
            </div>
            <div className="field">
              <label>Sector</label>
              <select className="input" value={form.sector_id} onChange={(e) => setForm({ ...form, sector_id: e.target.value })}>
                <option value="">— Elegir —</option>
                {sectores.map((s) => <option key={s.id} value={s.id}>{s.nombre} ({s.prefijo})</option>)}
              </select>
            </div>
            <div className="form-grid">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Subárea</label>
                <input className="input" value={form.subarea} onChange={(e) => setForm({ ...form, subarea: e.target.value })} placeholder="BOX2 Soldadura Manual" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Tipo</label>
                <input className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="Soldadura" />
              </div>
            </div>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Símbolo</label>
                <select className="input" value={form.simbolo} onChange={(e) => setForm({ ...form, simbolo: e.target.value })}>
                  {SIMBOLOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Criticidad</label>
                <select className="input" value={form.criticidad} onChange={(e) => setForm({ ...form, criticidad: e.target.value as Criticidad })}>
                  {CRITICIDADES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            </div>
            {errNuevo && <div className="error-msg" style={{ textAlign: 'left' }}>{errNuevo}</div>}
            <div className="row-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-verde" style={{ flex: 1 }} disabled={guardando} onClick={() => void crearActivo()}>✔ Crear activo</button>
              <button className="btn" onClick={() => setVerNuevo(false)}>Cancelar</button>
            </div>
            <div className="meta" style={{ marginTop: 10 }}>El activo se crea sin posición: aparece en la bandeja "Sin ubicar".</div>
          </div>
        </div>
      )}
    </div>
  )
}
