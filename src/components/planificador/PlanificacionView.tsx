import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import {
  SECTORES, sectorById,
  MATERIALES, lineaDesdeModelo, materialLabel, CATEGORIA_COMPONENTE_LABEL,
  operariosParaSector, esSectorHerreria, maquinaSirveSector,
  type MaterialBobina, type SectorId, type OrdenProduccion, type Tarea,
  type Semielaborado, type EstadoSemielaborado, type TipoTarea, type Feriado, type EstadoTarea,
} from '../../types'
import { MODELOS_CATALOGO, modeloPorNombre, componentesDeModelo, componentePorCodigo } from '../../data/catalogo'
import { guardarOrden, guardarTarea, guardarSemielaborado, eliminarTarea, eliminarOrden, guardarFeriado, eliminarFeriado } from '../../sync/syncEngine'
import { useAuth } from '../../auth/AuthContext'
import { isoWeek, fechaCorta, hhmm } from '../../lib/time'
import { tiempoNetoMin } from '../../lib/kpi'
import EditarTarea from './EditarTarea'

// v1.16: resumen de "Carga actual" (tareas asignadas + pendientes, SIN finalizar)
// de un colaborador o maquina, agrupado por modelo + fase (F1/F2/F3 del
// semielaborado). Ayuda al planificador a ver el "juego de fases" ya cargado.
function faseDeTarea(t: Tarea): string {
  const d = componentePorCodigo(t.componenteCodigo)?.descripcion ?? ''
  const m = d.match(/\bF\d\b/)
  return m ? m[0] : ''
}
function resumenCarga(tareas: Tarea[], pred: (t: Tarea) => boolean): { total: number; grupos: { label: string; n: number }[] } {
  const fil = tareas.filter((t) => pred(t) && t.estado !== 'finalizada')
  const m = new Map<string, number>()
  for (const t of fil) {
    const fase = faseDeTarea(t)
    const key = `${t.modelo}${fase ? ' ' + fase : ''}`
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  const grupos = [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
  return { total: fil.length, grupos }
}

// ============================================================
// Vista Planificacion (solo planificador / gerencia).
// 1. Crear Ordenes de Fabricacion.
// 2. Asignar tareas (operacion x sector) a cada colaborador, por semana.
// 3. Gestionar semielaborados (espejo local de articulos OITM de SAP B1).
// Todo se persiste offline-first (IndexedDB + cola de sync).
// ============================================================

type SubVista = 'ordenes' | 'asignar' | 'semi' | 'feriados'

export default function PlanificacionView({ focoTareaId, onFocoConsumido }: { focoTareaId?: string | null; onFocoConsumido?: () => void } = {}) {
  const { permisos } = useAuth()
  // v1.9: encargados de planta solo pueden cargar REPARACIONES (sin produccion).
  const soloReparacion = !!(permisos?.crearReparacion && !permisos?.gestionProduccion)
  const [sub, setSub] = useState<SubVista>(soloReparacion ? 'asignar' : 'ordenes')

  // v1.17: si llega un foco de tarea (click en el Gantt), saltar a "Asignar tareas".
  useEffect(() => { if (focoTareaId) setSub('asignar') }, [focoTareaId])

  return (
    <div>
      <div className="tabs">
        {!soloReparacion && <button className={'tab' + (sub === 'ordenes' ? ' active' : '')} onClick={() => setSub('ordenes')}>Ordenes de fabricacion</button>}
        <button className={'tab' + (sub === 'asignar' ? ' active' : '')} onClick={() => setSub('asignar')}>{soloReparacion ? 'Cargar reparación' : 'Asignar tareas'}</button>
        {!soloReparacion && <button className={'tab' + (sub === 'semi' ? ' active' : '')} onClick={() => setSub('semi')}>Semielaborados</button>}
        {!soloReparacion && <button className={'tab' + (sub === 'feriados' ? ' active' : '')} onClick={() => setSub('feriados')}>📅 Feriados</button>}
      </div>

      {sub === 'ordenes' && !soloReparacion && <PanelOrdenes />}
      {sub === 'asignar' && <PanelAsignar soloReparacion={soloReparacion} focoTareaId={sub === 'asignar' ? focoTareaId : null} onFocoConsumido={onFocoConsumido} />}
      {sub === 'semi' && !soloReparacion && <PanelSemielaborados />}
      {sub === 'feriados' && !soloReparacion && <PanelFeriados />}
    </div>
  )
}

// ------------------------------------------------------------
// 0) Feriados / dias no laborables (v1.17) — los carga el planificador.
//    El motor de calendario los trata como dia cerrado en TODA la app.
// ------------------------------------------------------------
function PanelFeriados() {
  const feriados = useLiveQuery(() => db.feriados.orderBy('fecha').toArray(), []) ?? []
  const [fecha, setFecha] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [msg, setMsg] = useState('')

  async function agregar() {
    if (!fecha) { setMsg('Elegí una fecha.'); return }
    const f: Feriado = { id: fecha, fecha, descripcion: descripcion.trim() || undefined, actualizado: new Date().toISOString() }
    await guardarFeriado(f)
    setDescripcion(''); setFecha('')
    setMsg(`Feriado ${fecha} guardado. Ese día queda como NO laborable en toda la planta.`)
  }
  async function borrar(f: Feriado) {
    if (!window.confirm(`¿Quitar el feriado del ${f.fecha}? Ese día volverá a ser laborable.`)) return
    await eliminarFeriado(f.id)
  }

  const hoyISO = new Date().toLocaleDateString('en-CA')
  return (
    <>
      <div className="card">
        <div className="section-title">Feriados / días no laborables</div>
        <div className="meta" style={{ marginBottom: 12 }}>
          Marcá los días que la planta NO trabaja. El sistema deja de agendar tareas, no dibuja esos días en el Gantt y no los cuenta para los KPIs.
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Fecha *</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="field">
            <label>Descripción (opcional)</label>
            <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="ej. Día del Trabajador" />
          </div>
        </div>
        <button className="btn btn-primary btn-bloque" onClick={agregar} disabled={!fecha}>＋ Agregar feriado</button>
        {msg && <div className="meta" style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div className="section-title">Feriados cargados ({feriados.length})</div>
      {feriados.length === 0
        ? <div className="empty">No hay feriados cargados.</div>
        : feriados.map((f) => {
            const pasado = f.fecha < hoyISO
            return (
              <div className="card" key={f.id} style={{ opacity: pasado ? 0.55 : 1 }}>
                <div className="card-header">
                  <div>
                    <h3>📅 {f.fecha}{pasado ? ' · (pasado)' : ''}</h3>
                    {f.descripcion && <div className="meta">{f.descripcion}</div>}
                  </div>
                  <button className="btn btn-rojo" onClick={() => borrar(f)}>🗑 Quitar</button>
                </div>
              </div>
            )
          })}
    </>
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

// v1.17: período del LISTADO de tareas (reemplaza el filtro por semana ISO).
type PeriodoLista = 'mes_actual' | 'mes_anterior' | 'anual' | 'todas'
const PERIODOS_LISTA: { id: PeriodoLista; label: string }[] = [
  { id: 'mes_actual', label: 'Mes actual' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'anual', label: 'Acumulado anual' },
  { id: 'todas', label: 'Todas' },
]
// ¿La tarea cae en el período? Referencia: inicio real, o arranque planificado.
function enPeriodoLista(t: Tarea, per: PeriodoLista, now: Date): boolean {
  if (per === 'todas') return true
  const ref = t.inicioReal ?? t.inicioPlanificado
  if (!ref) return false
  const d = new Date(ref)
  if (per === 'anual') return d.getFullYear() === now.getFullYear()
  const base = new Date(now.getFullYear(), per === 'mes_anterior' ? now.getMonth() - 1 : now.getMonth(), 1)
  return d.getFullYear() === base.getFullYear() && d.getMonth() === base.getMonth()
}
const ESTADOS_TAREA: { id: 'todos' | EstadoTarea; label: string }[] = [
  { id: 'todos', label: 'Todos los estados' },
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'pausada', label: 'Pausada' },
  { id: 'finalizada', label: 'Finalizada' },
]

// ------------------------------------------------------------
// 2) Asignar tareas (operacion x sector) a colaboradores
// ------------------------------------------------------------
function PanelAsignar({ soloReparacion = false, focoTareaId = null, onFocoConsumido }: { soloReparacion?: boolean; focoTareaId?: string | null; onFocoConsumido?: () => void }) {
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), [])
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), [])
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), [])
  // v1.17: el listado ya NO filtra por semana ISO (causaba que tareas finalizadas
  // o de otra semana "desaparecieran"). Se trae todo y se filtra por periodo/estado.
  const tareas = useLiveQuery(() => db.tareas.toArray(), [])
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
  // v1.18: prototipo de prueba (sin semielaborado). notaProto = tipo de prototipo.
  const [esProto, setEsProto] = useState(false)
  const [notaProto, setNotaProto] = useState('')
  const [editar, setEditar] = useState<Tarea | null>(null) // v1.16: tarea en edicion
  // v1.16: toolbar del listado de tareas (filtros + agrupacion para legibilidad).
  const [filtroSector, setFiltroSector] = useState<'todos' | SectorId>('todos')
  const [agruparPor, setAgruparPor] = useState<'sector' | 'maquina' | 'operario'>('sector')
  const [filtroFecha, setFiltroFecha] = useState('')
  // v1.17: período (mes) + estado de la operación para el listado.
  const [periodoLista, setPeriodoLista] = useState<PeriodoLista>('mes_actual')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoTarea>('todos')
  // v1.17: tarea resaltada al venir desde un click en el Gantt.
  const [resaltado, setResaltado] = useState<string | null>(null)
  useEffect(() => {
    if (!focoTareaId) return
    const id = focoTareaId
    // Limpiar filtros para garantizar que la tarea aparezca (sea de la semana/mes que sea).
    setFiltroSector('todos'); setFiltroFecha(''); setFiltroEstado('todos'); setPeriodoLista('todas'); setResaltado(id)
    setTimeout(() => { document.getElementById('tarea-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, 120)
    setTimeout(() => setResaltado(null), 3000)
    onFocoConsumido?.() // libera el foco del padre (permite volver a clickear la misma)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoTareaId])
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
  const maquinasDelSector = (maquinas ?? []).filter((m) => m.activo && maquinaSirveSector(m, sectorId))
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
  // Semielaborados del sector con CUPO segun la cantidad de la OF. Aplica a TODOS
  // los semielaborados del transformador: cada tarea ya planificada (cualquier
  // estado) de ese componente en esta orden consume 1 unidad. Se ocultan los que
  // ya estan completos (planificado >= cantidad de la OF).
  const cantidadOrden = ordenSel?.cantidad ?? 1
  const componentesDelSector = componentesDeModelo(modeloSel)
    .filter((c) => c.sectorId === sectorId)
    .map((c) => {
      const planificado = todasTareas.filter((t) => t.ordenId === ordenId && t.componenteCodigo === c.codigo).length
      return { c, restante: cantidadOrden - planificado }
    })
    .filter((x) => x.restante > 0)

  // v1.16: ¿el modelo de la orden tiene semielaborados para este sector? Si los
  // tiene, elegir uno es OBLIGATORIO (no se puede planificar fabricacion "suelta").
  const sectorTieneSemi = !!modeloSel && componentesDeModelo(modeloSel).some((c) => c.sectorId === sectorId)

  // v1.16: ¿faltan campos para poder asignar? (deshabilita el boton).
  const faltanCampos = (soloReparacion || tipo === 'reparacion')
    ? (!descripcion.trim() || !maquinaId || !fechaPlan || !horaPlan)
    : esProto // v1.18: prototipo no requiere orden ni semielaborado, pero sí la nota
      ? (!notaProto.trim() || !maquinaId || (operariosDelSector.length > 0 && !operarioId) || !fechaPlan || !horaPlan)
      : (!ordenId || !maquinaId || (operariosDelSector.length > 0 && !operarioId)
          || (sectorTieneSemi && !componenteCodigo) || !fechaPlan || !horaPlan)

  // v1.16: carga actual (en vivo) del colaborador y la maquina seleccionados.
  const cargaOperario = useMemo(() => operarioId ? resumenCarga(todasTareas, (t) => t.operarioId === operarioId) : null, [todasTareas, operarioId])
  const cargaMaquina = useMemo(() => maquinaId ? resumenCarga(todasTareas, (t) => t.maquinaId === maquinaId) : null, [todasTareas, maquinaId])

  // Al cambiar de sector se reinician estacion, colaborador y semielaborado.
  function cambiarSector(s: SectorId) { setSectorId(s); setMaquinaId(''); setOperarioId(''); setComponenteCodigo('') }
  function cambiarOrden(id: string) { setOrdenId(id); setComponenteCodigo('') }

  async function asignar() {
    const esRep = soloReparacion || tipo === 'reparacion' // v1.9: encargado siempre reparacion
    const proto = !esRep && esProto // v1.18: prototipo de prueba (sin semielaborado)
    // Fabricacion necesita orden; reparacion necesita descripcion (no lleva orden).
    const orden = (ordenes ?? []).find((o) => o.id === ordenId)
    if (!esRep && !proto && !orden) { setMsg('Selecciona una orden.'); return }
    if (esRep && !descripcion.trim()) { setMsg('Describe la reparacion (que se corrige).'); return }
    if (proto && !notaProto.trim()) { setMsg('Escribí qué tipo de prototipo es (la nota).'); return }
    // v1.16: el semielaborado es obligatorio si el sector del modelo lo tiene (salvo prototipo).
    if (!esRep && !proto && sectorTieneSemi && !componenteCodigo) {
      setMsg(componentesDelSector.length === 0
        ? 'Todos los semielaborados de este sector ya estan planificados para esta orden.'
        : 'Selecciona el semielaborado (segun sector).')
      return
    }
    if (!maquinaId) { setMsg('Selecciona una estacion (maquina/box/linea) para el sector.'); return }
    if (operariosDelSector.length > 0 && !operarioId) { setMsg('Selecciona un colaborador.'); return }
    if (!fechaPlan || !horaPlan) { setMsg('Indica dia y hora de arranque.'); return }
    // Dia+hora elegidos -> ISO local. La semana ISO se deriva de esa fecha.
    const inicioPlanificado = new Date(`${fechaPlan}T${horaPlan}`).toISOString()
    const t: Tarea = {
      id: crypto.randomUUID(),
      tipo: esRep ? 'reparacion' : 'fabricacion',
      ordenId: esRep ? undefined : orden?.id,
      sectorId,
      maquinaId,
      // v1.3: el planificador asigna colaborador + estacion simultaneamente.
      operarioId: operarioId || undefined,
      modelo: esRep ? descripcion.trim() : (orden?.modelo ?? 'Prototipo'),
      componenteCodigo: (esRep || proto) ? undefined : (componenteCodigo || undefined),
      nroTransformador: nroTransformador.trim() || undefined,
      semana: isoWeek(new Date(inicioPlanificado)),
      prioridad: Math.max(1, Number(prioridad) || 1),
      estado: 'pendiente',
      tiempoEstandarMin: Math.max(1, Number(estandar) || 1),
      activaHoraRecuperacion: horaRecup,
      inicioPlanificado,
      paradas: [],
      esPrototipo: proto || undefined,
      notas: proto ? notaProto.trim() : undefined,
    }
    await guardarTarea(t)
    setNroTransformador(''); setComponenteCodigo(''); setHoraRecup(false); setDescripcion(''); setEsProto(false); setNotaProto('')
    const queTipo = esRep ? 'Reparacion' : proto ? 'Prototipo' : 'Tarea'
    setMsg(`${queTipo} asignad${queTipo === 'Tarea' ? 'a' : queTipo === 'Prototipo' ? 'o' : 'a'} a ${nombreOperario(operarioId)} · ${nombreMaquina(maquinaId)} en ${sectorById(sectorId).nombre}.`)
  }

  // v1.6: activar/desactivar la hora de recuperacion de una tarea ya cargada.
  async function toggleRecup(t: Tarea) {
    await guardarTarea({ ...t, activaHoraRecuperacion: !t.activaHoraRecuperacion })
    setMsg(`Hora de recuperación ${!t.activaHoraRecuperacion ? 'activada' : 'desactivada'} para ${t.modelo}.`)
  }

  // v1.16: el planificador puede eliminar en CUALQUIER estado (la RLS ya lo
  // permite). Para tareas ya arrancadas/finalizadas se pide doble confirmacion,
  // porque borra el registro de produccion y afecta el historial y los KPIs.
  async function borrar(t: Tarea) {
    const ref = `${t.modelo}${t.nroTransformador ? ` · ${t.nroTransformador}` : ''}`
    const aviso = t.estado === 'pendiente'
      ? `Eliminar la tarea de ${ref}? Esta accion no se puede deshacer.`
      : `⚠ La tarea de ${ref} esta en estado "${t.estado}" (ya tiene produccion registrada).\n\nEliminarla la borra del historial y de los KPIs, y NO se puede deshacer.\n\nSi solo fue una finalizacion por error, conviene usar "↩ Reabrir" en vez de borrar.\n\n¿Eliminar de todos modos?`
    if (!window.confirm(aviso)) return
    await eliminarTarea(t)
    setMsg('Tarea eliminada.')
  }

  // v1.16: revertir una finalizacion por error. Vuelve la tarea a "en proceso"
  // y limpia el cierre (fin/calidad/duracion) para que NO cuente en los KPIs.
  // El operario puede volver a finalizarla correctamente despues.
  async function reabrir(t: Tarea) {
    if (!window.confirm(`¿Reabrir la tarea de ${t.modelo}? El tiempo entre la finalización y ahora NO se cuenta; el trabajo ya hecho se conserva.`)) return
    // Se preservan inicioReal, paradas y duracionEfectivaMin (no se pierde lo hecho).
    // v1.17: el lapso "finalizada -> reabierta" se registra como una parada NO
    // productiva automatica (causa 'reapertura'), para que ese tiempo muerto (error
    // de carga o retrabajo) NO cuente ni en Real ni en Neto al re-finalizar.
    const ahora = new Date().toISOString()
    const paradas = [...t.paradas]
    if (t.finReal && t.finReal < ahora) {
      paradas.push({ id: crypto.randomUUID(), tareaId: t.id, causa: 'reapertura', inicio: t.finReal, fin: ahora, observacion: 'Tiempo entre finalización y reapertura (no productivo)' })
    }
    await guardarTarea({ ...t, estado: 'en_proceso', finReal: undefined, calidadOk: undefined, defecto: undefined, paradas })
    setMsg('Tarea reabierta: el tiempo entre la finalización y ahora no se cuenta.')
  }

  const tareasOrdenadas = useMemo(
    () => [...(tareas ?? [])].sort((a, b) => a.prioridad - b.prioridad),
    [tareas],
  )

  // v1.17: tareas visibles segun periodo (mes), estado, sector y dia de arranque.
  const visibles = useMemo(() => {
    const now = new Date()
    return tareasOrdenadas.filter((t) => {
      if (!enPeriodoLista(t, periodoLista, now)) return false
      if (filtroEstado !== 'todos' && t.estado !== filtroEstado) return false
      if (filtroSector !== 'todos' && t.sectorId !== filtroSector) return false
      if (filtroFecha) {
        const ref = t.inicioReal ?? t.inicioPlanificado
        if (!ref || new Date(ref).toLocaleDateString('en-CA') !== filtroFecha) return false
      }
      return true
    })
  }, [tareasOrdenadas, periodoLista, filtroEstado, filtroSector, filtroFecha])

  // v1.16: agrupacion dinamica (sector / estacion / colaborador) para legibilidad.
  const grupos = useMemo(() => {
    const m = new Map<string, { label: string; items: Tarea[] }>()
    for (const t of visibles) {
      let key: string, label: string
      if (agruparPor === 'maquina') { key = t.maquinaId; label = nombreMaquina(t.maquinaId) }
      else if (agruparPor === 'operario') { key = t.operarioId ?? '__sin__'; label = t.operarioId ? nombreOperario(t.operarioId) : 'Sin asignar' }
      else { key = t.sectorId; label = sectorById(t.sectorId).nombre }
      const g = m.get(key) ?? { label, items: [] }
      g.items.push(t); m.set(key, g)
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [visibles, agruparPor, nombreMaquina, nombreOperario])

  // Tarjeta de una tarea (extraida para reusar dentro de los grupos).
  const renderTarea = (t: Tarea) => (
    <div className={'card' + (resaltado === t.id ? ' card-foco' : '')} id={'tarea-' + t.id} key={t.id}>
      <div className="card-header">
        <div>
          <h3>{t.tipo === 'reparacion' ? '🔧 ' : ''}{t.modelo}{t.nroTransformador ? ` · ${t.nroTransformador}` : ''}{t.tipo === 'reparacion' && <span className="estado-chip" style={{ background: 'var(--reparacion)', color: '#fff', marginLeft: 8 }}>Reparación</span>}</h3>
          <div className="meta">
            {sectorById(t.sectorId).nombre} · {nombreOperario(t.operarioId)} · {nombreMaquina(t.maquinaId)} · Prioridad <strong>{t.prioridad}</strong> · Estandar <strong>{t.tiempoEstandarMin}m</strong>
            {t.inicioReal
              ? <> · Arranque real <strong>{fechaCorta(t.inicioReal)} {hhmm(t.inicioReal)}</strong></>
              : t.inicioPlanificado ? <> · Arranque plan. <strong>{fechaCorta(t.inicioPlanificado)} {hhmm(t.inicioPlanificado)}</strong></> : null}
            {t.esPrototipo ? <> · <strong style={{ color: 'var(--naranja)' }}>🧪 PROTOTIPO{t.notas ? ` · ${t.notas}` : ''}</strong></>
              : t.componenteCodigo ? <> · Semielaborado <strong>{componentePorCodigo(t.componenteCodigo)?.descripcion ?? t.componenteCodigo}</strong></> : null}
            {t.activaHoraRecuperacion ? <> · <strong style={{ color: 'var(--naranja)' }}>Hora recup. ON</strong></> : null}
            {t.estado === 'finalizada' ? <> · Neto <strong>{tiempoNetoMin(t)}m</strong></> : null}
          </div>
        </div>
        <span className={'estado-chip e-' + (t.estado === 'en_proceso' ? 'proceso' : t.estado === 'pausada' ? 'pausa' : t.estado === 'finalizada' ? 'finalizado' : 'pendiente')}>
          {t.estado}
        </span>
      </div>
      {(!soloReparacion || t.tipo === 'reparacion') && (
        <div className="row-actions">
          {t.estado !== 'finalizada' && (
            <button className="btn" style={{ flex: 1 }} onClick={() => toggleRecup(t)}>
              {t.activaHoraRecuperacion ? '⏱ Quitar hora recup.' : '⏱ Habilitar hora recup.'}
            </button>
          )}
          {t.estado !== 'finalizada' && (
            <button className="btn" style={{ flex: 1 }} onClick={() => setEditar(t)}>✏️ Editar</button>
          )}
          {t.estado === 'finalizada' && (
            <button className="btn" style={{ flex: 1 }} onClick={() => reabrir(t)}>↩ Reabrir</button>
          )}
          <button className="btn btn-rojo" style={{ flex: 1 }} onClick={() => borrar(t)}>🗑 Eliminar</button>
        </div>
      )}
    </div>
  )

  return (
    <>
      <div className="card">
        <div className="section-title">Asignar {tipo === 'reparacion' ? 'reparación' : 'tarea'}</div>

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

        {/* v1.18: prototipo de prueba (sin semielaborado definido). */}
        {tipo === 'fabricacion' && !soloReparacion && (
          <label className="check-inline" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={esProto} onChange={(e) => setEsProto(e.target.checked)} />
            <span>🧪 Es un PROTOTIPO de prueba (sin semielaborado definido)</span>
          </label>
        )}

        <div className="form-grid">
          {tipo === 'fabricacion' ? (
            <div className="field">
              <label>Orden de fabricacion{esProto ? ' (opcional)' : ''}</label>
              <select className="input" value={ordenId} onChange={(e) => cambiarOrden(e.target.value)}>
                <option value="">— {esProto ? 'Sin orden' : 'Selecciona'} —</option>
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
          {tipo === 'fabricacion' && !esProto && (
            <div className="field">
              <label>Semielaborado (segun sector){sectorTieneSemi ? ' *' : ''}</label>
              <select className="input" value={componenteCodigo} onChange={(e) => setComponenteCodigo(e.target.value)} disabled={!ordenSel || componentesDelSector.length === 0}>
                <option value="">— {!ordenSel ? 'Elegi una orden primero' : componentesDelSector.length === 0 ? 'Todos los semielaborados ya planificados' : 'Selecciona'} —</option>
                {componentesDelSector.map(({ c, restante }) => (
                  <option key={c.codigo} value={c.codigo}>{c.descripcion}{cantidadOrden > 1 ? ` (faltan ${restante})` : ''}</option>
                ))}
              </select>
              {ordenSel && !modeloSel && <div className="meta" style={{ marginTop: 6 }}>El modelo de la orden no esta en el catalogo maestro.</div>}
            </div>
          )}
          {tipo === 'fabricacion' && esProto && (
            <div className="field">
              <label>Tipo de prototipo (nota) *</label>
              <input className="input" value={notaProto} onChange={(e) => setNotaProto(e.target.value)} placeholder="ej. Bobina AT de prueba con nuevo aislante" />
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
        <button className="btn btn-primary btn-bloque" onClick={asignar} disabled={faltanCampos}>＋ Asignar {tipo === 'reparacion' ? 'reparación' : 'tarea'}</button>
        {faltanCampos && <div className="meta" style={{ marginTop: 8 }}>Completá todos los campos obligatorios para poder asignar{sectorTieneSemi && !componenteCodigo ? ' (falta el semielaborado)' : ''}.</div>}
        {msg && <div className="meta" style={{ marginTop: 10 }}>{msg}</div>}

        {/* v1.16: panel de carga actual (reacciona al colaborador/maquina elegidos). */}
        {(cargaOperario || cargaMaquina) && (
          <div className="carga-panel">
            <div className="carga-tit">📊 Carga actual <span className="meta">(asignado + pendiente, sin finalizar)</span></div>
            <div className="carga-cols">
              {cargaOperario && (
                <div className="carga-col">
                  <div className="carga-sub">👤 {nombreOperario(operarioId)} · <strong>{cargaOperario.total}</strong> tarea(s)</div>
                  {cargaOperario.grupos.length === 0
                    ? <div className="meta">Sin tareas pendientes.</div>
                    : cargaOperario.grupos.map((g) => <div key={g.label} className="carga-row"><span className="carga-n">{g.n}×</span> {g.label}</div>)}
                </div>
              )}
              {cargaMaquina && (
                <div className="carga-col">
                  <div className="carga-sub">🛠 {nombreMaquina(maquinaId)} · <strong>{cargaMaquina.total}</strong> tarea(s)</div>
                  {cargaMaquina.grupos.length === 0
                    ? <div className="meta">Sin tareas pendientes.</div>
                    : cargaMaquina.grupos.map((g) => <div key={g.label} className="carga-row"><span className="carga-n">{g.n}×</span> {g.label}</div>)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="section-title">Tareas · {PERIODOS_LISTA.find((p) => p.id === periodoLista)?.label} ({visibles.length}{visibles.length !== tareasOrdenadas.length ? ` de ${tareasOrdenadas.length}` : ''})</div>

      {/* v1.17: toolbar de filtrado/agrupacion del listado (periodo + estado + sector + dia). */}
      <div className="filtros" style={{ marginBottom: 12 }}>
        <select className="select" value={periodoLista} onChange={(e) => setPeriodoLista(e.target.value as PeriodoLista)}>
          {PERIODOS_LISTA.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select className="select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as 'todos' | EstadoTarea)}>
          {ESTADOS_TAREA.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <select className="select" value={filtroSector} onChange={(e) => setFiltroSector(e.target.value as 'todos' | SectorId)}>
          <option value="todos">Todos los sectores</option>
          {SECTORES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className="select" value={agruparPor} onChange={(e) => setAgruparPor(e.target.value as 'sector' | 'maquina' | 'operario')}>
          <option value="sector">Agrupar por sector</option>
          <option value="maquina">Agrupar por estación</option>
          <option value="operario">Agrupar por colaborador</option>
        </select>
        <input type="date" className="select" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} title="Filtrar por día de arranque" />
        {filtroFecha && <button className="btn" onClick={() => setFiltroFecha('')}>✕ Quitar día</button>}
      </div>

      {visibles.length === 0
        ? <div className="empty">{tareasOrdenadas.length === 0 ? 'Aun no hay tareas asignadas.' : 'No hay tareas para el filtro seleccionado.'}</div>
        : grupos.map((g) => (
            <div key={g.label} style={{ marginBottom: 14 }}>
              <div className="grupo-tit">{g.label} <span className="grupo-n">{g.items.length} tarea(s)</span></div>
              {g.items.map((t) => renderTarea(t))}
            </div>
          ))}

      {editar && (
        <EditarTarea
          tarea={editar}
          maquinas={maquinas ?? []}
          usuarios={usuarios ?? []}
          onClose={() => setEditar(null)}
        />
      )}
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
