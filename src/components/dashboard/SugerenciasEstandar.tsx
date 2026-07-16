import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { Tarea } from '../../types'
import { fmtDur } from '../../lib/time'
import { guardarEstandar } from '../../sync/syncEngine'
import { sugerenciasEstandar, estandarDesdeSugerencia, type SugerenciaEstandar } from '../../lib/estandaresSugeridos'

// ============================================================
// MODAL "Sugerencias de Tiempos Estándar" (v1.24). Asistente/copiloto: propone
// afinar los tiempos estimados usando la MEDIANA de los tiempos reales del período.
// El planificador aprueba individual o globalmente; recién ahí se persiste.
// ============================================================
export default function SugerenciasEstandar({ tareas, nombreMaquina, onClose }: {
  tareas: Tarea[]
  nombreMaquina: (id: string) => string
  onClose: () => void
}) {
  const estandares = useLiveQuery(() => db.estandares.toArray(), []) ?? []
  const [aprobadas, setAprobadas] = useState<Set<string>>(new Set<string>())
  const [guardando, setGuardando] = useState(false)

  // Se recalcula sobre las tareas del período y los estándares vigentes.
  const sugerencias = useMemo(
    () => sugerenciasEstandar(tareas, estandares, nombreMaquina, { umbral: 0.05, minMuestras: 3 }),
    [tareas, estandares, nombreMaquina],
  )
  const pendientes = sugerencias.filter((s) => !aprobadas.has(s.id))

  async function aprobar(s: SugerenciaEstandar) {
    setGuardando(true)
    await guardarEstandar(estandarDesdeSugerencia(s))
    setAprobadas((prev) => new Set<string>(prev).add(s.id))
    setGuardando(false)
  }
  async function aprobarTodas() {
    setGuardando(true)
    for (const s of pendientes) await guardarEstandar(estandarDesdeSugerencia(s))
    setAprobadas((prev) => { const n = new Set<string>(prev); pendientes.forEach((s) => n.add(s.id)); return n })
    setGuardando(false)
  }

  const signo = (p: number) => (p > 0 ? '+' : '')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: '95%' }}>
        <div className="section-title" style={{ marginTop: 0 }}>🎯 Sugerencias de Tiempos Estándar</div>
        <div className="meta" style={{ marginBottom: 12 }}>
          Basado en la <strong>mediana</strong> del tiempo neto real del período (mín. 3 muestras · desviación &gt; 5%).
          Bobinado se afina por <strong>modelo + máquina</strong>; Montaje, por <strong>modelo</strong> (trabajo manual).
        </div>

        {sugerencias.length === 0 ? (
          <div className="empty">No hay desviaciones relevantes: los estándares están alineados con la realidad del período. 👌</div>
        ) : pendientes.length === 0 ? (
          <div className="empty">✓ Todas las sugerencias del período fueron aplicadas.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla-detalle">
              <thead>
                <tr>
                  <th>Máquina / Sector</th><th>Modelo</th>
                  <th className="num">Estimado actual</th><th className="num">Sugerido (mediana)</th>
                  <th className="num">Desviación</th><th className="num">Muestras</th><th></th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((s) => {
                  const sube = s.desviacionPct > 0
                  return (
                    <tr key={s.id}>
                      <td>{s.maquinaLabel}</td>
                      <td>{s.modelo}</td>
                      <td className="num">{fmtDur(s.actualMin)}</td>
                      <td className="num"><strong>{fmtDur(s.sugeridoMin)}</strong></td>
                      <td className="num" style={{ fontWeight: 800, color: sube ? 'var(--rojo)' : 'var(--estado-fin)' }}>
                        {signo(s.desviacionPct)}{Math.round(s.desviacionPct * 100)}%
                      </td>
                      <td className="num">{s.muestras}</td>
                      <td><button className="btn btn-verde" disabled={guardando} onClick={() => void aprobar(s)}>✓ Aceptar</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={onClose}>Cerrar</button>
          {pendientes.length > 0 && (
            <button className="btn btn-primary" disabled={guardando} onClick={() => void aprobarTodas()}>
              ✓ Aprobar todas ({pendientes.length})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
