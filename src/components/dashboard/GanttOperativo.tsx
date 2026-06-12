import { useMemo, useState } from 'react'
import type { Tarea, EstadoTarea } from '../../types'
import { sectorById } from '../../types'
import { hhmm, fmtDur } from '../../lib/time'
import { sumarMinutosLaborables, proximoInstanteLaborable, tramosLaborables } from '../../lib/calendario'

// Ventana horaria de cada dia (turno de planta: 07:00 - 16:00 reloj visible).
const H_INI = 7
const H_FIN = 16
const DAY_MIN = (H_FIN - H_INI) * 60 // 540

const COLOR: Record<EstadoTarea, string> = {
  pendiente: 'var(--estado-pendiente)',
  en_proceso: 'var(--estado-proceso)',
  pausada: 'var(--estado-pausa)',
  finalizada: 'var(--estado-fin)',
}

function minClock(d: Date): number { return d.getHours() * 60 + d.getMinutes() }

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
// de [07:00, 16:00]. Cubre almuerzo (12-13), limpieza (ult. 15 min) y, los
// viernes, la franja cerrada 15:00-16:00.
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

// Parte un intervalo [start,end] en segmentos por dia visible (clip a 07:00-16:00).
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

interface Segmento { tarea: Tarea; idx: number; left: number; width: number; estimada: boolean; plan: Plan }

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
      const key = agrupar === 'sector'
        ? sectorById(t.sectorId).nombre
        : agrupar === 'maquina'
          ? nombreMaquina(t.maquinaId)
          : (t.operarioId ? nombreOperario(t.operarioId) : 'Sin iniciar')
      const arr = map.get(key) ?? []
      for (const sg of segs) {
        const left = ((sg.idx + (sg.ini - H_INI * 60) / DAY_MIN) / N) * 100
        const width = Math.max(0.6, ((sg.fin - sg.ini) / DAY_MIN / N) * 100)
        arr.push({ tarea: t, idx: sg.idx, left, width, estimada: p.estimada, plan: p })
      }
      map.set(key, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [tareas, agrupar, ahoraISO, nombreOperario, nombreMaquina, dias, N])

  // Linea "ahora": solo si hoy es uno de los dias visibles y estamos en turno.
  const ahoraPct = (() => {
    const idx = dias.findIndex((d) => d.toDateString() === ahora.toDateString())
    if (idx < 0) return -1
    const cm = minClock(ahora)
    if (cm < H_INI * 60 || cm > H_FIN * 60) return -1
    return ((idx + (cm - H_INI * 60) / DAY_MIN) / N) * 100
  })()

  const horas = Array.from({ length: H_FIN - H_INI }, (_, i) => H_INI + i)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Controles de escala */}
      <div className="gantt-ctrl">
        <div className="seg">
          <button className={'seg-btn' + (escala === 'semana' ? ' on' : '')} onClick={() => setEscala('semana')}>Semana</button>
          <button className={'seg-btn' + (escala === 'dia' ? ' on' : '')} onClick={() => setEscala('dia')}>Día</button>
        </div>
        {escala === 'dia' && (
          <input
            type="date"
            className="select"
            value={fechaSel}
            onChange={(e) => e.target.value && setFechaSel(e.target.value)}
          />
        )}
      </div>

      <div className="gantt">
        <div className="gantt-inner">
          <div className="gantt-head">
            <div className="gantt-lblcol">{agrupar === 'sector' ? 'Sector' : agrupar === 'maquina' ? 'Estación' : 'Colaborador'}</div>
            <div className="gantt-timeline">
              {escala === 'semana'
                ? dias.map((d, i) => (
                    <div key={i} className="gantt-hcell gantt-daycell">
                      {d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </div>
                  ))
                : horas.map((h) => <div key={h} className="gantt-hcell">{String(h).padStart(2, '0')}:00</div>)}
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
                {/* en vista dia: lineas de grilla por hora */}
                {escala === 'dia' && horas.slice(1).map((h, i) => (
                  <div key={h} className="gantt-grid-line" style={{ left: `${((i + 1) / DAY_MIN) * 60 * 100}%` }} />
                ))}
                {/* linea "ahora" */}
                {ahoraPct >= 0 && ahoraPct <= 100 && (
                  <div className="gantt-grid-line" style={{ left: `${ahoraPct}%`, background: 'var(--rojo)', width: 2 }} />
                )}
                {segs.map((b, i) => (
                  <div
                    key={b.tarea.id + '-' + b.idx + '-' + i}
                    className="gantt-bar"
                    style={{
                      left: `${b.left}%`, width: `${b.width}%`,
                      background: COLOR[b.tarea.estado],
                      opacity: b.estimada ? 0.55 : 1,
                      border: b.estimada ? '1px dashed rgba(255,255,255,.5)' : 'none',
                      color: b.tarea.estado === 'pausada' ? '#1a1206' : '#fff',
                    }}
                    title={`${b.tarea.modelo} · ${b.tarea.estado} · ${b.estimada ? 'plan' : 'real'} ${hhmm(b.plan.startISO)}–${hhmm(b.plan.endISO)} · ${fmtDur(b.tarea.tiempoEstandarMin)}`}
                  >
                    {b.tarea.modelo}
                  </div>
                ))}
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
