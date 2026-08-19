import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { fechaLocalISO } from '../../lib/time'
import { guardarControlProgramadoSGO, guardarEjecucionControlSGO, guardarEventoSGO } from '../../sync/syncEngine'
import { sumarFrecuenciaControl, tipoEventoDesdeControl, type ControlProgramadoSGO, type EjecucionControlSGO } from '../../sgo/controles'
import {
  PLANTILLAS_AUDITORIA_LOGISTICA, auditoriaCompleta, calcularCumplimientoAuditoria,
  checklistDesdePlantilla, puntosNoConformes,
  type DatosAuditoriaLogistica, type EstadoPuntoAuditoria, type TipoAuditoriaLogistica,
} from '../../sgo/logistica'
import { codigoEventoSGO, type EventoSGO, type PilarSGO } from '../../sgo/types'
import { datosMejoraDesdeEvento } from '../../sgo/mejoras'

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
      {/* v1.47: "Cubicaje y carga" se mudó al módulo de Logística. No era una
          auditoría, era una herramienta operativa del día a día. */}
    </div>

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
      const tipoEvento = tipoEventoDesdeControl(pilar)
      const severidad = desviados.some((p) => p.pilar === 'seguridad') ? 'alta' : 'media'
      const evento: EventoSGO = {
        id: eventoId, codigo: codigoEventoSGO(new Date(), eventoId), tipo: tipoEvento, pilar,
        titulo: `Auditoría logística con desvíos · ${plantilla.label}`,
        descripcion: [
          `${desviados.length} punto(s) no conforme(s) detectado(s) por ${auditor.trim()} en ${ubicacion.trim()}.`,
          ...desviados.map((p) => `• ${p.label}: ${p.observacion}`),
          `Acción inmediata: ${accionInmediata.trim()}`,
          [documentoSap && `SAP: ${documentoSap}`, remito && `Remito: ${remito}`, series && `Series: ${series}`, patente && `Patente: ${patente}`].filter(Boolean).join(' · '),
        ].filter(Boolean).join('\n'),
        severidad, estado: 'contenido',
        areaId: 'logistica_operativa', areaOrigenId: pilar === 'calidad' ? 'logistica_operativa' : undefined,
        responsable: responsableSector.trim(), contencion: accionInmediata.trim(), controlId: idControl,
        evidenciaUrls: [evidencia.trim()], detectadoEn: now, detectadoPor: usuario,
        mejora: datosMejoraDesdeEvento({ tipo: tipoEvento, pilar, severidad }, {
          fuente: 'auditoria_logistica', origenEntidad: 'auditoria_logistica', origenId: idControl,
          beneficioEsperado: 'Eliminar los desvíos logísticos detectados y evitar su repetición.',
        }),
        creadoEn: now, actualizadoEn: now,
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

function Modal({ titulo, onClose, ancho = 760, children }: { titulo: string; onClose: () => void; ancho?: number; children: React.ReactNode }) {
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: ancho, width: '96%', maxHeight: '94vh', overflow: 'auto' }}><div className="card-header" style={{ marginBottom: 12 }}><div className="section-title" style={{ margin: 0 }}>{titulo}</div><button className="btn" onClick={onClose}>×</button></div>{children}</div></div>
}
