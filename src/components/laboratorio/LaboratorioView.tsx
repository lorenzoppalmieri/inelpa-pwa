import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { TareaLaboratorio } from '../../types'
import { ENSAYOS_LAB, estadoEnsayo } from '../../types'
import { fechaCorta, hhmm } from '../../lib/time'
import FichaLaboratorio from './FichaLaboratorio'

// ============================================================
// VISTA DEL LABORATORISTA (v1.37) — cola de ensayos. Las tareas llegan solas
// cuando Montaje PO finaliza un transformador. El laboratorista abre la ficha,
// corre los ensayos y finaliza (rutea a despacho o retrabajo).
// ============================================================
export default function LaboratorioView() {
  const tareas = useLiveQuery(() => db.laboratorio.toArray(), []) ?? []
  const [abierta, setAbierta] = useState<TareaLaboratorio | null>(null)

  const g = useMemo(() => {
    const pendientes = tareas.filter((t) => t.estado !== 'finalizada')
      .sort((a, b) => (a.creada < b.creada ? -1 : 1))
    const finalizadas = tareas.filter((t) => t.estado === 'finalizada')
      .sort((a, b) => ((b.finalizada ?? '') < (a.finalizada ?? '') ? -1 : 1))
    return { pendientes, finalizadas }
  }, [tareas])

  // Resumen de ensayos de una tarea (para la tarjeta finalizada).
  const resumen = (t: TareaLaboratorio) => {
    const ap = ENSAYOS_LAB.filter((e) => estadoEnsayo(t, e.key) === 'aprobado').length
    const re = ENSAYOS_LAB.filter((e) => estadoEnsayo(t, e.key) === 'rechazado').length
    return `${ap} aprobado(s)${re ? ` · ${re} rechazado(s)` : ''}`
  }

  return (
    <div>
      <div className="section-title" style={{ margin: '4px 0 12px' }}>🔬 Laboratorio · cola de ensayos</div>

      <div className="logi-kpis">
        <div className="logi-kpi"><div className="n">{g.pendientes.length}</div><div className="l">Pendientes de ensayo</div></div>
        <div className="logi-kpi"><div className="n">{g.finalizadas.length}</div><div className="l">Ensayadas</div></div>
      </div>

      <div className="section-title">Pendientes de ensayo ({g.pendientes.length})</div>
      {g.pendientes.length === 0 ? <div className="empty">Sin transformadores esperando ensayo.</div> : g.pendientes.map((t) => (
        <div className="card logi-tarea" key={t.id}>
          <div className="card-header">
            <div>
              <h3>{t.modelo}{t.nroSerie ? ` · Serie ${t.nroSerie}` : ' · (sin serie)'}</h3>
              <div className="meta">
                Cliente <strong>{t.cliente || 'Stock'}</strong>{t.ot ? ` · OT ${t.ot}` : ''}{t.linea ? ` · ${t.linea === 'rural' ? 'Rural' : 'Distribución'}` : ''} · Ingresó {fechaCorta(t.creada)} {hhmm(t.creada)}
              </div>
            </div>
          </div>
          <div className="row-actions">
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setAbierta(t)}>🔬 Abrir ensayo</button>
          </div>
        </div>
      ))}

      <div className="section-title">Ensayadas ({g.finalizadas.length})</div>
      {g.finalizadas.length === 0 ? <div className="empty">Aún no hay ensayos finalizados.</div> : g.finalizadas.slice(0, 30).map((t) => (
        <div className="card" key={t.id}>
          <div className="card-header">
            <div>
              <h3>{t.modelo}{t.nroSerie ? ` · Serie ${t.nroSerie}` : ''}</h3>
              <div className="meta">
                {resumen(t)} · {t.finalizada ? `${fechaCorta(t.finalizada)} ${hhmm(t.finalizada)}` : ''}
                {t.comentario ? <> · <em>{t.comentario}</em></> : null}
              </div>
            </div>
            <span className="estado-chip" style={{ background: t.resultado === 'retrabajo' ? 'var(--rojo)' : 'var(--estado-fin)' }}>
              {t.resultado === 'retrabajo' ? 'Retrabajo' : 'Aprobado → Despacho'}
            </span>
          </div>
          <div className="row-actions">
            <button className="btn" onClick={() => setAbierta(t)}>👁 Ver ensayo</button>
          </div>
        </div>
      ))}

      {abierta && (
        <FichaLaboratorio
          tarea={tareas.find((x) => x.id === abierta.id) ?? abierta}
          onClose={() => setAbierta(null)}
        />
      )}
    </div>
  )
}
