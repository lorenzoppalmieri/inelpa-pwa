import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { validarCierreEvento } from '../../sgo/cierre'
import {
  aplicarCosteoRetrabajo, crearCosteoRetrabajo, guardarNuevaVersionTarifarioCostos,
  obtenerTarifarioCostosVigente, TARIFARIO_COSTOS_BASE,
} from '../../sgo/costosRetrabajo'
import { conciliarInvestigacionesRetrabajo } from '../../sgo/integraciones'
import { datosMejoraDesdeEvento } from '../../sgo/mejoras'
import { usuarioEsLorenzo, usuarioPuedeCerrarRetrabajo, usuarioPuedeInvestigarRetrabajo } from '../../sgo/permisos'
import { resolverTrazabilidadProductiva, type TrazabilidadProductivaSGO } from '../../sgo/trazabilidad'
import {
  ESTADOS_INVESTIGACION_RETRABAJO, NIVELES_INVESTIGACION_RETRABAJO, costoRetrabajoTotal,
  estadoInvestigacionRetrabajo, esEventoRetrabajo, nivelInvestigacionRetrabajo,
  requisitosCierreRetrabajo, semaforoSLAInvestigacion, tiempoRetrabajoDesdePlanta,
  type EstadoInvestigacionRetrabajo,
} from '../../sgo/retrabajos'
import {
  AREAS_SGO, areaSGOLabel, codigoEventoSGO, costoNoCalidadTotal, type AccionSGO, type AreaSGOId,
  type ClasificacionCausaRetrabajoSGO, type DatosCosteoRetrabajoSGO, type DatosRetrabajoSGO, type EventoSGO,
  type MaterialCostoRetrabajoSGO, type ModalidadCostoRetrabajoSGO, type NivelInvestigacionRetrabajoSGO,
  type TarifarioCostosRetrabajoSGO,
} from '../../sgo/types'
import { guardarAccionSGO, guardarEventoSGO } from '../../sync/syncEngine'

const ORIGEN_LABEL: Record<DatosRetrabajoSGO['origen'], string> = {
  parada_calidad: 'Parada de calidad', defecto_final: 'Defecto al finalizar', laboratorio: 'Rechazo de laboratorio',
}
const CAUSAS: { id: ClasificacionCausaRetrabajoSGO; label: string }[] = [
  { id: 'persona', label: 'Personas / capacitación' }, { id: 'metodo', label: 'Método / procedimiento' },
  { id: 'maquina', label: 'Máquina / herramienta' }, { id: 'material', label: 'Material / proveedor' },
  { id: 'medicion', label: 'Medición / control' }, { id: 'ambiente', label: 'Ambiente / entorno' },
  { id: 'diseno', label: 'Diseño / especificación' }, { id: 'otro', label: 'Otro' },
]
const COLUMNAS: { titulo: string; estados: EstadoInvestigacionRetrabajo[] }[] = [
  { titulo: 'Nuevos', estados: ['nuevo'] },
  { titulo: 'En investigación', estados: ['en_investigacion', 'reincidencia'] },
  { titulo: 'Con acciones', estados: ['con_acciones'] },
  { titulo: 'Verificación y cierre', estados: ['pendiente_verificacion', 'listo_cierre'] },
]
const fechaHora = (iso: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
const fecha = (iso?: string) => iso ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(`${iso.slice(0, 10)}T12:00:00`)) : 'Sin fecha'
const estadoLabel = (id: EstadoInvestigacionRetrabajo) => ESTADOS_INVESTIGACION_RETRABAJO.find((item) => item.id === id)?.label ?? id

export default function RetrabajosSGOView({ usuario, onOpenEvento }: { usuario: string; onOpenEvento: (id: string) => void }) {
  const eventos = useLiveQuery(() => db.eventosSGO.toArray(), []) ?? []
  const acciones = useLiveQuery(() => db.accionesSGO.toArray(), []) ?? []
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), []) ?? []
  const usuariosPlanta = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const [buscar, setBuscar] = useState('')
  const [area, setArea] = useState<AreaSGOId | ''>('')
  const [estado, setEstado] = useState<EstadoInvestigacionRetrabajo | ''>('')
  const [cerrados, setCerrados] = useState(false)
  const [editor, setEditor] = useState<EventoSGO>()
  const puedeInvestigar = usuarioPuedeInvestigarRetrabajo(usuario)
  const ahora = new Date().toISOString()
  const mes = ahora.slice(0, 7)

  useEffect(() => {
    if (!puedeInvestigar) return
    void conciliarInvestigacionesRetrabajo(usuario).catch((error) => console.error('[SGO] No se pudo conciliar retrabajos', error))
  }, [puedeInvestigar, usuario])

  const retrabajos = useMemo(() => eventos.filter(esEventoRetrabajo), [eventos])
  const trazabilidades = useMemo(() => new Map(retrabajos.map((evento) => [evento.id, resolverTrazabilidadProductiva(evento, tareas, maquinas, usuariosPlanta)])), [retrabajos, tareas, maquinas, usuariosPlanta])
  const accionesDe = (id: string) => acciones.filter((accion) => accion.eventoId === id)
  const activos = retrabajos.filter((evento) => evento.estado !== 'cerrado')
  const finalizados = retrabajos.filter((evento) => evento.estado === 'cerrado')
  const vencidos = activos.filter((evento) => semaforoSLAInvestigacion(evento, ahora).tono === 'rojo').length
  const tomados = retrabajos.filter((evento) => evento.retrabajo?.tomadoEn)
  const enTermino = tomados.length ? Math.round(tomados.filter((evento) => evento.retrabajo!.tomadoEn! <= evento.retrabajo!.fechaLimiteToma).length / tomados.length * 100) : 0
  const costoMes = retrabajos.filter((evento) => evento.detectadoEn.slice(0, 7) === mes).reduce((total, evento) => total + costoRetrabajoTotal(evento), 0)
  const reincidencias = retrabajos.filter((evento) => evento.retrabajo?.reincidente || evento.retrabajo?.resultadoVerificacion === 'reincidencia').length
  const base = cerrados ? finalizados : activos
  const q = buscar.trim().toLocaleLowerCase('es')
  const visibles = base.filter((evento) => {
    const etapa = estadoInvestigacionRetrabajo(evento, accionesDe(evento.id))
    const texto = `${evento.codigo} ${evento.titulo} ${evento.modelo ?? ''} ${evento.nroSerie ?? ''} ${evento.ordenId ?? ''} ${evento.retrabajo?.causaRegistrada ?? ''}`.toLocaleLowerCase('es')
    return (!q || texto.includes(q)) && (!area || evento.areaId === area || evento.areaOrigenId === area) && (!estado || etapa === estado)
  }).sort((a, b) => b.detectadoEn.localeCompare(a.detectadoEn))

  return <div className="sgo-retrabajos">
    <div className="card sgo-retrabajos-cabecera"><div><div className="section-title">INVESTIGACIONES DE RETRABAJO</div><div className="meta">Cada retrabajo registrado en producción o laboratorio genera un expediente automático asignado a Lara.</div></div><div className="row-actions"><button className={`btn ${!cerrados ? 'btn-primary' : ''}`} onClick={() => setCerrados(false)}>Activos ({activos.length})</button><button className={`btn ${cerrados ? 'btn-primary' : ''}`} onClick={() => setCerrados(true)}>Historial ({finalizados.length})</button></div></div>
    {!puedeInvestigar && <div className="card sgo-retrabajo-aviso">Vista de seguimiento. La investigación puede ser modificada únicamente por Lara y Lorenzo.</div>}
    <div className="sgo-retrabajos-kpis">
      <Kpi valor={activos.filter((evento) => !evento.retrabajo?.tomadoEn).length} label="Nuevos sin tomar" tono="azul" />
      <Kpi valor={vencidos} label="Fuera de plazo" tono={vencidos ? 'rojo' : 'verde'} />
      <Kpi valor={activos.filter((evento) => estadoInvestigacionRetrabajo(evento, accionesDe(evento.id)) === 'en_investigacion').length} label="En investigación" tono="amarillo" />
      <Kpi valor={`${enTermino}%`} label="Tomados en 24 h" tono={enTermino >= 90 ? 'verde' : enTermino >= 75 ? 'amarillo' : 'rojo'} />
      <Kpi valor={`$${Math.round(costoMes).toLocaleString('es-AR')}`} label="Costo del mes" tono="rojo" />
      <Kpi valor={reincidencias} label="Reincidencias" tono={reincidencias ? 'rojo' : 'verde'} />
    </div>
    <div className="card sgo-retrabajos-filtros"><input className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar código, modelo, serie, orden o defecto…" /><select className="input" value={area} onChange={(e) => setArea(e.target.value as AreaSGOId | '')}><option value="">Todas las áreas</option>{AREAS_SGO.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select className="input" value={estado} onChange={(e) => setEstado(e.target.value as EstadoInvestigacionRetrabajo | '')}><option value="">Todos los estados</option>{ESTADOS_INVESTIGACION_RETRABAJO.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
    {cerrados ? <Listado eventos={visibles} acciones={acciones} trazabilidades={trazabilidades} ahora={ahora} onOpen={setEditor} /> : <div className="sgo-retrabajos-kanban">{COLUMNAS.map((columna) => {
      const items = visibles.filter((evento) => columna.estados.includes(estadoInvestigacionRetrabajo(evento, accionesDe(evento.id))))
      return <section className="sgo-retrabajos-columna" key={columna.titulo}><div className="sgo-retrabajos-columna-titulo"><strong>{columna.titulo}</strong><span>{items.length}</span></div><div className="sgo-retrabajos-lista">{items.map((evento) => <RetrabajoCard key={evento.id} evento={evento} acciones={accionesDe(evento.id)} trazabilidad={trazabilidades.get(evento.id)!} ahora={ahora} onOpen={() => setEditor(evento)} />)}{!items.length && <div className="empty">Sin casos</div>}</div></section>
    })}</div>}
    {editor && <EditorRetrabajo eventoInicial={editor} acciones={accionesDe(editor.id)} trazabilidad={trazabilidades.get(editor.id)!} usuario={usuario} onClose={() => setEditor(undefined)} onOpenEvento={() => { setEditor(undefined); onOpenEvento(editor.id) }} />}
  </div>
}

function Kpi({ valor, label, tono }: { valor: string | number; label: string; tono: string }) { return <div className={`card sgo-retrabajo-kpi tono-${tono}`}><strong>{valor}</strong><span>{label}</span></div> }

function Listado({ eventos, acciones, trazabilidades, ahora, onOpen }: { eventos: EventoSGO[]; acciones: AccionSGO[]; trazabilidades: Map<string, TrazabilidadProductivaSGO>; ahora: string; onOpen: (evento: EventoSGO) => void }) {
  if (!eventos.length) return <div className="empty">No hay investigaciones cerradas con estos filtros.</div>
  return <div className="sgo-retrabajos-lista">{eventos.map((evento) => <RetrabajoCard key={evento.id} evento={evento} acciones={acciones.filter((accion) => accion.eventoId === evento.id)} trazabilidad={trazabilidades.get(evento.id)!} ahora={ahora} onOpen={() => onOpen(evento)} />)}</div>
}

function RetrabajoCard({ evento, acciones, trazabilidad, ahora, onOpen }: { evento: EventoSGO; acciones: AccionSGO[]; trazabilidad: TrazabilidadProductivaSGO; ahora: string; onOpen: () => void }) {
  const etapa = estadoInvestigacionRetrabajo(evento, acciones)
  const sla = semaforoSLAInvestigacion(evento, ahora)
  const nivel = NIVELES_INVESTIGACION_RETRABAJO.find((item) => item.id === nivelInvestigacionRetrabajo(evento))?.label
  return <button className={`card sgo-retrabajo-card sla-${sla.tono}`} onClick={onOpen}><div className="sgo-retrabajo-card-top"><span className={`estado-chip retrabajo-${etapa}`}>{estadoLabel(etapa)}</span><span className={`sgo-retrabajo-sla sla-${sla.tono}`}>{sla.label}</span></div><strong>{evento.titulo}</strong><div className="meta">{evento.codigo} · {ORIGEN_LABEL[evento.retrabajo!.origen]} · {nivel}</div><div className="meta">{areaSGOLabel(evento.areaOrigenId ?? evento.areaId)} · {evento.modelo || 'Sin modelo'}{evento.nroSerie ? ` · Serie ${evento.nroSerie}` : ''}</div><div className="sgo-trazabilidad-compacta"><span><b>Sector:</b> {trazabilidad.sector}</span><span><b>Máquina:</b> {trazabilidad.maquina}</span><span><b>Operario:</b> {trazabilidad.operario}</span></div><div className="sgo-retrabajo-causa">{evento.retrabajo?.causaRegistrada || 'Sin causa informada en origen'}</div><div className="sgo-retrabajo-card-resumen"><span>Ocurrió: <strong>{fechaHora(evento.detectadoEn)}</strong></span><span>{evento.retrabajo?.minutosRetrabajo !== undefined ? `${evento.retrabajo.minutosRetrabajo} min` : 'Tiempo en curso'}</span><span>${costoRetrabajoTotal(evento).toLocaleString('es-AR')}</span></div></button>
}

function EditorRetrabajo({ eventoInicial, acciones, trazabilidad, usuario, onClose, onOpenEvento }: { eventoInicial: EventoSGO; acciones: AccionSGO[]; trazabilidad: TrazabilidadProductivaSGO; usuario: string; onClose: () => void; onOpenEvento: () => void }) {
  const [evento, setEvento] = useState(eventoInicial)
  const [guardando, setGuardando] = useState(false)
  const datos = evento.retrabajo!
  const puede = usuarioPuedeInvestigarRetrabajo(usuario)
  const lorenzo = usuarioEsLorenzo(usuario)
  const nivel = nivelInvestigacionRetrabajo(evento)
  const cierrePermitido = usuarioPuedeCerrarRetrabajo(usuario, evento)
  const nivelForzado = ['alta', 'critica'].includes(evento.severidad) || datos.origen === 'laboratorio' || Boolean(datos.reincidente)
  const editable = puede && Boolean(datos.tomadoEn) && evento.estado !== 'cerrado'
  const modalidadCosto = datos.modalidadCosto ?? (datos.costosRevisados ? (costoNoCalidadTotal(evento.costoDetalle) > 0 ? 'detallado' : 'sin_costo') : '')
  const requisitos = requisitosCierreRetrabajo(evento, acciones)
  const setCampo = <K extends keyof EventoSGO>(campo: K, valor: EventoSGO[K]) => setEvento({ ...evento, [campo]: valor, actualizadoEn: new Date().toISOString() })
  const setDato = <K extends keyof DatosRetrabajoSGO>(campo: K, valor: DatosRetrabajoSGO[K]) => setEvento({ ...evento, retrabajo: { ...datos, [campo]: valor }, actualizadoEn: new Date().toISOString() })
  const setNivel = (valor: NivelInvestigacionRetrabajoSGO) => {
    if (nivelForzado && valor !== 'critica') return
    setDato('nivelInvestigacion', valor)
  }
  const setModalidadCosto = (valor: ModalidadCostoRetrabajoSGO) => {
    const base = { ...datos, modalidadCosto: valor, costosRevisados: valor === 'sin_costo', costeo: valor === 'detallado' ? datos.costeo : undefined }
    if (valor === 'sin_costo') {
      setEvento({ ...evento, costoDetalle: { material: 0, manoObra: 0, maquina: 0, ensayos: 0, logistica: 0, terceros: 0 }, costoEstimado: 0, retrabajo: { ...base, costosJustificacion: 'Sin costo adicional' }, actualizadoEn: new Date().toISOString() })
      return
    }
    setEvento({ ...evento, retrabajo: base, costoDetalle: valor === 'total_estimado' ? undefined : evento.costoDetalle, actualizadoEn: new Date().toISOString() })
  }

  async function tomar() {
    if (!puede || datos.tomadoEn) return
    const now = new Date().toISOString()
    const actualizado = { ...evento, estado: 'en_analisis' as const, responsable: 'Lara', retrabajo: { ...datos, tomadoEn: now, tomadoPor: usuario }, actualizadoEn: now }
    setGuardando(true)
    try { await guardarEventoSGO(actualizado); setEvento(actualizado) } finally { setGuardando(false) }
  }

  async function guardar() {
    if (!editable) return
    const activas = acciones.filter((accion) => accion.estado !== 'cancelada')
    const estado: EventoSGO['estado'] = activas.length ? 'con_acciones' : 'en_analisis'
    const reincide = datos.resultadoVerificacion === 'reincidencia'
    const now = new Date().toISOString()
    const retrabajo = cierrePermitido && datos.resultadoVerificacion !== 'pendiente'
      ? { ...datos, verificadoEn: now, verificadoPor: usuario }
      : datos
    const actualizado: EventoSGO = { ...evento, retrabajo, estado, severidad: reincide ? 'alta' : evento.severidad, cerradoEn: undefined, cerradoPor: undefined, actualizadoEn: now }
    setGuardando(true)
    try { await guardarEventoSGO(actualizado); onClose() } finally { setGuardando(false) }
  }

  async function resolverAccionesComoCorreccion() {
    const pendientes = acciones.filter((accion) => !['verificada', 'cancelada'].includes(accion.estado))
    if (!editable || nivel !== 'simple' || !pendientes.length) return
    if (!window.confirm(`Se marcarán ${pendientes.length} acción(es) como resueltas mediante la corrección inmediata documentada. Usá esta opción solo si efectivamente quedaron solucionadas. ¿Continuar?`)) return
    const now = new Date().toISOString()
    setGuardando(true)
    try {
      for (const accion of pendientes) {
        await guardarAccionSGO({
          ...accion, estado: 'verificada', eficaz: true,
          evidencia: accion.evidencia || 'Corrección inmediata documentada en la investigación de retrabajo.',
          completadaEn: accion.completadaEn ?? now, completadaPor: accion.completadaPor ?? usuario,
          verificadaEn: now, verificadaPor: usuario,
          comentarioVerificacion: datos.resultadoResolucion || 'La corrección inmediata resolvió el retrabajo.', actualizadoEn: now,
        })
      }
    } finally { setGuardando(false) }
  }

  async function proponerMejora() {
    if (!editable || datos.mejoraEventoId) return
    setGuardando(true)
    try {
      const vinculada = await db.eventosSGO.filter((item) => item.mejora?.origenEntidad === 'retrabajo' && item.mejora.origenId === evento.id).first()
      const mejoraId = vinculada?.id ?? crypto.randomUUID()
      if (!vinculada) {
        const now = new Date().toISOString()
        const mejora = datosMejoraDesdeEvento(evento, {
      fuente: 'retrabajo_produccion', origenEntidad: 'retrabajo',
          origenId: evento.id,
      beneficioEsperado: 'Eliminar la causa del retrabajo y evitar su repetición.',
    })
        const propuesta: EventoSGO = {
          id: mejoraId, codigo: codigoEventoSGO(new Date(), mejoraId), tipo: 'oportunidad_mejora', pilar: 'mejora',
          titulo: `Mejora derivada de ${evento.codigo}`, descripcion: `Oportunidad detectada durante la investigación: ${evento.titulo}`,
          severidad: evento.severidad, estado: 'abierto', areaId: evento.areaOrigenId ?? evento.areaId,
          ordenId: evento.ordenId, tareaId: evento.tareaId, nroSerie: evento.nroSerie, modelo: evento.modelo,
          detectadoEn: now, detectadoPor: usuario, responsable: 'Lara', mejora, creadoEn: now, actualizadoEn: now,
        }
        await guardarEventoSGO(propuesta)
      }
      const actualizado: EventoSGO = {
        ...evento, retrabajo: { ...datos, mejoraEventoId: mejoraId }, actualizadoEn: new Date().toISOString(),
      }
      await guardarEventoSGO(actualizado)
      setEvento(actualizado)
    } finally { setGuardando(false) }
  }

  async function cerrar() {
    if (!cierrePermitido) return
    const now = new Date().toISOString()
    const candidato: EventoSGO = {
      ...evento, retrabajo: {
        ...datos,
        resultadoVerificacion: nivel === 'simple' ? 'eficaz' : datos.resultadoVerificacion,
        fechaVerificacion: nivel === 'critica' ? datos.fechaVerificacion : now.slice(0, 10),
        verificadoEn: now, verificadoPor: usuario,
      },
      estado: 'cerrado', cerradoEn: now, cerradoPor: usuario, actualizadoEn: now,
    }
    const errores = validarCierreEvento(candidato, acciones)
    if (errores.length) { window.alert(`No se puede cerrar la investigación:\n\n• ${errores.join('\n• ')}`); return }
    if (!window.confirm('La investigación quedará cerrada y pasará al historial. ¿Continuar?')) return
    setGuardando(true)
    try {
      if (nivel === 'con_accion') {
        for (const accion of acciones.filter((item) => item.estado === 'completada')) {
          await guardarAccionSGO({ ...accion, estado: 'verificada', eficaz: true, verificadaEn: now, verificadaPor: usuario, comentarioVerificacion: datos.observacionVerificacion, actualizadoEn: now })
        }
      }
      await guardarEventoSGO(candidato)
      onClose()
    } finally { setGuardando(false) }
  }

  return <div className="modal-overlay"><div className="modal sgo-retrabajo-editor" role="dialog" aria-modal="true" aria-label={`Investigación ${evento.codigo}`}><div className="card-header"><div><div className="section-title">{evento.codigo} · Investigación de retrabajo</div><div className="meta">{ORIGEN_LABEL[datos.origen]} · detectado {fechaHora(evento.detectadoEn)}</div></div><button className="btn" onClick={onClose}>×</button></div>
    <div className="sgo-retrabajo-origen"><div><span>Sector / línea</span><strong>{trazabilidad.sector}</strong></div><div><span>Máquina / puesto</span><strong>{trazabilidad.maquina}</strong></div><div><span>Operario</span><strong>{trazabilidad.operario}</strong></div><div><span>Fecha y hora</span><strong>{fechaHora(trazabilidad.ocurridoEn)}</strong></div><div><span>Modelo / serie</span><strong>{evento.modelo || '—'}{evento.nroSerie ? ` · ${evento.nroSerie}` : ''}</strong></div><div><span>Orden</span><strong>{evento.ordenId || '—'}</strong></div><div><span>Tiempo</span><strong>{datos.minutosRetrabajo !== undefined ? `${datos.minutosRetrabajo} min` : 'En curso / sin dato'}</strong></div><div><span>Registro SGO</span><strong>{trazabilidad.registradoPor}</strong></div></div>
    <div className="card sgo-retrabajo-deteccion"><strong>{datos.causaRegistrada || evento.titulo}</strong><div>{datos.observacionOrigen || evento.descripcion}</div></div>
    {!datos.tomadoEn ? <div className="card sgo-retrabajo-tomar"><div><strong>Pendiente de Lara</strong><div className="meta">Debe tomarse antes del {fechaHora(datos.fechaLimiteToma)}.</div></div>{puede && <button className="btn btn-primary" disabled={guardando} onClick={() => void tomar()}>Tomar investigación</button>}</div>
      : <div className="meta sgo-retrabajo-tomado">Tomada por <strong>{datos.tomadoPor}</strong> el {fechaHora(datos.tomadoEn)}</div>}

    <fieldset disabled={!editable}>
      <div className="section-title">1. Contención y trazabilidad</div><div className="sgo-retrabajo-form-grid"><Campo label="Proceso donde se originó *"><input className="input" value={datos.procesoOrigen ?? ''} onChange={(e) => setDato('procesoOrigen', e.target.value || undefined)} /></Campo><Campo label="Proceso donde se detectó *"><input className="input" value={datos.procesoDeteccion ?? ''} onChange={(e) => setDato('procesoDeteccion', e.target.value || undefined)} /></Campo><Campo label="Cantidad afectada"><input className="input" type="number" min="1" value={evento.cantidadAfectada ?? 1} onChange={(e) => setCampo('cantidadAfectada', Math.max(1, Number(e.target.value) || 1))} /></Campo><Campo label="Disposición *"><select className="input" value={evento.disposicion ?? 'pendiente'} onChange={(e) => setCampo('disposicion', e.target.value as EventoSGO['disposicion'])}><option value="pendiente">Pendiente</option><option value="retrabajo">Retrabajo</option><option value="rechazo">Rechazo / scrap</option><option value="concesion">Concesión</option><option value="devolucion">Devolución</option><option value="no_aplica">No aplica</option></select></Campo></div><Campo label="Contención inmediata *"><textarea className="input" rows={2} value={evento.contencion ?? ''} onChange={(e) => setCampo('contencion', e.target.value || undefined)} /></Campo>

      <div className="section-title">2. Investigación de causa raíz</div><div className="sgo-retrabajo-form-grid"><Campo label="Método de análisis *"><select className="input" value={evento.metodoAnalisis ?? ''} onChange={(e) => setCampo('metodoAnalisis', (e.target.value || undefined) as EventoSGO['metodoAnalisis'])}><option value="">Seleccionar</option><option value="5_porques">5 porqués</option><option value="ishikawa">Ishikawa</option><option value="a3">A3</option><option value="8d">8D</option><option value="otro">Otro</option></select></Campo><Campo label="Clasificación de causa *"><select className="input" value={datos.clasificacionCausa ?? ''} onChange={(e) => setDato('clasificacionCausa', (e.target.value || undefined) as DatosRetrabajoSGO['clasificacionCausa'])}><option value="">Seleccionar</option>{CAUSAS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Campo></div><Campo label="Causa raíz comprobada *"><textarea className="input" rows={3} value={evento.causaRaiz ?? ''} onChange={(e) => setCampo('causaRaiz', e.target.value || undefined)} placeholder="No confundir la causa con el síntoma observado." /></Campo><Campo label="Factores contribuyentes *"><textarea className="input" rows={2} value={datos.factoresContribuyentes ?? ''} onChange={(e) => setDato('factoresContribuyentes', e.target.value || undefined)} /></Campo><label className="check-inline"><input type="checkbox" checked={Boolean(datos.reincidente)} onChange={(e) => setDato('reincidente', e.target.checked)} /> Es un defecto o causa reincidente</label>

      <div className="section-title">3. Costos del retrabajo</div>
      <CostosRetrabajoEditor
        evento={evento}
        usuario={usuario}
        lorenzo={lorenzo}
        modalidad={modalidadCosto}
        onModalidad={setModalidadCosto}
        onChange={setEvento}
      />

      <div className="section-title">4. Evidencia y verificación</div><Campo label="Evidencias / referencias (una por línea)"><textarea className="input" rows={2} value={(evento.evidenciaUrls ?? []).join('\n')} onChange={(e) => setCampo('evidenciaUrls', e.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} /></Campo><div className="sgo-retrabajo-form-grid"><Campo label="Fecha real de verificación *"><input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={datos.fechaVerificacion ?? ''} onChange={(e) => setDato('fechaVerificacion', e.target.value || undefined)} /></Campo><Campo label="Resultado de la verificación"><select className="input" disabled={!lorenzo} value={datos.resultadoVerificacion ?? 'pendiente'} onChange={(e) => setDato('resultadoVerificacion', e.target.value as DatosRetrabajoSGO['resultadoVerificacion'])}><option value="pendiente">Pendiente</option><option value="eficaz">Acciones eficaces</option><option value="reincidencia">Reincidencia</option></select></Campo></div><Campo label="Observación de verificación *"><textarea className="input" rows={2} disabled={!lorenzo} value={datos.observacionVerificacion ?? ''} onChange={(e) => setDato('observacionVerificacion', e.target.value || undefined)} /></Campo>
    </fieldset>

    <div className="card sgo-retrabajo-acciones"><div><strong>{acciones.length}</strong><span>acciones</span></div><div><strong>{acciones.filter((accion) => accion.estado === 'verificada').length}</strong><span>verificadas</span></div><div><strong>{acciones.filter((accion) => !['verificada', 'cancelada'].includes(accion.estado) && accion.fechaCompromiso < new Date().toISOString().slice(0, 10)).length}</strong><span>vencidas</span></div><button className="btn" onClick={onOpenEvento}>Abrir expediente y acciones</button></div>
    <div className="card sgo-retrabajo-mejora"><div><strong>Oportunidad de mejora continua</strong><div className="meta">Se crea como expediente vinculado solo si la investigación identifica una mejora que merece seguimiento propio.</div></div>{datos.mejoraEventoId ? <span className="estado-chip mejora-detectada">Propuesta creada</span> : editable ? <button className="btn" disabled={guardando} onClick={() => void proponerMejora()}>Proponer mejora</button> : <span className="meta">Sin propuesta</span>}</div>
    <div className="row-actions sgo-retrabajo-editor-pie"><button className="btn" onClick={onClose}>Cerrar ventana</button>{editable && <button className="btn btn-primary" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar investigación'}</button>}{lorenzo && evento.estado !== 'cerrado' && <button className="btn btn-verde" disabled={guardando} onClick={() => void cerrar()}>Verificar y cerrar</button>}</div>
  </div></div>
}

function CostosRetrabajoEditor({ evento, usuario, lorenzo, modalidad, onModalidad, onChange }: {
  evento: EventoSGO
  usuario: string
  lorenzo: boolean
  modalidad: ModalidadCostoRetrabajoSGO | ''
  onModalidad: (valor: ModalidadCostoRetrabajoSGO) => void
  onChange: (evento: EventoSGO) => void
}) {
  // v1.93: el tiempo del retrabajo ya está medido en planta. Un retrabajo ES una
  // parada de calidad, y el evento guarda `tareaId` + `paradaId`, así que se
  // puede recuperar sin que Lara lo busque a mano. Se PROPONE: ella confirma.
  const tareaOrigen = useLiveQuery(
    async () => (evento.tareaId ? db.tareas.get(evento.tareaId) : undefined),
    [evento.tareaId],
  )
  // La tarea es OPCIONAL: si Lara no la tiene espejada, el tiempo igual sale del
  // propio evento. Antes dependía de db.tareas y a ella no le aparecía nada.
  const tiempoPlanta = useMemo(() => {
    const p = tareaOrigen?.paradas?.find((x) => x.id === evento.paradaId)
    return tiempoRetrabajoDesdePlanta(evento, p, tareaOrigen?.finReal)
  }, [evento, tareaOrigen])

  const [tarifarioVigente, setTarifarioVigente] = useState<TarifarioCostosRetrabajoSGO>(TARIFARIO_COSTOS_BASE)
  const [tarifarioListo, setTarifarioListo] = useState(false)
  const [editandoTarifario, setEditandoTarifario] = useState(false)
  const [guardandoTarifario, setGuardandoTarifario] = useState(false)
  const [nuevoTarifario, setNuevoTarifario] = useState({
    vigenteDesde: new Date().toISOString().slice(0, 10),
    horaHombre: TARIFARIO_COSTOS_BASE.horaHombre,
    factorTiempoPerdido: TARIFARIO_COSTOS_BASE.factorTiempoPerdido,
    cobreKg: TARIFARIO_COSTOS_BASE.cobreKg,
    aluminioKg: TARIFARIO_COSTOS_BASE.aluminioKg,
  })
  const datos = evento.retrabajo!
  const costeo = datos.costeo
  const tarifarioAplicado = costeo?.tarifario ?? tarifarioVigente
  const moneda = (valor = 0) => valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })

  useEffect(() => {
    let activo = true
    void obtenerTarifarioCostosVigente().then((tarifario) => {
      if (!activo) return
      setTarifarioVigente(tarifario)
      setNuevoTarifario({
        vigenteDesde: new Date().toISOString().slice(0, 10),
        horaHombre: tarifario.horaHombre,
        factorTiempoPerdido: tarifario.factorTiempoPerdido,
        cobreKg: tarifario.cobreKg,
        aluminioKg: tarifario.aluminioKg,
      })
      setTarifarioListo(true)
    })
    return () => { activo = false }
  }, [])

  function actualizarCosteo(cambio: Partial<DatosCosteoRetrabajoSGO>) {
    const base = costeo ?? crearCosteoRetrabajo(tarifarioVigente)
    onChange(aplicarCosteoRetrabajo(evento, { ...base, ...cambio }))
  }

  function cambiarModalidad(valor: ModalidadCostoRetrabajoSGO) {
    if (valor === 'detallado') {
      onChange(aplicarCosteoRetrabajo(evento, costeo ?? crearCosteoRetrabajo(tarifarioVigente)))
      return
    }
    onModalidad(valor)
  }

  function cambiarMaterial(materialTipo: MaterialCostoRetrabajoSGO) {
    actualizarCosteo({
      materialTipo,
      materialKg: undefined,
      materialDescripcion: undefined,
      materialCostoManual: undefined,
    })
  }

  async function guardarTarifario() {
    if (!lorenzo || guardandoTarifario) return
    setGuardandoTarifario(true)
    try {
      const guardado = await guardarNuevaVersionTarifarioCostos(nuevoTarifario, usuario)
      const vigente = await obtenerTarifarioCostosVigente()
      setTarifarioVigente(vigente)
      setEditandoTarifario(false)
      window.alert(guardado.vigenteDesde > new Date().toISOString().slice(0, 10) ? 'Nuevo tarifario programado para la fecha indicada.' : 'Nuevo tarifario guardado. Se aplicará a los retrabajos que todavía no hayan iniciado su costeo.')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo guardar el tarifario.')
    } finally { setGuardandoTarifario(false) }
  }

  return <div className="sgo-costeo-retrabajo">
    <Campo label="Forma de registrar el costo *"><select className="input" value={modalidad} disabled={!tarifarioListo && !costeo} onChange={(e) => cambiarModalidad(e.target.value as ModalidadCostoRetrabajoSGO)}><option value="">{tarifarioListo ? 'Seleccionar' : 'Cargando tarifario…'}</option><option value="detallado">Calcular con tarifario</option><option value="total_estimado">Ingresar un total estimado</option><option value="sin_costo">Sin costo adicional</option></select></Campo>

    {modalidad === 'sin_costo' && <div className="card sgo-costeo-aviso">Se registrará un costo total de $0. El caso conservará la justificación “Sin costo adicional”.</div>}

    {modalidad === 'total_estimado' && <div className="sgo-retrabajo-form-grid"><Campo label="Costo total estimado (ARS) *"><input className="input" type="number" min="0" step="0.01" value={evento.costoEstimado ?? ''} onChange={(e) => onChange({ ...evento, costoEstimado: Math.max(0, Number(e.target.value) || 0), actualizadoEn: new Date().toISOString() })} /></Campo><Campo label="Referencia / explicación"><input className="input" value={datos.costosJustificacion ?? ''} onChange={(e) => onChange({ ...evento, retrabajo: { ...datos, costosJustificacion: e.target.value || undefined }, actualizadoEn: new Date().toISOString() })} /></Campo></div>}

    {modalidad === 'detallado' && <>
      <div className="card sgo-tarifario-resumen"><div><strong>Tarifario aplicado</strong><div className="meta">Vigente desde {tarifarioAplicado.vigenteDesde}. Esta copia quedará fija en el retrabajo.</div></div><div className="sgo-tarifario-valores"><span>Hora hombre <b>{moneda(tarifarioAplicado.horaHombre)}</b></span><span>Factor <b>×{tarifarioAplicado.factorTiempoPerdido}</b></span><span>Cobre <b>{moneda(tarifarioAplicado.cobreKg)}/kg</b></span><span>Aluminio <b>{moneda(tarifarioAplicado.aluminioKg)}/kg</b></span></div>{lorenzo && <button type="button" className="btn" onClick={() => setEditandoTarifario((valor) => !valor)}>Editar valores base</button>}</div>

      {lorenzo && editandoTarifario && <div className="card sgo-tarifario-editor"><div className="section-title">Nueva versión del tarifario</div><div className="meta">No modifica retrabajos que ya tengan un costeo iniciado.</div><div className="sgo-tarifario-form"><Campo label="Vigente desde"><input className="input" type="date" value={nuevoTarifario.vigenteDesde} onChange={(e) => setNuevoTarifario({ ...nuevoTarifario, vigenteDesde: e.target.value })} /></Campo><Campo label="Hora hombre"><input className="input" type="number" min="0.01" value={nuevoTarifario.horaHombre} onChange={(e) => setNuevoTarifario({ ...nuevoTarifario, horaHombre: Number(e.target.value) })} /></Campo><Campo label="Factor de tiempo perdido"><input className="input" type="number" min="1" step="0.1" value={nuevoTarifario.factorTiempoPerdido} onChange={(e) => setNuevoTarifario({ ...nuevoTarifario, factorTiempoPerdido: Number(e.target.value) })} /></Campo><Campo label="Cobre por kg"><input className="input" type="number" min="0.01" value={nuevoTarifario.cobreKg} onChange={(e) => setNuevoTarifario({ ...nuevoTarifario, cobreKg: Number(e.target.value) })} /></Campo><Campo label="Aluminio por kg"><input className="input" type="number" min="0.01" value={nuevoTarifario.aluminioKg} onChange={(e) => setNuevoTarifario({ ...nuevoTarifario, aluminioKg: Number(e.target.value) })} /></Campo></div><div className="row-actions"><button type="button" className="btn" onClick={() => setEditandoTarifario(false)}>Cancelar</button><button type="button" className="btn btn-primary" disabled={guardandoTarifario} onClick={() => void guardarTarifario()}>{guardandoTarifario ? 'Guardando…' : 'Guardar nueva versión'}</button></div></div>}

      {!costeo && costoNoCalidadTotal(evento.costoDetalle) > 0 && <div className="card sgo-costeo-aviso">Este registro contiene un costeo anterior de {moneda(costoNoCalidadTotal(evento.costoDetalle))}. Al completar la nueva calculadora se reemplazará por un cálculo trazable.</div>}

      <div className="card sgo-costeo-bloque"><div className="sgo-costeo-bloque-titulo"><div><strong>Mano de obra</strong><div className="meta">Tiempo de corrección × personas × hora hombre × factor productivo.</div></div><b>{moneda(evento.costoDetalle?.manoObra)}</b></div><div className="sgo-retrabajo-form-grid"><Campo label="Horas utilizadas *"><input className="input" type="number" min="0" step="0.25" value={costeo?.horasCorreccion ?? 0} onChange={(e) => actualizarCosteo({ horasCorreccion: Math.max(0, Number(e.target.value) || 0) })} /></Campo><Campo label="Personas involucradas *"><input className="input" type="number" min="1" step="1" value={costeo?.personasInvolucradas ?? 1} onChange={(e) => actualizarCosteo({ personasInvolucradas: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></Campo></div>{/* v1.93: el tiempo sale de la parada de calidad que originó el retrabajo.
    Se ofrece, no se impone: Lara ve de dónde viene y decide si lo usa. */}
      {tiempoPlanta && <div className="sgo-tiempo-planta">
        <div>
          <strong>Tiempo registrado en planta: {tiempoPlanta.horas} h</strong>
          <div className="meta">
            {tiempoPlanta.causa ? `${tiempoPlanta.causa} · ` : ''}{new Date(tiempoPlanta.inicio).toLocaleString()} · {tiempoPlanta.procedencia}
          </div>
        </div>
        <button
          className="btn"
          disabled={!costeo || costeo.horasCorreccion === tiempoPlanta.horas}
          onClick={() => actualizarCosteo({ horasCorreccion: tiempoPlanta.horas })}
        >
          {costeo?.horasCorreccion === tiempoPlanta.horas ? '✓ Aplicado' : '↧ Usar este tiempo'}
        </button>
      </div>}
      {costeo && <div className="meta">{costeo.horasCorreccion} h × {costeo.personasInvolucradas} persona(s) × {moneda(costeo.tarifario.horaHombre)} × {costeo.tarifario.factorTiempoPerdido}</div>}</div>

      <div className="card sgo-costeo-bloque"><div className="sgo-costeo-bloque-titulo"><div><strong>Material perdido</strong><div className="meta">Solo puede seleccionarse cobre o aluminio; nunca ambos en el mismo retrabajo.</div></div><b>{moneda(evento.costoDetalle?.material)}</b></div><div className="sgo-retrabajo-form-grid"><Campo label="Material"><select className="input" value={costeo?.materialTipo ?? 'ninguno'} onChange={(e) => cambiarMaterial(e.target.value as MaterialCostoRetrabajoSGO)}><option value="ninguno">Sin material perdido</option><option value="cobre">Cobre</option><option value="aluminio">Aluminio</option><option value="otro">Otro material</option></select></Campo>{costeo && ['cobre', 'aluminio'].includes(costeo.materialTipo) && <Campo label="Kilogramos perdidos *"><input className="input" type="number" min="0" step="0.01" value={costeo.materialKg ?? 0} onChange={(e) => actualizarCosteo({ materialKg: Math.max(0, Number(e.target.value) || 0) })} /></Campo>}{costeo?.materialTipo === 'otro' && <><Campo label="Descripción *"><input className="input" value={costeo.materialDescripcion ?? ''} onChange={(e) => actualizarCosteo({ materialDescripcion: e.target.value || undefined })} /></Campo><Campo label="Costo relevado *"><input className="input" type="number" min="0" step="0.01" value={costeo.materialCostoManual ?? 0} onChange={(e) => actualizarCosteo({ materialCostoManual: Math.max(0, Number(e.target.value) || 0) })} /></Campo></>}</div>{costeo && ['cobre', 'aluminio'].includes(costeo.materialTipo) && <div className="meta">Precio aplicado: {moneda(costeo.materialTipo === 'cobre' ? costeo.tarifario.cobreKg : costeo.tarifario.aluminioKg)} por kg.</div>}</div>

      <div className="card sgo-costeo-bloque"><div className="sgo-costeo-bloque-titulo"><div><strong>Máquina y repuestos</strong><div className="meta">Si hay rotura, Lara solicita el valor a Compras y deja la referencia.</div></div><b>{moneda(evento.costoDetalle?.maquina)}</b></div><div className="sgo-retrabajo-form-grid"><Campo label="Estado"><select className="input" value={costeo?.maquinaEstado ?? 'no_aplica'} onChange={(e) => actualizarCosteo({ maquinaEstado: e.target.value as DatosCosteoRetrabajoSGO['maquinaEstado'], estado: e.target.value === 'pendiente_cotizacion' ? 'estimado' : (costeo?.estado ?? 'estimado') })}><option value="no_aplica">No aplica</option><option value="pendiente_cotizacion">Pendiente de cotización</option><option value="estimado">Costo estimado</option><option value="confirmado">Costo confirmado</option></select></Campo>{costeo?.maquinaEstado !== 'no_aplica' && <><Campo label="Repuesto / reparación *"><input className="input" value={costeo?.maquinaDetalle ?? ''} onChange={(e) => actualizarCosteo({ maquinaDetalle: e.target.value || undefined })} /></Campo><Campo label="Referencia de Compras / SAP B1"><input className="input" value={costeo?.maquinaReferenciaCompras ?? ''} onChange={(e) => actualizarCosteo({ maquinaReferenciaCompras: e.target.value || undefined })} /></Campo><Campo label="Costo relevado"><input className="input" type="number" min="0" step="0.01" disabled={costeo?.maquinaEstado === 'pendiente_cotizacion'} value={costeo?.maquinaCosto ?? 0} onChange={(e) => actualizarCosteo({ maquinaCosto: Math.max(0, Number(e.target.value) || 0) })} /></Campo></>}</div>{costeo?.maquinaEstado === 'pendiente_cotizacion' && <div className="sgo-costeo-pendiente">Costo pendiente: solicitar cotización a Compras.</div>}</div>

      <div className="card sgo-costeo-bloque"><div className="sgo-costeo-bloque-titulo"><div><strong>Otros costos relevados</strong><div className="meta">Ingresar el importe y explicar brevemente su origen.</div></div></div><div className="sgo-costeo-directos">{([['ensayos', 'Ensayos'], ['logistica', 'Logística'], ['terceros', 'Terceros']] as const).map(([id, label]) => {
        const costoCampo = `${id}Costo` as 'ensayosCosto' | 'logisticaCosto' | 'tercerosCosto'
        const detalleCampo = `${id}Detalle` as 'ensayosDetalle' | 'logisticaDetalle' | 'tercerosDetalle'
        return <div className="sgo-costeo-directo" key={id}><Campo label={`${label} (ARS)`}><input className="input" type="number" min="0" step="0.01" value={costeo?.[costoCampo] ?? 0} onChange={(e) => actualizarCosteo({ [costoCampo]: Math.max(0, Number(e.target.value) || 0) })} /></Campo><Campo label="Detalle"><input className="input" value={costeo?.[detalleCampo] ?? ''} onChange={(e) => actualizarCosteo({ [detalleCampo]: e.target.value || undefined })} /></Campo></div>
      })}</div></div>

      <div className="sgo-retrabajo-form-grid"><Campo label="Estado del costeo"><select className="input" value={costeo?.estado ?? 'estimado'} onChange={(e) => { const confirmado = e.target.value === 'confirmado'; actualizarCosteo({ estado: e.target.value as DatosCosteoRetrabajoSGO['estado'], confirmadoEn: confirmado ? new Date().toISOString() : undefined, confirmadoPor: confirmado ? usuario : undefined }) }}><option value="estimado">Estimado</option><option value="confirmado" disabled={costeo?.maquinaEstado === 'pendiente_cotizacion' || (nivelInvestigacionRetrabajo(evento) === 'critica' && !lorenzo)}>Confirmado</option></select>{costeo?.confirmadoPor && <div className="meta">Confirmado por {costeo.confirmadoPor}.</div>}{nivelInvestigacionRetrabajo(evento) === 'critica' && !lorenzo && <div className="meta">El costeo crítico lo confirma Lorenzo.</div>}</Campo><Campo label="Referencia general SAP B1"><input className="input" value={datos.referenciaSAP ?? ''} onChange={(e) => onChange({ ...evento, retrabajo: { ...datos, referenciaSAP: e.target.value || undefined }, actualizadoEn: new Date().toISOString() })} /></Campo></div>

      <div className="card sgo-costeo-total"><div><span>Mano de obra</span><b>{moneda(evento.costoDetalle?.manoObra)}</b></div><div><span>Material</span><b>{moneda(evento.costoDetalle?.material)}</b></div><div><span>Máquina</span><b>{moneda(evento.costoDetalle?.maquina)}</b></div><div><span>Ensayos</span><b>{moneda(evento.costoDetalle?.ensayos)}</b></div><div><span>Logística</span><b>{moneda(evento.costoDetalle?.logistica)}</b></div><div><span>Terceros</span><b>{moneda(evento.costoDetalle?.terceros)}</b></div><div className="sgo-costeo-total-final"><span>Costo total estimado</span><strong>{moneda(evento.costoEstimado)}</strong></div></div>
    </>}
  </div>
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <div className="field"><label>{label}</label>{children}</div> }
