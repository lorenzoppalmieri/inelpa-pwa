import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { fechaLocalISO } from '../../lib/time'
import { guardarControlProgramadoSGO, guardarEjecucionControlSGO, guardarEventoSGO } from '../../sync/syncEngine'
import { sumarFrecuenciaControl, tipoEventoDesdeControl, type ControlProgramadoSGO, type EjecucionControlSGO } from '../../sgo/controles'
import {
  PLANTILLAS_AUDITORIA_LOGISTICA, TARIMAS_INELPA, auditoriaCompleta, calcularCumplimientoAuditoria, calcularCubicaje,
  checklistDesdePlantilla, evaluarDistribucion, puntosNoConformes,
  type DatosAuditoriaLogistica, type EspacioCarga, type EstadoPuntoAuditoria, type ItemCarga, type PiezaUbicada,
  type TarimaInelpa, type TarimaInelpaId, type TipoAuditoriaLogistica,
} from '../../sgo/logistica'
import { codigoEventoSGO, type EventoSGO, type PilarSGO } from '../../sgo/types'

const COLORES_CARGA = ['#2563eb', '#f59e0b', '#16a34a', '#7c3aed', '#dc2626', '#0891b2', '#db2777']

function fechaHoraLabel(iso: string) {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

function controlId(tipo: TipoAuditoriaLogistica) {
  return `sgo-logistica-${tipo}`
}

function plantillaLabel(tipo?: TipoAuditoriaLogistica) {
  return PLANTILLAS_AUDITORIA_LOGISTICA.find((p) => p.id === tipo)?.label ?? 'Auditoría logística'
}

export default function AuditoriaLogisticaView({ usuario, onOpenEvento }: { usuario: string; onOpenEvento: (id: string) => void }) {
  const controles = useLiveQuery(() => db.controlesProgramadosSGO.where('tipo').equals('auditoria_logistica').toArray(), []) ?? []
  const ejecuciones = useLiveQuery(() => db.ejecucionesControlesSGO.toArray(), []) ?? []
  const auditorias = useMemo(() => ejecuciones.filter((e) => e.auditoriaLogistica), [ejecuciones])
  const [seccion, setSeccion] = useState<'auditorias' | 'cubicaje'>('auditorias')
  const [nueva, setNueva] = useState<TipoAuditoriaLogistica>()
  const [filtroTipo, setFiltroTipo] = useState<TipoAuditoriaLogistica | ''>('')
  const [filtroResultado, setFiltroResultado] = useState<'todos' | 'conforme' | 'con_desvios'>('todos')

  const mes = fechaLocalISO().slice(0, 7)
  const delMes = auditorias.filter((e) => e.ejecutadoEn.slice(0, 7) === mes)
  const promedio = delMes.length ? Math.round(delMes.reduce((t, e) => t + (e.auditoriaLogistica?.porcentajeCumplimiento ?? 0), 0) / delMes.length) : 0
  const noConformidades = delMes.reduce((t, e) => t + puntosNoConformes(e.auditoriaLogistica?.checklist ?? []).length, 0)
  const cobertura = PLANTILLAS_AUDITORIA_LOGISTICA.filter((p) => delMes.some((e) => e.auditoriaLogistica?.tipo === p.id)).length
  const filtradas = auditorias.filter((e) => {
    const datos = e.auditoriaLogistica!
    const cumpleTipo = !filtroTipo || datos.tipo === filtroTipo
    const tieneDesvios = puntosNoConformes(datos.checklist).length > 0
    const cumpleResultado = filtroResultado === 'todos' || (filtroResultado === 'con_desvios' ? tieneDesvios : !tieneDesvios)
    return cumpleTipo && cumpleResultado
  }).sort((a, b) => b.ejecutadoEn.localeCompare(a.ejecutadoEn))

  return <div>
    <div className="card sgo-log-cabecera">
      <div>
        <div className="section-title" style={{ margin: 0 }}>🚚 Auditoría de Logística</div>
        <div className="meta">Responsable operativo: Nicolás · recepción, stock, despacho, embalaje y carga.</div>
      </div>
      <div className="tabs" role="tablist" aria-label="Herramientas de auditoría logística">
        <button className={`tab ${seccion === 'auditorias' ? 'active' : ''}`} onClick={() => setSeccion('auditorias')}>Auditorías</button>
        <button className={`tab ${seccion === 'cubicaje' ? 'active' : ''}`} onClick={() => setSeccion('cubicaje')}>Cubicaje y carga</button>
      </div>
    </div>

    {seccion === 'cubicaje' ? <CalculadoraCubicaje /> : <>
      <div className="sgo-log-kpis">
        <Kpi valor={delMes.length} label="Auditorías del mes" tono="azul" />
        <Kpi valor={`${promedio}%`} label="Cumplimiento promedio" tono={promedio >= 90 ? 'verde' : promedio >= 75 ? 'amarillo' : 'rojo'} />
        <Kpi valor={noConformidades} label="Puntos no conformes" tono={noConformidades ? 'rojo' : 'verde'} />
        <Kpi valor={`${cobertura}/4`} label="Frentes cubiertos" tono={cobertura === 4 ? 'verde' : 'amarillo'} />
      </div>

      <div className="section-title">Plan de auditoría de Nicolás</div>
      <div className="sgo-log-plantillas">
        {PLANTILLAS_AUDITORIA_LOGISTICA.map((p) => {
          const historial = auditorias.filter((e) => e.auditoriaLogistica?.tipo === p.id).sort((a, b) => b.ejecutadoEn.localeCompare(a.ejecutadoEn))
          const ultima = historial[0]
          const programado = controles.find((c) => c.id === controlId(p.id))
          return <div className="card sgo-log-plantilla" key={p.id}>
            <div className="sgo-log-icono">{p.icono}</div>
            <div>
              <strong>{p.label}</strong>
              <p>{p.descripcion}</p>
              <div className="meta">Frecuencia sugerida: {p.frecuencia === 'semanal' ? 'semanal' : 'quincenal'} · {p.puntos.length} puntos</div>
              <div className="meta">Última: {ultima ? `${fechaHoraLabel(ultima.ejecutadoEn)} · ${ultima.auditoriaLogistica?.porcentajeCumplimiento}%` : 'sin registros'}{programado ? ` · próxima ${programado.proximaFecha}` : ''}</div>
            </div>
            <button className="btn btn-primary" onClick={() => setNueva(p.id)}>Auditar</button>
          </div>
        })}
      </div>

      <div className="card sgo-log-filtros">
        <div className="field"><label>Tipo</label><select className="input" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as TipoAuditoriaLogistica | '')}><option value="">Todos</option>{PLANTILLAS_AUDITORIA_LOGISTICA.map((p) => <option value={p.id} key={p.id}>{p.label}</option>)}</select></div>
        <div className="field"><label>Resultado</label><select className="input" value={filtroResultado} onChange={(e) => setFiltroResultado(e.target.value as typeof filtroResultado)}><option value="todos">Todos</option><option value="conforme">Sin desvíos</option><option value="con_desvios">Con desvíos</option></select></div>
      </div>

      <div className="section-title">Historial ({filtradas.length})</div>
      {!filtradas.length ? <div className="empty">Todavía no hay auditorías logísticas registradas.</div> : <div className="sgo-log-historial">
        {filtradas.map((e) => {
          const d = e.auditoriaLogistica!
          const nc = puntosNoConformes(d.checklist).length
          return <div className={`card sgo-log-registro ${nc ? 'con-desvio' : 'conforme'}`} key={e.id}>
            <div>
              <div className="sgo-log-registro-titulo"><strong>{plantillaLabel(d.tipo)}</strong><span className={`estado-chip ${nc ? 'sgo-estado-abierto' : 'sgo-estado-cerrado'}`}>{d.porcentajeCumplimiento}%</span></div>
              <div className="meta">{fechaHoraLabel(e.ejecutadoEn)} · {d.auditor} · {d.ubicacion || 'sin ubicación'}{d.patente ? ` · ${d.patente}` : ''}</div>
              <div>{nc ? `${nc} punto(s) no conforme(s)` : 'Sin desvíos'}{e.detalle ? ` · ${e.detalle}` : ''}</div>
            </div>
            {e.eventoId && <button className="btn" onClick={() => onOpenEvento(e.eventoId!)}>Abrir expediente</button>}
          </div>
        })}
      </div>}
    </>}

    {nueva && <NuevaAuditoria tipo={nueva} usuario={usuario} controles={controles} onClose={() => setNueva(undefined)} onOpenEvento={onOpenEvento} />}
  </div>
}

function Kpi({ valor, label, tono }: { valor: number | string; label: string; tono: string }) {
  return <div className={`card sgo-log-kpi tono-${tono}`}><strong>{valor}</strong><span>{label}</span></div>
}

function NuevaAuditoria({ tipo, usuario, controles, onClose, onOpenEvento }: { tipo: TipoAuditoriaLogistica; usuario: string; controles: ControlProgramadoSGO[]; onClose: () => void; onOpenEvento: (id: string) => void }) {
  const plantilla = PLANTILLAS_AUDITORIA_LOGISTICA.find((p) => p.id === tipo)!
  const [auditor, setAuditor] = useState(usuario.toLowerCase() === 'nicolas' ? 'Nicolás' : usuario)
  const [ubicacion, setUbicacion] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [documentoSap, setDocumentoSap] = useState('')
  const [remito, setRemito] = useState('')
  const [transportista, setTransportista] = useState('')
  const [patente, setPatente] = useState('')
  const [chofer, setChofer] = useState('')
  const [ordenes, setOrdenes] = useState('')
  const [series, setSeries] = useState('')
  const [puntos, setPuntos] = useState(() => checklistDesdePlantilla(tipo))
  const [observaciones, setObservaciones] = useState('')
  const [accionInmediata, setAccionInmediata] = useState('')
  const [responsableSector, setResponsableSector] = useState('')
  const [evidencia, setEvidencia] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cumplimiento = calcularCumplimientoAuditoria(puntos)
  const desviados = puntosNoConformes(puntos)

  function actualizarPunto(id: string, estado: EstadoPuntoAuditoria, observacion?: string) {
    setPuntos((actuales) => actuales.map((p) => p.id === id ? { ...p, estado, observacion: observacion ?? p.observacion } : p))
  }

  async function guardar() {
    if (!auditor.trim() || !ubicacion.trim()) { window.alert('Completá auditor y ubicación.'); return }
    if (!auditoriaCompleta(puntos)) { window.alert('Respondé todos los puntos del checklist.'); return }
    if (desviados.some((p) => !p.observacion?.trim())) { window.alert('Cada punto no conforme debe explicar el desvío observado.'); return }
    if (desviados.length && (!accionInmediata.trim() || !responsableSector.trim() || !evidencia.trim())) {
      window.alert('Una auditoría con desvíos requiere acción inmediata, responsable y evidencia o referencia.')
      return
    }
    setGuardando(true)
    const now = new Date().toISOString()
    const idControl = controlId(tipo)
    const existente = controles.find((c) => c.id === idControl)
    const control: ControlProgramadoSGO = existente ?? {
      id: idControl, titulo: `Auditoría logística · ${plantilla.label}`, tipo: 'auditoria_logistica',
      areaId: 'logistica_operativa', pilar: plantilla.pilar, norma: 'sgo_integral',
      requisito: 'Control operativo de Logística', instrucciones: plantilla.descripcion,
      responsable: 'Nicolás', frecuencia: plantilla.frecuencia, proximaFecha: fechaLocalISO(), toleranciaDias: 1, activo: true,
      creadoEn: now, creadoPor: usuario, actualizadoEn: now, actualizadoPor: usuario,
    }
    await guardarControlProgramadoSGO(control)

    let eventoId: string | undefined
    if (desviados.length) {
      eventoId = crypto.randomUUID()
      const pilar = desviados[0].pilar as PilarSGO
      const evento: EventoSGO = {
        id: eventoId, codigo: codigoEventoSGO(new Date(), eventoId), tipo: tipoEventoDesdeControl(pilar), pilar,
        titulo: `Auditoría logística con desvíos · ${plantilla.label}`,
        descripcion: [
          `${desviados.length} punto(s) no conforme(s) detectado(s) por ${auditor.trim()} en ${ubicacion.trim()}.`,
          ...desviados.map((p) => `• ${p.label}: ${p.observacion}`),
          `Acción inmediata: ${accionInmediata.trim()}`,
          [documentoSap && `SAP: ${documentoSap}`, remito && `Remito: ${remito}`, series && `Series: ${series}`, patente && `Patente: ${patente}`].filter(Boolean).join(' · '),
        ].filter(Boolean).join('\n'),
        severidad: desviados.some((p) => p.pilar === 'seguridad') ? 'alta' : 'media', estado: 'contenido',
        areaId: 'logistica_operativa', areaOrigenId: pilar === 'calidad' ? 'logistica_operativa' : undefined,
        responsable: responsableSector.trim(), contencion: accionInmediata.trim(), controlId: idControl,
        evidenciaUrls: [evidencia.trim()], detectadoEn: now, detectadoPor: usuario, creadoEn: now, actualizadoEn: now,
      }
      await guardarEventoSGO(evento)
    }

    const datos: DatosAuditoriaLogistica = {
      tipo, auditor: auditor.trim(), fecha: now, ubicacion: ubicacion.trim(), proveedor: proveedor.trim() || undefined,
      documentoSap: documentoSap.trim() || undefined, remito: remito.trim() || undefined,
      transportista: transportista.trim() || undefined, patente: patente.trim() || undefined, chofer: chofer.trim() || undefined,
      ordenes: ordenes.trim() || undefined, series: series.trim() || undefined, checklist: puntos,
      observaciones: observaciones.trim() || undefined, accionInmediata: accionInmediata.trim() || undefined,
      responsableSector: responsableSector.trim() || undefined, porcentajeCumplimiento: cumplimiento,
    }
    const ejecucion: EjecucionControlSGO = {
      id: crypto.randomUUID(), controlId: idControl, fechaProgramada: control.proximaFecha, ejecutadoEn: now, ejecutadoPor: usuario,
      resultado: desviados.length ? 'no_conforme' : 'conforme', detalle: observaciones.trim() || `${puntos.length} puntos evaluados`,
      evidencia: evidencia.trim() || undefined, nroSerie: series.trim() || undefined, eventoId, auditoriaLogistica: datos,
    }
    await guardarEjecucionControlSGO(ejecucion)
    const siguiente = sumarFrecuenciaControl(fechaLocalISO(), control.frecuencia)
    await guardarControlProgramadoSGO({ ...control, proximaFecha: siguiente ?? control.proximaFecha, actualizadoEn: now, actualizadoPor: usuario })
    setGuardando(false)
    onClose()
    if (eventoId && window.confirm('Se generó un expediente SGO por los desvíos. ¿Querés abrirlo?')) onOpenEvento(eventoId)
  }

  const esTransporte = tipo === 'despacho' || tipo === 'embalaje_carga'
  return <Modal titulo={`${plantilla.icono} ${plantilla.label}`} onClose={onClose} ancho={980}>
    <div className="sgo-log-auditoria-meta">
      <div className="field"><label>Auditor *</label><input className="input" value={auditor} onChange={(e) => setAuditor(e.target.value)} /></div>
      <div className="field"><label>Ubicación / depósito *</label><input className="input" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Recepción, depósito Cerdán, playa…" /></div>
      {tipo === 'recepcion' && <div className="field"><label>Proveedor</label><input className="input" value={proveedor} onChange={(e) => setProveedor(e.target.value)} /></div>}
      <div className="field"><label>Documento SAP</label><input className="input" value={documentoSap} onChange={(e) => setDocumentoSap(e.target.value)} /></div>
      <div className="field"><label>Remito</label><input className="input" value={remito} onChange={(e) => setRemito(e.target.value)} /></div>
      {(tipo === 'stock' || tipo === 'recepcion') && <div className="field"><label>Materiales / muestra</label><input className="input" value={ordenes} onChange={(e) => setOrdenes(e.target.value)} placeholder="Códigos, ubicaciones o lote" /></div>}
      {esTransporte && <>
        <div className="field"><label>Órdenes / pedidos</label><input className="input" value={ordenes} onChange={(e) => setOrdenes(e.target.value)} /></div>
        <div className="field"><label>Series</label><input className="input" value={series} onChange={(e) => setSeries(e.target.value)} /></div>
        <div className="field"><label>Transportista</label><input className="input" value={transportista} onChange={(e) => setTransportista(e.target.value)} /></div>
        <div className="field"><label>Patente</label><input className="input" value={patente} onChange={(e) => setPatente(e.target.value.toUpperCase())} /></div>
        <div className="field"><label>Chofer</label><input className="input" value={chofer} onChange={(e) => setChofer(e.target.value)} /></div>
      </>}
    </div>

    <div className="sgo-log-score"><div><strong>{cumplimiento}%</strong><span>Cumplimiento actual</span></div><div><strong>{desviados.length}</strong><span>No conformes</span></div><div><strong>{puntos.filter((p) => p.estado === 'pendiente').length}</strong><span>Pendientes</span></div></div>
    <div className="sgo-log-checklist">
      {puntos.map((p, index) => <div className={`sgo-log-punto punto-${p.estado}`} key={p.id}>
        <div className="sgo-log-punto-texto"><span>{index + 1}</span><div><strong>{p.label}</strong><div className="meta">Pilar: {p.pilar}</div></div></div>
        <div className="sgo-log-punto-estados">
          {([['conforme', 'Conforme'], ['no_conforme', 'No conforme'], ['no_aplica', 'N/A']] as [EstadoPuntoAuditoria, string][]).map(([estado, label]) => <button key={estado} className={`btn ${p.estado === estado ? 'activo' : ''}`} onClick={() => actualizarPunto(p.id, estado)}>{label}</button>)}
        </div>
        {p.estado === 'no_conforme' && <input className="input" value={p.observacion ?? ''} onChange={(e) => actualizarPunto(p.id, p.estado, e.target.value)} placeholder="Describir evidencia objetiva del desvío *" />}
      </div>)}
    </div>
    <div className="field"><label>Observaciones generales</label><textarea className="input" rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} /></div>
    {desviados.length > 0 && <div className="sgo-log-desvio-box">
      <div className="field"><label>Acción inmediata / contención *</label><textarea className="input" rows={2} value={accionInmediata} onChange={(e) => setAccionInmediata(e.target.value)} /></div>
      <div className="field"><label>Responsable del sector *</label><input className="input" value={responsableSector} onChange={(e) => setResponsableSector(e.target.value)} /></div>
      <div className="field"><label>Evidencia / referencia *</label><input className="input" value={evidencia} onChange={(e) => setEvidencia(e.target.value)} placeholder="Fotos, remito, documento SAP, acta…" /></div>
      <div className="meta">Al guardar se creará automáticamente un expediente SGO.</div>
    </div>}
    {!desviados.length && <div className="field"><label>Evidencia / referencia</label><input className="input" value={evidencia} onChange={(e) => setEvidencia(e.target.value)} placeholder="Fotos, remito, documento SAP, acta…" /></div>}
    <div className="row-actions" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Registrando…' : 'Registrar auditoría'}</button></div>
  </Modal>
}

function CalculadoraCubicaje() {
  const [espacio, setEspacio] = useState<EspacioCarga>({ nombre: 'Semirremolque orientativo', largoM: 13.6, anchoM: 2.45, altoM: 2.7, cargaMaxKg: 24000 })
  const tarimaInicial = TARIMAS_INELPA[0]
  const [items, setItems] = useState<ItemCarga[]>([
    { id: crypto.randomUUID(), descripcion: 'Transformador TTD16 a TTD40', tarimaId: tarimaInicial.id, cantidad: 1, largoM: tarimaInicial.largoM, anchoM: tarimaInicial.anchoM, altoM: 0, pesoKg: 0, rotatable: true, apilable: false, color: COLORES_CARGA[0] },
  ])
  const resultado = useMemo(() => calcularCubicaje(items, espacio), [items, espacio])
  const [ubicaciones, setUbicaciones] = useState<PiezaUbicada[]>([])
  const [seleccionadaId, setSeleccionadaId] = useState<string>()
  const planoRef = useRef<HTMLDivElement>(null)
  const arrastreRef = useRef<{ id: string; pointerId: number; offsetXM: number; offsetYM: number } | undefined>(undefined)
  const evaluacion = useMemo(() => evaluarDistribucion(ubicaciones, espacio), [ubicaciones, espacio])
  const conflictivas = useMemo(() => new Set([...evaluacion.fueraDeLimites, ...evaluacion.superpuestos]), [evaluacion])
  const seleccionada = ubicaciones.find((p) => p.id === seleccionadaId)

  useEffect(() => {
    setUbicaciones([...resultado.ubicaciones, ...resultado.pendientesUbicacion])
    setSeleccionadaId(undefined)
  }, [resultado])

  function setItem(id: string, campo: keyof ItemCarga, valor: string | number | boolean) {
    setItems((actuales) => actuales.map((i) => {
      if (i.id !== id) return i
      const actualizado = { ...i, [campo]: valor }
      if (campo === 'largoM' || campo === 'anchoM') actualizado.tarimaId = 'personalizada'
      return actualizado
    }))
  }
  function agregar() {
    setItems((actuales) => [...actuales, { id: crypto.randomUUID(), descripcion: 'Carga personalizada', tarimaId: 'personalizada', cantidad: 1, largoM: 1, anchoM: 1, altoM: 0, pesoKg: 0, rotatable: true, apilable: false, color: COLORES_CARGA[actuales.length % COLORES_CARGA.length] }])
  }
  function agregarTarima(tarima: TarimaInelpa) {
    setItems((actuales) => [...actuales, {
      id: crypto.randomUUID(), descripcion: 'Transformador ' + tarima.rangoTransformador, tarimaId: tarima.id,
      cantidad: 1, largoM: tarima.largoM, anchoM: tarima.anchoM, altoM: 0, pesoKg: 0,
      rotatable: true, apilable: false, color: COLORES_CARGA[actuales.length % COLORES_CARGA.length],
    }])
  }
  function aplicarTarima(id: string, tarimaId: TarimaInelpaId | 'personalizada') {
    const tarima = TARIMAS_INELPA.find((t) => t.id === tarimaId)
    setItems((actuales) => actuales.map((i) => i.id !== id ? i : tarima
      ? { ...i, tarimaId: tarima.id, largoM: tarima.largoM, anchoM: tarima.anchoM }
      : { ...i, tarimaId: 'personalizada' }))
  }
  function restablecerDistribucion() {
    setUbicaciones([...resultado.ubicaciones, ...resultado.pendientesUbicacion])
    setSeleccionadaId(undefined)
  }
  function iniciarArrastre(e: ReactPointerEvent<HTMLDivElement>, pieza: PiezaUbicada) {
    const rect = planoRef.current?.getBoundingClientRect()
    if (!rect || !espacio.largoM || !espacio.anchoM) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const puntoXM = ((e.clientX - rect.left) / rect.width) * espacio.largoM
    const puntoYM = ((e.clientY - rect.top) / rect.height) * espacio.anchoM
    arrastreRef.current = { id: pieza.id, pointerId: e.pointerId, offsetXM: puntoXM - pieza.xM, offsetYM: puntoYM - pieza.yM }
    setSeleccionadaId(pieza.id)
  }
  function arrastrar(e: ReactPointerEvent<HTMLDivElement>) {
    const arrastre = arrastreRef.current
    const rect = planoRef.current?.getBoundingClientRect()
    if (!arrastre || arrastre.pointerId !== e.pointerId || !rect || !espacio.largoM || !espacio.anchoM) return
    setUbicaciones((actuales) => actuales.map((p) => {
      if (p.id !== arrastre.id) return p
      const puntoXM = ((e.clientX - rect.left) / rect.width) * espacio.largoM
      const puntoYM = ((e.clientY - rect.top) / rect.height) * espacio.anchoM
      const maxX = Math.max(0, espacio.largoM - p.largoM)
      const maxY = Math.max(0, espacio.anchoM - p.anchoM)
      const xM = Math.round(Math.min(maxX, Math.max(0, puntoXM - arrastre.offsetXM)) * 100) / 100
      const yM = Math.round(Math.min(maxY, Math.max(0, puntoYM - arrastre.offsetYM)) * 100) / 100
      return { ...p, xM, yM }
    }))
  }
  function terminarArrastre(e: ReactPointerEvent<HTMLDivElement>) {
    if (arrastreRef.current?.pointerId === e.pointerId) arrastreRef.current = undefined
  }
  function moverSeleccionada(dx: number, dy: number) {
    if (!seleccionadaId) return
    setUbicaciones((actuales) => actuales.map((p) => {
      if (p.id !== seleccionadaId) return p
      return {
        ...p,
        xM: Math.round(Math.min(Math.max(0, espacio.largoM - p.largoM), Math.max(0, p.xM + dx)) * 100) / 100,
        yM: Math.round(Math.min(Math.max(0, espacio.anchoM - p.anchoM), Math.max(0, p.yM + dy)) * 100) / 100,
      }
    }))
  }
  function rotarSeleccionada() {
    if (!seleccionadaId) return
    setUbicaciones((actuales) => actuales.map((p) => {
      if (p.id !== seleccionadaId) return p
      const largoM = p.anchoM
      const anchoM = p.largoM
      const centroX = p.xM + p.largoM / 2
      const centroY = p.yM + p.anchoM / 2
      return {
        ...p, largoM, anchoM,
        xM: Math.round(Math.min(Math.max(0, espacio.largoM - largoM), Math.max(0, centroX - largoM / 2)) * 100) / 100,
        yM: Math.round(Math.min(Math.max(0, espacio.anchoM - anchoM), Math.max(0, centroY - anchoM / 2)) * 100) / 100,
      }
    }))
  }
  function descargarCSV() {
    const lineas = [
      ['Descripción', 'Tarima', 'Cantidad', 'Largo m', 'Ancho m', 'Alto m', 'Peso unitario kg', 'Rotable', 'Apilable'],
      ...items.map((i) => [i.descripcion, i.tarimaId ?? 'personalizada', i.cantidad, i.largoM, i.anchoM, i.altoM, i.pesoKg, i.rotatable ? 'Sí' : 'No', i.apilable ? 'Sí' : 'No']),
      [],
      ['Vehículo', espacio.nombre], ['Dimensiones', `${espacio.largoM} x ${espacio.anchoM} x ${espacio.altoM} m`],
      ['Volumen utilizado', `${resultado.usoVolumenPct}%`], ['Peso utilizado', `${resultado.usoPesoPct}%`], ['Unidades no ubicadas', resultado.unidadesNoUbicadas],
      [],
      ['Posición', 'Descripción', 'X desde frente (m)', 'Y desde lateral (m)', 'Largo ocupado (m)', 'Ancho ocupado (m)', 'Unidades apiladas'],
      ...ubicaciones.map((p, index) => [index + 1, p.descripcion, p.xM, p.yM, p.largoM, p.anchoM, p.unidades]),
      [],
      ['Distribución válida', evaluacion.valida ? 'Sí' : 'No'],
    ]
    const csv = lineas.map((fila) => fila.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `plan-carga-${fechaLocalISO()}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <div>
    <div className="card sgo-carga-aviso"><strong>Calculadora orientativa</strong><span>Sirve para anticipar volumen, peso y ocupación de piso. No certifica estabilidad, amarre, centro de gravedad ni cargas por eje.</span></div>
    <div className="card-header" style={{ marginBottom: 8 }}><div><div className="section-title" style={{ margin: 0 }}>Tarimas normalizadas INELPA</div><div className="meta">Huella exterior según PLANOS DE TARIMAS · Diseño y Desarrollo · 29/01/2026</div></div></div>
    <div className="sgo-tarimas-biblioteca">
      {TARIMAS_INELPA.map((tarima) => <div className="card sgo-tarima-card" key={tarima.id}>
        <div><strong>{tarima.nombre}</strong><span>{tarima.rangoTransformador}</span></div>
        <b>{tarima.largoM.toFixed(2)} × {tarima.anchoM.toFixed(2)} m</b>
        <span className="meta">Plano · hoja {tarima.hojaPlano}</span>
        <button className="btn" onClick={() => agregarTarima(tarima)}>+ Agregar</button>
      </div>)}
    </div>
    <div className="section-title">Espacio de carga</div>
    <div className="meta" style={{ marginBottom: 7 }}>Ingresá las medidas interiores reales y la capacidad del camión contratado. La distribución se recalcula al modificarlas.</div>
    <div className="card sgo-carga-espacio">
      <div className="field"><label>Nombre / unidad</label><input className="input" value={espacio.nombre} onChange={(e) => setEspacio({ ...espacio, nombre: e.target.value })} /></div>
      {([['largoM', 'Largo interior (m)'], ['anchoM', 'Ancho interior (m)'], ['altoM', 'Alto útil (m)'], ['cargaMaxKg', 'Carga máxima (kg)']] as [keyof EspacioCarga, string][]).map(([campo, label]) => <div className="field" key={campo}><label>{label}</label><input className="input" type="number" min="0" step="0.01" value={espacio[campo]} onChange={(e) => setEspacio({ ...espacio, [campo]: Math.max(0, Number(e.target.value) || 0) })} /></div>)}
    </div>

    <div className="card-header" style={{ margin: '18px 0 8px' }}><div className="section-title" style={{ margin: 0 }}>Bultos y equipos</div><button className="btn" onClick={agregar}>+ Agregar bulto</button></div>
    <div className="sgo-carga-items">
      {items.map((i, index) => <div className="card sgo-carga-item" key={i.id} style={{ borderLeftColor: i.color }}>
        <div className="field sgo-carga-desc"><label>Descripción</label><input className="input" value={i.descripcion} onChange={(e) => setItem(i.id, 'descripcion', e.target.value)} /></div>
        <div className="field sgo-carga-tarima-select"><label>Tarima</label><select className="input" value={i.tarimaId ?? 'personalizada'} onChange={(e) => aplicarTarima(i.id, e.target.value as TarimaInelpaId | 'personalizada')}>
          {TARIMAS_INELPA.map((tarima) => <option value={tarima.id} key={tarima.id}>{tarima.id} · {tarima.rangoTransformador}</option>)}
          <option value="personalizada">Medida personalizada</option>
        </select></div>
        {([['cantidad', 'Cantidad', 1], ['largoM', 'Largo tarima m', .01], ['anchoM', 'Ancho tarima m', .01], ['altoM', 'Altura total m', .01], ['pesoKg', 'kg/unidad', .1]] as [keyof ItemCarga, string, number][]).map(([campo, label, step]) => <div className="field" key={campo}><label>{label}</label><input className="input" type="number" min={campo === 'cantidad' ? 1 : 0} step={step} value={i[campo] as number} onChange={(e) => setItem(i.id, campo, campo === 'cantidad' ? Math.max(1, Number(e.target.value) || 1) : Math.max(0, Number(e.target.value) || 0))} /></div>)}
        <label className="check-inline"><input type="checkbox" checked={i.rotatable} onChange={(e) => setItem(i.id, 'rotatable', e.target.checked)} /> Puede rotar en planta</label>
        <label className="check-inline"><input type="checkbox" checked={i.apilable} onChange={(e) => setItem(i.id, 'apilable', e.target.checked)} /> Apilable</label>
        <button className="btn" disabled={items.length === 1} onClick={() => setItems((a) => a.filter((x) => x.id !== i.id))}>Quitar {index + 1}</button>
        {(!i.altoM || !i.pesoKg) && <div className="meta sgo-carga-incompleto">Completá la altura total y el peso para calcular volumen y capacidad. La tarima ya puede acomodarse en el plano.</div>}
      </div>)}
    </div>

    <div className="sgo-log-kpis" style={{ marginTop: 16 }}>
      <Kpi valor={`${resultado.volumenCargaM3} m³`} label={`de ${resultado.volumenEspacioM3} m³`} tono={resultado.usoVolumenPct > 100 ? 'rojo' : 'azul'} />
      <Kpi valor={`${resultado.usoVolumenPct}%`} label="Ocupación volumétrica" tono={resultado.usoVolumenPct > 100 ? 'rojo' : resultado.usoVolumenPct > 85 ? 'amarillo' : 'verde'} />
      <Kpi valor={`${resultado.pesoTotalKg} kg`} label={`${resultado.usoPesoPct}% de carga máxima`} tono={resultado.usoPesoPct > 100 ? 'rojo' : resultado.usoPesoPct > 85 ? 'amarillo' : 'verde'} />
      <Kpi valor={`${resultado.usoPisoPct}%`} label="Ocupación de piso estimada" tono={resultado.unidadesNoUbicadas ? 'rojo' : 'azul'} />
    </div>

    <div className="sgo-carga-layout">
      <div>
        <div className="card-header sgo-carga-plano-header"><div><div className="section-title" style={{ margin: 0 }}>Plano de carga editable</div><div className="meta">Arrastrá cada pallet. Tocá uno para rotarlo o moverlo con precisión.</div></div><div className="row-actions"><button className="btn" onClick={restablecerDistribucion}>Distribución automática</button><button className="btn" onClick={descargarCSV}>Exportar plan CSV</button></div></div>
        <div ref={planoRef} className="sgo-carga-plano sgo-carga-plano-editable" style={{ aspectRatio: `${Math.max(.1, espacio.largoM)} / ${Math.max(.1, espacio.anchoM)}` }}>
          {ubicaciones.map((p) => <div
            className={`sgo-carga-bulto ${seleccionadaId === p.id ? 'seleccionado' : ''} ${conflictivas.has(p.id) ? 'conflicto' : ''}`}
            key={p.id} title={`${p.descripcion} · ${p.unidades} unidad(es)`}
            onPointerDown={(e) => iniciarArrastre(e, p)} onPointerMove={arrastrar} onPointerUp={terminarArrastre} onPointerCancel={terminarArrastre}
            style={{ left: `${(p.xM / Math.max(.01, espacio.largoM)) * 100}%`, top: `${(p.yM / Math.max(.01, espacio.anchoM)) * 100}%`, width: `${(p.largoM / Math.max(.01, espacio.largoM)) * 100}%`, height: `${(p.anchoM / Math.max(.01, espacio.anchoM)) * 100}%`, background: p.color }}
          ><span>{p.descripcion}</span><small>{p.largoM.toFixed(2)} × {p.anchoM.toFixed(2)} m</small>{p.unidades > 1 && <b>×{p.unidades}</b>}</div>)}
        </div>
        <div className="meta">Frente del camión a la izquierda · posición X desde el frente e Y desde el lateral superior.</div>
        {seleccionada && <div className="card sgo-carga-seleccion">
          <div><strong>{seleccionada.descripcion}</strong><span>Posición X {seleccionada.xM.toFixed(2)} m · Y {seleccionada.yM.toFixed(2)} m · huella {seleccionada.largoM.toFixed(2)} × {seleccionada.anchoM.toFixed(2)} m</span></div>
          <button className="btn" onClick={rotarSeleccionada}>↻ Rotar 90°</button>
          <div className="sgo-carga-nudges"><button className="btn" aria-label="Mover hacia el frente" onClick={() => moverSeleccionada(-.05, 0)}>←</button><button className="btn" aria-label="Mover hacia el lateral superior" onClick={() => moverSeleccionada(0, -.05)}>↑</button><button className="btn" aria-label="Mover hacia el lateral inferior" onClick={() => moverSeleccionada(0, .05)}>↓</button><button className="btn" aria-label="Mover hacia atrás" onClick={() => moverSeleccionada(.05, 0)}>→</button></div>
        </div>}
      </div>
      <div className="card sgo-carga-advertencias">
        <strong>Estado del plano</strong>
        <div className={evaluacion.valida ? 'sgo-carga-ok' : 'sgo-carga-error'}>{evaluacion.valida ? '✓ Distribución sin superposiciones' : `⚠ Revisar ${evaluacion.superpuestos.length} pallet(s) superpuestos y ${evaluacion.fueraDeLimites.length} fuera de límites`}</div>
        <strong>Verificaciones obligatorias</strong>{resultado.advertencias.map((a) => <div key={a}>• {a}</div>)}
      </div>
    </div>

    <div className="section-title" style={{ marginTop: 20 }}>Próxima evolución: optimización 3D</div>
    <div className="sgo-carga-integraciones">
      <div className="card"><strong>Goodloading · integración recomendada</strong><p>La API puede devolver coordenadas, utilización, cargas por eje, centro de gravedad y un enlace a la animación 3D.</p><a className="btn" href="https://www.goodloading.com/en/api/integrations/" target="_blank" rel="noreferrer">Ver integración</a></div>
      <div className="card"><strong>EasyCargo · piloto manual</strong><p>Muy útil para probar planificación 3D, restricciones, reportes y carga desde Excel antes de contratar una integración.</p><a className="btn" href="https://www.easycargo3d.com/en/" target="_blank" rel="noreferrer">Ver EasyCargo</a></div>
    </div>
  </div>
}

function Modal({ titulo, onClose, ancho = 760, children }: { titulo: string; onClose: () => void; ancho?: number; children: React.ReactNode }) {
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: ancho, width: '96%', maxHeight: '94vh', overflow: 'auto' }}><div className="card-header" style={{ marginBottom: 12 }}><div className="section-title" style={{ margin: 0 }}>{titulo}</div><button className="btn" onClick={onClose}>×</button></div>{children}</div></div>
}
