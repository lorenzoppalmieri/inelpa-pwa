import { useMemo } from 'react'
import type { DespachoTrafo, EstadoDespacho } from '../../types'
import { ESTADOS_DESPACHO } from '../../types'
import { fmtDur, minutosEntre, fechaCorta } from '../../lib/time'

// ============================================================
// REPORTES DE DESPACHO (v1.28, Fase 2) — analítica para Melany (supervisora).
// Todo con los datos actuales; barras CSS (clases .pareto-*), sin librerías.
//   · Tiempo promedio de embalaje (Distribución vs Rural)
//   · Cantidad embalada por colaboradora
//   · Pareto de demoras por causa (tiempo perdido)
//   · Equipos listos hace más de X días (embalados sin despachar)
//   · Semáforo: distribución por estado
//   · Despachados este mes vs el mes anterior
// ============================================================

function media(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0
}
// Tiempo activo de embalaje = (fin - inicio) laborable menos las demoras acumuladas.
function tiempoEmbalaje(d: DespachoTrafo): number {
  return Math.max(0, minutosEntre(d.embalajeInicio, d.embalajeFin) - (d.minutosDemora ?? 0))
}

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

const DIAS_ALERTA = 3 // "listos hace más de X días"

export default function DespachoReportes({ despachos }: { despachos: DespachoTrafo[] }) {
  const ahoraISO = new Date().toISOString()

  const rep = useMemo(() => {
    const embalados = despachos.filter((d) => d.embalajeFin) // ya pasaron por embalaje

    // 1) Tiempo prom. de embalaje: general + por línea.
    const tDist = embalados.filter((d) => d.linea === 'distribucion').map(tiempoEmbalaje).filter((m) => m > 0)
    const tRural = embalados.filter((d) => d.linea === 'rural').map(tiempoEmbalaje).filter((m) => m > 0)
    const promGeneral = media([...tDist, ...tRural])

    // 2) Cantidad embalada por colaboradora.
    const porOp = new Map<string, number>()
    for (const d of embalados) if (d.operario) porOp.set(d.operario, (porOp.get(d.operario) ?? 0) + 1)
    const cantOp = [...porOp.entries()].map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v)

    // 3) Pareto de demoras por causa (tiempo perdido; las abiertas cuentan hasta ahora).
    const dem = new Map<string, { min: number; n: number }>()
    for (const d of despachos) for (const dm of d.demoras ?? []) {
      const min = minutosEntre(dm.inicio, dm.fin ?? ahoraISO)
      if (min <= 0) continue
      const cur = dem.get(dm.causa) ?? { min: 0, n: 0 }
      cur.min += min; cur.n++; dem.set(dm.causa, cur)
    }
    const demoras = [...dem.entries()].map(([causa, v]) => ({ causa, min: v.min, n: v.n })).sort((a, b) => b.min - a.min)
    const demoraTotal = demoras.reduce((a, b) => a + b.min, 0)

    // 4) Equipos listos (embalado) hace más de X días, sin despachar.
    const listos = despachos.filter((d) => d.estado === 'embalado' && d.embalajeFin)
      .map((d) => ({ d, min: minutosEntre(d.embalajeFin, ahoraISO) }))
      .sort((a, b) => b.min - a.min)

    // 5) Distribución por estado (semáforo).
    const porEstado = ESTADOS_DESPACHO.map((e) => ({ e: e.id as EstadoDespacho, label: e.label, color: e.color, n: despachos.filter((d) => d.estado === e.id).length }))

    // 6) Despachados este mes vs el mes anterior.
    const now = new Date()
    const mesAct = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const mesAnt = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
    const despEnMes = (m: string) => despachos.filter((d) => d.fechaDespacho && d.fechaDespacho.slice(0, 7) === m).length
    const despAct = despEnMes(mesAct), despAnt = despEnMes(mesAnt)

    return {
      promGeneral, promDist: media(tDist), promRural: media(tRural), nDist: tDist.length, nRural: tRural.length,
      cantOp, demoras, demoraTotal, listos, porEstado, despAct, despAnt,
    }
  }, [despachos, ahoraISO])

  if (despachos.length === 0) return <div className="empty">Aún no hay transformadores en despacho para analizar.</div>

  const maxProm = Math.max(1, rep.promDist, rep.promRural)
  const maxOp = Math.max(1, ...rep.cantOp.map((x) => x.v))
  const maxDem = Math.max(1, ...rep.demoras.map((x) => x.min))
  const maxEst = Math.max(1, ...rep.porEstado.map((x) => x.n))
  const maxListo = Math.max(1, ...rep.listos.map((x) => x.min))
  const evol = rep.despAct - rep.despAnt

  return (
    <>
      {/* Indicadores resumen */}
      <div className="logi-kpis">
        <div className="logi-kpi"><div className="n">{rep.despAct}</div><div className="l">Despachados este mes</div></div>
        <div className="logi-kpi"><div className="n" style={{ color: evol >= 0 ? 'var(--estado-fin)' : 'var(--rojo)' }}>{evol >= 0 ? '+' : ''}{evol}</div><div className="l">vs mes anterior ({rep.despAnt})</div></div>
        <div className="logi-kpi"><div className="n">{rep.promGeneral ? fmtDur(rep.promGeneral) : '—'}</div><div className="l">Prom. embalaje</div></div>
        <div className="logi-kpi"><div className="n" style={{ color: (rep.listos[0]?.min ?? 0) > DIAS_ALERTA * 1440 ? 'var(--rojo)' : undefined }}>{rep.listos.length}</div><div className="l">Listos sin despachar</div></div>
      </div>

      {/* Tiempo prom. embalaje: Distribución vs Rural */}
      <div className="section-title">Tiempo promedio de embalaje · Distribución vs Rural</div>
      <div className="card">
        <Barra label="Distribución" sub={`${rep.nDist} equipo(s)`} valor={rep.promDist ? fmtDur(rep.promDist) : '—'} ratio={rep.promDist / maxProm} color="var(--azul-claro)" />
        <Barra label="Rural" sub={`${rep.nRural} equipo(s)`} valor={rep.promRural ? fmtDur(rep.promRural) : '—'} ratio={rep.promRural / maxProm} color="var(--naranja)" />
        <div className="meta" style={{ marginTop: 6 }}>Los rurales suelen tardar más (amurado al cajón, tacos, enfilmado).</div>
      </div>

      {/* Cantidad embalada por colaboradora */}
      <div className="section-title">Cantidad embalada por colaboradora</div>
      <div className="card">
        {rep.cantOp.length === 0 ? <div className="empty">Sin embalajes registrados.</div>
          : rep.cantOp.map(({ n, v }) => <Barra key={n} label={n} valor={`${v}`} ratio={v / maxOp} />)}
      </div>

      {/* Pareto de demoras */}
      <div className="section-title">Cuellos de botella: tiempo perdido por demoras {rep.demoraTotal > 0 ? `(total ${fmtDur(rep.demoraTotal)})` : ''}</div>
      <div className="card">
        {rep.demoras.length === 0 ? <div className="empty">Sin demoras registradas. 👌</div>
          : rep.demoras.map(({ causa, min, n }) => (
            <Barra key={causa} label={causa} sub={`${n} evento(s)`} valor={`${fmtDur(min)} · ${Math.round((min / rep.demoraTotal) * 100)}%`} ratio={min / maxDem} color="var(--rojo)" />
          ))}
      </div>

      {/* Equipos listos hace más de X días */}
      <div className="section-title">Equipos listos hace más de {DIAS_ALERTA} días (embalados sin despachar)</div>
      <div className="card">
        {rep.listos.length === 0 ? <div className="empty">Nada embalado esperando despacho. 👌</div>
          : rep.listos.map(({ d, min }) => {
            const dias = Math.floor(min / 1440)
            return (
              <Barra key={d.id} label={`Serie ${d.nroSerie || d.ot}`} sub={`${d.cliente} · embalado ${d.embalajeFin ? fechaCorta(d.embalajeFin) : '—'}`}
                valor={dias >= 1 ? `${dias} día(s)` : fmtDur(min)} ratio={min / maxListo}
                color={min > DIAS_ALERTA * 1440 ? 'var(--rojo)' : min > 1440 ? 'var(--naranja)' : 'var(--azul-claro)'} />
            )
          })}
      </div>

      {/* Semáforo por estado */}
      <div className="section-title">Distribución por estado</div>
      <div className="card">
        {rep.porEstado.map(({ e, label, color, n }) => <Barra key={e} label={label} valor={`${n}`} ratio={n / maxEst} color={color} />)}
      </div>
    </>
  )
}
