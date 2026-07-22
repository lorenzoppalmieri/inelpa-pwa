import { useMemo } from 'react'
import type { DespachoTrafo } from '../../types'
import { EMBALAJE_ALERTA_MIN, LISTO_ALERTA_DIAS, checklistCompleto } from '../../types'
import { fmtDur, minutosEntre } from '../../lib/time'

// ============================================================
// ALERTAS AUTOMÁTICAS DE DESPACHO (v1.28, Fase 3). Se calculan en vivo sobre los
// despachos y se muestran como panel arriba del tablero (relevamiento, secc. 13):
//   · Embalaje excesivo (activo > umbral)
//   · Embalados sin checklist completo / sin fotos (bloquean el despacho)
//   · Nuevos ingresos de hoy
//   · Equipos listos hace más de X días
// ============================================================

interface Alerta { nivel: 'rojo' | 'naranja' | 'info'; icono: string; texto: string }

export default function AlertasDespacho({ despachos }: { despachos: DespachoTrafo[] }) {
  const ahoraISO = new Date().toISOString()

  const alertas = useMemo<Alerta[]>(() => {
    const out: Alerta[] = []
    const hoy = new Date().toLocaleDateString('en-CA')

    // Tiempo activo de embalaje (descuenta demoras cerradas + la vigente).
    const activo = (d: DespachoTrafo) => {
      if (!d.embalajeInicio) return 0
      const dem = (d.minutosDemora ?? 0) + (d.demoraEnCurso ? minutosEntre(d.demoraEnCurso, ahoraISO) : 0)
      return Math.max(0, minutosEntre(d.embalajeInicio, ahoraISO) - dem)
    }

    // 1) Embalaje excesivo.
    const exces = despachos.filter((d) => (d.estado === 'embalando' || d.estado === 'demorado') && activo(d) > EMBALAJE_ALERTA_MIN)
    if (exces.length) {
      const peor = exces.slice().sort((a, b) => activo(b) - activo(a))[0]
      out.push({ nivel: 'rojo', icono: '⏱', texto: `${exces.length} embalaje(s) excesivo(s) (>${fmtDur(EMBALAJE_ALERTA_MIN)}). Peor: serie ${peor.nroSerie} — ${fmtDur(activo(peor))}.` })
    }

    // 2) Embalados sin checklist / sin fotos (no se pueden despachar).
    const incompletos = despachos.filter((d) => d.estado === 'embalado' && !checklistCompleto(d.checklist))
    const sinFotos = incompletos.filter((d) => !d.checklist?.fotos).length
    if (incompletos.length) {
      out.push({ nivel: 'naranja', icono: '📋', texto: `${incompletos.length} embalado(s) con checklist incompleto${sinFotos ? ` · ${sinFotos} sin fotos` : ''} — no se pueden despachar.` })
    }

    // 3) Listos (embalado) hace más de X días, sin despachar.
    const listosViejos = despachos.filter((d) => d.estado === 'embalado' && d.embalajeFin && minutosEntre(d.embalajeFin, ahoraISO) > LISTO_ALERTA_DIAS * 1440)
    if (listosViejos.length) {
      out.push({ nivel: 'rojo', icono: '📦', texto: `${listosViejos.length} equipo(s) listo(s) hace más de ${LISTO_ALERTA_DIAS} días sin despachar.` })
    }

    // 4) Nuevos ingresos de hoy (info).
    const nuevos = despachos.filter((d) => d.estado === 'esperando_embalaje' && d.creada.slice(0, 10) === hoy).length
    if (nuevos) out.push({ nivel: 'info', icono: '🆕', texto: `${nuevos} nuevo(s) ingreso(s) de despacho hoy, esperando embalaje.` })

    return out
  }, [despachos, ahoraISO])

  if (alertas.length === 0) return null

  const bg = (n: Alerta['nivel']) => n === 'rojo' ? 'rgba(239,68,68,.12)' : n === 'naranja' ? 'rgba(245,158,11,.12)' : 'rgba(30,111,184,.12)'
  const bd = (n: Alerta['nivel']) => n === 'rojo' ? 'var(--rojo)' : n === 'naranja' ? 'var(--naranja)' : 'var(--azul-claro)'

  return (
    <div className="card" style={{ padding: '10px 12px', marginBottom: 12 }}>
      <div className="meta" style={{ fontWeight: 800, marginBottom: 6 }}>🔔 Alertas ({alertas.length})</div>
      {alertas.map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', marginBottom: 4, borderRadius: 8, background: bg(a.nivel), borderLeft: `4px solid ${bd(a.nivel)}` }}>
          <span>{a.icono}</span><span style={{ fontSize: '.9rem' }}>{a.texto}</span>
        </div>
      ))}
    </div>
  )
}
