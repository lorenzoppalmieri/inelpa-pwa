import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import {
  SECTORES, sectorById,
  MODELOS_TRANSFORMADOR, MATERIALES, lineaDesdeModelo, materialLabel,
  operariosParaSector, esSectorHerreria,
  type MaterialBobina, type SectorId, type OrdenProduccion, type Tarea,
  type Semielaborado, type EstadoSemielaborado,
} from '../../types'
import { guardarOrden, guardarTarea, guardarSemielaborado, eliminarTarea } from '../../sync/syncEngine'
import { isoWeek, fechaCorta, hhmm } from '../../lib/time'

// ============================================================
// Vista Planificacion (solo planificador / gerencia).
// 1. Crear Ordenes de Fabricacion.
// 2. Asignar tareas (operacion x sector) a cada colaborador, por semana.
// 3. Gestionar semielaborados (espejo local de articulos OITM de SAP B1).
// Todo se persiste offline-first (IndexedDB + cola de sync).
// ============================================================

type SubVista = 'ordenes' | 'asignar' | 'semi'

export default function PlanificacionView() {
  const [sub, setSub] = useState<SubVista>('ordenes')

  return (
    <div>
      <div className="tabs">
        <button className={'tab' + (sub === 'ordenes' ? ' active' : '')} onClick={() => setSub('ordenes')}>Ordenes de fabricacion</button>
        <button className={'tab' + (sub === 'asignar' ? ' active' : '')} onClick={() => setSub('asignar')}>Asignar tareas</button>
        <button className={'tab' + (sub === 'semi' ? ' active' : '')} onClick={() => setSub('semi')}>Semielaborados</button>
      </div>

      {sub === 'ordenes' && <PanelOrdenes />}
      {sub === 'asignar' && <PanelAsignar />}
      {sub === 'semi' && <PanelSemielaborados />}
    </div>
  )
}

// ------------------------------------------------------------
// 1) Crear y listar Ordenes de Fabricacion
// ------------------------------------------------------------
function PanelOrdenes() {
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), [])
  const [nroOrden, setNroOrden] = useState('')
  const [nroContrato, setNroContrato] = useState('')
  const [modelo, setModelo] = useState('')
  const [material, setMaterial] = useState<MaterialBobina | ''>('')
  const [cantidad, setCantidad] = useState('1')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [msg, setMsg] = useState('')

  // La linea se infiere del prefijo del modelo (TTD=distribucion, TMR/TBR/TTR=rural).
  const linea = modelo ? lineaDesdeModelo(modelo) : null

  async function crear() {
    if (!nroOrden.trim() || !modelo || !material || !fechaEntrega) {
      setMsg('Completa N° de orden, modelo, material y fecha de entrega.')
      return
    }
    const o: OrdenProduccion = {
      id: crypto.randomUUID(),
      nroOrden: nroOrden.trim(),
      nroContrato: nroContrato.trim() || undefined,
      modelo,
      material,
      linea: lineaDesdeModelo(modelo),
      cantidad: Math.max(1, Number(cantidad) || 1),
      fechaEntrega,
    }
    await guardarOrden(o)
    setNroOrden(''); setNroContrato(''); setModelo(''); setMaterial(''); setCantidad('1'); setFechaEntrega('')
    setMsg(`Orden ${o.nroOrden} creada.`)
  }

  return (
    <>
      <div className="card">
        <div className="section-title">Nueva orden de fabricacion</div>
        <div className="form-grid">
          <div className="field">
            <label>N° de orden (OF)</label>
            <input className="input" value={nroOrden} onChange={(e) => setNroOrden(e.target.value)} placeholder="OF-2605" />
          </div>
          <div className="field">
            <label>N° de contrato / OV (opcional)</label>
            <input className="input" value={nroContrato} onChange={(e) => setNroContrato(e.target.value)} placeholder="CTR-8860" />
          </div>
          <div className="field">
            <label>Modelo de transformador</label>
            <select className="input" value={modelo} onChange={(e) => setModelo(e.target.value)}>
              <option value="">— Selecciona —</option>
              {MODELOS_TRANSFORMADOR.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Material</label>
            <select className="input" value={material} onChange={(e) => setMaterial(e.target.value as MaterialBobina | '')}>
              <option value="">— Selecciona —</option>
              {MATERIALES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Linea (segun modelo)</label>
            <input className="input" value={linea ? linea : ''} placeholder="—" readOnly disabled />
          </div>
          <div className="field">
            <label>Cantidad</label>
            <input className="input" type="number" min={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>
          <div className="field">
            <label>Fecha de entrega</label>
            <input className="input" type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary btn-bloque" onClick={crear}>＋ Crear orden</button>
        {msg && <div className="meta" style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div className="section-title">Ordenes cargadas ({ordenes?.length ?? 0})</div>
      {(ordenes ?? []).map((o) => (
        <div className="card" key={o.id}>
          <div className="card-header">
            <div>
              <h3>{o.nroOrden} · {o.modelo}</h3>
              <div className="meta">
                {o.nroContrato ? <>Contrato {o.nroContrato} · </> : null}
                Material <strong>{materialLabel(o.material)}</strong> · Linea <strong>{o.linea}</strong> · Cantidad <strong>{o.cantidad}</strong> · Entrega <strong>{fechaCorta(o.fechaEntrega)}</strong>
              </div>
            </div>
          </div>
        </div>
      ))}
      {(!ordenes || ordenes.length === 0) && <div className="empty">Aun no hay ordenes cargadas.</div>}
    </>
  )
}

// ------------------------------------------------------------
// 2) Asignar tareas (operacion x sector) a colaboradores
// ------------------------------------------------------------
function PanelAsignar() {
  const semana = isoWeek(new Date())
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), [])
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), [])
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), [])
  const tareas = useLiveQuery(() => db.tareas.where('semana').equals(semana).toArray(), [semana])

  const [ordenId, setOrdenId] = useState('')
  const [sectorId, setSectorId] = useState<SectorId>('bob_dist_at')
  const [operarioId, setOperarioId] = useState('')
  const [maquinaId, setMaquinaId] = useState('')
  const [prioridad, setPrioridad] = useState('1')
  const [estandar, setEstandar] = useState('120')
  const [nroTransformador, setNroTransformador] = useState('')
  // v1.4: dia + hora de arranque planificado (alimenta el Gantt y el auto-shift).
  const [fechaPlan, setFechaPlan] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [horaPlan, setHoraPlan] = useState('07:00')
  const [msg, setMsg] = useState('')

  const nombreMaquina = useMemo(() => {
    const m = new Map((maquinas ?? []).map((x) => [x.id, x.nombre]))
    return (id: string) => m.get(id) ?? id
  }, [maquinas])

  const nombreOperario = useMemo(() => {
    const m = new Map((usuarios ?? []).map((u) => [u.id, u.nombre]))
    return (id?: string) => (id ? m.get(id) ?? id : '—')
  }, [usuarios])

  // Estaciones elegibles: las del sector seleccionado (activas).
  const maquinasDelSector = (maquinas ?? []).filter((m) => m.activo && m.sectorId === sectorId)
  // Colaboradores elegibles: regla Herreria para las 4 sub-etapas, sector directo para el resto.
  const operariosDelSector = operariosParaSector(sectorId, usuarios ?? [])

  // Al cambiar de sector se reinician estacion y colaborador (cambia el universo elegible).
  function cambiarSector(s: SectorId) { setSectorId(s); setMaquinaId(''); setOperarioId('') }

  async function asignar() {
    const orden = (ordenes ?? []).find((o) => o.id === ordenId)
    if (!orden) { setMsg('Selecciona una orden.'); return }
    if (!maquinaId) { setMsg('Selecciona una estacion (maquina/box/linea) para el sector.'); return }
    if (operariosDelSector.length > 0 && !operarioId) { setMsg('Selecciona un colaborador.'); return }
    if (!fechaPlan || !horaPlan) { setMsg('Indica dia y hora de arranque.'); return }
    // Dia+hora elegidos -> ISO local. La semana ISO se deriva de esa fecha.
    const inicioPlanificado = new Date(`${fechaPlan}T${horaPlan}`).toISOString()
    const t: Tarea = {
      id: crypto.randomUUID(),
      ordenId: orden.id,
      sectorId,
      maquinaId,
      // v1.3: el planificador asigna colaborador + estacion simultaneamente.
      operarioId: operarioId || undefined,
      modelo: orden.modelo,
      nroTransformador: nroTransformador.trim() || undefined,
      semana: isoWeek(new Date(inicioPlanificado)),
      prioridad: Math.max(1, Number(prioridad) || 1),
      estado: 'pendiente',
      tiempoEstandarMin: Math.max(1, Number(estandar) || 1),
      inicioPlanificado,
      paradas: [],
    }
    await guardarTarea(t)
    setNroTransformador('')
    setMsg(`Tarea asignada a ${nombreOperario(operarioId)} · ${nombreMaquina(maquinaId)} en ${sectorById(sectorId).nombre}.`)
  }

  async function borrar(t: Tarea) {
    if (t.estado !== 'pendiente') { setMsg('Solo se pueden eliminar tareas que aun no arrancaron.'); return }
    if (!window.confirm(`Eliminar la tarea de ${t.modelo}${t.nroTransformador ? ` · ${t.nroTransformador}` : ''}? Esta accion no se puede deshacer.`)) return
    await eliminarTarea(t)
    setMsg('Tarea eliminada.')
  }

  const tareasOrdenadas = useMemo(
    () => [...(tareas ?? [])].sort((a, b) => a.prioridad - b.prioridad),
    [tareas],
  )

  return (
    <>
      <div className="card">
        <div className="section-title">Asignar tarea · semana {semana.split('-W')[1]}</div>
        <div className="form-grid">
          <div className="field">
            <label>Orden de fabricacion</label>
            <select className="input" value={ordenId} onChange={(e) => setOrdenId(e.target.value)}>
              <option value="">— Selecciona —</option>
              {(ordenes ?? []).map((o) => <option key={o.id} value={o.id}>{o.nroOrden} · {o.modelo}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Sector / operacion</label>
            <select className="input" value={sectorId} onChange={(e) => cambiarSector(e.target.value as SectorId)}>
              {SECTORES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Colaborador</label>
            <select className="input" value={operarioId} onChange={(e) => setOperarioId(e.target.value)}>
              <option value="">— Selecciona —</option>
              {operariosDelSector.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
            {esSectorHerreria(sectorId)
              ? <div className="meta" style={{ marginTop: 6 }}>Sub-etapa de Herreria: se muestra el pool de Herreria.</div>
              : operariosDelSector.length === 0 && <div className="meta" style={{ marginTop: 6 }}>Sin colaboradores cargados para este sector.</div>}
          </div>
          <div className="field">
            <label>Estacion (maquina / box / linea)</label>
            <select className="input" value={maquinaId} onChange={(e) => setMaquinaId(e.target.value)}>
              <option value="">— Selecciona —</option>
              {maquinasDelSector.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            {maquinasDelSector.length === 0 && <div className="meta" style={{ marginTop: 6 }}>Sin estaciones cargadas para este sector.</div>}
          </div>
          <div className="field">
            <label>N° transformador (opcional)</label>
            <input className="input" value={nroTransformador} onChange={(e) => setNroTransformador(e.target.value)} placeholder="TR-10280" />
          </div>
          <div className="field">
            <label>Prioridad (1 = mas alta)</label>
            <input className="input" type="number" min={1} value={prioridad} onChange={(e) => setPrioridad(e.target.value)} />
          </div>
          <div className="field">
            <label>Tiempo estandar (min)</label>
            <input className="input" type="number" min={1} value={estandar} onChange={(e) => setEstandar(e.target.value)} />
          </div>
          <div className="field">
            <label>Dia de arranque</label>
            <input className="input" type="date" value={fechaPlan} onChange={(e) => setFechaPlan(e.target.value)} />
          </div>
          <div className="field">
            <label>Hora de arranque</label>
            <input className="input" type="time" value={horaPlan} onChange={(e) => setHoraPlan(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary btn-bloque" onClick={asignar}>＋ Asignar tarea</button>
        {msg && <div className="meta" style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div className="section-title">Tareas de la semana ({tareasOrdenadas.length})</div>
      {tareasOrdenadas.map((t) => (
        <div className="card" key={t.id}>
          <div className="card-header">
            <div>
              <h3>{t.modelo}{t.nroTransformador ? ` · ${t.nroTransformador}` : ''}</h3>
              <div className="meta">
                {sectorById(t.sectorId).nombre} · {nombreOperario(t.operarioId)} · {nombreMaquina(t.maquinaId)} · Prioridad <strong>{t.prioridad}</strong> · Estandar <strong>{t.tiempoEstandarMin}m</strong>
                {t.inicioPlanificado ? <> · Arranque <strong>{fechaCorta(t.inicioPlanificado)} {hhmm(t.inicioPlanificado)}</strong></> : null}
              </div>
            </div>
            <span className={'estado-chip e-' + (t.estado === 'en_proceso' ? 'proceso' : t.estado === 'pausada' ? 'pausa' : t.estado === 'finalizada' ? 'finalizado' : 'pendiente')}>
              {t.estado}
            </span>
          </div>
          {/* v1.4: solo se puede borrar una tarea que AUN no arranco. */}
          {t.estado === 'pendiente' && (
            <div className="row-actions">
              <button className="btn btn-rojo" style={{ flex: 1 }} onClick={() => borrar(t)}>🗑 Eliminar tarea</button>
            </div>
          )}
        </div>
      ))}
      {tareasOrdenadas.length === 0 && <div className="empty">Aun no hay tareas asignadas esta semana.</div>}
    </>
  )
}

// ------------------------------------------------------------
// 3) Semielaborados (espejo local de articulos OITM de SAP B1)
// ------------------------------------------------------------
const SEMI_CHIP: Record<EstadoSemielaborado, string> = {
  en_proceso: 'e-proceso', disponible: 'e-finalizado', consumido: 'e-pendiente',
}
const SEMI_TXT: Record<EstadoSemielaborado, string> = {
  en_proceso: 'En proceso', disponible: 'Disponible', consumido: 'Consumido',
}

function PanelSemielaborados() {
  const semis = useLiveQuery(() => db.semielaborados.toArray(), [])
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), [])
  const [filtro, setFiltro] = useState<'todos' | EstadoSemielaborado>('todos')

  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [sectorOrigen, setSectorOrigen] = useState<SectorId>('bob_dist_at')
  const [modelo, setModelo] = useState('')
  const [tiempoEstimado, setTiempoEstimado] = useState('')
  const [msg, setMsg] = useState('')

  async function crear() {
    if (!codigo.trim() || !descripcion.trim() || !modelo) {
      setMsg('Completa codigo, descripcion y modelo.')
      return
    }
    const tEst = Number(tiempoEstimado)
    const s: Semielaborado = {
      id: crypto.randomUUID(),
      codigo: codigo.trim(),
      descripcion: descripcion.trim(),
      sectorOrigen,
      modelo,
      tiempoEstimadoMin: tiempoEstimado.trim() && tEst > 0 ? tEst : undefined,
      estado: 'en_proceso',
      actualizado: new Date().toISOString(),
    }
    await guardarSemielaborado(s)
    setCodigo(''); setDescripcion(''); setModelo(''); setTiempoEstimado('')
    setMsg(`Semielaborado ${s.codigo} creado.`)
  }

  async function cambiarEstado(s: Semielaborado, estado: EstadoSemielaborado, ordenDestinoId?: string) {
    await guardarSemielaborado({ ...s, estado, ordenDestinoId: ordenDestinoId ?? s.ordenDestinoId, actualizado: new Date().toISOString() })
  }

  const visibles = (semis ?? []).filter((s) => filtro === 'todos' || s.estado === filtro)

  return (
    <>
      <div className="card">
        <div className="section-title">Nuevo semielaborado</div>
        <div className="meta" style={{ marginBottom: 12 }}>
          Espejo local de articulos OITM de SAP B1. En produccion este listado se sincroniza
          desde el maestro de articulos de SAP via Service Layer; en el modo demo se da de alta
          manualmente. El componente ya esta listo: al go-live solo cambia la fuente de datos.
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Codigo de bobina / ItemCode</label>
            <input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="BAT-315-002" />
          </div>
          <div className="field">
            <label>Descripcion</label>
            <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Bobina AT 315 kVA trifasica" />
          </div>
          <div className="field">
            <label>Sector origen</label>
            <select className="input" value={sectorOrigen} onChange={(e) => setSectorOrigen(e.target.value as SectorId)}>
              {SECTORES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Modelo asociado</label>
            <select className="input" value={modelo} onChange={(e) => setModelo(e.target.value)}>
              <option value="">— Selecciona —</option>
              {MODELOS_TRANSFORMADOR.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Tiempo estimado (min)</label>
            <input className="input" type="number" min={0} inputMode="numeric" value={tiempoEstimado} onChange={(e) => setTiempoEstimado(e.target.value)} placeholder="240" />
          </div>
        </div>
        <button className="btn btn-primary btn-bloque" onClick={crear}>＋ Crear semielaborado</button>
        {msg && <div className="meta" style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div className="filtros">
        <select className="select" value={filtro} onChange={(e) => setFiltro(e.target.value as any)}>
          <option value="todos">Todos los estados</option>
          <option value="en_proceso">En proceso</option>
          <option value="disponible">Disponible</option>
          <option value="consumido">Consumido</option>
        </select>
      </div>

      <div className="section-title">Semielaborados ({visibles.length})</div>
      {visibles.map((s) => (
        <div className="card" key={s.id}>
          <div className="card-header">
            <div>
              <h3>{s.codigo} · {s.descripcion}</h3>
              <div className="meta">
                {sectorById(s.sectorOrigen).nombre} · Modelo <strong>{s.modelo}</strong>
                {s.tiempoEstimadoMin != null ? <> · Estimado <strong>{s.tiempoEstimadoMin}m</strong></> : null}
                {s.sapItemCode ? <> · SAP <strong>{s.sapItemCode}</strong></> : null}
              </div>
            </div>
            <span className={'estado-chip ' + SEMI_CHIP[s.estado]}>{SEMI_TXT[s.estado]}</span>
          </div>
          <div className="row-actions">
            {s.estado === 'en_proceso' && (
              <button className="btn btn-verde" style={{ flex: 1 }} onClick={() => cambiarEstado(s, 'disponible')}>Marcar disponible</button>
            )}
            {s.estado === 'disponible' && (
              <select
                className="input"
                style={{ flex: 1 }}
                defaultValue=""
                onChange={(e) => { if (e.target.value) cambiarEstado(s, 'consumido', e.target.value) }}
              >
                <option value="">Consumir en orden…</option>
                {(ordenes ?? []).map((o) => <option key={o.id} value={o.id}>{o.nroOrden} · {o.modelo}</option>)}
              </select>
            )}
            {s.estado === 'consumido' && <div className="meta">Consumido en orden {s.ordenDestinoId ?? '—'}</div>}
          </div>
        </div>
      ))}
      {visibles.length === 0 && <div className="empty">No hay semielaborados para este filtro.</div>}
    </>
  )
}
