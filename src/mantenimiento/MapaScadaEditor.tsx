import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { esSuperAdmin } from '../auth/roles'
import { OT_ABIERTAS } from './types'
import type {
  MantActivo, MantAnotacion, MantAviso, MantBloque, MantOT, MantPlanta, BloqueTipo,
} from './types'
import { ESTADOS, ESTADO_ORDEN, mapaDeEstados, type Estado } from './estado'
import { cargarAlertasTempranas } from './alertas'

// ============================================================
// MAPA SCADA · LAYOUT EDITABLE (v1.65)
// El plano es 100% dato: bloques (mant_bloques) + pines de estado
// (mant_activos.x_pct/y_pct) + anotaciones de dibujo (mant_anotaciones).
//   - Operación: cualquier autenticado ve el estado en vivo.
//   - Edición  : SOLO admin (rol 'mantenimiento' o super admin). Tres capas:
//       Bloques  -> mover / redimensionar / renombrar / recolorear.
//       Máquinas -> posicionar los pines (guarda x_pct/y_pct).
//       Dibujo   -> líneas / círculos / texto; mover, cortar, borrar.
// Realtime: avisos + OT recalculan el semáforo de los pines.
// ============================================================

const VBW = 2800, VBH = 780
const COLORES = ['#22d3ee', '#f5a524', '#dbe4f0', '#22c55e', '#ef4444', '#a855f7', '#3b82f6', '#eab308']
type Herramienta = 'sel' | 'linea' | 'circulo' | 'texto' | 'borrador'
type Capa = 'bloques' | 'maquinas' | 'dibujo'
const TOOLS: { id: Herramienta; label: string }[] = [
  { id: 'sel', label: '▹ Seleccionar' }, { id: 'linea', label: '╱ Línea' },
  { id: 'circulo', label: '◯ Círculo' }, { id: 'texto', label: 'A Texto' }, { id: 'borrador', label: '🧽 Borrador' },
]
const CAT: { id: BloqueTipo; label: string }[] = [
  { id: 'muro', label: 'Muro / circulación' }, { id: 'maquina', label: 'Maquinaria' },
  { id: 'estanteria', label: 'Estantería / estructura' }, { id: 'zona', label: 'Zona (rótulo)' },
]

export default function MapaScadaEditor({ onVerFicha }: { onVerFicha?: (id: string) => void }) {
  const { usuario } = useAuth()
  const puedeEditar = !!usuario && (usuario.rol === 'mantenimiento' || esSuperAdmin(usuario))

  const [plantas, setPlantas] = useState<MantPlanta[]>([])
  const [plantaId, setPlantaId] = useState('')
  const [bloques, setBloques] = useState<MantBloque[]>([])
  const [anotaciones, setAnotaciones] = useState<MantAnotacion[]>([])
  const [activos, setActivos] = useState<MantActivo[]>([])
  const [avisos, setAvisos] = useState<MantAviso[]>([])
  const [ots, setOts] = useState<MantOT[]>([])
  // P6: ids de activos con alerta temprana (amarillo por paradas repetidas).
  const [alertas, setAlertas] = useState<Set<string>>(new Set())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [modo, setModo] = useState<'operacion' | 'edicion'>('operacion')
  const [capa, setCapa] = useState<Capa>('bloques')
  const [herramienta, setHerramienta] = useState<Herramienta>('sel')
  const [color, setColor] = useState('#22d3ee')
  const [selBloque, setSelBloque] = useState<string | null>(null)
  const [selMaquina, setSelMaquina] = useState<string | null>(null)
  const [selAnot, setSelAnot] = useState<string | null>(null)
  const [draw, setDraw] = useState<{ tipo: 'linea' | 'circulo'; x0: number; y0: number; x1: number; y1: number } | null>(null)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<Record<string, unknown> | null>(null)
  const clip = useRef<MantAnotacion | null>(null)
  const sb = supabase

  const planta = useMemo(() => plantas.find((p) => p.id === plantaId) ?? null, [plantas, plantaId])
  const ubicados = useMemo(() => activos.filter((a) => a.activo && a.x_pct != null && a.y_pct != null), [activos])
  const estadoPorActivo = useMemo(() => {
    const ids = new Set(activos.map((a) => a.id))
    return mapaDeEstados(avisos.filter((a) => ids.has(a.activo_id)), ots.filter((o) => ids.has(o.activo_id)), alertas)
  }, [avisos, ots, activos, alertas])
  const estadoDe = useCallback((id: string): Estado => estadoPorActivo.get(id) ?? 'ok', [estadoPorActivo])

  const edB = modo === 'edicion' && capa === 'bloques' && puedeEditar
  const edM = modo === 'edicion' && capa === 'maquinas' && puedeEditar
  const edD = modo === 'edicion' && capa === 'dibujo' && puedeEditar
  const dibInteractivo = edD && (herramienta === 'sel' || herramienta === 'borrador')

  // ---------- Carga ----------
  useEffect(() => {
    if (!sb) { setCargando(false); return }
    let vivo = true
    ;(async () => {
      const { data: ps } = await sb.from('mant_plantas').select('*').eq('activa', true).order('orden')
      if (!vivo) return
      const lista = (ps ?? []) as MantPlanta[]
      setPlantas(lista)
      const ini = lista.find((p) => p.id === 'cerdan_n1') ?? lista[0]
      if (ini) setPlantaId(ini.id); else setCargando(false)
    })()
    return () => { vivo = false }
  }, [sb])

  const cargarPlanta = useCallback(async (pid: string) => {
    if (!sb) return
    setCargando(true); setError('')
    const [{ data: bs }, { data: an }, { data: ac }] = await Promise.all([
      sb.from('mant_bloques').select('*').eq('planta_id', pid).order('orden'),
      sb.from('mant_anotaciones').select('*').eq('planta_id', pid),
      sb.from('mant_activos').select('id, nombre, sector_id, planta_id, simbolo, criticidad, x_pct, y_pct, activo').eq('planta_id', pid),
    ])
    setBloques((bs ?? []) as MantBloque[])
    setAnotaciones((an ?? []) as MantAnotacion[])
    setActivos((ac ?? []) as MantActivo[])
    setCargando(false)
  }, [sb])

  const cargarEstados = useCallback(async () => {
    if (!sb) return
    const [{ data: av }, { data: ot }] = await Promise.all([
      sb.from('mant_avisos').select('*').eq('estado', 'nuevo'),
      sb.from('mant_ordenes_trabajo').select('*').in('estado', OT_ABIERTAS),
    ])
    setAvisos((av ?? []) as MantAviso[])
    setOts((ot ?? []) as MantOT[])
  }, [sb])

  // P6: alertas tempranas (una query agrupada de paradas; nunca rompe).
  const cargarAlertas = useCallback(async () => {
    const m = await cargarAlertasTempranas()
    setAlertas(new Set(m.keys()))
  }, [])

  useEffect(() => {
    if (!plantaId) return
    setSelBloque(null); setSelMaquina(null); setSelAnot(null)
    void cargarPlanta(plantaId); void cargarEstados(); void cargarAlertas()
  }, [plantaId, cargarPlanta, cargarEstados, cargarAlertas])

  useEffect(() => {
    if (!sb || !plantaId) return
    const canal = sb.channel('mant-scada-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mant_avisos' }, () => { void cargarEstados() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mant_ordenes_trabajo' }, () => { void cargarEstados() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paradas' }, () => { void cargarAlertas() })
      .subscribe()
    return () => { void sb.removeChannel(canal) }
  }, [sb, plantaId, cargarEstados, cargarAlertas])

  // ---------- Helpers de coordenadas ----------
  function rect() { return stageRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1) }
  const pctX = (px: number) => (px / rect().width) * 100
  const pctY = (px: number) => (px / rect().height) * 100
  function toVB(cx: number, cy: number) { const r = rect(); return { x: (cx - r.left) / r.width * VBW, y: (cy - r.top) / r.height * VBH } }

  // ---------- Persistencia ----------
  async function patchBloque(id: string, patch: Partial<MantBloque>) {
    if (!sb) return
    setBloques((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
    const { error: e } = await sb.from('mant_bloques').update({ ...patch, actualizado_en: new Date().toISOString(), actualizado_por: usuario?.usuario ?? null }).eq('id', id)
    if (e) setError('No se pudo guardar el bloque.')
  }
  async function patchActivoPos(id: string, x: number, y: number) {
    if (!sb) return
    setActivos((prev) => prev.map((a) => (a.id === id ? { ...a, x_pct: x, y_pct: y } : a)))
    const { error: e } = await sb.from('mant_activos').update({ x_pct: x, y_pct: y, actualizado_en: new Date().toISOString(), actualizado_por: usuario?.usuario ?? null }).eq('id', id)
    if (e) setError('No se pudo guardar la posición de la máquina.')
  }
  async function insertAnot(a: Omit<MantAnotacion, 'id'>) {
    if (!sb) return
    const { data, error: e } = await sb.from('mant_anotaciones').insert({ ...a, creado_por: usuario?.usuario ?? null }).select('*').single()
    if (e || !data) { setError('No se pudo guardar el dibujo.'); return }
    setAnotaciones((prev) => [...prev, data as MantAnotacion])
    setSelAnot((data as MantAnotacion).id)
  }
  async function patchAnot(id: string, patch: Partial<MantAnotacion>) {
    if (!sb) return
    setAnotaciones((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
    await sb.from('mant_anotaciones').update(patch).eq('id', id)
  }
  async function delAnot(id: string) {
    if (!sb) return
    setAnotaciones((prev) => prev.filter((a) => a.id !== id))
    if (selAnot === id) setSelAnot(null)
    await sb.from('mant_anotaciones').delete().eq('id', id)
  }

  // ---------- Drag de bloques / máquinas / anotaciones ----------
  function downBloque(e: React.PointerEvent, b: MantBloque) {
    if (!edB) return
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragRef.current = { kind: 'bloque', id: b.id, sx: e.clientX, sy: e.clientY, ox: b.x, oy: b.y, movio: false }
  }
  function downResize(e: React.PointerEvent, b: MantBloque) {
    if (!edB) return
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragRef.current = { kind: 'resize', id: b.id, sx: e.clientX, sy: e.clientY, ow: b.w, oh: b.h }
  }
  function downMaquina(e: React.PointerEvent, a: MantActivo) {
    if (!edM) return
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    dragRef.current = { kind: 'maquina', id: a.id, sx: e.clientX, sy: e.clientY, ox: a.x_pct ?? 0, oy: a.y_pct ?? 0, movio: false }
  }
  function downAnot(e: React.PointerEvent, a: MantAnotacion) {
    if (!edD) return
    e.stopPropagation()
    if (herramienta === 'borrador') { void delAnot(a.id); return }
    if (herramienta !== 'sel') return
    setSelAnot(a.id)
    dragRef.current = { kind: 'anot', id: a.id, sx: e.clientX, sy: e.clientY, o: JSON.parse(JSON.stringify(a)), movio: false }
  }

  function onMove(e: React.PointerEvent) {
    if (draw) { const p = toVB(e.clientX, e.clientY); setDraw({ ...draw, x1: p.x, y1: p.y }); return }
    const d = dragRef.current
    if (!d) return
    if (d.kind === 'resize') {
      const dx = pctX(e.clientX - (d.sx as number)), dy = pctY(e.clientY - (d.sy as number))
      setBloques((prev) => prev.map((b) => (b.id === d.id ? { ...b, w: Math.max(1.5, +(( d.ow as number) + dx).toFixed(2)), h: Math.max(2.5, +((d.oh as number) + dy).toFixed(2)) } : b)))
      return
    }
    const dxp = pctX(e.clientX - (d.sx as number)), dyp = pctY(e.clientY - (d.sy as number))
    if (Math.abs(e.clientX - (d.sx as number)) + Math.abs(e.clientY - (d.sy as number)) > 3) d.movio = true
    if (d.kind === 'bloque') {
      const nx = Math.max(0, Math.min(100, (d.ox as number) + dxp)), ny = Math.max(0, Math.min(100, (d.oy as number) + dyp))
      setBloques((prev) => prev.map((b) => (b.id === d.id ? { ...b, x: +nx.toFixed(2), y: +ny.toFixed(2) } : b)))
    } else if (d.kind === 'maquina') {
      const nx = Math.max(0, Math.min(100, (d.ox as number) + dxp)), ny = Math.max(0, Math.min(100, (d.oy as number) + dyp))
      setActivos((prev) => prev.map((a) => (a.id === d.id ? { ...a, x_pct: +nx.toFixed(2), y_pct: +ny.toFixed(2) } : a)))
    } else if (d.kind === 'anot') {
      const p = toVB(e.clientX, e.clientY), q = toVB(d.sx as number, d.sy as number)
      const ddx = p.x - q.x, ddy = p.y - q.y, o = d.o as MantAnotacion
      setAnotaciones((prev) => prev.map((a) => {
        if (a.id !== d.id) return a
        if (a.tipo === 'linea') return { ...a, x1: (o.x1 ?? 0) + ddx, y1: (o.y1 ?? 0) + ddy, x2: (o.x2 ?? 0) + ddx, y2: (o.y2 ?? 0) + ddy }
        if (a.tipo === 'circulo') return { ...a, cx: (o.cx ?? 0) + ddx, cy: (o.cy ?? 0) + ddy }
        return { ...a, x: (o.x ?? 0) + ddx, y: (o.y ?? 0) + ddy }
      }))
    }
  }

  function onUp() {
    if (draw) { finalizarDraw(); return }
    const d = dragRef.current; dragRef.current = null
    if (!d) return
    if (d.kind === 'resize') { const b = bloques.find((x) => x.id === d.id); if (b) void patchBloque(b.id, { w: b.w, h: b.h }); return }
    if (!d.movio) {
      if (d.kind === 'bloque') { const b = bloques.find((x) => x.id === d.id); if (b) abrirBloque(b) }
      return
    }
    if (d.kind === 'bloque') { const b = bloques.find((x) => x.id === d.id); if (b) void patchBloque(b.id, { x: b.x, y: b.y }) }
    else if (d.kind === 'maquina') { const a = activos.find((x) => x.id === d.id); if (a && a.x_pct != null && a.y_pct != null) void patchActivoPos(a.id, a.x_pct, a.y_pct) }
    else if (d.kind === 'anot') { const a = anotaciones.find((x) => x.id === d.id); if (a) void patchAnot(a.id, a) }
  }

  // ---------- Dibujo ----------
  function onStageDown(e: React.PointerEvent) {
    // clic en el fondo
    if (modo === 'operacion') { setSelMaquina(null); return }
    if (capa === 'bloques') { setSelBloque(null); return }
    if (capa !== 'dibujo') return
    if (herramienta === 'sel') { setSelAnot(null); return }
    const p = toVB(e.clientX, e.clientY)
    if (herramienta === 'texto') {
      const t = window.prompt('Texto de la anotación:'); if (!t) return
      void insertAnot({ planta_id: plantaId, tipo: 'texto', color, x1: null, y1: null, x2: null, y2: null, cx: null, cy: null, r: null, x: p.x, y: p.y, texto: t, tam: 20 })
      return
    }
    if (herramienta === 'linea' || herramienta === 'circulo') {
      stageRef.current?.setPointerCapture(e.pointerId)
      setDraw({ tipo: herramienta, x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    }
  }
  function finalizarDraw() {
    const d = draw; setDraw(null)
    if (!d) return
    if (d.tipo === 'linea') {
      if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) < 6) return
      void insertAnot({ planta_id: plantaId, tipo: 'linea', color, x1: d.x0, y1: d.y0, x2: d.x1, y2: d.y1, cx: null, cy: null, r: null, x: null, y: null, texto: null, tam: null })
    } else {
      const r = Math.hypot(d.x1 - d.x0, d.y1 - d.y0); if (r < 6) return
      void insertAnot({ planta_id: plantaId, tipo: 'circulo', color, x1: null, y1: null, x2: null, y2: null, cx: d.x0, cy: d.y0, r, x: null, y: null, texto: null, tam: null })
    }
  }

  // clipboard
  function copiar() { const a = anotaciones.find((x) => x.id === selAnot); if (a) clip.current = JSON.parse(JSON.stringify(a)) }
  function cortar() { const a = anotaciones.find((x) => x.id === selAnot); if (a) { clip.current = JSON.parse(JSON.stringify(a)); void delAnot(a.id) } }
  function pegar() {
    const c = clip.current; if (!c) return
    const off = 30
    const base = { planta_id: plantaId, tipo: c.tipo, color: c.color,
      x1: c.x1 != null ? c.x1 + off : null, y1: c.y1 != null ? c.y1 + off : null, x2: c.x2 != null ? c.x2 + off : null, y2: c.y2 != null ? c.y2 + off : null,
      cx: c.cx != null ? c.cx + off : null, cy: c.cy != null ? c.cy + off : null, r: c.r,
      x: c.x != null ? c.x + off : null, y: c.y != null ? c.y + off : null, texto: c.texto, tam: c.tam }
    void insertAnot(base)
  }
  function borrarSel() { if (selAnot) void delAnot(selAnot) }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!edD) return
      const tag = (e.target as HTMLElement)?.tagName ?? ''
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || document.querySelector('.modal-overlay')) return
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selAnot) { e.preventDefault(); borrarSel() } return }
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase()
        if (k === 'x') { e.preventDefault(); cortar() }
        else if (k === 'c') { e.preventDefault(); copiar() }
        else if (k === 'v') { e.preventDefault(); pegar() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edD, selAnot])

  // ---------- Modal de bloque ----------
  const [modalBloque, setModalBloque] = useState<{ b: MantBloque | null } | null>(null)
  function abrirBloque(b: MantBloque | null) { setModalBloque({ b }) }

  async function guardarModalBloque(nombre: string, tipo: BloqueTipo) {
    if (!sb) return
    const m = modalBloque
    if (!m) return
    if (m.b) { await patchBloque(m.b.id, { nombre, tipo }) }
    else {
      const nuevo = { planta_id: plantaId, tipo, nombre, x: 45, y: 45, w: 10, h: 12, orden: bloques.length }
      const { data, error: e } = await sb.from('mant_bloques').insert(nuevo).select('*').single()
      if (e || !data) { setError('No se pudo crear el bloque.'); return }
      setBloques((prev) => [...prev, data as MantBloque])
      setSelBloque((data as MantBloque).id)
    }
    setModalBloque(null)
  }
  async function borrarBloque() {
    if (!sb || !modalBloque?.b) return
    const id = modalBloque.b.id
    setBloques((prev) => prev.filter((b) => b.id !== id)); setModalBloque(null); setSelBloque(null)
    await sb.from('mant_bloques').delete().eq('id', id)
  }

  if (!sb) return <div className="empty">Supabase no está configurado (faltan credenciales en .env).</div>

  const resumen = ESTADO_ORDEN.map((id) => ({
    id, n: ubicados.filter((a) => estadoDe(a.id) === id).length,
  }))

  return (
    <div className="scada">
      {/* Barra superior */}
      <div className="scada-top no-print">
        <div className="section-title" style={{ margin: 0 }}>🛰️ SCADA · Nave</div>
        <select className="select" value={plantaId} onChange={(e) => setPlantaId(e.target.value)} aria-label="Planta">
          {plantas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {puedeEditar && (
          <div className="scada-switch">
            <button className={modo === 'operacion' ? 'on' : ''} onClick={() => setModo('operacion')}>🛰️ Operación</button>
            <button className={modo === 'edicion' ? 'on' : ''} onClick={() => setModo('edicion')}>✏️ Edición</button>
          </div>
        )}
        {modo === 'edicion' && puedeEditar && (
          <div className="scada-switch capa">
            {(['bloques', 'maquinas', 'dibujo'] as Capa[]).map((c) => (
              <button key={c} className={capa === c ? 'on' : ''} onClick={() => { setCapa(c); setSelAnot(null); setSelBloque(null) }}>
                {c === 'bloques' ? '▧ Bloques' : c === 'maquinas' ? '⚙ Máquinas' : '✎ Dibujo'}
              </button>
            ))}
          </div>
        )}
        {edB && <button className="btn btn-primary" style={{ minHeight: 40 }} onClick={() => abrirBloque(null)}>＋ Bloque</button>}
        <div className="scada-leyenda" style={{ marginLeft: 'auto' }}>
          {resumen.map((r) => (
            <span key={r.id} className="mant-chip"><i style={{ background: ESTADOS[r.id].color }} />{ESTADOS[r.id].label} · {r.n}</span>
          ))}
        </div>
      </div>

      {/* Barra de dibujo */}
      {edD && (
        <div className="scada-dibujo no-print">
          {TOOLS.map((t) => (
            <button key={t.id} className={'scada-tool' + (herramienta === t.id ? ' on' : '')} onClick={() => { setHerramienta(t.id); setSelAnot(null) }}>{t.label}</button>
          ))}
          <span className="scada-sep" />
          {COLORES.map((c) => (
            <button key={c} className={'scada-swatch' + (color === c ? ' on' : '')} style={{ background: c }} title={c}
              onClick={() => { setColor(c); if (selAnot) void patchAnot(selAnot, { color: c }) }} />
          ))}
          <input type="color" value={color} onChange={(e) => { setColor(e.target.value); if (selAnot) void patchAnot(selAnot, { color: e.target.value }) }} style={{ width: 34, height: 30, border: 'none', background: 'none', cursor: 'pointer' }} />
          <span className="scada-sep" />
          <button className="scada-tool" onClick={cortar}>✂ Cortar</button>
          <button className="scada-tool" onClick={pegar}>📋 Pegar</button>
          <button className="scada-tool" onClick={borrarSel}>🗑 Borrar</button>
        </div>
      )}

      {error && <div className="error-msg" style={{ textAlign: 'left', margin: '6px 0' }}>{error}</div>}

      {/* Escenario */}
      <div
        ref={stageRef}
        className={'scada-stage' + (modo === 'operacion' ? ' op' : '') + (edD && herramienta !== 'sel' && herramienta !== 'borrador' ? ' dibujando' : '')}
        onPointerDown={onStageDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {cargando && <div className="empty">Cargando plano…</div>}

        {/* Bloques */}
        {bloques.map((b) => (
          <div
            key={b.id}
            className={'scada-bloque b-' + b.tipo + (edB ? ' editable' : ' inerte') + (b.id === selBloque && edB ? ' sel' : '')}
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
            title={b.nombre}
            onPointerDown={(e) => downBloque(e, b)}
          >
            <span>{b.nombre}</span>
            {edB && <span className="scada-rz" onPointerDown={(e) => downResize(e, b)} />}
          </div>
        ))}

        {/* Anotaciones: líneas + círculos */}
        <svg className={'scada-dib' + (dibInteractivo ? ' activa' : '')} viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none">
          {anotaciones.filter((a) => a.tipo !== 'texto').map((a) => (
            a.tipo === 'linea' ? (
              <line key={a.id} x1={a.x1 ?? 0} y1={a.y1 ?? 0} x2={a.x2 ?? 0} y2={a.y2 ?? 0}
                stroke={a.color} strokeWidth={4} strokeLinecap="round"
                className={'scada-shape' + (a.id === selAnot ? ' sel' : '')} onPointerDown={(e) => downAnot(e, a)} />
            ) : (
              <circle key={a.id} cx={a.cx ?? 0} cy={a.cy ?? 0} r={a.r ?? 0} fill="none"
                stroke={a.color} strokeWidth={3} className={'scada-shape' + (a.id === selAnot ? ' sel' : '')} onPointerDown={(e) => downAnot(e, a)} />
            )
          ))}
          {draw && (draw.tipo === 'linea'
            ? <line x1={draw.x0} y1={draw.y0} x2={draw.x1} y2={draw.y1} stroke={color} strokeWidth={4} strokeDasharray="6 5" />
            : <circle cx={draw.x0} cy={draw.y0} r={Math.hypot(draw.x1 - draw.x0, draw.y1 - draw.y0)} fill="none" stroke={color} strokeWidth={3} strokeDasharray="6 5" />)}
        </svg>

        {/* Anotaciones: texto */}
        <div className={'scada-dib-txt' + (dibInteractivo ? ' activa' : '')}>
          {anotaciones.filter((a) => a.tipo === 'texto').map((a) => (
            <div key={a.id} className={'scada-texto' + (a.id === selAnot ? ' sel' : '')}
              style={{ left: `${(a.x ?? 0) / VBW * 100}%`, top: `${(a.y ?? 0) / VBH * 100}%`, color: a.color, fontSize: (a.tam ?? 18) }}
              onPointerDown={(e) => downAnot(e, a)}>{a.texto}</div>
          ))}
        </div>

        {/* Máquinas (pines) */}
        {ubicados.map((a) => {
          const est = estadoDe(a.id)
          return (
            <div
              key={a.id}
              className={'scada-pin e-' + est + (edM ? ' editable' : '') + (a.id === selMaquina ? ' sel' : '')}
              style={{ left: `${a.x_pct}%`, top: `${a.y_pct}%`, ['--c' as string]: ESTADOS[est].color }}
              title={`${a.id} · ${a.nombre} — ${ESTADOS[est].label}`}
              onPointerDown={(e) => downMaquina(e, a)}
              onClick={(e) => { if (modo === 'operacion') { e.stopPropagation(); setSelMaquina(a.id) } }}
            >
              <span className="scada-pin-dot" />
              <span className="scada-pin-tag">{a.id}</span>
            </div>
          )
        })}

        {/* Popover */}
        {modo === 'operacion' && selMaquina && (() => {
          const a = activos.find((x) => x.id === selMaquina); if (!a) return null
          const est = estadoDe(a.id)
          return (
            <div className="scada-pop" style={{ left: `${a.x_pct}%`, top: `${a.y_pct}%` }} onPointerDown={(e) => e.stopPropagation()}>
              <h4>{a.nombre}</h4>
              <div className="meta">{a.id}</div>
              <span className="scada-badge" style={{ color: ESTADOS[est].color }}><i style={{ background: ESTADOS[est].color }} />{ESTADOS[est].label}</span>
              <div className="row-actions" style={{ marginTop: 10 }}>
                {onVerFicha && <button className="btn btn-primary" style={{ flex: 1, minHeight: 40 }} onClick={() => onVerFicha(a.id)}>📄 Ficha / Crear OT</button>}
                <button className="btn" style={{ minHeight: 40 }} onClick={() => setSelMaquina(null)}>✕</button>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Modal de bloque */}
      {modalBloque && (
        <BloqueModal
          bloque={modalBloque.b}
          onCancelar={() => setModalBloque(null)}
          onGuardar={guardarModalBloque}
          onBorrar={modalBloque.b ? borrarBloque : undefined}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------
function BloqueModal({ bloque, onCancelar, onGuardar, onBorrar }: {
  bloque: MantBloque | null
  onCancelar: () => void
  onGuardar: (nombre: string, tipo: BloqueTipo) => void
  onBorrar?: () => void
}) {
  const [nombre, setNombre] = useState(bloque?.nombre ?? '')
  const [tipo, setTipo] = useState<BloqueTipo>(bloque?.tipo ?? 'maquina')
  const [err, setErr] = useState('')
  return (
    <div className="modal-overlay" onClick={onCancelar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{bloque ? 'Editar bloque' : 'Nuevo bloque'}</h2>
        <div className="field">
          <label>Nombre</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Flejadora" />
        </div>
        <div className="field">
          <label>Categoría</label>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as BloqueTipo)}>
            {CAT.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        {err && <div className="error-msg" style={{ textAlign: 'left' }}>{err}</div>}
        <div className="row-actions" style={{ marginTop: 14 }}>
          {onBorrar && <button className="btn btn-rojo" style={{ marginRight: 'auto' }} onClick={onBorrar}>🗑 Borrar</button>}
          <button className="btn" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-verde" onClick={() => { if (!nombre.trim()) { setErr('El nombre es obligatorio.'); return } onGuardar(nombre.trim(), tipo) }}>
            {bloque ? 'Guardar' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}
