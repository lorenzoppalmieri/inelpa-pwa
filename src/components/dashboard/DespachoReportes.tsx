import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { DespachoTrafo, EstadoDespacho } from '../../types'
import { ESTADOS_DESPACHO } from '../../types'
import { fmtDur, minutosEntre, fechaCorta } from '../../lib/time'
import { calcularTiempoProductivo } from '../../lib/calendario'
import { ars } from './FletesInternos'
import { PERIODOS_REPORTE, rangoReporte, enRango, type PeriodoReporte } from '../../lib/periodoReporte'

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
  return Math.max(0, calcularTiempoProductivo(d.embalajeInicio, d.embalajeFin) - (d.minutosDemora ?? 0))
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
  const fletes = useLiveQuery(() => db.fletes.toArray(), []) ?? []
  const [periodo, setPeriodo] = useState<PeriodoReporte>('mes_actual')
  const [verFletes, setVerFletes] = useState(false)   // v1.42: modal de desglose de viajes

  // v1.42: además de los totales, se guarda la LISTA de viajes del período para
  // el desglose (Melany necesita poder auditar de dónde sale el gasto).
  const flete = useMemo(() => {
    const r = rangoReporte(periodo)
    const tot = (desde: string, hasta: string) => fletes.filter((f) => enRango(f.fecha, desde, hasta)).reduce((s, f) => s + f.costo, 0)
    const detalle = fletes
      .filter((f) => enRango(f.fecha, r.desde, r.hasta))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))   // más reciente primero
    return { gastoMes: tot(r.desde, r.hasta), gastoMesAnt: tot(r.desdePrev, r.hastaPrev), viajesMes: detalle.length, detalle }
  }, [fletes, periodo])

  const rep = useMemo(() => {
    // Filtro por período: fecha de actividad = despacho / fin de embalaje / ingreso.
    const r = rangoReporte(periodo)
    const dp = despachos.filter((d) => enRango(d.fechaDespacho ?? d.embalajeFin ?? d.fechaIngreso, r.desde, r.hasta))
    const embalados = dp.filter((d) => d.embalajeFin) // ya pasaron por embalaje

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
    for (const d of dp) for (const dm of d.demoras ?? []) {
      const min = calcularTiempoProductivo(dm.inicio, dm.fin ?? ahoraISO)
      if (min <= 0) continue
      const cur = dem.get(dm.causa) ?? { min: 0, n: 0 }
      cur.min += min; cur.n++; dem.set(dm.causa, cur)
    }
    const demoras = [...dem.entries()].map(([causa, v]) => ({ causa, min: v.min, n: v.n })).sort((a, b) => b.min - a.min)
    const demoraTotal = demoras.reduce((a, b) => a + b.min, 0)

    // 4) Equipos listos (embalado) hace más de X días, sin despachar.
    // OJO: esto es ANTIGÜEDAD, no tiempo de trabajo -> va en días CALENDARIO a
    // propósito (un trafo parado en depósito envejece también de noche y el finde).
    // No cambiar a horas hábiles.
    const listos = dp.filter((d) => d.estado === 'embalado' && d.embalajeFin)
      .map((d) => ({ d, min: minutosEntre(d.embalajeFin, ahoraISO) }))
      .sort((a, b) => b.min - a.min)

    // 5) Distribución por estado (semáforo).
    const porEstado = ESTADOS_DESPACHO.map((e) => ({ e: e.id as EstadoDespacho, label: e.label, color: e.color, n: dp.filter((d) => d.estado === e.id).length }))

    // 6) Despachados en el período vs el período anterior (por fecha de despacho).
    const despAct = despachos.filter((d) => enRango(d.fechaDespacho, r.desde, r.hasta)).length
    const despAnt = despachos.filter((d) => enRango(d.fechaDespacho, r.desdePrev, r.hastaPrev)).length

    return {
      promGeneral, promDist: media(tDist), promRural: media(tRural), nDist: tDist.length, nRural: tRural.length,
      cantOp, demoras, demoraTotal, listos, porEstado, despAct, despAnt,
    }
  }, [despachos, ahoraISO, periodo])

  const selectorPeriodo = (
    <div className="filtros no-print" style={{ marginBottom: 12 }}>
      <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoReporte)}>
        {PERIODOS_REPORTE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </div>
  )

  if (despachos.length === 0) return <>{selectorPeriodo}<div className="empty">Aún no hay transformadores en despacho para analizar.</div></>

  const maxProm = Math.max(1, rep.promDist, rep.promRural)
  const maxOp = Math.max(1, ...rep.cantOp.map((x) => x.v))
  const maxDem = Math.max(1, ...rep.demoras.map((x) => x.min))
  const maxEst = Math.max(1, ...rep.porEstado.map((x) => x.n))
  const maxListo = Math.max(1, ...rep.listos.map((x) => x.min))
  const evol = rep.despAct - rep.despAnt

  return (
    <>
      {selectorPeriodo}
      {/* Indicadores resumen */}
      <div className="logi-kpis">
        <div className="logi-kpi"><div className="n">{rep.despAct}</div><div className="l">Despachados (período)</div></div>
        <div className="logi-kpi"><div className="n" style={{ color: evol >= 0 ? 'var(--estado-fin)' : 'var(--rojo)' }}>{evol >= 0 ? '+' : ''}{evol}</div><div className="l">vs período anterior ({rep.despAnt})</div></div>
        <div className="logi-kpi"><div className="n">{rep.promGeneral ? fmtDur(rep.promGeneral) : '—'}</div><div className="l">Prom. embalaje</div></div>
        <div className="logi-kpi"><div className="n" style={{ color: (rep.listos[0]?.min ?? 0) > DIAS_ALERTA * 1440 ? 'var(--rojo)' : undefined }}>{rep.listos.length}</div><div className="l">Listos sin despachar</div></div>
      </div>

      {/* Gasto de flete interno */}
      <div className="section-title">Gasto de flete interno</div>
      <div className="logi-kpis">
        <div className="logi-kpi"><div className="n" style={{ color: 'var(--naranja)' }}>{ars(flete.gastoMes)}</div><div className="l">Gasto (período)</div></div>
        <div className="logi-kpi"><div className="n">{ars(flete.gastoMesAnt)}</div><div className="l">Período anterior</div></div>
        <div className="logi-kpi"><div className="n" style={{ color: (flete.gastoMes - flete.gastoMesAnt) <= 0 ? 'var(--estado-fin)' : 'var(--rojo)' }}>{flete.gastoMes - flete.gastoMesAnt >= 0 ? '+' : ''}{ars(flete.gastoMes - flete.gastoMesAnt)}</div><div className="l">Variación</div></div>
        {/* v1.42: tarjeta clickeable → abre el desglose de viajes del período. */}
        <button
          type="button" className="logi-kpi" onClick={() => setVerFletes(true)} disabled={flete.viajesMes === 0}
          title={flete.viajesMes ? 'Ver el detalle de los viajes' : 'Sin viajes registrados en el período'}
          style={{
            cursor: flete.viajesMes ? 'pointer' : 'default', font: 'inherit', color: 'inherit', textAlign: 'center',
            border: flete.viajesMes ? '1px solid var(--azul-claro)' : '1px solid var(--borde)',
          }}
        >
          <div className="n">{flete.viajesMes}</div>
          <div className="l">Viajes (período){flete.viajesMes ? ' · ver detalle 🔍' : ''}</div>
        </button>
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

      {/* v1.42: desglose de viajes del período (drill-down de la tarjeta "Viajes") */}
      {verFletes && (
        <div className="modal-overlay" onClick={() => setVerFletes(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820, width: '92vw' }}>
            <div className="section-title" style={{ marginTop: 0 }}>
              Detalle de fletes del período · {flete.detalle.length} viaje(s) · total <strong style={{ color: 'var(--naranja)' }}>{ars(flete.gastoMes)}</strong>
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <table className="tabla-fletes" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--borde)' }}>
                    <th style={{ padding: '8px 6px' }}>Fecha</th>
                    <th style={{ padding: '8px 6px' }}>Cliente / destino</th>
                    <th style={{ padding: '8px 6px' }}>Serie(s) / modelo</th>
                    <th style={{ padding: '8px 6px' }}>Transportista</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {flete.detalle.map((f) => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--borde)' }}>
                      <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{fechaCorta(f.fecha)}</td>
                      {/* Los fletes anteriores a v1.42 no tienen cliente: cae al concepto. */}
                      <td style={{ padding: '8px 6px' }}>
                        {f.cliente || f.concepto}
                        {f.cliente && f.concepto ? <div className="meta">{f.concepto}</div> : null}
                      </td>
                      <td style={{ padding: '8px 6px' }}>{f.series?.length ? f.series.join(', ') : <span className="meta">—</span>}</td>
                      <td style={{ padding: '8px 6px' }}>{f.transportista || <span className="meta">—</span>}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{ars(f.costo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--borde)' }}>
                    <td colSpan={4} style={{ padding: '8px 6px', fontWeight: 700 }}>Total del período</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: 'var(--naranja)' }}>{ars(flete.gastoMes)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="meta" style={{ marginTop: 10 }}>
              Cliente y series se cargan al registrar el flete. Los viajes anteriores a esta versión muestran el concepto en su lugar.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn" onClick={() => setVerFletes(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
