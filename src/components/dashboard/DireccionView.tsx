import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { SECTORES, periodoMensual, esReparacion, type Tarea, type AndonAreaId, type SectorId } from '../../types'
import { calcularOEE, paretoDemoras, filtrarPorRango, minutosParada, pct } from '../../lib/kpi'
import { calcularAndon, ANDON_AREAS, tierDe } from '../../lib/andon'
import { minutosLaboralesLogistica } from '../../lib/calendario'

// ============================================================
// VISTA DIRECCION (v1.16) — tablero ejecutivo para gerencia/socios.
// Solo lectura. Se nutre de la data que ya existe (KPIs, ANDON, paradas,
// logistica). Visible unicamente para el usuario 'lorenzo' (gateado en
// DashboardView). Pensado para proyectar en reunion + exportar a PDF.
// ============================================================

type Periodo = 'mes_actual' | 'mes_anterior' | 'anual'
const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'mes_actual', label: 'Mes actual' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'anual', label: 'Acumulado anual' },
]

// Areas ANDON que pertenecen a cada linea (para "Produccion por linea").
const AREAS_DIST: AndonAreaId[] = ['montaje_dist', 'bob_dist_at', 'bob_dist_bt', 'herreria_dist']
const AREAS_RURAL: AndonAreaId[] = ['montaje_rural', 'bob_rural_at', 'bob_rural_bt', 'herreria_rural']

function mesesDe(periodo: Periodo, now: Date): string[] {
  if (periodo === 'anual') {
    const y = now.getFullYear()
    return Array.from({ length: now.getMonth() + 1 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
  }
  const d = periodo === 'mes_anterior' ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now
  return [periodoMensual(d)]
}
function rangoDe(periodo: Periodo, now: Date): { desde: string; hasta: string } {
  const y = now.getFullYear(), m = now.getMonth()
  if (periodo === 'anual') return { desde: new Date(y, 0, 1).toISOString(), hasta: new Date(y + 1, 0, 1).toISOString() }
  const mm = periodo === 'mes_anterior' ? m - 1 : m
  return { desde: new Date(y, mm, 1).toISOString(), hasta: new Date(y, mm + 1, 1).toISOString() }
}

interface AggArea { terminados: number; objetivo: number; retrabajos: number }

export default function DireccionView() {
  const [periodo, setPeriodo] = useState<Periodo>('mes_actual')
  const now = useMemo(() => new Date(), [])

  const todas = useLiveQuery(() => db.tareas.toArray(), [])
  const objetivos = useLiveQuery(() => db.objetivos.toArray(), [])
  const solicitudes = useLiveQuery(() => db.solicitudesLogistica.toArray(), [])

  // Mapa de objetivos por clave `${periodo}_${area}`.
  const objMap = useMemo(() => new Map((objetivos ?? []).map((o) => [o.id, o.cantidad])), [objetivos])

  // Agrega ANDON (terminados/objetivo/retrabajos) por area sumando los meses del periodo.
  const aggArea = useMemo(() => {
    return (meses: string[]): Map<AndonAreaId, AggArea> => {
      const acc = new Map<AndonAreaId, AggArea>()
      ANDON_AREAS.forEach((a) => acc.set(a.id, { terminados: 0, objetivo: 0, retrabajos: 0 }))
      for (const mes of meses) {
        const objMes = new Map<AndonAreaId, number>()
        ANDON_AREAS.forEach((a) => objMes.set(a.id, objMap.get(`${mes}_${a.id}`) ?? 0))
        const filas = calcularAndon(todas ?? [], objMes, mes)
        for (const f of filas) {
          const c = acc.get(f.area.id)!
          c.terminados += f.terminados; c.objetivo += f.objetivo; c.retrabajos += f.retrabajos
        }
      }
      return acc
    }
  }, [todas, objMap])

  // Resumen (un periodo): OEE, unidades, objetivo, retrabajos, demoras.
  const resumenDe = useMemo(() => {
    return (per: Periodo) => {
      const meses = mesesDe(per, now)
      const { desde, hasta } = rangoDe(per, now)
      const enRango = filtrarPorRango(todas ?? [], desde, hasta)
      const oee = calcularOEE(enRango).oee
      const agg = aggArea(meses)
      let unidades = 0, objetivo = 0, retrabajos = 0
      agg.forEach((v) => { unidades += v.terminados; objetivo += v.objetivo; retrabajos += v.retrabajos })
      const demorasMin = enRango.filter((t) => !esReparacion(t)).reduce((a, t) => a + minutosParada(t), 0)
      return { oee, unidades, objetivo, retrabajos, demorasMin, agg, enRango }
    }
  }, [todas, aggArea, now])

  const actual = useMemo(() => resumenDe(periodo), [resumenDe, periodo])
  // Tendencia: solo para vistas mensuales, comparado con el mes anterior.
  const previo = useMemo(
    () => (periodo === 'mes_actual' ? resumenDe('mes_anterior') : null),
    [resumenDe, periodo],
  )

  // Produccion por linea (unidades terminadas vs objetivo).
  const porLinea = useMemo(() => {
    const sum = (areas: AndonAreaId[]) => {
      let term = 0, obj = 0
      areas.forEach((a) => { const v = actual.agg.get(a); if (v) { term += v.terminados; obj += v.objetivo } })
      return { term, obj, pct: obj > 0 ? term / obj : 0 }
    }
    return { dist: sum(AREAS_DIST), rural: sum(AREAS_RURAL) }
  }, [actual])

  // Ranking de sectores por OEE (los que tuvieron trabajo en el periodo).
  const ranking = useMemo(() => {
    return SECTORES.map((s) => {
      const tareasSec = actual.enRango.filter((t) => t.sectorId === (s.id as SectorId))
      const fin = tareasSec.filter((t) => t.estado === 'finalizada' && !esReparacion(t))
      if (fin.length === 0) return null
      return { sector: s, oee: calcularOEE(tareasSec), n: fin.length }
    }).filter((x): x is { sector: typeof SECTORES[number]; oee: ReturnType<typeof calcularOEE>; n: number } => x !== null)
      .sort((a, b) => b.oee.oee - a.oee.oee)
  }, [actual])

  // Pareto de demoras del periodo (top 6).
  const pareto = useMemo(() => paretoDemoras(actual.enRango).slice(0, 6), [actual])

  // ANDON consolidado: cuantas areas en cada tier (mes en curso del periodo).
  const consolidado = useMemo(() => {
    const conteo = { rojo: 0, verde: 0, verde_fuerte: 0, violeta: 0 }
    const filas = ANDON_AREAS.map((a) => {
      const v = actual.agg.get(a.id)!
      const p = v.objetivo > 0 ? v.terminados / v.objetivo : 0
      const tier = tierDe(p)
      conteo[tier.id as keyof typeof conteo] = (conteo[tier.id as keyof typeof conteo] ?? 0) + 1
      return { area: a, ...v, pct: p, tier }
    })
    return { conteo, filas }
  }, [actual])

  // Tendencia 6 meses: OEE + unidades por mes.
  const tendencia = useMemo(() => {
    const out: { mes: string; oee: number; unidades: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mes = periodoMensual(d)
      const { desde, hasta } = { desde: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(), hasta: new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString() }
      const oee = calcularOEE(filtrarPorRango(todas ?? [], desde, hasta)).oee
      const agg = aggArea([mes])
      let unidades = 0; agg.forEach((v) => unidades += v.terminados)
      out.push({ mes: d.toLocaleDateString('es-AR', { month: 'short' }), oee, unidades })
    }
    return out
  }, [todas, aggArea, now])

  // Logistica: tiempo de respuesta (en horario laboral) + atendidas/pendientes.
  const logistica = useMemo(() => {
    const { desde, hasta } = rangoDe(periodo, now)
    const enRango = (solicitudes ?? []).filter((s) => s.creada >= desde && s.creada < hasta)
    const entregadas = enRango.filter((s) => s.estado === 'entregado' && s.entregadaEn)
    const tiempos = entregadas.map((s) => minutosLaboralesLogistica(s.creada, s.entregadaEn))
    const prom = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : 0
    const pendientes = enRango.filter((s) => s.estado !== 'entregado').length
    return { total: enRango.length, entregadas: entregadas.length, pendientes, promedioMin: Math.round(prom) }
  }, [solicitudes, periodo, now])

  if (!todas || !objetivos) return <div className="meta">Cargando tablero de dirección…</div>

  const maxUnidTend = Math.max(1, ...tendencia.map((t) => t.unidades))

  return (
    <div className="dir">
      <div className="dir-head">
        <div className="section-title" style={{ margin: 0 }}>Dirección · visión ejecutiva</div>
        <div className="dir-controls no-print">
          <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
            {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => window.print()}>🖨 Exportar PDF</button>
        </div>
      </div>

      {/* ---- Bloque 1: Resumen ejecutivo ---- */}
      <div className="dir-heroes">
        <Hero label="OEE de planta" valor={pct(actual.oee)} trend={trend(actual.oee, previo?.oee)} color="azul" />
        <Hero label="Producción vs objetivo"
          valor={actual.objetivo > 0 ? pct(actual.unidades / actual.objetivo) : `${actual.unidades} u`}
          sub={actual.objetivo > 0 ? `${actual.unidades} / ${actual.objetivo} u` : 'sin objetivo cargado'}
          trend={trend(actual.unidades, previo?.unidades)} color="violeta" />
        <Hero label="Retrabajos" valor={String(actual.retrabajos)} trend={trend(actual.retrabajos, previo?.retrabajos)} color="rojo" invertido />
        <Hero label="Tiempo perdido (demoras)" valor={horas(actual.demorasMin)} trend={trend(actual.demorasMin, previo?.demorasMin)} color="naranja" invertido />
      </div>

      <div className="dir-grid">
        {/* ---- Bloque 2: Produccion por linea ---- */}
        <div className="card dir-card">
          <div className="dir-card-tit">Producción por línea</div>
          <LineaBarra nombre="Distribución" {...porLinea.dist} />
          <LineaBarra nombre="Rural" {...porLinea.rural} />
        </div>

        {/* ---- Bloque 4: ANDON consolidado ---- */}
        <div className="card dir-card">
          <div className="dir-card-tit">ANDON · estado de premios</div>
          <div className="dir-andon-resumen">
            <span className="dir-pill andon-violeta">{consolidado.conteo.violeta} completo</span>
            <span className="dir-pill andon-verde3">{consolidado.conteo.verde_fuerte} casi</span>
            <span className="dir-pill andon-verde1">{consolidado.conteo.verde} parcial</span>
            <span className="dir-pill andon-rojo">{consolidado.conteo.rojo} sin premio</span>
          </div>
          <div className="dir-mini-list">
            {consolidado.filas.map((f) => (
              <div key={f.area.id} className="dir-mini-row">
                <span className={'dir-dot ' + f.tier.clase} />
                <span className="dir-mini-area">{f.area.label}</span>
                <span className="dir-mini-num">{f.terminados}/{f.objetivo || '—'}</span>
                <span className="dir-mini-pct">{f.objetivo > 0 ? pct(f.pct) : '—'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ---- Bloque 3a: Ranking de areas por OEE ---- */}
        <div className="card dir-card">
          <div className="dir-card-tit">Ranking de áreas (OEE)</div>
          {ranking.length === 0 ? <div className="empty">Sin producción finalizada en el período.</div> : (
            <div className="dir-mini-list">
              {ranking.map((r) => (
                <div key={r.sector.id} className="dir-mini-row">
                  <span className="dir-mini-area">{r.sector.nombre}</span>
                  <span className="dir-bar-mini"><span style={{ width: `${Math.round(r.oee.oee * 100)}%` }} /></span>
                  <span className="dir-mini-pct">{pct(r.oee.oee)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- Bloque 3b: Pareto de perdidas ---- */}
        <div className="card dir-card">
          <div className="dir-card-tit">Pérdidas · causas de demora</div>
          {pareto.length === 0 ? <div className="empty">Sin demoras registradas en el período.</div> : (
            <div className="dir-mini-list">
              {pareto.map((p) => (
                <div key={p.causa} className="dir-mini-row">
                  <span className="dir-mini-area">{p.label}</span>
                  <span className="dir-bar-mini perdida"><span style={{ width: `${Math.round(p.pct * 100)}%` }} /></span>
                  <span className="dir-mini-pct">{horas(p.minutos)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- Bloque 5: Logistica ---- */}
        <div className="card dir-card">
          <div className="dir-card-tit">Logística · abastecimiento</div>
          <div className="dir-logi">
            <div><div className="dir-logi-n">{logistica.promedioMin ? horas(logistica.promedioMin) : '—'}</div><div className="meta">Resp. promedio (hs laborales)</div></div>
            <div><div className="dir-logi-n">{logistica.entregadas}</div><div className="meta">Pedidos entregados</div></div>
            <div><div className="dir-logi-n" style={{ color: logistica.pendientes > 0 ? 'var(--rojo,#dc2626)' : undefined }}>{logistica.pendientes}</div><div className="meta">Pendientes</div></div>
          </div>
        </div>

        {/* ---- Bloque 7: Tendencia 6 meses ---- */}
        <div className="card dir-card dir-card-wide">
          <div className="dir-card-tit">Tendencia · últimos 6 meses</div>
          <div className="dir-trend">
            {tendencia.map((t, i) => (
              <div key={i} className="dir-trend-col">
                <div className="dir-trend-bars">
                  <span className="dir-trend-oee" title={`OEE ${pct(t.oee)}`} style={{ height: `${Math.round(t.oee * 100)}%` }} />
                  <span className="dir-trend-und" title={`${t.unidades} u`} style={{ height: `${Math.round((t.unidades / maxUnidTend) * 100)}%` }} />
                </div>
                <div className="dir-trend-lbl">{t.mes}</div>
              </div>
            ))}
          </div>
          <div className="dir-trend-leg"><span><i className="dir-trend-oee" /> OEE</span><span><i className="dir-trend-und" /> Unidades</span></div>
        </div>
      </div>
    </div>
  )
}

// ---------- helpers de presentacion ----------
function horas(min: number): string {
  if (min < 60) return `${Math.round(min)} min`
  return `${(min / 60).toFixed(1)} h`
}
// Tendencia: signo y % de cambio de A respecto de B (mes anterior).
function trend(a: number, b?: number): { dir: 'up' | 'down' | 'flat'; txt: string } | null {
  if (b == null || b === 0) return null
  const delta = (a - b) / b
  if (Math.abs(delta) < 0.005) return { dir: 'flat', txt: '0%' }
  return { dir: delta > 0 ? 'up' : 'down', txt: `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta * 100).toFixed(0)}%` }
}

function Hero({ label, valor, sub, trend, color, invertido }: {
  label: string; valor: string; sub?: string
  trend: { dir: 'up' | 'down' | 'flat'; txt: string } | null
  color: string; invertido?: boolean
}) {
  // invertido: para métricas donde "menos es mejor" (retrabajos, demoras) el color
  // de la flecha se invierte (subir = malo = rojo).
  const buena = trend ? (invertido ? trend.dir === 'down' : trend.dir === 'up') : true
  return (
    <div className={'dir-hero dir-' + color}>
      <div className="dir-hero-lbl">{label}</div>
      <div className="dir-hero-val">{valor}</div>
      {sub && <div className="dir-hero-sub">{sub}</div>}
      {trend && <div className={'dir-hero-trend ' + (trend.dir === 'flat' ? 'flat' : buena ? 'bien' : 'mal')}>{trend.txt} vs mes ant.</div>}
    </div>
  )
}

function LineaBarra({ nombre, term, obj, pct: p }: { nombre: string; term: number; obj: number; pct: number }) {
  return (
    <div className="dir-linea">
      <div className="dir-linea-top"><span>{nombre}</span><strong>{term} / {obj || '—'} u {obj > 0 ? `· ${Math.round(p * 100)}%` : ''}</strong></div>
      <div className="dir-bar"><span style={{ width: `${Math.min(100, Math.round(p * 100))}%` }} /></div>
    </div>
  )
}
