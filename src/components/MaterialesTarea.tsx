import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/dexie'
import type { LineaReceta, Tarea } from '../types'
import { formatoCantidad, materialesDeTarea, recetaPorArticulo } from '../lib/materiales'
import { cantidadTarea } from '../lib/saldoOF'
import { etapaEntrega } from '../lib/preparacionMaterial'

// ============================================================
// v2.57 — Materiales de UNA tarea (receta de SAP × cantidad). Desplegable,
// cerrado por defecto para no alargar la tarjeta. Lo usan la tarjeta del
// operario y la lista del planificador. No se dibuja si el artículo no tiene
// receta de SAP (tareas de OF cargadas a mano, reparaciones, prototipos).
// ============================================================
export default function MaterialesTarea({ tarea }: { tarea: Tarea }) {
  const codigo = tarea.componenteCodigo
  const lineas = useLiveQuery(
    () => (codigo ? db.materialesReceta.where('parentCode').equals(codigo).toArray() : Promise.resolve([] as LineaReceta[])),
    [codigo],
  ) ?? []
  const materiales = useMemo(() => materialesDeTarea(tarea, recetaPorArticulo(lineas)), [tarea, lineas])
  // v2.58: en qué anda la entrega de logística (el operario ve si le viene el material).
  const prep = useLiveQuery(() => db.preparacionesMaterial.get(tarea.id), [tarea.id])
  if (materiales.length === 0) return null
  const n = cantidadTarea(tarea)
  const { etapa, complemento } = etapaEntrega(tarea, prep)
  const estadoEntrega = etapa === 'entregado'
    ? <span className="prep-chip entregado">✓ Entregado</span>
    : etapa === 'en_preparacion'
      ? <span className="prep-chip hoy">🚚 En preparación</span>
      : complemento ? <span className="prep-chip complemento">Entrega parcial</span> : null

  return (
    <details className="materiales-tarea">
      <summary>📦 Materiales ({materiales.length}){n > 1 ? ` · para ${n} unidades` : ''}{estadoEntrega && <> {estadoEntrega}</>}</summary>
      <div style={{ overflowX: 'auto' }}>
        <table className="tabla-detalle">
          <thead><tr><th>Material</th><th className="num">Cantidad</th></tr></thead>
          <tbody>
            {materiales.map((m) => (
              <tr key={`${m.codigo}|${m.unidad}`}>
                <td style={{ whiteSpace: 'normal' }}>
                  {m.nombre}
                  {m.esSemielaborado && <span className="meta"> · semielaborado</span>}
                  {m.nombre !== m.codigo && <div className="meta">{m.codigo}</div>}
                </td>
                <td className="num">{formatoCantidad(m.cantidad)} {m.unidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="meta" style={{ marginTop: 4 }}>Receta de SAP × cantidad de la tarea. La entrega de materiales se gestiona en SAP.</div>
    </details>
  )
}
