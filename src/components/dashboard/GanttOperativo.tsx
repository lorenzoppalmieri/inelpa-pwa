import { type PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from 'react'
import type { Tarea, EstadoTarea, Maquina } from '../../types'
import { sectorById, causaLabel, esParadaNoProductiva, esSectorBobinado } from '../../types'
import { componentePorCodigo } from '../../data/catalogo'
import { hhmm, fmtDur, isoWeek, minutosEntre } from '../../lib/time'
import { proximoInstanteLaborable, tramosLaborables, calcularTiempoNetoProductivo, type GrupoAlmuerzo } from '../../lib/calendario'
import { programar, type Plan } from '../../lib/programacion'
import { minutosNoProductivos, minutosParada } from '../../lib/kpi'
import { guardarTarea } from '../../sync/syncEngine'

// Ventana horaria visible de cada dia (turno de planta: 07:00 - 17:00 reloj
// visible). La franja 16:00-17:00 es recuperacion de horas y cuenta como
// produccion estandar (definida en lib/calendario.ts).
const H_INI = 7
const H_FIN = 17
const DAY_MIN = (H_FIN - H_INI) * 60 // 600
const PX_HORA: Record<number, number> = { 1: 150, 2: 92, 4: 58 }
const SIN_ASIGNAR = '__sin__'

const COLOR: Record<EstadoTarea, string> = {
  pendiente: 'var(--estado-pendiente)',
  en_proceso: 'var(--estado-proceso)',
  pausada: 'var(--estado-pausa)',
  finalizada: 'var(--estado-fin)',
}

function minClock(d: Date): number { return d.getHours() * 60 + d.getMinutes() }
function mismaFecha(a: Date, b: Date): boolean { return a.toDateString() === b.toDateString() }

// v1.17: resumen de paradas de una tarea para el tooltip de la barra (causa +
// horario inicio-fin + duracion). Marca el almuerzo/pausa como no productivo.
function resumenParadas(t: Tarea): string {
  if (!t.paradas?.length) return ''
  const lineas = t.paradas.map((p) => {
    const etq = causaLabel(p.causa) + (esParadaNoProductiva(p.causa) ? ' (almuerzo/pausa)' : '')
    return p.fin
      ? `• ${etq}: ${hhmm(p.inicio)}–${hhmm(p.fin)} (${fmtDur(minutosEntre(p.inicio, p.fin))})`
      : `• ${etq}: desde ${hhmm(p.inicio)} · en curso`
  })
  return `\n— Paradas —\n${lineas.join('\n')}`
}

function lunesDeSemana(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0)
  const dow = (r.getDay() + 6) % 7
  r.setDate(r.getDate() - dow)
  return r
}
function sumarDias(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }

// Bandas NO productivas de un dia (complemento de tramos laborables en [7,17]).
function bandasMuertasDia(day: Date, grupo: GrupoAlmuerzo): { ini: number; fin: number }[] {
  const tramos = tramosLaborables(day, grupo)
  const bands: { ini: number; fin: number }[] = []
  let cursor = H_INI * 60
  for (const t of tramos) {
    if (t.iniMin > cursor) bands.push({ ini: cursor, fin: t.iniMin })
    cursor = Math.max(cursor, t.finMin)
  }
  if (cursor < H_FIN * 60) bands.push({ ini: cursor, fin: H_FIN * 60 })
  return bands
}

// Parte un intervalo [start,end] en segmentos por dia visible (clip a 07:00-17:00).
function segmentosPorDia(startISO: string, endISO: string, dias: Date[]) {
  const s = new Date(startISO), e = new Date(endISO)
  const segs: { idx: number; ini: number; fin: number }[] = []
  dias.forEach((day, idx) => {
    const dayIni = new Date(day); dayIni.setHours(H_INI, 0, 0, 0)
    const dayFin = new Date(day); dayFin.setHours(H_FIN, 0, 0, 0)
    const segIni = s > dayIni ? s : dayIni
    const segFin = e < dayFin ? e : dayFin
    if (segFin.getTime() - segIni.getTime() > 60000) {
      segs.push({ idx, ini: minClock(segIni), fin: minClock(segFin) })
    }
  })
  return segs
}

interface Segmento { tarea: Tarea; idx: number; left: number; width: number; estimada: boolean; esInicio: boolean; plan: Plan; row: number }
// Apilado vertical de sub-filas dentro de un carril.
const FILA_TOP = 11   // offset de la 1ra fila (px)
const FILA_ALTO = 34  // alto de barra (28) + separacion (6)
const topDeFila = (row: number) => FILA_TOP + row * FILA_ALTO
interface Lane { id: string; label: string; sub?: string }
type Escala = 'semana' | 'dia'

export default function GanttOperativo({ tareas, agrupar, maquinas, operarios, nombreOperario, nombreMaquina, puedeMoverProduccion = true, soloLectura = false, onTareaClick }: {
  tareas: Tarea[]
  agrupar: 'sector' | 'operario' | 'maquina'
  maquinas: Maquina[]
  operarios: { id: string; nombre: string }[]
  nombreOperario: (id: string) => string
  nombreMaquina: (id: string) => string
  // v1.9: si es false (encargados), solo se pueden arrastrar tareas de reparacion.
  puedeMoverProduccion?: boolean
  // v1.11: modo 100% lectura (logistica): sin drag de ninguna barra.
  soloLectura?: boolean
  // v1.17: click en una barra -> abrir esa tarea en "Asignar tareas" (solo planificador).
  onTareaClick?: (t: Tarea) => void
}) {
  const ahora = new Date()
  const ahoraISO = ahora.toISOString()
  const [escala, setEscala] = useState<Escala>('semana')
  const [fechaSel, setFechaSel] = useState<string>(() => new Date().toLocaleDateString('en-CA'))
  const [bloque, setBloque] = useState<1 | 2 | 4>(2)
  // Turno de almuerzo activo en la vista (rota cada 15 dias por sector/linea).
  const [almuerzo, setAlmuerzo] = useState<GrupoAlmuerzo>('A')

  const diasSemana = useMemo(() => {
    const lun = lunesDeSemana(new Date())
    return Array.from({ length: 5 }, (_, i) => sumarDias(lun, i))
  }, [])
  const diaUnico = useMemo(() => new Date(`${fechaSel}T00:00:00`), [fechaSel])
  const dias = escala === 'semana' ? diasSemana : [diaUnico]
  const N = dias.length

  // El drag puede reasignar de carril (cambia maquina/operario) solo en esos modos.
  const reasignable = agrupar === 'maquina' || agrupar === 'operario'

  // Carril (lane) de una tarea segun el modo de agrupacion.
  function laneDeTarea(t: Tarea): string {
    if (agrupar === 'maquina') return t.maquinaId
    if (agrupar === 'operario') return t.operarioId ?? SIN_ASIGNAR
    return t.sectorId
  }

  // CARRILES (eje Y). En maquina/operario se muestran TODOS los del catalogo
  // (aunque esten vacios) para poder soltar tareas sobre ellos. En sector, los
  // sectores presentes en las tareas.
  const lanes = useMemo<Lane[]>(() => {
    if (agrupar === 'maquina') {
      return maquinas.map((m) => ({ id: m.id, label: m.nombre, sub: sectorById(m.sectorId).nombre }))
    }
    if (agrupar === 'operario') {
      const base = operarios.map((o) => ({ id: o.id, label: o.nombre }))
      const hayHuerfanas = tareas.some((t) => !t.operarioId)
      return hayHuerfanas ? [...base, { id: SIN_ASIGNAR, label: 'Sin asignar' }] : base
    }
    const ids = [...new Set(tareas.map((t) => t.sectorId))]
    return ids.map((id) => ({ id, label: sectorById(id).nombre })).sort((a, b) => a.label.localeCompare(b.label))
  }, [agrupar, maquinas, operarios, tareas])

  // Segmentos por carril (con auto-shift por maquina). v1.16: dentro de cada
  // carril, las tareas que se SOLAPAN en el tiempo se reparten en sub-filas
  // (packing por intervalos) para que no se pisen visualmente. Esto es clave en
  // Montaje Parte Activa / Post Horno, donde varias tareas corren en paralelo.
  const { segsPorLane, filasPorLane } = useMemo(() => {
    const plan = programar(tareas, ahoraISO, almuerzo)
    const map = new Map<string, Segmento[]>()
    const filas = new Map<string, number>()
    // Agrupar tareas por carril.
    const porLane = new Map<string, Tarea[]>()
    for (const t of tareas) { const id = laneDeTarea(t); const a = porLane.get(id) ?? []; a.push(t); porLane.set(id, a) }

    for (const [laneId, ts] of porLane) {
      const conPlan = ts.map((t) => ({ t, p: plan.get(t.id) }))
        .filter((x): x is { t: Tarea; p: Plan } => !!x.p)
        .sort((a, b) => (a.p.startISO < b.p.startISO ? -1 : a.p.startISO > b.p.startISO ? 1 : 0))
      // v1.17: BOBINADO produce 1 bobina por maquina -> NO hay paralelo: una sola
      // fila secuencial (el auto-shift ya encola las tareas con igual hora de
      // arranque). El apilado en sub-filas queda solo para sectores con paralelo
      // real (Montaje Parte Activa / Post Horno).
      const laneBobinado = ts.length > 0 && ts.every((t) => esSectorBobinado(t.sectorId))
      const rowDe = new Map<string, number>()
      if (laneBobinado) {
        for (const { t } of conPlan) rowDe.set(t.id, 0)
        filas.set(laneId, 1)
      } else {
        // Packing greedy: cada tarea va a la 1ra sub-fila libre (cuyo fin <= su inicio).
        const finDeFila: string[] = []
        for (const { t, p } of conPlan) {
          let r = finDeFila.findIndex((fin) => fin <= p.startISO)
          if (r === -1) { r = finDeFila.length; finDeFila.push(p.endISO) } else finDeFila[r] = p.endISO
          rowDe.set(t.id, r)
        }
        filas.set(laneId, Math.max(1, finDeFila.length))
      }

      const arr: Segmento[] = []
      for (const { t, p } of conPlan) {
        const segs = segmentosPorDia(p.startISO, p.endISO, dias)
        if (segs.length === 0) continue
        const startD = new Date(p.startISO)
        const row = rowDe.get(t.id) ?? 0
        for (const sg of segs) {
          const left = ((sg.idx + (sg.ini - H_INI * 60) / DAY_MIN) / N) * 100
          const width = Math.max(0.6, ((sg.fin - sg.ini) / DAY_MIN / N) * 100)
          const esInicio = mismaFecha(dias[sg.idx], startD) && sg.ini === minClock(startD)
          arr.push({ tarea: t, idx: sg.idx, left, width, estimada: p.estimada, esInicio, plan: p, row })
        }
      }
      map.set(laneId, arr)
    }
    return { segsPorLane: map, filasPorLane: filas }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tareas, agrupar, ahoraISO, dias, N, almuerzo])

  // ============================================================
  // Drag & Drop 2D: X = inicioPlanificado (hora/fecha), Y = carril (maquina u
  // operario). Se usa un "fantasma" flotante que sigue al cursor; al soltar se
  // resuelve el carril destino con elementFromPoint (data-lane-id) y el instante
  // con el bounding box de ese track. Persiste en Dexie (guardarTarea) y el
  // auto-shift reordena las tareas subsiguientes del carril en el proximo render.
  // ============================================================
  const dragRef = useRef<{ tarea: Tarea; grabPx: number } | null>(null)
  // v1.17: marca si hubo arrastre real (movimiento), para NO disparar el click de
  // navegacion cuando el usuario solo reprogramo una barra.
  const dragMovedRef = useRef(false)
  const [ghost, setGhost] = useState<{ id: string; x: number; y: number; w: number; label: string } | null>(null)

  function instanteDesdeFraccion(frac: number): Date {
    const fN = Math.max(0, Math.min(0.9999, frac)) * N
    const dayIdx = Math.min(N - 1, Math.max(0, Math.floor(fN)))
    const within = fN - dayIdx
    const minDia = H_INI * 60 + within * DAY_MIN
    const d = new Date(dias[dayIdx]); d.setHours(0, 0, 0, 0); d.setMinutes(Math.round(minDia))
    return d
  }

  function iniciarArrastre(e: ReactPointerEvent<HTMLDivElement>, b: Segmento) {
    if (b.tarea.estado !== 'pendiente' || !b.esInicio) return // solo tareas pendientes
    e.preventDefault()
    const track = e.currentTarget.parentElement as HTMLElement
    const rect = track.getBoundingClientRect()
    const barLeftPx = (b.left / 100) * rect.width
    const barWpx = Math.max(60, (b.width / 100) * rect.width)
    // offset del cursor respecto del borde izquierdo de la barra (precision en X)
    const grabPx = e.clientX - (rect.left + barLeftPx)
    dragRef.current = { tarea: b.tarea, grabPx }
    dragMovedRef.current = false
    setGhost({ id: b.tarea.id, x: e.clientX, y: e.clientY, w: barWpx, label: b.tarea.modelo })

    const onMove = (ev: PointerEvent) => { dragMovedRef.current = true; setGhost((g) => (g ? { ...g, x: ev.clientX, y: ev.clientY } : g)) }
    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      const s = dragRef.current
      dragRef.current = null
      if (!s) { setGhost(null); return }

      // Carril destino (eje Y) por la celda bajo el cursor.
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
      const laneEl = el?.closest('.gantt-track') as HTMLElement | null
      if (!laneEl) { setGhost(null); return } // soltado fuera de la grilla: cancelar
      const laneId = laneEl.dataset.laneId

      // Instante (eje X) por el bounding box del track destino.
      const rect = laneEl.getBoundingClientRect()
      const leftPx = Math.max(0, Math.min(ev.clientX - s.grabPx - rect.left, rect.width))
      const frac = leftPx / rect.width
      const cand = instanteDesdeFraccion(frac)
      const nowISO = new Date().toISOString()
      let candISO = cand.toISOString()
      if (candISO < nowISO) candISO = nowISO
      const snapped = proximoInstanteLaborable(candISO, almuerzo)

      const patch: Partial<Tarea> = { inicioPlanificado: snapped, semana: isoWeek(new Date(snapped)) }
      if (reasignable && laneId && laneId !== SIN_ASIGNAR) {
        if (agrupar === 'maquina') {
          patch.maquinaId = laneId
          const m = maquinas.find((x) => x.id === laneId)
          if (m) patch.sectorId = m.sectorId // mover de maquina mueve el sector consistentemente
        } else if (agrupar === 'operario') {
          patch.operarioId = laneId
        }
      }
      // Sin cambios reales: evitar escritura (y el re-render asociado).
      const sinCambios = patch.inicioPlanificado === s.tarea.inicioPlanificado &&
        (patch.maquinaId ?? s.tarea.maquinaId) === s.tarea.maquinaId &&
        (patch.operarioId ?? s.tarea.operarioId) === s.tarea.operarioId
      if (sinCambios) { setGhost(null); return }

      // Persistencia inmediata en Dexie + cola de sync; el fantasma se mantiene
      // hasta consolidar para evitar el "rubber-banding" del useLiveQuery.
      await guardarTarea({ ...s.tarea, ...patch })
      setGhost(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  const ahoraPct = (() => {
    const idx = dias.findIndex((d) => d.toDateString() === ahora.toDateString())
    if (idx < 0) return -1
    const cm = minClock(ahora)
    if (cm < H_INI * 60 || cm > H_FIN * 60) return -1
    return ((idx + (cm - H_INI * 60) / DAY_MIN) / N) * 100
  })()

  // v1.16: DEMORA SIN JUSTIFICAR = Tiempo Real - Tiempo Estimado (definicion
  // exacta de direccion; el Tiempo Real ya descuenta planta cerrada/almuerzo
  // pero NO las paradas). Se evalua en tareas finalizadas y en curso.
  function demoraSinJustificarMin(t: Tarea): number {
    if (t.tipo === 'reparacion' || !t.inicioReal) return 0
    let endRef: string | undefined
    if (t.estado === 'finalizada') endRef = t.finReal
    else if (t.estado === 'en_proceso') endRef = ahoraISO
    else return 0 // pendiente / pausada: no se evalua
    if (!endRef) return 0
    const real = calcularTiempoNetoProductivo(new Date(t.inicioReal), new Date(endRef), { horaRecuperacion: t.activaHoraRecuperacion, sinAlmuerzo: true }) - minutosNoProductivos(t)
    const neto = real - minutosParada(t) // v1.18: Neto = Real - demoras justificadas
    return Math.max(0, Math.round(neto - t.tiempoEstandarMin))
  }

  const horas = Array.from({ length: H_FIN - H_INI }, (_, i) => H_INI + i)
  const innerStyle = escala === 'dia' ? { width: 200 + (H_FIN - H_INI) * PX_HORA[bloque] } : undefined
  const lblCol = agrupar === 'sector' ? 'Sector' : agrupar === 'maquina' ? 'Estación' : 'Colaborador'

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="gantt-ctrl">
        <div className="seg">
          <button className={'seg-btn' + (escala === 'semana' ? ' on' : '')} onClick={() => setEscala('semana')}>Semana</button>
          <button className={'seg-btn' + (escala === 'dia' ? ' on' : '')} onClick={() => setEscala('dia')}>Día</button>
        </div>
        {escala === 'dia' && (
          <>
            <input type="date" className="select" value={fechaSel} onChange={(e) => e.target.value && setFechaSel(e.target.value)} />
            <div className="seg" title="Zoom del eje horario">
              {([1, 2, 4] as const).map((b) => (
                <button key={b} className={'seg-btn' + (bloque === b ? ' on' : '')} onClick={() => setBloque(b)}>{b}h</button>
              ))}
            </div>
          </>
        )}
        <div className="seg" title="Turno de almuerzo (30 min) activo en la vista">
          <span className="seg-cap">Almuerzo</span>
          <button className={'seg-btn' + (almuerzo === 'A' ? ' on' : '')} onClick={() => setAlmuerzo('A')}>A · 12:00–12:30</button>
          <button className={'seg-btn' + (almuerzo === 'B' ? ' on' : '')} onClick={() => setAlmuerzo('B')}>B · 12:30–13:00</button>
        </div>
        {reasignable && <span className="meta" style={{ alignSelf: 'center' }}>Arrastrá una barra pendiente para moverla de {agrupar === 'maquina' ? 'máquina' : 'colaborador'} y horario.</span>}
      </div>

      <div className="gantt">
        <div className="gantt-inner" style={innerStyle}>
          <div className="gantt-head">
            <div className="gantt-lblcol">{lblCol}</div>
            <div className="gantt-timeline">
              {escala === 'semana'
                ? dias.map((d, i) => (
                    <div key={i} className="gantt-hcell gantt-daycell">
                      {d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </div>
                  ))
                : horas.map((h) => (
                    <div key={h} className="gantt-hcell">{(h - H_INI) % bloque === 0 ? `${String(h).padStart(2, '0')}:00` : ''}</div>
                  ))}
            </div>
          </div>

          {lanes.map((lane) => {
            const segs = segsPorLane.get(lane.id) ?? []
            const nTareas = new Set(segs.map((s) => s.tarea.id)).size
            // v1.16: altura del carril segun cuantas sub-filas necesito (tareas en paralelo).
            const filas = filasPorLane.get(lane.id) ?? 1
            const altoCarril = Math.max(50, topDeFila(filas - 1) + 28 + 8)
            const rowDe = new Map(segs.map((s) => [s.tarea.id, s.row]))
            return (
              <div className="gantt-row" key={lane.id} style={{ minHeight: altoCarril }}>
                <div className="gantt-rowlbl">
                  <div>{lane.label}</div>
                  <div className="sub">{lane.sub ? `${lane.sub} · ` : ''}{nTareas} tarea(s)</div>
                </div>
                <div className="gantt-track" data-lane-id={lane.id} style={{ height: altoCarril }}>
                  {dias.flatMap((day, idx) => bandasMuertasDia(day, almuerzo).map((bd, j) => {
                    const left = ((idx + (bd.ini - H_INI * 60) / DAY_MIN) / N) * 100
                    const width = ((bd.fin - bd.ini) / DAY_MIN / N) * 100
                    return <div key={`${idx}-${j}`} className="gantt-banda-muerta" style={{ left: `${left}%`, width: `${width}%` }} title="Sin producción" />
                  }))}
                  {escala === 'semana' && dias.slice(1).map((_, i) => (
                    <div key={`sep${i}`} className="gantt-grid-line" style={{ left: `${((i + 1) / N) * 100}%`, background: 'var(--borde)', width: 2 }} />
                  ))}
                  {escala === 'dia' && horas.filter((h) => h > H_INI && (h - H_INI) % bloque === 0).map((h) => (
                    <div key={h} className="gantt-grid-line" style={{ left: `${((h - H_INI) * 60 / DAY_MIN) * 100}%` }} />
                  ))}
                  {ahoraPct >= 0 && ahoraPct <= 100 && (
                    <div className="gantt-grid-line" style={{ left: `${ahoraPct}%`, background: 'var(--rojo)', width: 2 }} />
                  )}
                  {segs.map((b, i) => {
                    // v1.9: encargados solo reparaciones. v1.11: logistica = sin drag.
                    const arrastrable = !soloLectura && b.tarea.estado === 'pendiente' && b.esInicio
                      && (puedeMoverProduccion || b.tarea.tipo === 'reparacion')
                    const dragging = ghost?.id === b.tarea.id && b.esInicio
                    const recup = !!b.tarea.activaHoraRecuperacion
                    const reparacion = b.tarea.tipo === 'reparacion'
                    // Etiqueta principal = SEMIELABORADO completo (nombre del maestro
                    // de articulos: incluye potencia/tension, fase y material).
                    // Fallback al modelo si la tarea no tiene semielaborado asignado.
                    const comp = componentePorCodigo(b.tarea.componenteCodigo)
                    const etiqueta = comp ? comp.descripcion : (b.tarea.modelo || '—')
                    const semiTxt = comp ? comp.descripcion : (b.tarea.componenteCodigo ? b.tarea.componenteCodigo : 'sin semielaborado')
                    return (
                      <div
                        key={b.tarea.id + '-' + b.idx + '-' + i}
                        className={'gantt-bar' + (arrastrable ? ' arrastrable' : '') + (recup ? ' recup' : '') + (reparacion ? ' reparacion' : '') + (onTareaClick ? ' clickable' : '')}
                        onPointerDown={arrastrable ? (e) => iniciarArrastre(e, b) : undefined}
                        onClick={onTareaClick ? () => {
                          // Si vino de un arrastre real, no navegar (y resetear la marca).
                          if (dragMovedRef.current) { dragMovedRef.current = false; return }
                          onTareaClick(b.tarea)
                        } : undefined}
                        style={{
                          left: `${b.left}%`, width: `${b.width}%`, top: topDeFila(b.row),
                          backgroundColor: reparacion ? 'var(--reparacion)' : COLOR[b.tarea.estado],
                          opacity: dragging ? 0.3 : b.estimada ? 0.55 : 1,
                          border: b.estimada ? '1px dashed rgba(255,255,255,.5)' : 'none',
                          color: b.tarea.estado === 'pausada' && !reparacion ? '#1a1206' : '#fff',
                        }}
                        title={`${reparacion ? '🔧 REPARACIÓN · ' : ''}Semielaborado: ${semiTxt}\nModelo: ${b.tarea.modelo}\n${b.tarea.estado} · ${nombreMaquina(b.tarea.maquinaId)} · ${b.tarea.operarioId ? nombreOperario(b.tarea.operarioId) : 'sin colaborador'} · ${hhmm(b.plan.startISO)}–${hhmm(b.plan.endISO)} · ${fmtDur(b.tarea.tiempoEstandarMin)}${reparacion ? ' · no productivo (excluido del OEE)' : ''}${recup ? ' · con hora de recuperación' : ''}${arrastrable ? ' · arrastrá para reprogramar' : ''}${resumenParadas(b.tarea)}`}
                      >
                        {reparacion && b.esInicio && <span className="gantt-rep-tag">🔧</span>}
                        {recup && b.esInicio && <span className="gantt-recup-tag">⏱+1h</span>}
                        <span className="gantt-bar-txt">{etiqueta}</span>
                      </div>
                    )
                  })}
                  {/* Sub-bloques de PARADA (tiempo no productivo registrado por el
                      operario) superpuestos sobre la barra, en su tramo real. */}
                  {[...new Map(segs.map((s) => [s.tarea.id, s.tarea])).values()].flatMap((t) =>
                    t.paradas
                      .filter((p) => p.fin && !esParadaNoProductiva(p.causa))
                      .flatMap((p, k) =>
                        segmentosPorDia(p.inicio, p.fin as string, dias).map((sg, j) => {
                          const left = ((sg.idx + (sg.ini - H_INI * 60) / DAY_MIN) / N) * 100
                          const width = Math.max(0.4, ((sg.fin - sg.ini) / DAY_MIN / N) * 100)
                          return (
                            <div
                              key={`par-${t.id}-${k}-${j}`}
                              className="gantt-parada-sub"
                              style={{ left: `${left}%`, width: `${width}%`, top: topDeFila(rowDe.get(t.id) ?? 0) }}
                              title={`Parada · ${causaLabel(p.causa)} · ${hhmm(p.inicio)}–${hhmm(p.fin as string)}`}
                            />
                          )
                        }),
                      ),
                  )}
                  {/* v1.16: DEMORA SIN JUSTIFICAR (negra) en la cola de la barra:
                      tiempo productivo por encima del estandar sin parada reportada. */}
                  {(() => {
                    const planDe = new Map(segs.map((s) => [s.tarea.id, s.plan]))
                    const tareasU = [...new Map(segs.map((s) => [s.tarea.id, s.tarea])).values()]
                    return tareasU.flatMap((t) => {
                      const p = planDe.get(t.id)
                      const dMin = demoraSinJustificarMin(t)
                      if (!p || dMin <= 0) return []
                      const blackEnd = new Date(p.endISO)
                      const blackStart = new Date(blackEnd.getTime() - dMin * 60000)
                      return segmentosPorDia(blackStart.toISOString(), p.endISO, dias).map((sg, j) => {
                        const left = ((sg.idx + (sg.ini - H_INI * 60) / DAY_MIN) / N) * 100
                        const width = Math.max(0.4, ((sg.fin - sg.ini) / DAY_MIN / N) * 100)
                        return (
                          <div
                            key={`dsj-${t.id}-${j}`}
                            className="gantt-demora-sj"
                            style={{ left: `${left}%`, width: `${width}%`, top: topDeFila(rowDe.get(t.id) ?? 0) }}
                            title={`Demora sin justificar · ${fmtDur(dMin)} por encima del estándar (sin parada reportada)`}
                          />
                        )
                      })
                    })
                  })()}
                </div>
              </div>
            )
          })}
          {lanes.length === 0 && <div className="empty">Sin carriles para los filtros seleccionados.</div>}
        </div>
      </div>

      {ghost && (
        <div className="gantt-ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.w }}>{ghost.label}</div>
      )}

      <div className="legend" style={{ padding: '12px 16px' }}>
        <span><i style={{ background: 'var(--estado-pendiente)' }} /> Planificado/Pendiente</span>
        <span><i style={{ background: 'var(--estado-proceso)' }} /> En proceso</span>
        <span><i style={{ background: 'var(--estado-pausa)' }} /> Pausado por demora</span>
        <span><i style={{ background: 'var(--estado-fin)' }} /> Finalizado</span>
        <span><i style={{ background: 'var(--rojo)', width: 3 }} /> Ahora</span>
        <span><i style={{ background: 'repeating-linear-gradient(45deg,#64748b,#64748b 4px,transparent 4px,transparent 8px)' }} /> Sin producción</span>
        <span><i style={{ background: 'var(--estado-proceso)', boxShadow: 'inset 4px 0 0 0 var(--naranja)' }} /> Con hora de recuperación (+1h)</span>
        <span><i style={{ background: 'repeating-linear-gradient(45deg,var(--rojo),var(--rojo) 3px,rgba(239,68,68,.35) 3px,rgba(239,68,68,.35) 6px)' }} /> Parada / demora justificada</span>
        <span><i style={{ background: '#000', boxShadow: 'inset 0 0 0 1px #f1f5f9' }} /> Demora SIN justificar (excede estándar)</span>
        <span><i style={{ background: 'var(--reparacion)' }} /> Reparación (no productivo)</span>
      </div>
    </div>
  )
}
