import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { SECTORES, sectorById, nombreSemielaborado, type EstadoTarea, type SectorId } from '../../types'
import { descripcionSemiTarea } from '../../data/catalogo'
import { formatoCantidad, materialesPorEstacion, recetaPorArticulo } from '../../lib/materiales'
import { cantidadTarea } from '../../lib/saldoOF'

// ============================================================
// v2.57 — LOGÍSTICA: QUÉ PREPARAR EN CADA ESTACIÓN.
//
// Para cada estación (bobinadora, box, línea...) junta sus tareas abiertas y
// suma los materiales que llevan: receta de SAP × cantidad de cada tarea. Las
// tareas van en el orden en que se van a hacer.
//
// SOLO LECTURA, A PROPÓSITO. La transferencia de materiales se hace en SAP
// (solicitud de transferencia sobre la OF, acordado con ALAMO en la reunión 1).
// Si acá se marcara "entregado", habría dos registros de la misma entrega que
// tarde o temprano no coincidirían.
// ============================================================
type FiltroEstado = 'abiertas' | 'en_curso' | 'pendientes'
const ESTADOS: Record<FiltroEstado, EstadoTarea[]> = {
  abiertas: ['pendiente', 'en_proceso', 'pausada'],
  en_curso: ['en_proceso', 'pausada'],
  pendientes: ['pendiente'],
}
const ESTADO_TXT: Record<EstadoTarea, string> = { pendiente: 'Pendiente', en_proceso: 'En proceso', pausada: 'Pausada', finalizada: 'Finalizada' }

export default function MaterialesPorEstacion() {
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), []) ?? []
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), []) ?? []
  const lineas = useLiveQuery(() => db.materialesReceta.toArray(), []) ?? []

  const [sector, setSector] = useState<'todos' | SectorId>('todos')
  const [estado, setEstado] = useState<FiltroEstado>('abiertas')

  const nombreMaquina = useMemo(() => { const m = new Map(maquinas.map((x) => [x.id, x.nombre])); return (id: string) => m.get(id) ?? id }, [maquinas])
  const nroOrden = useMemo(() => new Map(ordenes.map((o) => [o.id, o.nroOrden])), [ordenes])
  const recetas = useMemo(() => recetaPorArticulo(lineas), [lineas])
  const estaciones = useMemo(
    () => materialesPorEstacion(tareas, recetas, { estados: ESTADOS[estado], sectorId: sector === 'todos' ? undefined : sector }),
    [tareas, recetas, estado, sector],
  )
  const sinNombre = useMemo(() => new Set(lineas.filter((l) => !l.childName).map((l) => l.childCode)).size, [lineas])

  return (
    <div>
      <div className="meta" style={{ marginBottom: 10 }}>
        Solo lectura: receta de SAP × cantidad de cada tarea. La transferencia de materiales se hace en SAP (solicitud sobre la OF).
        {sinNombre > 0 && <> · {sinNombre} material(es) se ven con el código porque SAP todavía no mandó ese artículo.</>}
      </div>

      <div className="toolbar" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="input" value={sector} onChange={(e) => setSector(e.target.value as 'todos' | SectorId)} style={{ maxWidth: 280 }}>
          <option value="todos">Todos los sectores</option>
          {SECTORES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className="input" value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)} style={{ maxWidth: 220 }}>
          <option value="abiertas">Pendientes y en curso</option>
          <option value="en_curso">Solo en curso</option>
          <option value="pendientes">Solo pendientes</option>
        </select>
      </div>

      {estaciones.length === 0 && (
        <div className="empty">No hay tareas {estado === 'abiertas' ? 'abiertas' : estado === 'en_curso' ? 'en curso' : 'pendientes'} con receta de SAP{sector !== 'todos' ? ' en este sector' : ''}.</div>
      )}

      {estaciones.map((e) => (
        <div className="card" key={e.maquinaId}>
          <div className="card-header">
            <div>
              <h3>{nombreMaquina(e.maquinaId)}</h3>
              <div className="meta">{sectorById(e.sectorId).nombre} · {e.tareas.length} tarea(s)</div>
            </div>
          </div>
          <div className="meta" style={{ margin: '6px 0 8px' }}>
            {e.tareas.map((t) => (
              <div key={t.id}>
                {t.ordenId && nroOrden.get(t.ordenId) ? <>OF <strong>{nroOrden.get(t.ordenId)}</strong> · </> : null}
                {nombreSemielaborado(t, descripcionSemiTarea(t))} · <strong>{cantidadTarea(t)} u.</strong> · {ESTADO_TXT[t.estado]}
              </div>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla-detalle">
              <thead><tr><th>Material a preparar</th><th className="num">Total</th></tr></thead>
              <tbody>
                {e.materiales.map((m) => (
                  <tr key={`${m.codigo}|${m.unidad}`}>
                    <td style={{ whiteSpace: 'normal' }}>
                      {m.nombre}
                      {m.esSemielaborado && <span className="meta"> · semielaborado (sale de otra OF)</span>}
                      {m.nombre !== m.codigo && <div className="meta">{m.codigo}</div>}
                    </td>
                    <td className="num">{formatoCantidad(m.cantidad)} {m.unidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
