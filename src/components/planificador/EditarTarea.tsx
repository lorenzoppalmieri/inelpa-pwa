import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { Tarea } from '../../types'
import { sectorById, maquinaSirveSector, operariosParaSector } from '../../types'
import type { Maquina, Usuario } from '../../types'
import { modeloPorNombre, componentesDeModelo } from '../../data/catalogo'
import { guardarTarea } from '../../sync/syncEngine'
import { isoWeek } from '../../lib/time'

// ============================================================
// EDITAR TAREA (v1.16) — el planificador ajusta una tarea ya creada, antes de
// arrancar O durante la produccion. Caso de uso: cambia el tiempo estandar
// porque se uso alambre recuperado (tarda mas), reasignar maquina/colaborador,
// mover el arranque, etc. No se puede editar una tarea finalizada (primero se
// "reabre"). El semielaborado y la orden no se cambian aca (se borra y recrea).
// ============================================================
export default function EditarTarea({ tarea, maquinas, usuarios, onClose }: {
  tarea: Tarea
  maquinas: Maquina[]
  usuarios: Usuario[]
  onClose: () => void
}) {
  const d0 = tarea.inicioPlanificado ? new Date(tarea.inicioPlanificado) : new Date()
  const [estandar, setEstandar] = useState(String(tarea.tiempoEstandarMin))
  const [prioridad, setPrioridad] = useState(String(tarea.prioridad))
  const [nro, setNro] = useState(tarea.nroTransformador ?? '')
  const [horaRecup, setHoraRecup] = useState(!!tarea.activaHoraRecuperacion)
  const [maquinaId, setMaquinaId] = useState(tarea.maquinaId)
  const [operarioId, setOperarioId] = useState(tarea.operarioId ?? '')
  const [fecha, setFecha] = useState(d0.toLocaleDateString('en-CA'))
  const [hora, setHora] = useState(d0.toTimeString().slice(0, 5))
  const [componenteCodigo, setComponenteCodigo] = useState(tarea.componenteCodigo ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // v1.16: semielaborados elegibles (solo fabricacion). Se aplica el cupo de la OF
  // descontando lo ya planificado, pero SIEMPRE se incluye el valor actual de la
  // tarea para no perderlo. Si el sector tiene semielaborados, elegir uno es obligatorio.
  const esFabricacion = tarea.tipo === 'fabricacion'
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), []) ?? []
  const todas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const ordenSel = ordenes.find((o) => o.id === tarea.ordenId)
  const modeloSel = modeloPorNombre(ordenSel?.modelo)
  const cantidadOrden = ordenSel?.cantidad ?? 1
  const componentesSector = useMemo(
    () => componentesDeModelo(modeloSel).filter((c) => c.sectorId === tarea.sectorId),
    [modeloSel, tarea.sectorId],
  )
  const opcionesSemi = useMemo(() => componentesSector.map((c) => {
    const planificado = todas.filter((t) => t.ordenId === tarea.ordenId && t.componenteCodigo === c.codigo && t.id !== tarea.id).length
    return { c, restante: cantidadOrden - planificado }
  }).filter((x) => x.restante > 0 || x.c.codigo === tarea.componenteCodigo), [componentesSector, todas, cantidadOrden, tarea])
  const sectorTieneSemi = esFabricacion && componentesSector.length > 0

  const maquinasOpc = useMemo(
    () => maquinas.filter((m) => m.activo && maquinaSirveSector(m, tarea.sectorId)),
    [maquinas, tarea.sectorId],
  )
  const operariosOpc = useMemo(
    () => operariosParaSector(tarea.sectorId, usuarios),
    [usuarios, tarea.sectorId],
  )

  const enProduccion = tarea.estado !== 'pendiente'

  async function guardar() {
    setError('')
    const est = Math.max(1, Number(estandar) || 0)
    if (!est) { setError('El tiempo estándar debe ser mayor a 0.'); return }
    if (sectorTieneSemi && !componenteCodigo) { setError('Elegí el semielaborado.'); return }
    if (!maquinaId) { setError('Elegí una estación.'); return }
    if (!fecha || !hora) { setError('Indicá día y hora de arranque.'); return }
    const inicioPlanificado = new Date(`${fecha}T${hora}`).toISOString()
    setGuardando(true)
    await guardarTarea({
      ...tarea,
      tiempoEstandarMin: est,
      prioridad: Math.max(1, Number(prioridad) || 1),
      nroTransformador: nro.trim() || undefined,
      componenteCodigo: esFabricacion ? (componenteCodigo || undefined) : tarea.componenteCodigo,
      activaHoraRecuperacion: horaRecup,
      maquinaId,
      operarioId: operarioId || undefined,
      inicioPlanificado,
      semana: isoWeek(new Date(inicioPlanificado)),
    })
    setGuardando(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="section-title" style={{ marginTop: 0 }}>
          Editar tarea · {tarea.modelo}{tarea.nroTransformador ? ` · ${tarea.nroTransformador}` : ''}
        </div>
        <div className="meta" style={{ marginBottom: 12 }}>
          {sectorById(tarea.sectorId).nombre} · estado <strong>{tarea.estado}</strong>
        </div>

        {enProduccion && (
          <div className="nota" style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: '8px 12px', borderRadius: '0 6px 6px 0', fontSize: '.85rem', marginBottom: 12, color: '#000' }}>
            ⚠ La tarea ya está en producción. Cambiar el tiempo estándar (ej. por alambre recuperado) recalcula la eficiencia/KPI de esta tarea.
          </div>
        )}

        <label className="meta">Tiempo estándar (min)</label>
        <input className="input" type="number" min={1} value={estandar} onChange={(e) => setEstandar(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />

        {esFabricacion && (
          <>
            <label className="meta">Semielaborado{sectorTieneSemi ? ' *' : ''}</label>
            <select className="select" value={componenteCodigo} onChange={(e) => setComponenteCodigo(e.target.value)} disabled={!sectorTieneSemi} style={{ width: '100%', marginBottom: 10 }}>
              <option value="">— {sectorTieneSemi ? 'Selecciona' : 'Sin semielaborado para este sector'} —</option>
              {opcionesSemi.map(({ c, restante }) => (
                <option key={c.codigo} value={c.codigo}>{c.descripcion}{cantidadOrden > 1 ? ` (faltan ${restante})` : ''}</option>
              ))}
            </select>
          </>
        )}

        <label className="meta">N° de transformador</label>
        <input className="input" value={nro} onChange={(e) => setNro(e.target.value)} placeholder="Opcional" style={{ width: '100%', marginBottom: 10 }} />

        <label className="meta">Estación</label>
        <select className="select" value={maquinaId} onChange={(e) => setMaquinaId(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
          {maquinasOpc.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>

        <label className="meta">Colaborador</label>
        <select className="select" value={operarioId} onChange={(e) => setOperarioId(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
          <option value="">— Sin asignar —</option>
          {operariosOpc.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="meta">Día de arranque</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="meta">Hora</label>
            <input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ width: 90 }}>
            <label className="meta">Prioridad</label>
            <input className="input" type="number" min={1} value={prioridad} onChange={(e) => setPrioridad(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>

        <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={horaRecup} onChange={(e) => setHoraRecup(e.target.checked)} />
          Habilitar hora de recuperación (+1h)
        </label>

        {error && <div className="empty" style={{ color: 'var(--rojo,#dc2626)', marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
