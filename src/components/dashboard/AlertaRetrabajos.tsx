import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { TareaLaboratorio } from '../../types'
import { fechaCorta } from '../../lib/time'

// ============================================================
// ALERTA DE RETRABAJOS DE LABORATORIO (v1.73)
//
// Un trafo que NO pasó el ensayo tiene que volver a Montaje PO, y para eso el
// planificador tiene que CREAR UNA TAREA NUEVA (reabrir la vieja no genera un
// segundo ensayo: el puente a Laboratorio se dispara una sola vez por tarea).
//
// El panel de detalle vive dentro de Planificación, pero ahí se perdía: si el
// planificador estaba parado en Gantt, KPIs o Andón, no se enteraba. Esta franja
// roja se muestra en TODAS las pestañas del tablero mientras haya retrabajos sin
// atender, y lleva de un clic al panel donde se resuelven.
// ============================================================

/** Cuántos retrabajos de laboratorio están sin atender. */
export function useRetrabajosPendientes(): TareaLaboratorio[] {
  const lab = useLiveQuery(() => db.laboratorio.toArray(), []) ?? []
  return useMemo(
    () => lab.filter((t) => t.resultado === 'retrabajo' && !t.retrabajoResuelto)
      .sort((a, b) => ((b.finalizada ?? '') < (a.finalizada ?? '') ? -1 : 1)),
    [lab],
  )
}

export default function AlertaRetrabajos({ onIr }: { onIr?: () => void }) {
  const pendientes = useRetrabajosPendientes()
  if (pendientes.length === 0) return null

  // Se nombran los primeros para que se reconozcan sin abrir nada.
  const muestra = pendientes.slice(0, 3)
  const resto = pendientes.length - muestra.length

  return (
    <div
      className="card no-print"
      style={{
        borderLeft: '6px solid var(--rojo)',
        background: 'color-mix(in srgb, var(--rojo) 12%, var(--panel))',
        marginBottom: 12,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 260 }}>
        <div style={{ fontWeight: 800, color: 'var(--rojo)' }}>
          🔧 {pendientes.length} transformador{pendientes.length === 1 ? '' : 'es'} rechazado{pendientes.length === 1 ? '' : 's'} en Laboratorio
        </div>
        <div className="meta">
          Hay que <strong>crear una tarea nueva de Montaje PO</strong> para cada uno (reabrir la vieja no vuelve a mandarlo a ensayo).
        </div>
        <div className="meta" style={{ marginTop: 4 }}>
          {muestra.map((t) => `${t.modelo}${t.nroSerie ? ` · Serie ${t.nroSerie}` : ''}${t.finalizada ? ` (${fechaCorta(t.finalizada)})` : ''}`).join(' · ')}
          {resto > 0 ? ` · y ${resto} más` : ''}
        </div>
      </div>
      {onIr && <button className="btn btn-rojo" onClick={onIr}>Ver retrabajos →</button>}
    </div>
  )
}
