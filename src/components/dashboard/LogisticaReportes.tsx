import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { TareaLogistica, PrioridadLog } from '../../types'
import { responsablesDe, RESPONSABLES_LOGISTICA } from '../../types'
import { fmtDur } from '../../lib/time'
import { minutosLaboralesLogistica } from '../../lib/calendario'
import { PERIODOS_REPORTE, rangoReporte, enRango, type PeriodoReporte } from '../../lib/periodoReporte'

// ============================================================
// TABLERO DE REPORTES DE LOGISTICA (v1.25) — analitica para el LIDER del area.
// Todo se calcula con los datos actuales de las tareas logisticas (sin backend
// nuevo). Gráficos con barras CSS (mismas clases que el resto del tablero).
// ============================================================

const PRIO_LABEL: Record<PrioridadLog, string> = { alta: 'ALTA', media: 'MEDIA', baja: 'BAJA' }

// Tiempo ACTIVO de resolucion de una tarea finalizada (descuenta pausas).
// v1.39: se mide en minutos DENTRO del horario del pañol (Lun-Jue 08-17, Vie
// 08-16). Lo trabajado fuera de ese rango no penaliza el KPI de resolución.
function resolucion(t: TareaLogistica): number {
  return Math.max(0, minutosLaboralesLogistica(t.iniciada ?? t.creada, t.finalizada) - (t.minutosPausada ?? 0))
}
function media(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0
}

// Barra horizontal reutilizable (estilo pareto del tablero).
function Barra({ label, sub, valor, ratio, color }: {
  label: string; sub?: string; valor: string; ratio: number; color?: string
}) {
  return (
    <div className="pareto-row">
      <div className="pareto-lbl">{label}{sub ? <div className="sub meta">{sub}</div> : null}</div>
      <div className="pareto-bar-wrap">
        <div className="pareto-bar" style={{ width: `${Math.max(6, Math.min(100, ratio * 100))}%`, background: color ?? 'var(--naranja)' }}>{valor}</div>
      </div>
    </div>
  )
}

export default function LogisticaReportes() {
  const tareas = useLiveQuery(() => db.tareasLogistica.toArray(), []) ?? []
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(id) }, [])
  const ahoraISO = new Date(ahora).toISOString()
  const [periodo, setPeriodo] = useState<PeriodoReporte>('mes_actual')

  const rep = useMemo(() => {
    // Filtro por período: se toma la fecha de actividad (finalizada / iniciada / creada).
    const r = rangoReporte(periodo)
    const tp = tareas.filter((t) => enRango(t.finalizada ?? t.iniciada ?? t.creada, r.desde, r.hasta))
    const finalizadas = tp.filter((t) => t.estado === 'finalizada')
    const abiertas = tp.filter((t) => t.estado !== 'finalizada')
    const pendientesSinTomar = tp.filter((t) => t.estado === 'pendiente')

    const promGeneral = media(finalizadas.map(resolucion))

    // 1) Volumen + 2) Velocidad por operario (una tarea cuenta para cada responsable).
    const volumen = new Map<string, number>()
    const tiempos = new Map<string, number[]>()
    for (const t of finalizadas) {
      for (const r of responsablesDe(t)) {
        volumen.set(r, (volumen.get(r) ?? 0) + 1)
        const arr = tiempos.get(r) ?? []; arr.push(resolucion(t)); tiempos.set(r, arr)
      }
    }
    const porVolumen = [...volumen.entries()].map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v)
    const porVelocidad = [...tiempos.entries()].map(([n, arr]) => ({ n, prom: media(arr), muestras: arr.length })).sort((a, b) => a.prom - b.prom)

    // 3) Carga abierta por operario (roster fijo + "Sin asignar").
    const carga = new Map<string, number>()
    for (const r of RESPONSABLES_LOGISTICA) carga.set(r, 0)
    let sinAsignar = 0
    for (const t of abiertas) {
      const rs = responsablesDe(t)
      if (rs.length === 0) sinAsignar++
      else for (const r of rs) carga.set(r, (carga.get(r) ?? 0) + 1)
    }
    const cargaArr = [...carga.entries()].map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v)
    const totalAbiertas = abiertas.length
    const maxCarga = cargaArr[0]?.v ?? 0
    const shareMax = totalAbiertas ? maxCarga / totalAbiertas : 0

    // 4) Prioridad vs cumplimiento (tiempo prom de resolucion por prioridad).
    const porPrioridad = (['alta', 'media', 'baja'] as PrioridadLog[]).map((p) => {
      const fs = finalizadas.filter((t) => t.prioridad === p)
      return { p, prom: media(fs.map(resolucion)), n: fs.length }
    })

    // 5) Tiempo de espera: pendientes sin tomar, ordenadas por antigüedad.
    //    En minutos del pañol (no penaliza la noche / finde que estuvieron esperando).
    const espera = pendientesSinTomar
      .map((t) => ({ t, min: minutosLaboralesLogistica(t.creada, ahoraISO) }))
      .sort((a, b) => b.min - a.min)

    // 6) Tendencia por día de la semana (pedidos creados). Lun -> Dom.
    const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
    const idx = [1, 2, 3, 4, 5, 6, 0]
    const conteoDia = idx.map((d, i) => ({ dia: dias[i], n: tp.filter((t) => new Date(t.creada).getDay() === d).length }))

    // 7) Pareto de tiempo perdido por CAUSA de bloqueo (los abiertos cuentan hasta ahora).
    const bloq = new Map<string, { min: number; n: number }>()
    for (const t of tp) for (const b of t.bloqueos ?? []) {
      const min = minutosLaboralesLogistica(b.inicio, b.fin ?? ahoraISO)
      if (min <= 0) continue
      const cur = bloq.get(b.motivo) ?? { min: 0, n: 0 }
      cur.min += min; cur.n++; bloq.set(b.motivo, cur)
    }
    const bloqueos = [...bloq.entries()].map(([motivo, v]) => ({ motivo, min: v.min, n: v.n })).sort((a, b) => b.min - a.min)
    const bloqueoTotal = bloqueos.reduce((a, b) => a + b.min, 0)

    return { finalizadas, abiertas, pendientesSinTomar, promGeneral, porVolumen, porVelocidad, cargaArr, sinAsignar, totalAbiertas, shareMax, porPrioridad, espera, conteoDia, bloqueos, bloqueoTotal }
  }, [tareas, ahoraISO, periodo])

  const selectorPeriodo = (
    <div className="filtros no-print" style={{ marginBottom: 12 }}>
      <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoReporte)}>
        {PERIODOS_REPORTE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </div>
  )

  if (tareas.length === 0) return <>{selectorPeriodo}<div className="empty">Aún no hay tareas logísticas para analizar.</div></>

  const maxVol = rep.porVolumen[0]?.v ?? 1
  const maxVel = Math.max(1, ...rep.porVelocidad.map((x) => x.prom))
  const maxCargaV = Math.max(1, ...rep.cargaArr.map((x) => x.v), rep.sinAsignar)
  const maxPrio = Math.max(1, ...rep.porPrioridad.map((x) => x.prom))
  const maxEspera = Math.max(1, ...rep.espera.map((x) => x.min))
  const maxDia = Math.max(1, ...rep.conteoDia.map((x) => x.n))
  const maxBloq = Math.max(1, ...rep.bloqueos.map((x) => x.min))

  // Semáforo de carga.
  const sem = rep.totalAbiertas === 0
    ? { color: 'var(--texto-tenue)', txt: 'Sin carga abierta' }
    : rep.shareMax >= 0.6
      ? { color: 'var(--rojo)', txt: `Desequilibrada — ${rep.cargaArr[0].n} concentra el ${Math.round(rep.shareMax * 100)}% de lo abierto` }
      : rep.shareMax >= 0.4
        ? { color: 'var(--naranja)', txt: `Algo cargada hacia ${rep.cargaArr[0].n} (${Math.round(rep.shareMax * 100)}%)` }
        : { color: 'var(--estado-fin)', txt: 'Equilibrada entre el equipo' }

  return (
    <>
      {selectorPeriodo}
      {/* Indicadores resumen */}
      <div className="logi-kpis">
        <div className="logi-kpi"><div className="n">{rep.finalizadas.length}</div><div className="l">Finalizadas</div></div>
        <div className="logi-kpi"><div className="n">{rep.promGeneral ? fmtDur(rep.promGeneral) : '—'}</div><div className="l">Tiempo prom. resolución</div></div>
        <div className="logi-kpi"><div className="n" style={{ color: 'var(--naranja)' }}>{rep.totalAbiertas}</div><div className="l">Abiertas (pend.+en curso)</div></div>
        <div className="logi-kpi"><div className="n" style={{ color: (rep.espera[0]?.min ?? 0) > 240 ? 'var(--rojo)' : undefined }}>{rep.espera[0] ? fmtDur(rep.espera[0].min) : '—'}</div><div className="l">Espera más larga (sin tomar)</div></div>
      </div>

      {/* Semáforo de carga */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', background: sem.color, flex: 'none', boxShadow: `0 0 8px ${sem.color}` }} />
        <div><strong>Balance de carga:</strong> {sem.txt}{rep.sinAsignar > 0 ? ` · ${rep.sinAsignar} sin asignar` : ''}</div>
      </div>

      {/* 1) Volumen por operario */}
      <div className="section-title">Volumen de trabajo por operario (tareas finalizadas)</div>
      <div className="card">
        {rep.porVolumen.length === 0 ? <div className="empty">Sin tareas finalizadas.</div>
          : rep.porVolumen.map(({ n, v }) => <Barra key={n} label={n} valor={`${v}`} ratio={v / maxVol} />)}
      </div>

      {/* 2) Velocidad vs promedio */}
      <div className="section-title">Velocidad de respuesta (prom. individual vs general {rep.promGeneral ? fmtDur(rep.promGeneral) : '—'})</div>
      <div className="card">
        {rep.porVelocidad.length === 0 ? <div className="empty">Sin datos.</div>
          : rep.porVelocidad.map(({ n, prom, muestras }) => (
            <Barra key={n} label={n} sub={`${muestras} tarea(s)`} valor={fmtDur(prom)} ratio={prom / maxVel}
              color={prom <= rep.promGeneral ? 'var(--estado-fin)' : 'var(--rojo)'} />
          ))}
        <div className="meta" style={{ marginTop: 6 }}>Verde = más rápido que el promedio general · Rojo = más lento.</div>
      </div>

      {/* 4) Prioridad vs cumplimiento */}
      <div className="section-title">Prioridad vs cumplimiento (¿las "Alta" se resuelven antes?)</div>
      <div className="card">
        {rep.porPrioridad.every((x) => x.n === 0) ? <div className="empty">Sin tareas finalizadas.</div>
          : rep.porPrioridad.map(({ p, prom, n }) => (
            <Barra key={p} label={PRIO_LABEL[p]} sub={`${n} tarea(s)`} valor={prom ? fmtDur(prom) : '—'} ratio={prom / maxPrio}
              color={p === 'alta' ? 'var(--rojo)' : p === 'media' ? 'var(--naranja)' : 'var(--azul-claro)'} />
          ))}
        <div className="meta" style={{ marginTop: 6 }}>Si "ALTA" tarda parecido a "BAJA", la priorización no se está respetando.</div>
      </div>

      {/* 5) Tiempo de espera (sin tomar) */}
      <div className="section-title">Tareas en espera (sin tomar) — cuánto llevan bloqueando el flujo</div>
      <div className="card">
        {rep.espera.length === 0 ? <div className="empty">No hay tareas pendientes sin tomar. 👌</div>
          : rep.espera.slice(0, 10).map(({ t, min }) => (
            <Barra key={t.id} label={t.titulo.length > 28 ? t.titulo.slice(0, 27) + '…' : t.titulo}
              sub={responsablesDe(t).length ? responsablesDe(t).join(', ') : 'Sin asignar'}
              valor={fmtDur(min)} ratio={min / maxEspera}
              color={min > 240 ? 'var(--rojo)' : min > 120 ? 'var(--naranja)' : 'var(--azul-claro)'} />
          ))}
      </div>

      {/* 7) Pareto de bloqueos por causa */}
      <div className="section-title">Cuellos de botella: tiempo perdido por bloqueos {rep.bloqueoTotal > 0 ? `(total ${fmtDur(rep.bloqueoTotal)})` : ''}</div>
      <div className="card">
        {rep.bloqueos.length === 0 ? <div className="empty">Sin bloqueos registrados. 👌</div>
          : rep.bloqueos.map(({ motivo, min, n }) => (
            <Barra key={motivo} label={motivo} sub={`${n} evento(s)`}
              valor={`${fmtDur(min)} · ${Math.round((min / rep.bloqueoTotal) * 100)}%`} ratio={min / maxBloq} color="var(--rojo)" />
          ))}
        <div className="meta" style={{ marginTop: 6 }}>Dónde se pierde más tiempo por trabas externas: prioridad para reforzar procesos o material.</div>
      </div>

      {/* 3) Carga abierta por operario */}
      <div className="section-title">Carga actual por operario (tareas abiertas)</div>
      <div className="card">
        {rep.cargaArr.map(({ n, v }) => <Barra key={n} label={n} valor={`${v}`} ratio={v / maxCargaV}
          color={rep.totalAbiertas && v / rep.totalAbiertas >= 0.6 ? 'var(--rojo)' : 'var(--naranja)'} />)}
        {rep.sinAsignar > 0 && <Barra label="Sin asignar" valor={`${rep.sinAsignar}`} ratio={rep.sinAsignar / maxCargaV} color="var(--texto-tenue)" />}
      </div>

      {/* 6) Tendencia por día de la semana */}
      <div className="section-title">Tendencia de carga por día de la semana (pedidos creados)</div>
      <div className="card">
        {rep.conteoDia.map(({ dia, n }) => <Barra key={dia} label={dia} valor={`${n}`} ratio={n / maxDia}
          color={n === maxDia && n > 0 ? 'var(--rojo)' : 'var(--azul-claro)'} />)}
        <div className="meta" style={{ marginTop: 6 }}>El día en rojo es el pico de pedidos: candidato a reforzar turno o adelantar programación.</div>
      </div>
    </>
  )
}
