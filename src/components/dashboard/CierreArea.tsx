import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { AndonAreaId, SectorId, Tarea } from '../../types'
import { sectoresDeArea, type AndonAreaDef } from '../../lib/andon'
import {
  cumplimientoDeSector, etiquetaVentana, ventanaEsAproximada,
  type CumplimientoColaborador, type VentanaCierre,
} from '../../lib/cierreObjetivos'

// ============================================================
// CIERRE POR ÁREA — el detalle al que se entra desde una tarjeta del Andon.
//
// Responde la pregunta del lunes: dentro de esta área, ¿quién cumplió y quién
// no? El "7 / 10" de cada colaborador sale de `cierreObjetivos.ts`, que cuenta
// los dos números con criterios distintos a propósito (ver el comentario de ese
// archivo: terminadas por fecha de fin, planificadas por semana objetivo
// congelada).
//
// Un área agrupa VARIOS sectores —Montaje Distribución son PA y PO— así que se
// calcula sector por sector y se muestran separados: son operaciones distintas
// y mezclarlas escondería cuál de las dos es la que está atrasada.
// ============================================================
export default function CierreArea({ area, ventana, onVolver }: {
  area: AndonAreaDef
  ventana: VentanaCierre
  onVolver: () => void
}) {
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []

  const nombre = useMemo(() => {
    const m = new Map(usuarios.map((u) => [u.id, u.nombre]))
    return (id: string) => m.get(id) ?? id
  }, [usuarios])

  const porSector = useMemo(
    () => sectoresDeArea(area.id)
      .map((s) => cumplimientoDeSector(tareas as Tarea[], s as SectorId, ventana))
      .filter((c) => c.planificadas > 0 || c.terminadas > 0),
    [tareas, area.id, ventana],
  )

  const aproximada = ventanaEsAproximada(ventana)
  const totT = porSector.reduce((s, c) => s + c.terminadas, 0)
  const totP = porSector.reduce((s, c) => s + c.planificadas, 0)

  return (
    <div>
      <div className="card-header" style={{ marginBottom: 12 }}>
        <div>
          <div className="section-title" style={{ margin: 0 }}>{area.label}</div>
          <div className="meta">{etiquetaVentana(ventana)}</div>
        </div>
        <button className="btn" onClick={onVolver}>← Volver al Andon</button>
      </div>

      {aproximada && (
        <div className="logi-alert" style={{ marginBottom: 12, background: 'rgba(245,158,11,.10)', borderColor: 'rgba(245,158,11,.45)' }}>
          <div className="logi-alert-head" style={{ color: '#fde68a', marginBottom: 4 }}>
            ⚠ Objetivo aproximado
          </div>
          <div className="meta">
            Este período es anterior al registro de objetivos. Las tareas que se
            reprogramaron antes de esa fecha perdieron su semana original, así que
            el número de la derecha puede quedar corto. Los períodos siguientes sí
            son exactos.
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Total del área: <strong>{totT} / {totP || '—'}</strong>
          {totP > 0 && <span className="meta"> · {Math.round((totT / totP) * 100)}%</span>}
        </div>
      </div>

      {porSector.length === 0
        ? <div className="empty">No hubo trabajo de esta área en el período elegido.</div>
        : porSector.map((c) => (
          <div className="card" key={c.sectorId} style={{ marginBottom: 12 }}>
            <div className="card-header">
              <div className="section-title" style={{ margin: 0 }}>{c.sector}</div>
              <div className="section-title" style={{ margin: 0 }}>
                {c.terminadas} / {c.planificadas || '—'}
              </div>
            </div>

            {c.colaboradores.length === 0
              ? <div className="meta">Sin tareas asignadas a un colaborador en este período.</div>
              : (
                <table className="tabla-detalle tabla-cards">
                  <thead>
                    <tr>
                      <th>Colaborador</th>
                      <th className="num">Realizadas</th>
                      <th className="num">Cumplimiento</th>
                      <th className="num">Arrastra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.colaboradores.map((x) => (
                      <FilaColaborador key={x.operarioId} c={x} nombre={nombre(x.operarioId)} />
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        ))}

      <div className="meta" style={{ marginTop: 10 }}>
        <strong>Realizadas</strong> cuenta por la fecha en que la tarea se terminó:
        una bobina empezada el viernes y cerrada el lunes suma en la semana nueva.
        <br />
        <strong>El objetivo</strong> queda fijo en el período para el que se pidió el
        trabajo. Mover una tarea atrasada en el Gantt cambia cuándo se va a hacer,
        no lo que se había pedido — por eso el denominador no se achica.
      </div>
    </div>
  )
}

function FilaColaborador({ c, nombre }: { c: CumplimientoColaborador; nombre: string }) {
  const pct = Math.round(c.ratio * 100)
  const color = c.planificadas === 0 ? undefined
    : pct >= 100 ? 'var(--estado-fin)'
    : pct >= 80 ? 'var(--naranja)'
    : 'var(--rojo)'
  return (
    <tr>
      <td data-label="Colaborador">{nombre}</td>
      <td className="num" data-label="Realizadas">
        <strong>{c.terminadas}</strong> / {c.planificadas || '—'}
        {/* Lo que se entregó en este período pero venía pedido de antes. Sin
            esto, un 5/3 parecería un error de cuenta. */}
        {c.terminadasDeArrastre > 0 && (
          <div className="sub meta">{c.terminadasDeArrastre} venían de antes</div>
        )}
      </td>
      <td className="num" data-label="Cumplimiento" style={{ fontWeight: 800, color }}>
        {c.planificadas > 0 ? `${pct}%` : '—'}
      </td>
      <td className="num" data-label="Arrastra">
        {c.pendientes > 0
          ? <span title="Del objetivo de este período, lo que quedó sin terminar. Ya le está ocupando tiempo en el Gantt del período siguiente.">
              {c.pendientes} pend.
            </span>
          : <span className="meta">—</span>}
      </td>
    </tr>
  )
}
