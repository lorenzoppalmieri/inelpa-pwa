import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { fechaLocalISO, sumarDiasLocalISO } from '../../lib/time'
import {
  guardarAccionSGO, guardarControlProgramadoSGO, guardarEjecucionControlSGO,
  guardarEventoSGO, guardarIndicadorSGO, guardarMedicionIndicadorSGO,
} from '../../sync/syncEngine'
import { idMedicionIndicador } from '../../sgo/indicadores'
import {
  AUDITORES_CAMPO, PLANTILLA_5S_RIT_9_2_12, SECCIONES_5S,
  areaSugeridaParaAuditor, areas5SParaAuditor, auditorDesdeUsuario, calcularPorcentajeCampo, calcularPorPilarCampo, calcularPorSeccionCampo,
  controlCampoCompleto, itemsDeAuditoriaCampo, prepararRespuestasCampo, respuestaEsHallazgo, semaforoCampo,
  type AuditoriaCampoSGO, type PuntajeControlCampo, type RespuestaControlCampo, type RiesgoHallazgoCampo,
} from '../../sgo/controlesCampo'
import {
  capturarEvidenciasCampo, encolarEvidenciasCampo, firmarEvidenciasCampo, listarEvidenciasPendientesCampo,
  sincronizarEvidenciasPendientesCampo, type EvidenciaPendienteCampo,
} from '../../sgo/evidenciasCampo'
import { datosMejoraDesdeEvento } from '../../sgo/mejoras'
import { proximaFechaControl, tipoEventoDesdeControl, type ControlProgramadoSGO, type EjecucionControlSGO } from '../../sgo/controles'
import {
  AREAS_SGO, PILARES_SGO, areaSGOLabel, codigoEventoSGO,
  type AccionSGO, type AreaSGOId, type EventoSGO, type PilarSGO,
} from '../../sgo/types'
import { usuarioEsLorenzo } from '../../sgo/permisos'

const fechaHora = (iso: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
const fechaLarga = (iso: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(`${iso.slice(0, 10)}T12:00:00`))
const normalizar = (texto: string) => texto.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function resultadoDesdeAuditoria(auditoria: AuditoriaCampoSGO): EjecucionControlSGO['resultado'] {
  const items = itemsDeAuditoriaCampo(auditoria)
  const critico = auditoria.respuestas.some((r) => r.puntaje === 0 && items.find((i) => i.id === r.itemId)?.critico)
  if (critico || auditoria.porcentajeCumplimiento < 75) return 'no_conforme'
  if (auditoria.porcentajeCumplimiento < 90 || auditoria.respuestas.some(respuestaEsHallazgo)) return 'observacion'
  return 'conforme'
}

export default function ControlesCampoView({ usuario, onOpenEvento }: { usuario: string; onOpenEvento: (id: string) => void }) {
  const controles = useLiveQuery(() => db.controlesProgramadosSGO.toArray(), []) ?? []
  const ejecuciones = useLiveQuery(() => db.ejecucionesControlesSGO.toArray(), []) ?? []
  const [controlActivo, setControlActivo] = useState<ControlProgramadoSGO | null | undefined>()
  const [solicitandoEspecial, setSolicitandoEspecial] = useState(false)
  const [programando, setProgramando] = useState(false)
  const [informe, setInforme] = useState<EjecucionControlSGO>()
  const [filtroAuditor, setFiltroAuditor] = useState(auditorDesdeUsuario(usuario) ?? '')
  const hoy = fechaLocalISO()
  const controlesCampo = controles.filter((c) => c.tipo === 'auditoria_campo' || c.plantillaCampoId === PLANTILLA_5S_RIT_9_2_12.id)
  const historial = ejecuciones.filter((e) => Boolean(e.auditoriaCampo)).sort((a, b) => b.ejecutadoEn.localeCompare(a.ejecutadoEn))
  const pendientes = controlesCampo.filter((c) => c.activo && (!filtroAuditor || normalizar(c.responsable).includes(normalizar(filtroAuditor))))
    .sort((a, b) => a.proximaFecha.localeCompare(b.proximaFecha))
  const desde30 = sumarDiasLocalISO(-30)
  const ultimos30 = historial.filter((e) => e.ejecutadoEn.slice(0, 10) >= desde30)
  const promedio = ultimos30.length ? Math.round(ultimos30.reduce((t, e) => t + (e.auditoriaCampo?.porcentajeCumplimiento ?? 0), 0) / ultimos30.length) : 0
  const hallazgos = ultimos30.reduce((t, e) => t + (e.auditoriaCampo?.respuestas.filter(respuestaEsHallazgo).length ?? 0), 0)
  const enFecha = ultimos30.length ? Math.round((ultimos30.filter((e) => e.ejecutadoEn.slice(0, 10) <= e.fechaProgramada).length / ultimos30.length) * 100) : 0

  return <div className="sgo-campo">
    <div className="card sgo-campo-cabecera">
      <div>
        <div className="section-title">Controles de campo</div>
        <div className="meta">Auditorías trazables para tablets · producción, semielaborados y logística.</div>
      </div>
      <div className="row-actions">
        {usuarioEsLorenzo(usuario) && <><button className="btn" onClick={() => setSolicitandoEspecial(true)}>+ Pedir auditoría especial</button><button className="btn" onClick={() => setProgramando(true)}>Programar área</button></>}
      </div>
    </div>

    <div className="sgo-campo-identidad card">
      <div>
        <strong>Acceso actual: {usuario}</strong>
        <div className="meta">El auditor real se registra dentro de cada informe aunque la tablet use GestionSGO.</div>
      </div>
      <select className="input" value={filtroAuditor} onChange={(e) => setFiltroAuditor(e.target.value)} aria-label="Filtrar por auditor">
        <option value="">Ver todo el equipo</option>
        {AUDITORES_CAMPO.map((a) => <option key={a.id} value={a.nombre}>{a.nombre} · {a.alcance}</option>)}
      </select>
    </div>

    <div className="sgo-controles-resumen">
      <Resumen valor={pendientes.filter((c) => c.proximaFecha < hoy).length} label="Vencidos" tono="rojo" />
      <Resumen valor={pendientes.filter((c) => c.proximaFecha === hoy).length} label="Para hoy" tono="amarillo" />
      <Resumen valor={`${promedio}%`} label="Promedio 30 días" tono={semaforoCampo(promedio)} />
      <Resumen valor={hallazgos} label="Hallazgos 30 días" tono={hallazgos ? 'rojo' : 'verde'} />
      <Resumen valor={`${enFecha}%`} label="Ejecutados en fecha" tono={enFecha >= 90 ? 'verde' : enFecha >= 75 ? 'amarillo' : 'rojo'} />
    </div>

    <div className="section-title">Mis controles programados ({pendientes.length})</div>
    {pendientes.length === 0 ? <div className="empty">No hay controles 5S programados para este filtro. Podés programar un área o iniciar un control directo.</div>
      : <div className="sgo-campo-agenda">{pendientes.map((control) => <article className={`card sgo-campo-agenda-card ${control.proximaFecha < hoy ? 'vencido' : ''}`} key={control.id}>
        <div>
          <strong>{control.frecuencia === 'unico' ? 'ESPECIAL · ' : ''}{areaSGOLabel(control.areaId)}</strong>
          <div className="meta">{control.responsable} · {control.proximaFecha < hoy ? 'Vencido' : control.proximaFecha === hoy ? 'Para hoy' : `Próximo: ${fechaLarga(control.proximaFecha)}`}</div>
          {control.frecuencia === 'unico' && <div className="meta">{control.instrucciones}</div>}
          <div className="meta">{PLANTILLA_5S_RIT_9_2_12.documento.codigo} · versión {PLANTILLA_5S_RIT_9_2_12.documento.version}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setControlActivo(control)}>Realizar</button>
      </article>)}</div>}

    <div className="section-title" style={{ marginTop: 22 }}>Informes recientes</div>
    {historial.length === 0 ? <div className="empty">Todavía no existen controles de campo finalizados.</div>
      : <div className="card sgo-campo-historial">{historial.slice(0, 80).map((e) => {
        const a = e.auditoriaCampo!
        return <div className="sgo-campo-historial-fila" key={e.id}>
          <span className={`sgo-campo-score score-${semaforoCampo(a.porcentajeCumplimiento)}`}>{a.porcentajeCumplimiento}%</span>
          <div><strong>{areaSGOLabel(a.areaId)}</strong><div className="meta">{fechaHora(e.ejecutadoEn)} · Auditor: {a.auditor} · {a.respuestas.filter(respuestaEsHallazgo).length} hallazgo(s)</div></div>
          <div className="row-actions">
            {a.eventoIds?.[0] && <button className="btn" onClick={() => onOpenEvento(a.eventoIds![0])}>Expediente</button>}
            <button className="btn" onClick={() => setInforme(e)}>Ver / Exportar</button>
          </div>
        </div>
      })}</div>}

    {controlActivo !== undefined && <EjecutarControlCampo control={controlActivo} usuario={usuario} historial={historial} onClose={() => setControlActivo(undefined)} />}
    {programando && <ProgramarControlCampo usuario={usuario} controles={controlesCampo} onClose={() => setProgramando(false)} />}
    {solicitandoEspecial && <SolicitarAuditoriaEspecial usuario={usuario} onClose={() => setSolicitandoEspecial(false)} />}
    {informe?.auditoriaCampo && <InformeControlCampo ejecucion={informe} usuario={usuario} onUpdated={setInforme} onClose={() => setInforme(undefined)} />}
  </div>
}

function Resumen({ valor, label, tono }: { valor: number | string; label: string; tono: string }) {
  return <div className={`card sgo-control-resumen tono-${tono}`}><strong>{valor}</strong><span>{label}</span></div>
}

export function ProgramarControlCampo({ usuario, controles, onClose }: { usuario: string; controles: ControlProgramadoSGO[]; onClose: () => void }) {
  const auditorInicial = auditorDesdeUsuario(usuario) ?? 'Lara'
  const [auditor, setAuditor] = useState(auditorInicial)
  const [area, setArea] = useState<AreaSGOId>(areaSugeridaParaAuditor(auditorInicial))
  const [fecha, setFecha] = useState(fechaLocalISO())
  const [guardando, setGuardando] = useState(false)
  const areasAuditor = areas5SParaAuditor(auditor)

  async function guardar() {
    if (!usuarioEsLorenzo(usuario)) { window.alert('Solo Lorenzo puede modificar la programación semanal de 5S.'); return }
    const existente = controles.find((c) => c.areaId === area && c.frecuencia !== 'unico')
    const now = new Date().toISOString()
    const control: ControlProgramadoSGO = {
      id: existente?.id ?? `sgo-campo-5s-${area}`, titulo: `Control semanal 5S · ${areaSGOLabel(area)}`,
      tipo: 'auditoria_campo', areaId: area, pilar: 'mejora', norma: 'sgo_integral', requisito: PLANTILLA_5S_RIT_9_2_12.documento.codigo,
      instrucciones: 'Evaluar las cinco S, documentar hallazgos y asignar acciones verificables.', responsable: auditor,
      frecuencia: 'semanal', proximaFecha: fecha, toleranciaDias: 1, activo: true, plantillaCampoId: PLANTILLA_5S_RIT_9_2_12.id,
      creadoEn: existente?.creadoEn ?? now, creadoPor: existente?.creadoPor ?? usuario, actualizadoEn: now, actualizadoPor: usuario,
    }
    setGuardando(true); await guardarControlProgramadoSGO(control); setGuardando(false); onClose()
  }

  return <Modal titulo="Programar control 5S" onClose={onClose}>
    <div className="field"><label>Auditor *</label><select className="input" value={auditor} onChange={(e) => { setAuditor(e.target.value); setArea(areaSugeridaParaAuditor(e.target.value)) }}>{AUDITORES_CAMPO.map((a) => <option key={a.id} value={a.nombre}>{a.nombre} · {a.alcance}</option>)}</select></div>
    <div className="field"><label>Área *</label><select className="input" value={area} onChange={(e) => setArea(e.target.value as AreaSGOId)}>{AREAS_SGO.filter((a) => areasAuditor.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
    <div className="field"><label>Próxima fecha *</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
    <div className="meta">La frecuencia inicial será semanal, con un día de tolerancia. Después podrá modificarse desde Controles programados.</div>
    <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Programar'}</button></div>
  </Modal>
}

export function SolicitarAuditoriaEspecial({ usuario, onClose }: { usuario: string; onClose: () => void }) {
  const [auditor, setAuditor] = useState('Lara')
  const [area, setArea] = useState<AreaSGOId>(areaSugeridaParaAuditor('Lara'))
  const [fecha, setFecha] = useState(fechaLocalISO())
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const areasAuditor = areas5SParaAuditor(auditor)

  async function guardar() {
    if (!usuarioEsLorenzo(usuario)) { window.alert('Solo Lorenzo puede solicitar auditorías especiales.'); return }
    if (!motivo.trim()) { window.alert('Completá el motivo de la auditoría especial.'); return }
    const now = new Date().toISOString()
    const id = `sgo-campo-5s-especial-${crypto.randomUUID()}`
    const control: ControlProgramadoSGO = {
      id, titulo: `Auditoría especial 5S · ${areaSGOLabel(area)}`, tipo: 'auditoria_campo', areaId: area,
      pilar: 'mejora', norma: 'sgo_integral', requisito: PLANTILLA_5S_RIT_9_2_12.documento.codigo,
      instrucciones: `AUDITORÍA ESPECIAL solicitada por Lorenzo. Motivo: ${motivo.trim()}`,
      responsable: auditor, frecuencia: 'unico', proximaFecha: fecha, toleranciaDias: 0, activo: true,
      plantillaCampoId: PLANTILLA_5S_RIT_9_2_12.id, creadoEn: now, creadoPor: usuario,
      actualizadoEn: now, actualizadoPor: usuario,
    }
    setGuardando(true)
    try { await guardarControlProgramadoSGO(control); onClose() }
    catch (e) { window.alert(e instanceof Error ? e.message : 'No se pudo solicitar la auditoría especial.') }
    finally { setGuardando(false) }
  }

  return <Modal titulo="Pedir auditoría especial 5S" onClose={onClose}>
    <div className="field"><label>Auditor *</label><select className="input" value={auditor} onChange={(e) => { setAuditor(e.target.value); setArea(areaSugeridaParaAuditor(e.target.value)) }}>{AUDITORES_CAMPO.map((a) => <option key={a.id} value={a.nombre}>{a.nombre} · {a.alcance}</option>)}</select></div>
    <div className="field"><label>Área *</label><select className="input" value={area} onChange={(e) => setArea(e.target.value as AreaSGOId)}>{AREAS_SGO.filter((a) => areasAuditor.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
    <div className="field"><label>Fecha requerida *</label><input className="input" type="date" min={fechaLocalISO()} value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
    <div className="field"><label>Motivo / alcance especial *</label><textarea className="input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. reincidencia, reclamo, cambio de layout o verificación extraordinaria." /></div>
    <div className="meta">Se agregará a la agenda del auditor como control de una sola vez y no modificará su frecuencia semanal.</div>
    <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Solicitando…' : 'Solicitar auditoría'}</button></div>
  </Modal>
}

interface BorradorCampo {
  ejecucionId: string
  controlId?: string
  area: AreaSGOId
  auditor: string
  encargado: string
  ubicacion: string
  turno: string
  inicio: string
  respuestas: RespuestaControlCampo[]
}

function leerBorrador(clave: string, control?: ControlProgramadoSGO | null): BorradorCampo | undefined {
  try {
    const raw = localStorage.getItem(clave)
    if (!raw) return undefined
    const dato = JSON.parse(raw) as BorradorCampo
    if (control && dato.controlId !== control.id) return undefined
    return dato
  } catch { return undefined }
}

export function EjecutarControlCampo({ control, usuario, historial, onClose }: { control: ControlProgramadoSGO | null; usuario: string; historial: EjecucionControlSGO[]; onClose: () => void }) {
  const claveBorrador = `sgo-campo-borrador-${control?.id ?? 'libre'}`
  const [inicial] = useState(() => leerBorrador(claveBorrador, control))
  const auditorLogin = auditorDesdeUsuario(usuario)
  const [ejecucionId] = useState(inicial?.ejecucionId ?? crypto.randomUUID())
  const [auditor, setAuditor] = useState(inicial?.auditor ?? auditorLogin ?? control?.responsable ?? '')
  const [area, setArea] = useState<AreaSGOId>(inicial?.area ?? control?.areaId ?? areaSugeridaParaAuditor(auditorLogin ?? 'Lara'))
  const [encargado, setEncargado] = useState(inicial?.encargado ?? '')
  const [ubicacion, setUbicacion] = useState(inicial?.ubicacion ?? '')
  const [turno, setTurno] = useState(inicial?.turno ?? 'Mañana')
  const [inicio] = useState(inicial?.inicio ?? new Date().toISOString())
  const [respuestas, setRespuestas] = useState<RespuestaControlCampo[]>(() => prepararRespuestasCampo(inicial?.respuestas))
  const [seccionActiva, setSeccionActiva] = useState(SECCIONES_5S[0].id)
  const [guardando, setGuardando] = useState(false)
  const [subiendoItem, setSubiendoItem] = useState<string>()
  const [fotosPendientes, setFotosPendientes] = useState<Record<string, number>>({})
  const porcentaje = calcularPorcentajeCampo(respuestas)
  const porSeccion = calcularPorSeccionCampo(respuestas)
  const porcentajeSeguridad = calcularPorPilarCampo(respuestas, 'seguridad')
  const porcentajeAmbiente = calcularPorPilarCampo(respuestas, 'ambiente')
  const respondidas = respuestas.filter((r) => r.puntaje !== 'pendiente').length

  useEffect(() => {
    const borrador: BorradorCampo = { ejecucionId, controlId: control?.id, area, auditor, encargado, ubicacion, turno, inicio, respuestas }
    localStorage.setItem(claveBorrador, JSON.stringify(borrador))
  }, [ejecucionId, control?.id, area, auditor, encargado, ubicacion, turno, inicio, respuestas, claveBorrador])

  useEffect(() => {
    void listarEvidenciasPendientesCampo(ejecucionId).then((registros) => {
      setFotosPendientes(registros.reduce<Record<string, number>>((porItem, registro) => {
        porItem[registro.itemId] = (porItem[registro.itemId] ?? 0) + 1
        return porItem
      }, {}))
    }).catch(() => undefined)
  }, [ejecucionId])

  function actualizar(itemId: string, cambio: Partial<RespuestaControlCampo>) {
    setRespuestas((actuales) => actuales.map((r) => r.itemId === itemId ? { ...r, ...cambio } : r))
  }

  async function subirFotos(itemId: string, files: FileList | null) {
    if (!files?.length) return
    setSubiendoItem(itemId)
    try {
      const { paths, pendientes } = await capturarEvidenciasCampo(files, ejecucionId, itemId)
      const actual = respuestas.find((r) => r.itemId === itemId)
      actualizar(itemId, { evidenciaPaths: [...(actual?.evidenciaPaths ?? []), ...paths] })
      if (pendientes) {
        setFotosPendientes((actuales) => ({ ...actuales, [itemId]: (actuales[itemId] ?? 0) + pendientes }))
        window.alert(`${pendientes} foto(s) quedaron guardadas en esta tablet. Podrás sincronizarlas al abrir el informe cuando vuelva Internet.`)
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudieron subir las evidencias.')
    } finally { setSubiendoItem(undefined) }
  }

  async function asegurarControl(): Promise<ControlProgramadoSGO> {
    if (control) return control
    const id = `sgo-campo-5s-${area}`
    const existente = await db.controlesProgramadosSGO.get(id)
    if (existente) return existente
    const now = new Date().toISOString()
    const nuevo: ControlProgramadoSGO = {
      id, titulo: `Control semanal 5S · ${areaSGOLabel(area)}`, tipo: 'auditoria_campo', areaId: area,
      pilar: 'mejora', norma: 'sgo_integral', requisito: PLANTILLA_5S_RIT_9_2_12.documento.codigo,
      instrucciones: 'Evaluar las cinco S, documentar hallazgos y asignar acciones verificables.', responsable: auditor,
      frecuencia: 'semanal', proximaFecha: fechaLocalISO(), toleranciaDias: 1, activo: true,
      plantillaCampoId: PLANTILLA_5S_RIT_9_2_12.id, creadoEn: now, creadoPor: usuario, actualizadoEn: now, actualizadoPor: usuario,
    }
    await guardarControlProgramadoSGO(nuevo)
    return nuevo
  }

  async function finalizar() {
    if (!auditor.trim() || !encargado.trim()) { window.alert('Seleccioná el auditor real y completá el encargado del área.'); return }
    const respuestasParaValidar = respuestas.map((respuesta) => fotosPendientes[respuesta.itemId]
      ? { ...respuesta, evidenciaPaths: [...(respuesta.evidenciaPaths ?? []), '__foto_pendiente_offline__'] }
      : respuesta)
    if (!controlCampoCompleto(respuestasParaValidar)) {
      window.alert('Faltan respuestas. Para 0 o 1 son obligatorios observación, evidencia, acción, responsable y fecha. “No aplica” requiere justificación.')
      return
    }
    const totalPendientes = Object.values(fotosPendientes).reduce((total, cantidad) => total + cantidad, 0)
    const avisoFotos = totalPendientes ? `\n\n${totalPendientes} foto(s) quedarán guardadas en esta tablet hasta que vuelvas a tener Internet.` : ''
    if (!window.confirm(`Se cerrará el control con ${porcentaje}% de cumplimiento. Una vez enviado quedará trazable.${avisoFotos}\n\n¿Continuar?`)) return
    setGuardando(true)
    try {
      const registroControl = await asegurarControl()
      const now = new Date().toISOString()
      const anterior = historial.find((e) => e.auditoriaCampo?.areaId === area)?.auditoriaCampo?.porcentajeCumplimiento
      const baseAuditoria: AuditoriaCampoSGO = {
        tipo: '5s', modalidad: registroControl.frecuencia === 'unico' ? 'especial' : 'programada',
        motivoEspecial: registroControl.frecuencia === 'unico' ? registroControl.instrucciones : undefined,
        plantillaId: PLANTILLA_5S_RIT_9_2_12.id, plantillaVersion: PLANTILLA_5S_RIT_9_2_12.version,
        documento: PLANTILLA_5S_RIT_9_2_12.documento, areaId: area, auditor: auditor.trim(), usuarioAcceso: usuario,
        encargadoArea: encargado.trim(), ubicacion: ubicacion.trim() || undefined, turno: turno || undefined,
        iniciadaEn: inicio, finalizadaEn: now, respuestas, items: PLANTILLA_5S_RIT_9_2_12.items,
        porcentajeCumplimiento: porcentaje, porcentajePorSeccion: porSeccion,
        porcentajePorPilar: { seguridad: porcentajeSeguridad, ambiente: porcentajeAmbiente }, calificacionAnterior: anterior,
      }

      const porPilar = new Map<PilarSGO, RespuestaControlCampo[]>()
      respuestas.filter(respuestaEsHallazgo).forEach((r) => {
        const pilar = PLANTILLA_5S_RIT_9_2_12.items.find((i) => i.id === r.itemId)?.pilar ?? 'mejora'
        porPilar.set(pilar, [...(porPilar.get(pilar) ?? []), r])
      })
      const eventoIds: string[] = []
      for (const [pilar, hallazgosPilar] of porPilar) {
        const eventoId = crypto.randomUUID()
        const items = hallazgosPilar.map((r) => PLANTILLA_5S_RIT_9_2_12.items.find((i) => i.id === r.itemId)!)
        const hayCritico = hallazgosPilar.some((r, idx) => r.puntaje === 0 && items[idx]?.critico)
        const hayCero = hallazgosPilar.some((r) => r.puntaje === 0)
        const tipo = tipoEventoDesdeControl(pilar)
        const severidad = hayCritico ? 'alta' : hayCero ? 'media' : 'baja'
        const detalle = hallazgosPilar.map((r, idx) => `${r.puntaje}/2 · ${items[idx]?.pregunta}: ${r.observacion}`).join('\n')
        const evento: EventoSGO = {
          id: eventoId, codigo: codigoEventoSGO(new Date(), eventoId), tipo, pilar,
          titulo: `Hallazgos 5S · ${areaSGOLabel(area)} · ${PILARES_SGO.find((p) => p.id === pilar)?.label}`,
          descripcion: `Control ${PLANTILLA_5S_RIT_9_2_12.documento.codigo} · Resultado general ${porcentaje}%.\n${detalle}`,
          severidad, estado: 'abierto', areaId: area,
          areaOrigenId: tipo === 'no_conformidad' ? area : undefined, controlId: registroControl.id,
          responsable: hallazgosPilar[0]?.responsable, detectadoEn: now, detectadoPor: auditor.trim(),
          seguridad: tipo === 'observacion_preventiva' ? {
            fechaHoraHecho: now, lugarExacto: ubicacion.trim() || areaSGOLabel(area), tareaActividad: 'Control semanal 5S',
            tipoObservacion: 'insegura', condicionObservada: detalle, accionInmediata: hallazgosPilar.map((r) => r.accion).filter(Boolean).join(' · '),
          } : undefined,
          mejora: datosMejoraDesdeEvento({ tipo, pilar, severidad }, {
            fuente: '5s', origenEntidad: 'control_5s', origenId: registroControl.id,
            beneficioEsperado: `Corregir y sostener los hallazgos del control 5S ${PLANTILLA_5S_RIT_9_2_12.documento.codigo}.`,
          }),
          creadoEn: now, actualizadoEn: now,
        }
        await guardarEventoSGO(evento)
        eventoIds.push(eventoId)
        for (const r of hallazgosPilar) {
          const item = PLANTILLA_5S_RIT_9_2_12.items.find((i) => i.id === r.itemId)!
          const accion: AccionSGO = {
            id: crypto.randomUUID(), eventoId, tipo: r.puntaje === 0 ? 'correctiva' : 'correccion',
            descripcion: `${item.pregunta} · ${r.accion}`, responsable: r.responsable!, fechaCompromiso: r.fechaCompromiso!,
            estado: 'pendiente', evidencia: r.evidenciaReferencia, creadoEn: now, creadoPor: auditor.trim(), actualizadoEn: now,
          }
          await guardarAccionSGO(accion)
        }
      }

      const auditoria = { ...baseAuditoria, eventoIds }
      const ejecucion: EjecucionControlSGO = {
        id: ejecucionId, controlId: registroControl.id, fechaProgramada: registroControl.proximaFecha,
        ejecutadoEn: now, ejecutadoPor: auditor.trim(), resultado: resultadoDesdeAuditoria(auditoria),
        detalle: `Control 5S ${porcentaje}% · ${respuestas.filter(respuestaEsHallazgo).length} hallazgo(s).`,
        evidencia: respuestas.flatMap((r) => [r.evidenciaReferencia, ...(r.evidenciaPaths ?? [])]).filter(Boolean).join(' · ') || undefined,
        eventoId: eventoIds[0], auditoriaCampo: auditoria,
      }
      await guardarEjecucionControlSGO(ejecucion)
      const siguiente = proximaFechaControl(registroControl)
      await guardarControlProgramadoSGO({
        ...registroControl, responsable: auditor.trim(), plantillaCampoId: PLANTILLA_5S_RIT_9_2_12.id,
        proximaFecha: siguiente ?? registroControl.proximaFecha, activo: Boolean(siguiente) && registroControl.activo,
        actualizadoEn: now, actualizadoPor: usuario,
      })

      const periodo = now.slice(0, 7)
      const indicadores = [
        { id: `sgo-5s-${area}`, pilar: 'mejora' as PilarSGO, nombre: 'Cumplimiento 5S', valor: porcentaje },
        { id: `sgo-5s-seguridad-${area}`, pilar: 'seguridad' as PilarSGO, nombre: 'Cumplimiento de Seguridad en 5S', valor: porcentajeSeguridad },
        { id: `sgo-5s-ambiente-${area}`, pilar: 'ambiente' as PilarSGO, nombre: 'Cumplimiento Ambiental en 5S', valor: porcentajeAmbiente },
      ]
      for (const indicador of indicadores) {
        await guardarIndicadorSGO({
          id: indicador.id, areaId: area, pilar: indicador.pilar, nombre: indicador.nombre, unidad: '%', direccion: 'mayor_mejor',
          meta: 90, umbralAmarillo: 75, valorActual: indicador.valor, origen: 'manual', periodo, frecuencia: 'mensual', activo: true,
          actualizadoEn: now, actualizadoPor: auditor.trim(),
        })
        await guardarMedicionIndicadorSGO({
          id: idMedicionIndicador(indicador.id, periodo), indicadorId: indicador.id, periodo, valor: indicador.valor,
          explicacion: `Último control semanal 5S realizado por ${auditor.trim()} en ${areaSGOLabel(area)}.`,
          evidencia: `Ejecución ${ejecucionId} · ${PLANTILLA_5S_RIT_9_2_12.documento.codigo}`, cerrado: false,
          registradoEn: now, registradoPor: auditor.trim(), actualizadoEn: now, actualizadoPor: auditor.trim(),
        })
      }
      localStorage.removeItem(claveBorrador)
      onClose()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo finalizar el control.')
    } finally { setGuardando(false) }
  }

  function descartar() {
    if (!window.confirm('¿Descartar el borrador de este control?')) return
    localStorage.removeItem(claveBorrador); onClose()
  }

  return <Modal titulo="Realizar control semanal de 5S" onClose={onClose} ancho={1120}>
    <div className="sgo-campo-doc-mini">
      <strong>{PLANTILLA_5S_RIT_9_2_12.documento.nombre}</strong>
      <span>{PLANTILLA_5S_RIT_9_2_12.documento.codigo}</span><span>Versión {PLANTILLA_5S_RIT_9_2_12.documento.version}</span>
    </div>
    <div className="sgo-campo-form-meta">
      <div className="field"><label>Auditor real *</label><select className="input" value={auditor} disabled={Boolean(auditorLogin)} onChange={(e) => { setAuditor(e.target.value); if (!control) setArea(areaSugeridaParaAuditor(e.target.value)) }}><option value="">Seleccionar</option>{AUDITORES_CAMPO.map((a) => <option key={a.id} value={a.nombre}>{a.nombre} · {a.alcance}</option>)}</select></div>
      <div className="field"><label>Área *</label><select className="input" value={area} disabled={Boolean(control)} onChange={(e) => setArea(e.target.value as AreaSGOId)}>{AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
      <div className="field"><label>Encargado del área *</label><input className="input" value={encargado} onChange={(e) => setEncargado(e.target.value)} /></div>
      <div className="field"><label>Ubicación puntual</label><input className="input" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ej. MAQ 3, depósito, playa" /></div>
      <div className="field"><label>Turno</label><select className="input" value={turno} onChange={(e) => setTurno(e.target.value)}><option>Mañana</option><option>Tarde</option><option>Noche</option></select></div>
    </div>

    <div className="sgo-campo-progreso"><div><strong>{respondidas}/{respuestas.length}</strong> puntos respondidos<div className="meta">Seguridad: {porcentajeSeguridad}% · Medio Ambiente: {porcentajeAmbiente}%</div></div><div className={`sgo-campo-score score-${semaforoCampo(porcentaje)}`}>{porcentaje}%</div></div>
    <div className="sgo-campo-secciones">{SECCIONES_5S.map((s) => <button key={s.id} className={`btn ${seccionActiva === s.id ? 'btn-primary' : ''}`} onClick={() => setSeccionActiva(s.id)}>{s.codigo} · {porSeccion[s.id] ?? 0}%</button>)}</div>

    <div className="sgo-campo-preguntas">{PLANTILLA_5S_RIT_9_2_12.items.filter((i) => i.seccion === seccionActiva).map((item) => {
      const r = respuestas.find((x) => x.itemId === item.id)!
      return <article className={`sgo-campo-pregunta puntaje-${String(r.puntaje)}`} key={item.id}>
        <div className="sgo-campo-pregunta-cab"><div><span className="meta">{item.numero}. {item.punto} · {PILARES_SGO.find((p) => p.id === item.pilar)?.label}{item.critico ? ' · CRÍTICO' : ''}</span><strong>{item.pregunta}</strong></div></div>
        <div className="sgo-campo-puntajes">
          {([{ valor: 0, label: '0 · No cumple' }, { valor: 1, label: '1 · Parcial' }, { valor: 2, label: '2 · Cumple' }, { valor: 'na', label: 'N/A' }] as { valor: PuntajeControlCampo; label: string }[]).map((op) => <button type="button" key={String(op.valor)} className={`btn campo-op campo-op-${String(op.valor)} ${r.puntaje === op.valor ? 'activo' : ''}`} onClick={() => actualizar(item.id, { puntaje: op.valor })}>{op.label}</button>)}
        </div>
        {r.puntaje === 'na' && <div className="field"><label>Justificación de “No aplica” *</label><textarea className="input" rows={2} value={r.justificacionNoAplica ?? ''} onChange={(e) => actualizar(item.id, { justificacionNoAplica: e.target.value })} /></div>}
        {respuestaEsHallazgo(r) && <div className="sgo-campo-hallazgo-form">
          <div className="field campo-span-2"><label>Observación objetiva *</label><textarea className="input" rows={2} value={r.observacion ?? ''} onChange={(e) => actualizar(item.id, { observacion: e.target.value })} placeholder="Qué se observó y dónde." /></div>
          <div className="field"><label>Riesgo</label><select className="input" value={r.riesgo ?? (item.critico ? 'alto' : 'medio')} onChange={(e) => actualizar(item.id, { riesgo: e.target.value as RiesgoHallazgoCampo })}><option value="bajo">Bajo</option><option value="medio">Medio</option><option value="alto">Alto</option><option value="critico">Crítico</option></select></div>
          <div className="field"><label>Responsable *</label><input className="input" value={r.responsable ?? ''} onChange={(e) => actualizar(item.id, { responsable: e.target.value })} /></div>
          <div className="field campo-span-2"><label>Corrección / acción requerida *</label><textarea className="input" rows={2} value={r.accion ?? ''} onChange={(e) => actualizar(item.id, { accion: e.target.value })} /></div>
          <div className="field"><label>Fecha compromiso *</label><input className="input" type="date" min={fechaLocalISO()} value={r.fechaCompromiso ?? ''} onChange={(e) => actualizar(item.id, { fechaCompromiso: e.target.value })} /></div>
          <div className="field"><label>Evidencia / referencia *</label><input className="input" value={r.evidenciaReferencia ?? ''} onChange={(e) => actualizar(item.id, { evidenciaReferencia: e.target.value })} placeholder="Foto, acta, SAP, ubicación…" /></div>
          <div className="field campo-span-2"><label>Fotografías</label><label className="btn" style={{ cursor: 'pointer', width: 'fit-content' }}>{subiendoItem === item.id ? 'Guardando…' : '📷 Tomar / adjuntar fotos'}<input type="file" accept="image/*" capture="environment" multiple disabled={subiendoItem === item.id} style={{ display: 'none' }} onChange={(e) => void subirFotos(item.id, e.target.files)} /></label>{Boolean(r.evidenciaPaths?.length) && <div className="meta">{r.evidenciaPaths!.length} fotografía(s) sincronizada(s).</div>}{Boolean(fotosPendientes[item.id]) && <div className="sgo-evidencia-pendiente">📴 {fotosPendientes[item.id]} foto(s) guardada(s) en la tablet, pendientes de Internet.</div>}</div>
        </div>}
      </article>
    })}</div>

    <div className="sgo-campo-final-acciones"><button className="btn" onClick={descartar}>Descartar borrador</button><div className="meta">Borrador guardado automáticamente en esta tablet.</div><button className="btn btn-primary" disabled={guardando || Boolean(subiendoItem)} onClick={() => void finalizar()}>{guardando ? 'Finalizando…' : 'Finalizar y generar informe'}</button></div>
  </Modal>
}

export function InformeControlCampo({ ejecucion, usuario, onUpdated, onClose }: { ejecucion: EjecucionControlSGO; usuario: string; onUpdated: (ejecucion: EjecucionControlSGO) => void; onClose: () => void }) {
  const auditoria = ejecucion.auditoriaCampo!
  const items = itemsDeAuditoriaCampo(auditoria)
  const seguridad = auditoria.porcentajePorPilar?.seguridad ?? calcularPorPilarCampo(auditoria.respuestas, 'seguridad', items)
  const ambiente = auditoria.porcentajePorPilar?.ambiente ?? calcularPorPilarCampo(auditoria.respuestas, 'ambiente', items)
  const [editandoFotos, setEditandoFotos] = useState(false)
  return <Modal titulo={`Informe · ${areaSGOLabel(auditoria.areaId)}`} onClose={onClose} ancho={1050}>
    <div className="sgo-campo-informe-vista">
      <div className="sgo-campo-doc-mini"><strong>{auditoria.documento.nombre}</strong><span>{auditoria.documento.codigo}</span><span>Versión {auditoria.documento.version}</span></div>
      <div className="sgo-campo-informe-resumen"><div><span>Fecha</span><strong>{fechaHora(auditoria.finalizadaEn)}</strong></div><div><span>Auditor</span><strong>{auditoria.auditor}</strong></div><div><span>Área</span><strong>{areaSGOLabel(auditoria.areaId)}</strong></div><div><span>Encargado</span><strong>{auditoria.encargadoArea}</strong></div><div><span>Resultado general</span><strong>{auditoria.porcentajeCumplimiento}%</strong></div><div><span>Seguridad</span><strong>{seguridad}%</strong></div><div><span>Medio Ambiente</span><strong>{ambiente}%</strong></div></div>
      {auditoria.evidenciasActualizadasEn && <div className="sgo-evidencia-traza">Última incorporación de fotos: {fechaHora(auditoria.evidenciasActualizadasEn)} · {auditoria.evidenciasActualizadasPor}</div>}
      {SECCIONES_5S.map((s) => <section key={s.id}><h3>{s.nombre} · {auditoria.porcentajePorSeccion[s.id] ?? 0}%</h3>{items.filter((i) => i.seccion === s.id).map((item) => { const r = auditoria.respuestas.find((x) => x.itemId === item.id); if (!r) return null; return <div className="sgo-campo-informe-item" key={item.id}><span className={`sgo-campo-score score-${r.puntaje === 2 ? 'verde' : r.puntaje === 1 ? 'amarillo' : r.puntaje === 0 ? 'rojo' : 'gris'}`}>{r.puntaje === 'na' ? 'N/A' : `${r.puntaje}/2`}</span><div><strong>{item.pregunta}</strong>{r.observacion && <div>{r.observacion}</div>}{r.justificacionNoAplica && <div className="meta">No aplica: {r.justificacionNoAplica}</div>}{r.accion && <div className="meta">Acción: {r.accion} · {r.responsable} · {r.fechaCompromiso}</div>}{Boolean(r.evidenciaPaths?.length) && <div className="meta">📷 {r.evidenciaPaths!.length} foto(s) adjunta(s)</div>}</div></div> })}</section>)}
    </div>
    <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn" onClick={onClose}>Cerrar</button><button className="btn" onClick={() => setEditandoFotos(true)}>📷 Agregar fotos</button><button className="btn btn-primary" onClick={() => void exportarInformeCampo(ejecucion)}>🖨 Exportar PDF</button></div>
    {editandoFotos && <EditorFotosAuditoriaCampo ejecucion={ejecucion} usuario={usuario} onUpdated={onUpdated} onClose={() => setEditandoFotos(false)} />}
  </Modal>
}

function EditorFotosAuditoriaCampo({ ejecucion, usuario, onUpdated, onClose }: { ejecucion: EjecucionControlSGO; usuario: string; onUpdated: (ejecucion: EjecucionControlSGO) => void; onClose: () => void }) {
  const auditoria = ejecucion.auditoriaCampo!
  const items = itemsDeAuditoriaCampo(auditoria)
  const [itemId, setItemId] = useState(items.find((item) => auditoria.respuestas.find((r) => r.itemId === item.id && respuestaEsHallazgo(r)))?.id ?? items[0]?.id ?? '')
  const [pendientes, setPendientes] = useState<EvidenciaPendienteCampo[]>([])
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function recargarPendientes() {
    try { setPendientes(await listarEvidenciasPendientesCampo(ejecucion.id)) } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudieron leer las fotos guardadas.') }
  }

  useEffect(() => { void recargarPendientes() }, [ejecucion.id])

  async function adjuntar(files: FileList | null) {
    if (!files?.length || !itemId) return
    setProcesando(true); setMensaje('')
    try {
      const cantidad = await encolarEvidenciasCampo(files, ejecucion.id, itemId)
      await recargarPendientes()
      setMensaje(`${cantidad} foto(s) guardada(s) en esta tablet. ${navigator.onLine ? 'Sincronizando…' : 'Se podrán enviar cuando vuelva Internet.'}`)
      if (navigator.onLine) await sincronizar()
    } catch (e) { setMensaje(e instanceof Error ? e.message : 'No se pudieron guardar las fotos.') }
    finally { setProcesando(false) }
  }

  async function sincronizar() {
    if (!navigator.onLine) { setMensaje('Las fotos están seguras en esta tablet. Conectate a Internet para sincronizarlas.'); return }
    setProcesando(true); setMensaje('Sincronizando fotografías…')
    try {
      const resultado = await sincronizarEvidenciasPendientesCampo(ejecucion, usuario)
      onUpdated(resultado.ejecucion)
      setPendientes([])
      setMensaje(resultado.sincronizadas ? `${resultado.sincronizadas} foto(s) incorporada(s) al informe correctamente.` : 'No hay fotos pendientes de sincronización.')
    } catch (e) {
      await recargarPendientes()
      setMensaje(e instanceof Error ? e.message : 'No se pudieron sincronizar las fotos.')
    } finally { setProcesando(false) }
  }

  return <Modal titulo="Agregar fotos a auditoría cerrada" onClose={onClose} ancho={720}>
    <div className="sgo-evidencia-aviso"><strong>El resultado de la auditoría no cambia.</strong><span>Solo se anexan fotografías. Las respuestas, el puntaje, la fecha y los hallazgos permanecen cerrados y trazables.</span></div>
    <div className="field"><label>Punto de control al que corresponde la foto *</label><select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>{items.map((item) => { const r = auditoria.respuestas.find((x) => x.itemId === item.id); return <option key={item.id} value={item.id}>{SECCIONES_5S.find((s) => s.id === item.seccion)?.codigo} · {item.numero} · {item.pregunta} · {r?.evidenciaPaths?.length ?? 0} foto(s)</option> })}</select></div>
    <label className="btn btn-primary sgo-evidencia-adjuntar">{procesando ? 'Guardando…' : '📷 Tomar o elegir fotografías'}<input type="file" accept="image/*" capture="environment" multiple disabled={procesando || !itemId} style={{ display: 'none' }} onChange={(e) => { void adjuntar(e.target.files); e.currentTarget.value = '' }} /></label>
    <div className={`sgo-evidencia-estado ${pendientes.length ? 'pendiente' : ''}`}><strong>{pendientes.length ? `📴 ${pendientes.length} foto(s) pendientes en esta tablet` : '✓ No hay fotos pendientes en esta tablet'}</strong>{mensaje && <span>{mensaje}</span>}</div>
    <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn" onClick={onClose}>Cerrar</button>{Boolean(pendientes.length) && <button className="btn btn-primary" disabled={procesando} onClick={() => void sincronizar()}>{procesando ? 'Sincronizando…' : 'Sincronizar ahora'}</button>}</div>
  </Modal>
}

const esc = (valor?: string | number) => String(valor ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]!))

async function exportarInformeCampo(ejecucion: EjecucionControlSGO) {
  const a = ejecucion.auditoriaCampo
  if (!a) return
  const items = itemsDeAuditoriaCampo(a)
  const seguridad = a.porcentajePorPilar?.seguridad ?? calcularPorPilarCampo(a.respuestas, 'seguridad', items)
  const ambiente = a.porcentajePorPilar?.ambiente ?? calcularPorPilarCampo(a.respuestas, 'ambiente', items)
  const paths = a.respuestas.flatMap((r) => r.evidenciaPaths ?? [])
  const urls = await firmarEvidenciasCampo(paths)
  const ventana = window.open('', '_blank')
  if (!ventana) { window.alert('El navegador bloqueó la ventana de exportación. Habilitá las ventanas emergentes.'); return }
  ventana.opener = null
  const filas = SECCIONES_5S.map((seccion) => `<tr class="seccion"><td colspan="6">${esc(seccion.nombre)} · ${a.porcentajePorSeccion[seccion.id] ?? 0}%</td></tr>${items.filter((i) => i.seccion === seccion.id).map((item) => {
    const r = a.respuestas.find((x) => x.itemId === item.id)
    if (!r) return ''
    const fotos = (r.evidenciaPaths ?? []).map((p) => urls[p] ? `<img src="${esc(urls[p])}" alt="Evidencia" />` : `<span>${esc(p)}</span>`).join('')
    return `<tr><td>${item.numero}</td><td>${esc(item.punto)}</td><td>${esc(item.pregunta)}</td><td class="puntaje">${r.puntaje === 'na' ? 'N/A' : esc(r.puntaje)}</td><td>${esc(r.observacion ?? r.justificacionNoAplica)}</td><td>${esc(r.accion)}${r.responsable ? `<br><b>${esc(r.responsable)}</b> · ${esc(r.fechaCompromiso)}` : ''}${r.evidenciaReferencia ? `<br>Evidencia: ${esc(r.evidenciaReferencia)}` : ''}<div class="fotos">${fotos}</div></td></tr>`
  }).join('')}`).join('')
  ventana.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(a.documento.codigo)} · ${esc(areaSGOLabel(a.areaId))}</title><style>
    @page{size:A4 portrait;margin:9mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;font-size:9px;margin:0}.cab{width:100%;border-collapse:collapse;margin-bottom:8px}.cab td{border:1px solid #111;padding:5px}.logo{width:22%;text-align:center}.logo img{max-width:100px;max-height:52px}.titulo{font-size:15px;font-weight:800;text-align:center}.doc{width:24%;line-height:1.5}.meta{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #111;margin-bottom:8px}.meta div{padding:5px;border-right:1px solid #111}.meta div:nth-child(3n){border-right:0}.resultado{font-size:18px;font-weight:900}.tabla{width:100%;border-collapse:collapse}.tabla th,.tabla td{border:1px solid #333;padding:4px;vertical-align:top}.tabla th{background:#e5e7eb}.seccion td{background:#cbd5e1;font-weight:800;font-size:10px}.puntaje{text-align:center;font-size:12px;font-weight:900}.fotos{display:flex;gap:3px;flex-wrap:wrap;margin-top:3px}.fotos img{width:58px;height:44px;object-fit:cover}.firmas{display:grid;grid-template-columns:repeat(3,1fr);gap:25px;margin-top:28px;text-align:center}.firmas div{border-top:1px solid #111;padding-top:4px}.pie{margin-top:8px;text-align:center;color:#444}@media print{thead{display:table-header-group}.seccion{break-after:avoid}tr{break-inside:avoid}}
  </style></head><body>
    <table class="cab"><tr><td class="logo"><img src="${esc(new URL('/logo.png', window.location.origin).href)}" alt="INELPA"></td><td class="titulo">${esc(a.documento.nombre)}</td><td class="doc"><b>${esc(a.documento.codigo)}</b><br>Versión: ${esc(a.documento.version)}<br>Fecha de emisión: ${esc(a.documento.fechaEmision)}<br>Hoja N° 1</td></tr></table>
    <div class="meta"><div><b>Fecha control</b><br>${esc(fechaHora(a.finalizadaEn))}</div><div><b>Controlado por</b><br>${esc(a.auditor)}</div><div><b>Sector</b><br>${esc(areaSGOLabel(a.areaId))}</div><div><b>Encargado de área</b><br>${esc(a.encargadoArea)}</div><div><b>Ubicación / turno</b><br>${esc(a.ubicacion)} · ${esc(a.turno)}</div><div><b>Resultado general</b><br><span class="resultado">${a.porcentajeCumplimiento}%</span>${a.calificacionAnterior !== undefined ? `<br>Anterior: ${a.calificacionAnterior}%` : ''}<br>Seguridad: ${seguridad}% · Ambiente: ${ambiente}%</div></div>
    <table class="tabla"><thead><tr><th>N°</th><th>Punto a verificar</th><th>Descripción</th><th>0/1/2</th><th>Observación</th><th>Acción / evidencia</th></tr></thead><tbody>${filas}</tbody></table>
    <div class="firmas"><div>Auditado por<br><b>${esc(a.auditor)}</b></div><div>Encargado del área<br><b>${esc(a.encargadoArea)}</b></div><div>Revisión SGO</div></div>
    <div class="pie">Emitido: ${esc(a.documento.emitidoPor)} · Aprobado: ${esc(a.documento.aprobadoPor)} · Registro ${esc(ejecucion.id)} · Acceso: ${esc(a.usuarioAcceso)}</div>
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350))<\/script>
  </body></html>`)
  ventana.document.close()
}

function Modal({ titulo, onClose, ancho = 760, children }: { titulo: string; onClose: () => void; ancho?: number; children: React.ReactNode }) {
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: ancho, width: '97%', maxHeight: '95vh', overflow: 'auto' }}><div className="card-header" style={{ marginBottom: 12 }}><div className="section-title" style={{ margin: 0 }}>{titulo}</div><button className="btn" onClick={onClose}>×</button></div>{children}</div></div>
}
