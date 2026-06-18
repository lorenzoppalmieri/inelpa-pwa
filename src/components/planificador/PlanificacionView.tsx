import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import {
  SECTORES, sectorById,
  MATERIALES, lineaDesdeModelo, materialLabel, CATEGORIA_COMPONENTE_LABEL,
  operariosParaSector, esSectorHerreria,
  type MaterialBobina, type SectorId, type OrdenProduccion, type Tarea,
  type Semielaborado, type EstadoSemielaborado, type TipoTarea,
} from '../../types'
import { MODELOS_CATALOGO, modeloPorNombre, componentesDeModelo, componentePorCodigo } from '../../data/catalogo'
import { guardarOrden, guardarTarea, guardarSemielaborado, eliminarTarea, eliminarOrden } from '../../sync/syncEngine'
import { useAuth } from '../../auth/AuthContext'
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
  const { permisos } = useAuth()
  // v1.9: encargados de planta solo pueden cargar REPARACIONES (sin produccion).
  const soloReparacion = !!(permisos?.crearReparacion && !permisos?.gestionProduccion)
  const [sub, setSub] = useState<SubVista>(soloReparacion ? 'asignar' : 'ordenes')

  return (
    <div>
      <div className="tabs">
        {!soloReparacion && <button className={'tab' + (sub === 'ordenes' ? ' active' : '')} onClick={() => setSub('ordenes')}>Ordenes de fabricacion</button>}
        <button className={'tab' + (sub === 'asignar' ? ' active' : '')} onClick={() => setSub('asignar')}>{soloReparacion ? 'Cargar reparación' : 'Asignar tareas'}</button>
        {!soloReparacion && <button className={'tab' + (sub === 'semi' ? ' active' : '')} onClick={() => setSub('semi')}>Semielaborados</button>}
      </div>

      {sub === 'ordenes' && !soloReparacion && <PanelOrdenes />}
      {sub === 'asignar' && <PanelAsignar soloReparacion={soloReparacion} />}
      {sub === 'semi' && !soloReparacion && <PanelSemielaborados />}
    </div>
  )
}

// ------------------------------------------------------------
// 1) Crear y listar Ordenes de Fabricacion
// ------------------------------------------------------------
function PanelOrdenes() {
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), [])
  const todasTareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const [nroOrden, setNroOrden] = useState('')
  const [nroContrato, setNroContrato] = useState('')
  const [modelo, setModelo] = useState('')
  const [material, setMaterial] = useState<MaterialBobina | ''>('')
  const [cantidad, setCantidad] = useState('1')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [msg, setMsg] = useState('')

  // La linea se infiere del prefijo del modelo (TTD=distribucion, TMR/TBR/TTR=rural).
  const linea = modelo ? lineaDesdeModelo(modelo) : null
  // Modelo del catalogo maestro + sus componentes (semielaborados) asociados.
  const modeloSel = modeloPorNombre(modelo)
  const componentes = componentesDeModelo(modeloSel)

  // Al elegir un modelo, el material queda determinado por el propio modelo.
  function elegirModelo(nombre: string) {
    setModelo(nombre)
    const m = modeloPorNombre(nombre)
    if (m?.material) setMaterial(m.material)
  }

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

  // Borrado manual por error de carga. SEGURIDAD: si la OF ya tiene tareas, se
  // bloquea (la FK borra en cascada y arruinaria el historial/OEE).
  async function borrarOrden(o: OrdenProduccion) {
    const nTareas = todasTareas.filter((t) => t.ordenId === o.id).length
    if (nTareas > 0) {
      window.alert(`⚠ La ${o.nroOrden} ya tiene ${nTareas} tarea(s) creada(s) en planta.\n\nNo se puede eliminar para no borrar trabajo real ni el historial. Si fue un error, eliminá primero esas tareas desde "Asignar tareas".`)
      return
    }
    if (!window.confirm(`¿Estás seguro de que querés eliminar la ${o.nroOrden} (${o.modelo})? Esta acción no se puede deshacer.`)) return
    await eliminarOrden(o)
    setMsg(`Orden ${o.nroOrden} eliminada.`)
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
            <select className="input" value={modelo} onChange={(e) => elegirModelo(e.target.value)}>
              <option value="">— Selecciona —</option>
              <optgroup label="Distribucion">
                {MODELOS_CATALOGO.filter((m) => m.linea === 'distribucion').map((m) => <option key={m.codigo} value={m.nombre}>{m.nombre}</option>)}
              </optgroup>
              <optgroup label="Rural">
                {MODELOS_CATALOGO.filter((m) => m.linea === 'rural').map((m) => <option key={m.codigo} value={m.nombre}>{m.nombre}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="field">
            <label>Material (segun modelo)</label>
            <select className="input" value={material} onChange={(e) => setMaterial(e.target.value as MaterialBobina | '')} disabled={!!modeloSel?.material}>
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
        {modeloSel && (
          <div className="semi-preview">
            <div className="meta" style={{ marginBottom: 8 }}>
              Semielaborados del modelo <strong>{modeloSel.nombre}</strong> ({componentes.length})
            </div>
            {componentes.length === 0 ? (
              <div className="empty" style={{ padding: '12px 0' }}>Este modelo no tiene componentes mapeados.</div>
            ) : (
              <div className="semi-chips">
                {componentes.map((c) => (
                  <div key={c.codigo} className="semi-chip" title={c.codigo}>
                    <span className="semi-cat">{CATEGORIA_COMPONENTE_LABEL[c.categoria]}</span>
                    <span>{c.descripcion}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button className="btn btn-primary btn-bloque" onClick={crear} style={{ marginTop: 12 }}>＋ Crear orden</button>
        {msg && <div className="meta" style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div className="section-title">Ordenes cargadas ({ordenes?.length ?? 0})</div>
      {(ordenes ?? []).map((o) => {
        const nTareas = todasTareas.filter((t) => t.ordenId === o.id).length
        return (
          <div className="card" key={o.id}>
            <div className="card-header">
              <div>
                <h3>{o.nroOrden} · {o.modelo}</h3>
                <div className="meta">
                  {o.nroContrato ? <>Contrato {o.nroContrato} · </> : null}
                  Material <strong>{materialLabel(o.material)}</strong> · Linea <strong>{o.linea}</strong> · Cantidad <strong>{o.cantidad}</strong> · Entrega <strong>{fechaCorta(o.fechaEntrega)}</strong>
                  {nTareas > 0 && <> · <strong>{nTareas}</strong> tarea(s)</>}
                </div>
              </div>
              <button
                className="btn btn-rojo"
                title={nTareas > 0 ? 'No se puede: la orden ya tiene tareas en planta' : 'Eliminar orden (error de carga)'}
                onClick={() => borrarOrden(o)}
              >🗑</button>
            </div>
          </div>
        )
      })}
      {(!ordenes || ordenes.length === 0) && <div className="empty">Aun no hay ordenes cargadas.</div>}
    </>
  )
}

// ------------------------------------------------------------
// 2) Asignar tareas (operacion x sector) a colaboradores
// ------------------------------------------------------------
function PanelAsignar({ soloReparacion = false }: { soloReparacion?: boolean }) {
  const semana = isoWeek(new Date())
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), [])
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), [])
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), [])
  const tareas = useLiveQuery(() => db.tareas.where('semana').equals(semana).toArray(), [semana])
  const todasTareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []

  const [ordenId, setOrdenId] = useState('')
  const [sectorId, setSectorId] = useState<SectorId>('bob_dist_at')
  const [operarioId, setOperarioId] = useState('')
  const [maquinaId, setMaquinaId] = useState('')
  const [componenteCodigo, setComponenteCodigo] = useState('')
  const [prioridad, setPrioridad] = useState('1')
  const [estandar, setEstandar] = useState('120')
  const [nroTransformador, setNroTransformador] = useState('')
  // v1.4: dia + hora de arranque planificado (alimenta el Gantt y el auto-shift).
  const [fechaPlan, setFechaPlan] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [horaPlan, setHoraPlan] = useState('07:00')
  // v1.6: habilitar la hora de recuperacion (16-17 / 15-16) para esta tarea.
  const [horaRecup, setHoraRecup] = useState(false)
  // v1.8/v1.9: tipo de tarea. Los encargados solo cargan reparaciones.
  const [tipo, setTipo] = useState<TipoTarea>(soloReparacion ? 'reparacion' : 'fabricacion')
  const [descripcion, setDescripcion] = useState('') // texto libre para reparaciones
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

  // v1.5: semielaborados elegibles = componentes del modelo de la orden que se
  // fabrican EN ESTE SECTOR. Ej. Bobinado Dist A.T. -> bobinas AT del modelo.
  const ordenSel = (ordenes ?? []).find((o) => o.id === ordenId)
  const modeloSel = modeloPorNombre(ordenSel?.modelo)

  // OF "activa" = aun tiene trabajo: sin tareas creadas o con alguna NO finalizada.
  // Las OF con TODAS sus tareas finalizadas se ocultan del desplegable (no se borran).
  const ordenesActivas = (ordenes ?? []).filter((o) => {
    const ts = todasTareas.filter((t) => t.ordenId === o.id)
    return ts.length === 0 || ts.some((t) => t.estado !== 'finalizada') || o.id === ordenId
  })
  const componentesDelSector = componentesDeModelo(modeloSel).filter((c) => c.sectorId === sectorId)

  // Al cambiar de sector se reinician estacion, colaborador y semielaborado.
  function cambiarSector(s: SectorId) { setSectorId(s); setMaquinaId(''); setOperarioId(''); setComponenteCodigo('') }
  function cambiarOrden(id: string) { setOrdenId(id); setComponenteCodigo('') }

  async function asignar() {
    const esRep = soloReparacion || tipo === 'reparacion' // v1.9: encargado siempre reparacion
    // Fabricacion necesita orden; reparacion necesita descripcion (no lleva orden).
    const orden = (ordenes ?? []).find((o) => o.id === ordenId)
    if (!esRep && !orden) { setMsg('Selecciona una orden.'); return }
    if (esRep && !descripcion.trim()) { setMsg('Describe la reparacion (que se corrige).'); return }
    if (!maquinaId) { setMsg('Selecciona una estacion (maquina/box/linea) para el sector.'); return }
    if (operariosDelSector.length > 0 && !operarioId) { setMsg('Selecciona un colaborador.'); return }
    if (!fechaPlan || !horaPlan) { setMsg('Indica dia y hora de arranque.'); return }
    // Dia+hora elegidos -> ISO local. La semana ISO se deriva de esa fecha.
    const inicioPlanificado = new Date(`${fechaPlan}T${horaPlan}`).toISOString()
    const t: Tarea = {
      id: crypto.randomUUID(),
      tipo: esRep ? 'reparacion' : 'fabricacion',
      ordenId: esRep ? undefined : orden!.id,
      sectorId,
      maquinaId,
      // v1.3: el planificador asigna colaborador + estacion simultaneamente.
      operarioId: operarioId || undefined,
      modelo: esRep ? descripcion.trim() : orden!.modelo,
      componenteCodigo: esRep ? undefined : (componenteCodigo || undefined),
      nroTransformador: nroTransformador.trim() || undefined,
      semana: isoWeek(new Date(inicioPlanificado)),
      prioridad: Math.max(1, Number(prioridad) || 1),
      estado: 'pendiente',
      tiempoEstandarMin: Math.max(1, Number(estandar) || 1),
      activaHoraRecuperacion: horaRecup,
      inicioPlanificado,
      paradas: [],
    }
    await guardarTarea(t)
    setNroTransformador(''); setComponenteCodigo(''); setHoraRecup(false); setDescripcion('')
    const queTipo = esRep ? 'Reparacion' : 'Tarea'
    setMsg(`${queTipo} asignada a ${nombreOperario(operarioId)} · ${nombreMaquina(maquinaId)} en ${sectorById(sectorId).nombre}.`)
  }

  // v1.6: activar/desactivar la hora de recuperacion de una tarea ya cargada.
  async function toggleRecup(t: Tarea) {
    await guardarTarea({ ...t, activaHoraRecuperacion: !t.activaHoraRecuperacion })
    setMsg(`Hora de recuperación ${!t.activaHoraRecuperacion ? 'activada' : 'desactivada'} para ${t.modelo}.`)
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
        <div className="section-title">Asignar {tipo === 'reparacion' ? 'reparación' : 'tarea'} · semana {semana.split('-W')[1]}</div>

        {/* v1.8: tipo de tarea. La reparacion no cuenta para el OEE.
            v1.9: los encargados quedan bloqueados en 'reparacion' (sin fabricacion). */}
        {soloReparacion ? (
          <div className="seg" style={{ marginBottom: 12 }}>
            <button className="seg-btn on" disabled>🔧 Reparación</button>
          </div>
        ) : (
          <div className="seg" style={{ marginBottom: 12 }}>
            <button className={'seg-btn' + (tipo === 'fabricacion' ? ' on' : '')} onClick={() => setTipo('fabricacion')}>🏭 Fabricación</button>
            <button className={'seg-btn' + (tipo === 'reparacion' ? ' on' : '')} onClick={() => setTipo('reparacion')}>🔧 Reparación</button>
          </div>
        )}

        <div className="form-grid">
          {tipo === 'fabricacion' ? (
            <div className="field">
              <label>Orden de fabricacion</label>
              <select className="input" value={ordenId} onChange={(e) => cambiarOrden(e.target.value)}>
                <option value="">— Selecciona —</option>
                {ordenesActivas.map((o) => <option key={o.id} value={o.id}>{o.nroOrden} · {o.modelo}</option>)}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>Descripción de la reparación</label>
              <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej. Rehacer hermetizado TR-10231" />
            </div>
          )}
          <div className="field">
            <label>Sector / operacion</label>
            <select className="input" value={sectorId} onChange={(e) => cambiarSector(e.target.value as SectorId)}>
              {SECTORES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          {tipo === 'fabricacion' && (
            <div className="field">
              <label>Semielaborado (segun sector)</label>
              <select className="input" value={componenteCodigo} onChange={(e) => setComponenteCodigo(e.target.value)} disabled={!ordenSel || componentesDelSector.length === 0}>
                <option value="">— {!ordenSel ? 'Elegi una orden primero' : componentesDelSector.length === 0 ? 'Sin semielaborados para este sector' : 'Selecciona'} —</option>
                {componentesDelSector.map((c) => <option key={c.codigo} value={c.codigo}>{c.descripcion}</option>)}
              </select>
              {ordenSel && !modeloSel && <div className="meta" style={{ marginTop: 6 }}>El modelo de la orden no esta en el catalogo maestro.</div>}
            </div>
          )}
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
          <div className="field">
            <label>Hora de recuperación (16–17 / 15–16)</label>
            <label className="check-inline">
              <input type="checkbox" checked={horaRecup} onChange={(e) => setHoraRecup(e.target.checked)} />
              <span>Computar la franja extra como tiempo productivo de esta tarea</span>
            </label>
          </div>
        </div>
        <button className="btn btn-primary btn-bloque" onClick={asignar}>＋ Asignar {tipo === 'reparacion' ? 'reparación' : 'tarea'}</button>
        {msg && <div className="meta" style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div className="section-title">Tareas de la semana ({tareasOrdenadas.length})</div>
      {tareasOrdenadas.map((t) => (
        <div className="card" key={t.id}>
          <div className="card-header">
            <div>
              <h3>{t.tipo === 'reparacion' ? '🔧 ' : ''}{t.modelo}{t.nroTransformador ? ` · ${t.nroTransformador}` : ''}{t.tipo === 'reparacion' && <span className="estado-chip" style={{ background: 'var(--reparacion)', color: '#fff', marginLeft: 8 }}>Reparación</span>}</h3>
              <div className="meta">
                {sectorById(t.sectorId).nombre} · {nombreOperario(t.operarioId)} · {nombreMaquina(t.maquinaId)} · Prioridad <strong>{t.prioridad}</strong> · Estandar <strong>{t.tiempoEstandarMin}m</strong>
                {t.inicioPlanificado ? <> · Arranque <strong>{fechaCorta(t.inicioPlanificado)} {hhmm(t.inicioPlanificado)}</strong></> : null}
                {t.componenteCodigo ? <> · Semielaborado <strong>{componentePorCodigo(t.componenteCodigo)?.descripcion ?? t.componenteCodigo}</strong></> : null}
                {t.activaHoraRecuperacion ? <> · <strong style={{ color: 'var(--naranja)' }}>Hora recup. ON</strong></> : null}
                {t.duracionEfectivaMin != null ? <> · Neto <strong>{t.duracionEfectivaMin}m</strong></> : null}
              </div>
            </div>
            <span className={'estado-chip e-' + (t.estado === 'en_proceso' ? 'proceso' : t.estado === 'pausada' ? 'pausa' : t.estado === 'finalizada' ? 'finalizado' : 'pendiente')}>
              {t.estado}
            </span>
          </div>
          {/* v1.9: el encargado solo edita/borra sus reparaciones, no produccion. */}
          {(!soloReparacion || t.tipo === 'reparacion') && (
            <div className="row-actions">
              {/* v1.6: boton rapido para alternar la hora de recuperacion (mientras no este finalizada). */}
              {t.estado !== 'finalizada' && (
                <button className="btn" style={{ flex: 1 }} onClick={() => toggleRecup(t)}>
                  {t.activaHoraRecuperacion ? '⏱ Quitar hora recup.' : '⏱ Habilitar hora recup.'}
                </button>
              )}
              {/* v1.4: solo se puede borrar una tarea que AUN no arranco. */}
              {t.estado === 'pendiente' && (
                <button className="btn btn-rojo" style={{ flex: 1 }} onClick={() => borrar(t)}>🗑 Eliminar tarea</button>
              )}
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
              {MODELOS_CATALOGO.map((m) => <option key={m.codigo} value={m.nombre}>{m.nombre}</option>)}
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
