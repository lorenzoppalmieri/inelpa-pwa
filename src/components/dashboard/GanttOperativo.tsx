import { type PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from 'react'
import type { Tarea, EstadoTarea } from '../../types'
import { sectorById } from '../../types'
import { hhmm, fmtDur, isoWeek } from '../../lib/time'
import { sumarMinutosLaborables, proximoInstanteLaborable, tramosLaborables } from '../../lib/calendario'
import { guardarTarea } from '../../sync/syncEngine'

// Ventana horaria visible de cada dia (turno de planta: 07:00 - 17:00 reloj
// visible). La franja 16:00-17:00 es recuperacion de horas y cuenta como
// produccion estandar (definida en lib/calendario.ts).
const H_INI = 7
const H_FIN = 17
const DAY_MIN = (H_FIN - H_INI) * 60 // 600

// Zoom (solo vista Dia): px por hora segun el tamano de bloque elegido.
//  bloque 1h = mas detalle/ancho; 4h = mas comprimido.
const PX_HORA: Record<number, number> = { 1: 150, 2: 92, 4: 58 }

const COLOR: Record<EstadoTarea, string> = {
  pendiente: 'var(--estado-pendiente)',
  en_proceso: 'var(--estado-proceso)',
  pausada: 'var(--estado-pausa)',
  finalizada: 'var(--estado-fin)',
}

function minClock(d: Date): number { return d.getHours() * 60 + d.getMinutes() }
function mismaFecha(a: Date, b: Date): boolean { return a.toDateString() === b.toDateString() }

// Lunes (00:00) de la semana que contiene a `d`.
function lunesDeSemana(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0)
  const dow = (r.getDay() + 6) % 7 // 0 = lunes
  r.setDate(r.getDate() - dow)
  return r
}
function sumarDias(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

// Bandas NO productivas de un dia = complemento de los tramos laborables dentro
// de [07:00, 17:00]. Cubre almuerzo (12-13), limpieza de fin de jornada
// (Lun-Jue 15:45-16:00, Vie 14:45-15:00) y, los viernes, la franja cerrada 16-17.
function bandasMuertasDia(day: Date): { ini: number; fin: number }[] {
  const tramos = tramosLaborables(day)
  const bands: { ini: number; fin: number }[] = []
  let cursor = H_INI * 60
  for (const t of tramos) {
    if (t.iniMin > cursor) bands.push({ ini: cursor, fin: t.iniMin })
    cursor = Math.max(cursor, t.finMin)
  }
  if (cursor < H_FIN * 60) bands.push({ ini: cursor, fin: H_FIN * 60 })
  return bands
}

interface Plan { startISO: string; endISO: string; estimada: boolean }

// ============================================================
// Programacion por maquina con auto-shift (multi-dia).
//  - Tareas iniciadas (inicioReal): fijas; si una en curso sobrepasa su
//    estimado, la maquina sigue ocupada hasta "ahora" y empuja a las siguientes.
//  - Tareas pendientes: arrancan en su inicioPlanificado; si colisionan en su
//    maquina se corren hacia adelante respetando turno + almuerzo (cruza dias).
// ============================================================
function programar(tareas: Tarea[], ahoraISO: string): Map<string, Plan> {
  const out = new Map<string, Plan>()
  const porMaquina = new Map<string, Tarea[]>()
  for (const t of tareas) {
    const arr = porMaquina.get(t.maquinaId) ?? []
    arr.push(t)
    porMaquina.set(t.maquinaId, arr)
  }
  for (const [, arr] of porMaquina) {
    const ordenadas = [...arr].sort((a, b) => {
      const ak = a.inicioReal ?? a.inicioPlanificado ?? ''
      const bk = b.inicioReal ?? b.inicioPlanificado ?? ''
      if (ak && bk && ak !== bk) return ak < bk ? -1 : 1
      if (ak && !bk) return -1
      if (!ak && bk) return 1
      return a.prioridad - b.prioridad
    })
    let cursor = ''
    for (const t of ordenadas) {
      if (t.inicioReal) {
        const estEnd = sumarMinutosLaborables(t.inicioReal, t.tiempoEstandarMin)
        let endISO = t.finReal ?? estEnd
        if (!t.finReal && t.estado !== 'finalizada') endISO = ahoraISO > estEnd ? ahoraISO : estEnd
        out.set(t.id, { startISO: t.inicioReal, endISO, estimada: false })
        if (!cursor || endISO > cursor) cursor = endISO
      } else {
        let startISO = t.inicioPlanificado ?? cursor ?? ahoraISO
        if (cursor && cursor > startISO) startISO = cursor
        startISO = proximoInstanteLaborable(startISO || ahoraISO)
        const endISO = sumarMinutosLaborables(startISO, t.tiempoEstandarMin)
        out.set(t.id, { startISO, endISO, estimada: true })
        cursor = endISO
      }
    }
  }
  return out
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

interface Segmento { tarea: Tarea; idx: number; left: number; width: number; estimada: boolean; esInicio: boolean; plan: Plan }

type Escala = 'semana' | 'dia'

export default function GanttOperativo({ tareas, agrupar, nombreOperario, nombreMaquina }: {
  tareas: Tarea[]
  agrupar: 'sector' | 'operario' | 'maquina'
  nombreOperario: (id: string) => string
  nombreMaquina: (id: string) => string
}) {
  const ahora = new Date()
  const ahoraISO = ahora.toISOString()
  const [escala, setEscala] = useState<Escala>('semana')
  // En vista "dia" se puede elegir CUALQUIER fecha (anterior o posterior), no solo la semana activa.
  const [fechaSel, setFechaSel] = useState<string>(() => new Date().toLocaleDateString('en-CA'))
  // Zoom del eje X en vista "dia": 1, 2 o 4 horas por bloque.
  const [bloque, setBloque] = useState<1 | 2 | 4>(2)

  // Dias laborables (Lun-Vie) de la semana activa (vista "semana").
  const diasSemana = useMemo(() => {
    const lun = lunesDeSemana(new Date())
    return Array.from({ length: 5 }, (_, i) => sumarDias(lun, i))
  }, [])

  // Dia unico elegido en vista "dia" (a las 00:00 local).
  const diaUnico = useMemo(() => new Date(`${fechaSel}T00:00:00`), [fechaSel])

  // Dias efectivamente dibujados segun la escala.
  const dias = escala === 'semana' ? diasSemana : [diaUnico]
  const N = dias.length

  const grupos = useMemo(() => {
    const plan = programar(tareas, ahoraISO)
    const map = new Map<string, Segmento[]>()
    for (const t of tareas) {
      const p = plan.get(t.id)
      if (!p) continue
      const segs = segmentosPorDia(p.startISO, p.endISO, dias)
      if (segs.length === 0) continue
      const startD = new Date(p.startISO)
      const key = agrupar === 'sector'
        ? sectorById(t.sectorId).nombre
        : agrupar === 'maquina'
          ? nombreMaquina(t.maquinaId)
          : (t.operarioId ? nombreOperario(t.operarioId) : 'Sin iniciar')
      const arr = map.get(key) ?? []
      for (const sg of segs) {
        const left = ((sg.idx + (sg.ini - H_INI * 60) / DAY_MIN) / N) * 100
        const width = Math.max(0.6, ((sg.fin - sg.ini) / DAY_MIN / N) * 100)
        const esInicio = mismaFecha(dias[sg.idx], startD) && sg.ini === minClock(startD)
        arr.push({ tarea: t, idx: sg.idx, left, width, estimada: p.estimada, esInicio, plan: p })
      }
      map.set(key, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [tareas, agrupar, ahoraISO, nombreOperario, nombreMaquina, dias, N])

  // ============================================================
  // Drag & Drop: reprogramar tareas PENDIENTES arrastrando su barra.
  //  - Solo la barra de inicio de una tarea pendiente es arrastrable.
  //  - Al soltar: posicion X -> dia+hora; se encaja (snap) al proximo tramo
  //    productivo y nunca antes de "ahora"; se persiste (Dexie + sync) y el
  //    auto-shift se re-ejecuta solo al actualizar las tareas.
  // ============================================================
  const dragRef = useRef<{ tarea: Tarea; rect: DOMRect; grabPx: number; barWpx: number } | null>(null)
  const [ghost, setGhost] = useState<{ id: string; leftPx: number } | null>(null)

  // Fraccion [0,1] sobre el track -> instante candidato (dia + minuto del dia).
  function instanteDesdeFraccion(frac: number): Date {
    const fN = Math.max(0, Math.min(1, frac)) * N
    let dayIdx = Math.floor(fN)
    if (dayIdx >= N) dayIdx = N - 1
    if (dayIdx < 0) dayIdx = 0
    const within = fN - dayIdx
    const minDia = H_INI * 60 + within * DAY_MIN
    const d = new Date(dias[dayIdx]); d.setHours(0, 0, 0, 0); d.setMinutes(Math.round(minDia))
    return d
  }

  function iniciarArrastre(e: ReactPointerEvent<HTMLDivElement>, b: Segmento) {
    if (b.tarea.estado !== 'pendiente' || !b.esInicio) return // solo pendientes
    e.preventDefault()
    const track = e.currentTarget.parentElement as HTMLElement
    const rect = track.getBoundingClientRect()
    const barLeftPx = (b.left / 100) * rect.width
    const barWpx = (b.width / 100) * rect.width
    const grabPx = e.clientX - rect.left - barLeftPx
    dragRef.current = { tarea: b.tarea, rect, grabPx, barWpx }
    setGhost({ id: b.tarea.id, leftPx: barLeftPx })

    const clampLeft = (clientX: number) => {
      const s = dragRef.current!
      const px = clientX - s.rect.left - s.grabPx
      return Math.max(0, Math.min(px, s.rect.width - s.barWpx))
    }
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return
      setGhost({ id: dragRef.current.tarea.id, leftPx: clampLeft(ev.clientX) })
    }
    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      const s = dragRef.current
      dragRef.current = null
      setGhost(null)
      if (!s) return
      const frac = clampLeft(ev.clientX) / s.rect.width
      const cand = instanteDesdeFraccion(frac)
      // No permitir arrastrar al pasado, y encajar al proximo tramo productivo.
      const nowISO = new Date().toISOString()
      let candISO = cand.toISOString()
      if (candISO < nowISO) candISO = nowISO
      const snapped = proximoInstanteLaborable(candISO)
      if (snapped === s.tarea.inicioPlanificado) return
      await guardarTarea({ ...s.tarea, inicioPlanificado: snapped, semana: isoWeek(new Date(snapped)) })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  // Linea "ahora": solo si hoy es uno de los dias visibles y estamos en turno.
  const ahoraPct = (() => {
    const idx = dias.findIndex((d) => d.toDateString() === ahora.toDateString())
    if (idx < 0) return -1
    const cm = minClock(ahora)
    if (cm < H_INI * 60 || cm > H_FIN * 60) return -1
    return ((idx + (cm - H_INI * 60) / DAY_MIN) / N) * 100
  })()

  const horas = Array.from({ length: H_FIN - H_INI }, (_, i) => H_INI + i)
  // En vista dia, ancho explicito del contenido segun el zoom (habilita scroll-x).
  const innerStyle = escala === 'dia' ? { width: 200 + (H_FIN - H_INI) * PX_HORA[bloque] } : undefined

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Controles de escala */}
      <div className="gantt-ctrl">
        <div className="seg">
          <button className={'seg-btn' + (escala === 'semana' ? ' on' : '')} onClick={() => setEscala('semana')}>Semana</button>
          <button className={'seg-btn' + (escala === 'dia' ? ' on' : '')} onClick={() => setEscala('dia')}>Día</button>
        </div>
        {escala === 'dia' && (
          <>
            <input
              type="date"
              className="select"
              value={fechaSel}
              onChange={(e) => e.target.value && setFechaSel(e.target.value)}
            />
            <div className="seg" title="Zoom del eje horario">
              {([1, 2, 4] as const).map((b) => (
                <button key={b} className={'seg-btn' + (bloque === b ? ' on' : '')} onClick={() => setBloque(b)}>{b}h</button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="gantt">
        <div className="gantt-inner" style={innerStyle}>
          <div className="gantt-head">
            <div className="gantt-lblcol">{agrupar === 'sector' ? 'Sector' : agrupar === 'maquina' ? 'Estación' : 'Colaborador'}</div>
            <div className="gantt-timeline">
              {escala === 'semana'
                ? dias.map((d, i) => (
                    <div key={i} className="gantt-hcell gantt-daycell">
                      {d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </div>
                  ))
                : horas.map((h) => (
                    <div key={h} className="gantt-hcell">
                      {(h - H_INI) % bloque === 0 ? `${String(h).padStart(2, '0')}:00` : ''}
                    </div>
                  ))}
            </div>
          </div>

          {grupos.map(([key, segs]) => (
            <div className="gantt-row" key={key}>
              <div className="gantt-rowlbl">
                <div>{key}</div>
                <div className="sub">{new Set(segs.map((s) => s.tarea.id)).size} tarea(s)</div>
              </div>
              <div className="gantt-track">
                {/* bandas no productivas por dia */}
                {dias.flatMap((day, idx) => bandasMuertasDia(day).map((bd, j) => {
                  const left = ((idx + (bd.ini - H_INI * 60) / DAY_MIN) / N) * 100
                  const width = ((bd.fin - bd.ini) / DAY_MIN / N) * 100
                  return <div key={`${idx}-${j}`} className="gantt-banda-muerta" style={{ left: `${left}%`, width: `${width}%` }} title="Sin producción" />
                }))}
                {/* separadores entre dias */}
                {escala === 'semana' && dias.slice(1).map((_, i) => (
                  <div key={`sep${i}`} className="gantt-grid-line" style={{ left: `${((i + 1) / N) * 100}%`, background: 'var(--borde)', width: 2 }} />
                ))}
                {/* en vista dia: lineas de grilla cada `bloque` horas */}
                {escala === 'dia' && horas.filter((h) => h > H_INI && (h - H_INI) % bloque === 0).map((h) => (
                  <div key={h} className="gantt-grid-line" style={{ left: `${((h - H_INI) * 60 / DAY_MIN) * 100}%` }} />
                ))}
                {/* linea "ahora" */}
                {ahoraPct >= 0 && ahoraPct <= 100 && (
                  <div className="gantt-grid-line" style={{ left: `${ahoraPct}%`, background: 'var(--rojo)', width: 2 }} />
                )}
                {segs.map((b, i) => {
                  const arrastrable = b.tarea.estado === 'pendiente' && b.esInicio
                  const dragging = ghost?.id === b.tarea.id && b.esInicio
                  return (
                    <div
                      key={b.tarea.id + '-' + b.idx + '-' + i}
                      className={'gantt-bar' + (arrastrable ? ' arrastrable' : '') + (dragging ? ' dragging' : '')}
                      onPointerDown={arrastrable ? (e) => iniciarArrastre(e, b) : undefined}
                      style={{
                        left: dragging ? `${ghost!.leftPx}px` : `${b.left}%`,
                        width: `${b.width}%`,
                        background: COLOR[b.tarea.estado],
                        opacity: dragging ? 0.85 : b.estimada ? 0.55 : 1,
                        border: b.estimada ? '1px dashed rgba(255,255,255,.5)' : 'none',
                        color: b.tarea.estado === 'pausada' ? '#1a1206' : '#fff',
                      }}
                      title={`${b.tarea.modelo} · ${b.tarea.estado} · ${b.estimada ? 'plan' : 'real'} ${hhmm(b.plan.startISO)}–${hhmm(b.plan.endISO)} · ${fmtDur(b.tarea.tiempoEstandarMin)}${arrastrable ? ' · arrastrá para reprogramar' : ''}`}
                    >
                      {b.tarea.modelo}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {grupos.length === 0 && <div className="empty">Sin tareas para los filtros seleccionados.</div>}
        </div>
      </div>
      <div className="legend" style={{ padding: '12px 16px' }}>
        <span><i style={{ background: 'var(--estado-pendiente)' }} /> Planificado/Pendiente</span>
        <span><i style={{ background: 'var(--estado-proceso)' }} /> En proceso</span>
        <span><i style={{ background: 'var(--estado-pausa)' }} /> Pausado por demora</span>
        <span><i style={{ background: 'var(--estado-fin)' }} /> Finalizado</span>
        <span><i style={{ background: 'var(--rojo)', width: 3 }} /> Ahora</span>
        <span><i style={{ background: 'repeating-linear-gradient(45deg,#64748b,#64748b 4px,transparent 4px,transparent 8px)' }} /> Sin producción</span>
      </div>
    </div>
  )
}
