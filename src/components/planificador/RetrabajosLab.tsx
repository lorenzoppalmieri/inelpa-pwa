import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { TareaLaboratorio } from '../../types'
import { ENSAYOS_LAB, estadoEnsayo } from '../../types'
import { guardarLaboratorio } from '../../sync/syncEngine'
import { fechaCorta } from '../../lib/time'

// ============================================================
// PANEL DE RETRABAJOS DE LABORATORIO (v1.37) — para el planificador.
// Lista los trafos que el laboratorio rechazó (resultado 'retrabajo') y que aún
// no se atendieron, con los ensayos que fallaron y el comentario del laboratorista.
// El planificador replanifica y marca "Resuelto".
// ============================================================
export default function RetrabajosLab() {
  const lab = useLiveQuery(() => db.laboratorio.toArray(), []) ?? []
  const pendientes = useMemo(
    () => lab.filter((t) => t.resultado === 'retrabajo' && !t.retrabajoResuelto)
      .sort((a, b) => ((b.finalizada ?? '') < (a.finalizada ?? '') ? -1 : 1)),
    [lab],
  )

  if (pendientes.length === 0) return null

  const rechazados = (t: TareaLaboratorio) =>
    ENSAYOS_LAB.filter((e) => estadoEnsayo(t, e.key) === 'rechazado').map((e) => e.label).join(', ')

  async function resolver(t: TareaLaboratorio) {
    await guardarLaboratorio({ ...t, retrabajoResuelto: true })
  }

  return (
    <div className="card" style={{ borderLeft: '5px solid var(--rojo)', marginBottom: 14 }}>
      <div className="section-title" style={{ marginTop: 0, color: 'var(--rojo)' }}>🔧 Retrabajos de laboratorio ({pendientes.length})</div>
      {pendientes.map((t) => (
        <div key={t.id} className="pareto-row" style={{ marginBottom: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <strong>{t.modelo}{t.nroSerie ? ` · Serie ${t.nroSerie}` : ''}</strong>
            <div className="meta" style={{ color: 'var(--rojo)' }}>✗ Rechazó: {rechazados(t) || '—'}</div>
            {t.comentario ? <div className="meta" style={{ fontStyle: 'italic' }}>📝 {t.comentario}</div> : null}
            <div className="meta">{t.cliente || 'Stock'}{t.ot ? ` · OT ${t.ot}` : ''}{t.finalizada ? ` · ${fechaCorta(t.finalizada)}` : ''}</div>
          </div>
          <button className="btn btn-verde" onClick={() => void resolver(t)}>✓ Resuelto</button>
        </div>
      ))}
    </div>
  )
}
