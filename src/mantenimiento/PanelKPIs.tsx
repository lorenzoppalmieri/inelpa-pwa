import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fechaCorta } from '../lib/time'

// ============================================================
// PANEL DE KPIs — MANTENIMIENTO
// Lee las vistas mant_v_* (v1.64), calculadas sobre el historial real
// (mant_registros, 3 años migrados): resumen, tendencia mensual y
// ranking de fallas. Da números desde el día 1, sin esperar a tener OT.
// ============================================================

interface Resumen {
  activos: number; activos_criticos: number
  correctivos_hist: number; preventivos_hist: number; horas_hist: number
  avisos_abiertos: number; ot_abiertas: number; gamas_activas: number
}
interface Mes { mes: string; correctivos: number; preventivos: number; horas: number }
interface Rank {
  activo_id: string; nombre: string; sector: string | null; criticidad: 'A' | 'B' | 'C'
  correctivos: number; preventivos: number; horas_total: number; mtbf_dias: number | null; ultima_correctiva: string | null
}

function Tarjeta({ label, valor, sub, tono }: { label: string; valor: string | number; sub?: string; tono?: string }) {
  return (
    <div className="mant-kpi-card" style={tono ? { borderTopColor: tono } : undefined}>
      <div className="mant-kpi-valor">{valor}</div>
      <div className="mant-kpi-label">{label}</div>
      {sub && <div className="meta">{sub}</div>}
    </div>
  )
}

export default function PanelKPIs({ onVerFicha }: { onVerFicha?: (id: string) => void }) {
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [meses, setMeses] = useState<Mes[]>([])
  const [ranking, setRanking] = useState<Rank[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) { setCargando(false); return }
    let vivo = true
    ;(async () => {
      const [{ data: r, error: e1 }, { data: m }, { data: rk }] = await Promise.all([
        supabase.from('mant_v_resumen').select('*').maybeSingle(),
        supabase.from('mant_v_kpi_mensual').select('*'),
        supabase.from('mant_v_ranking_fallas').select('*').limit(15),
      ])
      if (!vivo) return
      if (e1) { setError('No se pudieron cargar los KPIs. ¿Corriste el SQL v1.64?'); setCargando(false); return }
      setResumen((r ?? null) as Resumen | null)
      setMeses(((m ?? []) as Mes[]).slice(-18))
      setRanking((rk ?? []) as Rank[])
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [])

  const maxMes = useMemo(() => Math.max(1, ...meses.map((m) => m.correctivos + m.preventivos)), [meses])

  if (!supabase) return <div className="empty">Supabase no está configurado (faltan credenciales en .env).</div>
  if (cargando) return <div className="empty">Cargando indicadores…</div>
  if (error) return <div className="error-msg" style={{ textAlign: 'left' }}>{error}</div>

  return (
    <div className="mant-kpis">
      {/* ---------- Tarjetas ---------- */}
      <div className="mant-kpi-grid">
        <Tarjeta label="Activos" valor={resumen?.activos ?? 0} sub={`${resumen?.activos_criticos ?? 0} críticos (A)`} tono="#1e6fb8" />
        <Tarjeta label="Correctivos (histórico)" valor={resumen?.correctivos_hist ?? 0} tono="#ef4444" />
        <Tarjeta label="Preventivos (histórico)" valor={resumen?.preventivos_hist ?? 0} tono="#22c55e" />
        <Tarjeta label="Horas registradas" valor={resumen?.horas_hist ?? 0} tono="#f59e0b" />
        <Tarjeta label="Avisos sin atender" valor={resumen?.avisos_abiertos ?? 0} tono="#ef4444" />
        <Tarjeta label="OT abiertas" valor={resumen?.ot_abiertas ?? 0} tono="#64748b" />
        <Tarjeta label="Gamas activas" valor={resumen?.gamas_activas ?? 0} tono="#1e6fb8" />
      </div>

      {/* ---------- Tendencia mensual ---------- */}
      <div className="card">
        <div className="section-title" style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>Tendencia mensual</div>
        <div className="meta" style={{ marginBottom: 10 }}>
          <span className="mant-lg"><i style={{ background: '#ef4444' }} /> Correctivo</span>
          <span className="mant-lg"><i style={{ background: '#22c55e' }} /> Preventivo</span>
        </div>
        {meses.length === 0 ? <div className="meta">Sin datos de historial.</div> : (
          <div className="mant-barras">
            {meses.map((m) => {
              const tot = m.correctivos + m.preventivos
              const h = Math.round((tot / maxMes) * 100)
              const cP = tot > 0 ? Math.round((m.correctivos / tot) * 100) : 0
              return (
                <div key={m.mes} className="mant-barra" title={`${m.mes}: ${m.correctivos} corr · ${m.preventivos} prev`}>
                  <div className="mant-barra-col" style={{ height: `${h}%` }}>
                    <div style={{ height: `${cP}%`, background: '#ef4444' }} />
                    <div style={{ height: `${100 - cP}%`, background: '#22c55e' }} />
                  </div>
                  <span className="mant-barra-lbl">{m.mes.slice(2, 7)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ---------- Ranking de fallas ---------- */}
      <div className="card">
        <div className="section-title" style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>Máquinas con más correctivo</div>
        {ranking.length === 0 ? <div className="meta">Sin correctivos vinculados a un activo todavía.</div> : (
          <div className="mant-tabla-wrap">
            <table className="mant-tabla">
              <thead>
                <tr><th>Código</th><th>Máquina</th><th>Crit.</th><th>Correctivos</th><th>MTBF (días)</th><th>Horas</th><th>Última</th></tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.activo_id} onClick={() => onVerFicha?.(r.activo_id)} title={`Ver ficha de ${r.activo_id}`}>
                    <td><strong>{r.activo_id}</strong></td>
                    <td>{r.nombre}{r.sector ? <span className="meta"> · {r.sector}</span> : null}</td>
                    <td><span className={`mant-chip-crit mant-crit-${r.criticidad}`}>{r.criticidad}</span></td>
                    <td><strong>{r.correctivos}</strong></td>
                    <td>{r.mtbf_dias ?? '—'}</td>
                    <td>{r.horas_total}</td>
                    <td className="meta">{r.ultima_correctiva ? fechaCorta(r.ultima_correctiva) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
