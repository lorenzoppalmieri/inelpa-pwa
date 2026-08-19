import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { validarCierreEvento } from '../../sgo/cierre'
import { conciliarInvestigacionesRetrabajo } from '../../sgo/integraciones'
import { datosMejoraDesdeEvento } from '../../sgo/mejoras'
import { usuarioEsLorenzo, usuarioPuedeInvestigarRetrabajo } from '../../sgo/permisos'
import {
  ESTADOS_INVESTIGACION_RETRABAJO, estadoInvestigacionRetrabajo, esEventoRetrabajo,
  semaforoSLAInvestigacion, type EstadoInvestigacionRetrabajo,
} from '../../sgo/retrabajos'
import {
  AREAS_SGO, areaSGOLabel, codigoEventoSGO, costoNoCalidadTotal, type AccionSGO, type AreaSGOId,
  type ClasificacionCausaRetrabajoSGO, type CostoNoCalidad, type DatosRetrabajoSGO, type EventoSGO,
} from '../../sgo/types'
import { guardarEventoSGO } from '../../sync/syncEngine'

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
  const accionesDe = (id: string) => acciones.filter((accion) => accion.eventoId === id)
  const activos = retrabajos.filter((evento) => evento.estado !== 'cerrado')
  const finalizados = retrabajos.filter((evento) => evento.estado === 'cerrado')
  const vencidos = activos.filter((evento) => semaforoSLAInvestigacion(evento, ahora).tono === 'rojo').length
  const tomados = retrabajos.filter((evento) => evento.retrabajo?.tomadoEn)
  const enTermino = tomados.length ? Math.round(tomados.filter((evento) => evento.retrabajo!.tomadoEn! <= evento.retrabajo!.fechaLimiteToma).length / tomados.length * 100) : 0
  const costoMes = retrabajos.filter((evento) => evento.detectadoEn.slice(0, 7) === mes).reduce((total, evento) => total + costoNoCalidadTotal(evento.costoDetalle), 0)
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
    {cerrados ? <Listado eventos={visibles} acciones={acciones} ahora={ahora} onOpen={setEditor} /> : <div className="sgo-retrabajos-kanban">{COLUMNAS.map((columna) => {
      const items = visibles.filter((evento) => columna.estados.includes(estadoInvestigacionRetrabajo(evento, accionesDe(evento.id))))
      return <section className="sgo-retrabajos-columna" key={columna.titulo}><div className="sgo-retrabajos-columna-titulo"><strong>{columna.titulo}</strong><span>{items.length}</span></div><div className="sgo-retrabajos-lista">{items.map((evento) => <RetrabajoCard key={evento.id} evento={evento} acciones={accionesDe(evento.id)} ahora={ahora} onOpen={() => setEditor(evento)} />)}{!items.length && <div className="empty">Sin casos</div>}</div></section>
    })}</div>}
    {editor && <EditorRetrabajo eventoInicial={editor} acciones={accionesDe(editor.id)} usuario={usuario} onClose={() => setEditor(undefined)} onOpenEvento={() => { setEditor(undefined); onOpenEvento(editor.id) }} />}
  </div>
}

function Kpi({ valor, label, tono }: { valor: string | number; label: string; tono: string }) { return <div className={`card sgo-retrabajo-kpi tono-${tono}`}><strong>{valor}</strong><span>{label}</span></div> }

function Listado({ eventos, acciones, ahora, onOpen }: { eventos: EventoSGO[]; acciones: AccionSGO[]; ahora: string; onOpen: (evento: EventoSGO) => void }) {
  if (!eventos.length) return <div className="empty">No hay investigaciones cerradas con estos filtros.</div>
  return <div className="sgo-retrabajos-lista">{eventos.map((evento) => <RetrabajoCard key={evento.id} evento={evento} acciones={acciones.filter((accion) => accion.eventoId === evento.id)} ahora={ahora} onOpen={() => onOpen(evento)} />)}</div>
}

function RetrabajoCard({ evento, acciones, ahora, onOpen }: { evento: EventoSGO; acciones: AccionSGO[]; ahora: string; onOpen: () => void }) {
  const etapa = estadoInvestigacionRetrabajo(evento, acciones)
  const sla = semaforoSLAInvestigacion(evento, ahora)
  return <button className={`card sgo-retrabajo-card sla-${sla.tono}`} onClick={onOpen}><div className="sgo-retrabajo-card-top"><span className={`estado-chip retrabajo-${etapa}`}>{estadoLabel(etapa)}</span><span className={`sgo-retrabajo-sla sla-${sla.tono}`}>{sla.label}</span></div><strong>{evento.titulo}</strong><div className="meta">{evento.codigo} · {ORIGEN_LABEL[evento.retrabajo!.origen]}</div><div className="meta">{areaSGOLabel(evento.areaOrigenId ?? evento.areaId)} · {evento.modelo || 'Sin modelo'}{evento.nroSerie ? ` · Serie ${evento.nroSerie}` : ''}</div><div className="sgo-retrabajo-causa">{evento.retrabajo?.causaRegistrada || 'Sin causa informada en origen'}</div><div className="sgo-retrabajo-card-resumen"><span>Detectado: <strong>{fechaHora(evento.detectadoEn)}</strong></span><span>{evento.retrabajo?.minutosRetrabajo !== undefined ? `${evento.retrabajo.minutosRetrabajo} min` : 'Tiempo en curso'}</span><span>${costoNoCalidadTotal(evento.costoDetalle).toLocaleString('es-AR')}</span></div></button>
}

function EditorRetrabajo({ eventoInicial, acciones, usuario, onClose, onOpenEvento }: { eventoInicial: EventoSGO; acciones: AccionSGO[]; usuario: string; onClose: () => void; onOpenEvento: () => void }) {
  const [evento, setEvento] = useState(eventoInicial)
  const [guardando, setGuardando] = useState(false)
  const datos = evento.retrabajo!
  const puede = usuarioPuedeInvestigarRetrabajo(usuario)
  const lorenzo = usuarioEsLorenzo(usuario)
  const editable = puede && Boolean(datos.tomadoEn) && evento.estado !== 'cerrado'
  const setCampo = <K extends keyof EventoSGO>(campo: K, valor: EventoSGO[K]) => setEvento({ ...evento, [campo]: valor, actualizadoEn: new Date().toISOString() })
  const setDato = <K extends keyof DatosRetrabajoSGO>(campo: K, valor: DatosRetrabajoSGO[K]) => setEvento({ ...evento, retrabajo: { ...datos, [campo]: valor }, actualizadoEn: new Date().toISOString() })
  const setCosto = (campo: keyof CostoNoCalidad, valor: number) => {
    const costoDetalle = { material: 0, manoObra: 0, maquina: 0, ensayos: 0, logistica: 0, terceros: 0, ...evento.costoDetalle, [campo]: Math.max(0, valor || 0) }
    setEvento({ ...evento, costoDetalle, costoEstimado: costoNoCalidadTotal(costoDetalle), actualizadoEn: new Date().toISOString() })
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
    const retrabajo = lorenzo && datos.resultadoVerificacion !== 'pendiente'
      ? { ...datos, verificadoEn: now, verificadoPor: usuario }
      : datos
    const actualizado: EventoSGO = { ...evento, retrabajo, estado, severidad: reincide ? 'alta' : evento.severidad, cerradoEn: undefined, cerradoPor: undefined, actualizadoEn: now }
    setGuardando(true)
    try { await guardarEventoSGO(actualizado); onClose() } finally { setGuardando(false) }
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
    if (!lorenzo) return
    const now = new Date().toISOString()
    const candidato: EventoSGO = {
      ...evento, retrabajo: { ...datos, verificadoEn: now, verificadoPor: usuario },
      estado: 'cerrado', cerradoEn: now, cerradoPor: usuario, actualizadoEn: now,
    }
    const errores = validarCierreEvento(candidato, acciones)
    if (errores.length) { window.alert(`No se puede cerrar la investigación:\n\n• ${errores.join('\n• ')}`); return }
    if (!window.confirm('La investigación quedará cerrada y pasará al historial. ¿Continuar?')) return
    setGuardando(true)
    try { await guardarEventoSGO(candidato); onClose() } finally { setGuardando(false) }
  }

  return <div className="modal-overlay"><div className="modal sgo-retrabajo-editor" role="dialog" aria-modal="true" aria-label={`Investigación ${evento.codigo}`}><div className="card-header"><div><div className="section-title">{evento.codigo} · Investigación de retrabajo</div><div className="meta">{ORIGEN_LABEL[datos.origen]} · detectado {fechaHora(evento.detectadoEn)}</div></div><button className="btn" onClick={onClose}>×</button></div>
    <div className="sgo-retrabajo-origen"><div><span>Área</span><strong>{areaSGOLabel(evento.areaOrigenId ?? evento.areaId)}</strong></div><div><span>Modelo / serie</span><strong>{evento.modelo || '—'}{evento.nroSerie ? ` · ${evento.nroSerie}` : ''}</strong></div><div><span>Orden</span><strong>{evento.ordenId || '—'}</strong></div><div><span>Tiempo</span><strong>{datos.minutosRetrabajo !== undefined ? `${datos.minutosRetrabajo} min` : 'En curso / sin dato'}</strong></div></div>
    <div className="card sgo-retrabajo-deteccion"><strong>{datos.causaRegistrada || evento.titulo}</strong><div>{datos.observacionOrigen || evento.descripcion}</div></div>
    {!datos.tomadoEn ? <div className="card sgo-retrabajo-tomar"><div><strong>Pendiente de Lara</strong><div className="meta">Debe tomarse antes del {fechaHora(datos.fechaLimiteToma)}.</div></div>{puede && <button className="btn btn-primary" disabled={guardando} onClick={() => void tomar()}>Tomar investigación</button>}</div>
      : <div className="meta sgo-retrabajo-tomado">Tomada por <strong>{datos.tomadoPor}</strong> el {fechaHora(datos.tomadoEn)}</div>}

    <fieldset disabled={!editable}>
      <div className="section-title">1. Contención y trazabilidad</div><div className="sgo-retrabajo-form-grid"><Campo label="Proceso donde se originó *"><input className="input" value={datos.procesoOrigen ?? ''} onChange={(e) => setDato('procesoOrigen', e.target.value || undefined)} /></Campo><Campo label="Proceso donde se detectó *"><input className="input" value={datos.procesoDeteccion ?? ''} onChange={(e) => setDato('procesoDeteccion', e.target.value || undefined)} /></Campo><Campo label="Cantidad afectada"><input className="input" type="number" min="1" value={evento.cantidadAfectada ?? 1} onChange={(e) => setCampo('cantidadAfectada', Math.max(1, Number(e.target.value) || 1))} /></Campo><Campo label="Disposición *"><select className="input" value={evento.disposicion ?? 'pendiente'} onChange={(e) => setCampo('disposicion', e.target.value as EventoSGO['disposicion'])}><option value="pendiente">Pendiente</option><option value="retrabajo">Retrabajo</option><option value="rechazo">Rechazo / scrap</option><option value="concesion">Concesión</option><option value="devolucion">Devolución</option><option value="no_aplica">No aplica</option></select></Campo></div><Campo label="Contención inmediata *"><textarea className="input" rows={2} value={evento.contencion ?? ''} onChange={(e) => setCampo('contencion', e.target.value || undefined)} /></Campo>

      <div className="section-title">2. Investigación de causa raíz</div><div className="sgo-retrabajo-form-grid"><Campo label="Método de análisis *"><select className="input" value={evento.metodoAnalisis ?? ''} onChange={(e) => setCampo('metodoAnalisis', (e.target.value || undefined) as EventoSGO['metodoAnalisis'])}><option value="">Seleccionar</option><option value="5_porques">5 porqués</option><option value="ishikawa">Ishikawa</option><option value="a3">A3</option><option value="8d">8D</option><option value="otro">Otro</option></select></Campo><Campo label="Clasificación de causa *"><select className="input" value={datos.clasificacionCausa ?? ''} onChange={(e) => setDato('clasificacionCausa', (e.target.value || undefined) as DatosRetrabajoSGO['clasificacionCausa'])}><option value="">Seleccionar</option>{CAUSAS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Campo></div><Campo label="Causa raíz comprobada *"><textarea className="input" rows={3} value={evento.causaRaiz ?? ''} onChange={(e) => setCampo('causaRaiz', e.target.value || undefined)} placeholder="No confundir la causa con el síntoma observado." /></Campo><Campo label="Factores contribuyentes *"><textarea className="input" rows={2} value={datos.factoresContribuyentes ?? ''} onChange={(e) => setDato('factoresContribuyentes', e.target.value || undefined)} /></Campo><label className="check-inline"><input type="checkbox" checked={Boolean(datos.reincidente)} onChange={(e) => setDato('reincidente', e.target.checked)} /> Es un defecto o causa reincidente</label>

      <div className="section-title">3. Costos del retrabajo</div><div className="sgo-retrabajo-costos">{([['manoObra', 'Mano de obra'], ['material', 'Material'], ['maquina', 'Máquina'], ['ensayos', 'Ensayos'], ['logistica', 'Logística'], ['terceros', 'Terceros']] as [keyof CostoNoCalidad, string][]).map(([id, label]) => <Campo label={label} key={id}><input className="input" type="number" min="0" value={evento.costoDetalle?.[id] ?? 0} onChange={(e) => setCosto(id, Number(e.target.value))} /></Campo>)}</div><div className="sgo-retrabajo-total">Costo total estimado: <strong>${costoNoCalidadTotal(evento.costoDetalle).toLocaleString('es-AR')}</strong></div><div className="sgo-retrabajo-form-grid"><Campo label="Referencia SAP B1"><input className="input" value={datos.referenciaSAP ?? ''} onChange={(e) => setDato('referenciaSAP', e.target.value || undefined)} /></Campo><label className="check-inline"><input type="checkbox" checked={Boolean(datos.costosRevisados)} onChange={(e) => setDato('costosRevisados', e.target.checked)} /> Costos revisados y confirmados</label></div>{datos.costosRevisados && costoNoCalidadTotal(evento.costoDetalle) === 0 && <Campo label="Justificación de costo cero *"><textarea className="input" rows={2} value={datos.costosJustificacion ?? ''} onChange={(e) => setDato('costosJustificacion', e.target.value || undefined)} /></Campo>}

      <div className="section-title">4. Evidencia y verificación</div><Campo label="Evidencias / referencias (una por línea)"><textarea className="input" rows={2} value={(evento.evidenciaUrls ?? []).join('\n')} onChange={(e) => setCampo('evidenciaUrls', e.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} /></Campo><div className="sgo-retrabajo-form-grid"><Campo label="Fecha real de verificación *"><input className="input" type="date" max={new Date().toISOString().slice(0, 10)} value={datos.fechaVerificacion ?? ''} onChange={(e) => setDato('fechaVerificacion', e.target.value || undefined)} /></Campo><Campo label="Resultado de la verificación"><select className="input" disabled={!lorenzo} value={datos.resultadoVerificacion ?? 'pendiente'} onChange={(e) => setDato('resultadoVerificacion', e.target.value as DatosRetrabajoSGO['resultadoVerificacion'])}><option value="pendiente">Pendiente</option><option value="eficaz">Acciones eficaces</option><option value="reincidencia">Reincidencia</option></select></Campo></div><Campo label="Observación de verificación *"><textarea className="input" rows={2} disabled={!lorenzo} value={datos.observacionVerificacion ?? ''} onChange={(e) => setDato('observacionVerificacion', e.target.value || undefined)} /></Campo>
    </fieldset>

    <div className="card sgo-retrabajo-acciones"><div><strong>{acciones.length}</strong><span>acciones</span></div><div><strong>{acciones.filter((accion) => accion.estado === 'verificada').length}</strong><span>verificadas</span></div><div><strong>{acciones.filter((accion) => !['verificada', 'cancelada'].includes(accion.estado) && accion.fechaCompromiso < new Date().toISOString().slice(0, 10)).length}</strong><span>vencidas</span></div><button className="btn" onClick={onOpenEvento}>Abrir expediente y acciones</button></div>
    <div className="card sgo-retrabajo-mejora"><div><strong>Oportunidad de mejora continua</strong><div className="meta">Se crea como expediente vinculado solo si la investigación identifica una mejora que merece seguimiento propio.</div></div>{datos.mejoraEventoId ? <span className="estado-chip mejora-detectada">Propuesta creada</span> : editable ? <button className="btn" disabled={guardando} onClick={() => void proponerMejora()}>Proponer mejora</button> : <span className="meta">Sin propuesta</span>}</div>
    <div className="row-actions sgo-retrabajo-editor-pie"><button className="btn" onClick={onClose}>Cerrar ventana</button>{editable && <button className="btn btn-primary" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar investigación'}</button>}{lorenzo && evento.estado !== 'cerrado' && <button className="btn btn-verde" disabled={guardando} onClick={() => void cerrar()}>Verificar y cerrar</button>}</div>
  </div></div>
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <div className="field"><label>{label}</label>{children}</div> }
