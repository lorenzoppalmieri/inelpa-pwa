import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { Tarea } from '../../types'
import { sectorById, maquinaSirveSector, operariosParaSector } from '../../types'
import type { Maquina, Usuario } from '../../types'
import {
  admiteCantidad, cantidadTarea, estandarPorUnidadMin, estandarTotalMin, sectorTieneSemielaborado,
  semielaboradosAsignables, validarCantidad,
} from '../../lib/saldoOF'
import { guardarTarea } from '../../sync/syncEngine'
import { isoWeek } from '../../lib/time'
import { recuperacionDiariaVigente } from '../../lib/calendario'

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
  // v2.55: el estándar se edita POR UNIDAD (la tarea guarda unidad × cantidad).
  // Dos decimales para no alterar el total de una tarea que nadie tocó (100 / 3).
  const [estandar, setEstandar] = useState(String(Number(estandarPorUnidadMin(tarea).toFixed(2))))
  const [cantidad, setCantidad] = useState(String(cantidadTarea(tarea)))
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

  // v1.16: semielaborados elegibles (solo fabricacion). Se aplica el saldo de la
  // OF descontando lo ya asignado por las OTRAS tareas, pero SIEMPRE se incluye
  // el valor actual de la tarea para no perderlo. Si el sector tiene
  // semielaborados, elegir uno es obligatorio.
  // v2.55: la cuenta es la de lib/saldoOF, la MISMA que usa "Asignar tarea".
  // v1.76 sigue valiendo: en bobinado el catálogo se comparte entre líneas.
  const esFabricacion = tarea.tipo === 'fabricacion'
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), []) ?? []
  const todas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const ordenSel = ordenes.find((o) => o.id === tarea.ordenId)
  const opcionesSemi = useMemo(
    () => semielaboradosAsignables(ordenSel, ordenes, tarea.sectorId, todas, { excluirTareaId: tarea.id, mantenerCodigo: tarea.componenteCodigo }),
    [ordenSel, ordenes, tarea, todas],
  )
  const sectorTieneSemi = esFabricacion && !tarea.esPrototipo && sectorTieneSemielaborado(ordenSel, ordenes, tarea.sectorId)
  const semiSel = opcionesSemi.find((x) => x.c.codigo === componenteCodigo)
  const conCantidad = esFabricacion && !tarea.esPrototipo && !!semiSel && admiteCantidad(tarea.sectorId)
  const cantidadNum = conCantidad ? Number(cantidad.replace(',', '.')) || 0 : cantidadTarea(tarea)

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
    // v2.55: la cantidad se valida contra el saldo (sin contar esta misma tarea).
    // Solo si cambió algo: una tarea vieja de una OF sobre-planificada se tiene
    // que poder seguir editando (estación, fecha) sin que la frene el saldo.
    let cant = cantidadTarea(tarea)
    if (conCantidad && semiSel) {
      const cambio = componenteCodigo !== (tarea.componenteCodigo ?? '') || cantidad.trim() !== String(cantidadTarea(tarea))
      if (cambio) {
        const v = validarCantidad(cantidad, semiSel.saldo.restante)
        if (!v.ok) { setError(v.error); return }
        cant = v.cantidad
      }
    }
    if (!maquinaId) { setError('Elegí una estación.'); return }
    if (!fecha || !hora) { setError('Indicá día y hora de arranque.'); return }
    const inicioPlanificado = new Date(`${fecha}T${hora}`).toISOString()
    setGuardando(true)
    await guardarTarea({
      ...tarea,
      tiempoEstandarMin: estandarTotalMin(est, cant),
      // Una tarea de 1 unidad que nunca tuvo cantidad queda igual que siempre.
      cantidad: tarea.cantidad !== undefined || cant !== 1 ? cant : undefined,
      prioridad: Math.max(1, Number(prioridad) || 1),
      nroTransformador: nro.trim() || undefined,
      componenteCodigo: esFabricacion ? (componenteCodigo || undefined) : tarea.componenteCodigo,
      activaHoraRecuperacion: horaRecup,
      maquinaId,
      operarioId: operarioId || undefined,
      inicioPlanificado,
      semana: isoWeek(new Date(inicioPlanificado)),
      // v2.23: `semanaObjetivo` NO se recalcula acá a propósito. Mover una tarea
      // atrasada a la semana que viene cambia CUÁNDO se va a hacer, no para qué
      // semana se había pedido. Si se recalculara, el objetivo de la semana
      // vieja se achicaría solo y el cumplimiento daría siempre 100%.
      // Se reenvía el valor original para que el upsert no lo pise con null.
      semanaObjetivo: tarea.semanaObjetivo ?? tarea.semana,
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

        <label className="meta">Tiempo estándar{conCantidad || cantidadNum > 1 ? ' por unidad' : ''} (min)</label>
        <input className="input" type="number" min={1} value={estandar} onChange={(e) => setEstandar(e.target.value)} style={{ width: '100%', marginBottom: cantidadNum > 1 ? 2 : 10 }} />
        {cantidadNum > 1 && (
          <div className="meta" style={{ marginBottom: 10 }}>
            Total de la tarea: <strong>{estandarTotalMin(Math.max(1, Number(estandar) || 1), cantidadNum)} min</strong> ({cantidadNum} × {Math.max(1, Number(estandar) || 1)})
          </div>
        )}

        {esFabricacion && (
          <>
            <label className="meta">Semielaborado{sectorTieneSemi ? ' *' : ''}</label>
            <select className="select" value={componenteCodigo} onChange={(e) => setComponenteCodigo(e.target.value)} disabled={!sectorTieneSemi} style={{ width: '100%', marginBottom: 10 }}>
              <option value="">— {sectorTieneSemi ? 'Selecciona' : 'Sin semielaborado para este sector'} —</option>
              {opcionesSemi.map(({ c, saldo }) => (
                <option key={c.codigo} value={c.codigo}>{c.descripcion}{saldo.total > 1 ? ` (faltan ${saldo.restante} de ${saldo.total})` : ''}</option>
              ))}
            </select>
            {/* v2.55: cantidad de esta tarea. El tope es el saldo de la OF sin contar esta tarea. */}
            {conCantidad && semiSel && (
              <>
                <label className="meta">Cantidad</label>
                <input className="input" type="number" min={1} step={1} max={semiSel.saldo.restante}
                  value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ width: '100%', marginBottom: 2 }} />
                <div className="meta" style={{ marginBottom: 10 }}>
                  Disponible para esta tarea: hasta <strong>{semiSel.saldo.restante}</strong> de {semiSel.saldo.total} (lo demás ya está en otras tareas).
                </div>
              </>
            )}
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

        {/* v2.43: sin recuperación diaria desde el 1/11/2026 (RRHH). */}
        {recuperacionDiariaVigente() && (
          <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input type="checkbox" checked={horaRecup} onChange={(e) => setHoraRecup(e.target.checked)} />
            Habilitar hora de recuperación (+1h)
          </label>
        )}

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
