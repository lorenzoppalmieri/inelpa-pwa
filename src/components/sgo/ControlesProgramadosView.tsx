import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { fechaLocalISO, sumarDiasLocalISO } from '../../lib/time'
import { guardarControlProgramadoSGO, guardarEjecucionControlSGO, guardarEventoSGO } from '../../sync/syncEngine'
import {
  FRECUENCIAS_CONTROL_SGO, NORMAS_CONTROL_SGO, RESULTADOS_CONTROL_SGO, TIPOS_CONTROL_SGO,
  estadoProgramacionControl, proximaFechaControl, resultadoControlRequiereEvento, tipoEventoDesdeControl,
  type ControlProgramadoSGO, type EjecucionControlSGO, type FrecuenciaControlSGO,
  type NormaControlSGO, type ResultadoControlSGO, type TipoControlSGO,
} from '../../sgo/controles'
import { AREAS_SGO, PILARES_SGO, areaSGOLabel, codigoEventoSGO, type AreaSGOId, type EventoSGO, type PilarSGO } from '../../sgo/types'

const ESTADO_CONTROL = {
  vencido: { label: 'Vencido', clase: 'vencido' },
  hoy: { label: 'Para hoy', clase: 'hoy' },
  proximo: { label: 'Próximo', clase: 'proximo' },
  programado: { label: 'Programado', clase: 'programado' },
  inactivo: { label: 'Inactivo', clase: 'inactivo' },
} as const

const RESULTADO_CLASE: Record<ResultadoControlSGO, string> = {
  conforme: 'conforme', observacion: 'observacion', no_conforme: 'no-conforme', no_aplica: 'no-aplica',
}

const fechaLabel = (fecha: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(`${fecha.slice(0, 10)}T12:00:00`))
const fechaHoraLabel = (fecha: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(fecha))
const frecuenciaLabel = (id: FrecuenciaControlSGO) => FRECUENCIAS_CONTROL_SGO.find((f) => f.id === id)?.label ?? id
const resultadoLabel = (id: ResultadoControlSGO) => RESULTADOS_CONTROL_SGO.find((r) => r.id === id)?.label ?? id

export default function ControlesProgramadosView({ usuario, onOpenEvento }: { usuario: string; onOpenEvento: (id: string) => void }) {
  const controles = useLiveQuery(() => db.controlesProgramadosSGO.toArray(), []) ?? []
  const ejecuciones = useLiveQuery(() => db.ejecucionesControlesSGO.toArray(), []) ?? []
  const [editor, setEditor] = useState<ControlProgramadoSGO | null | undefined>()
  const [ejecutando, setEjecutando] = useState<ControlProgramadoSGO>()
  const [buscar, setBuscar] = useState('')
  const [area, setArea] = useState<AreaSGOId | ''>('')
  const [estado, setEstado] = useState('activos')
  const hoy = fechaLocalISO()
  const desde30 = sumarDiasLocalISO(-30)

  const resumen = useMemo(() => ({
    vencidos: controles.filter((c) => estadoProgramacionControl(c, hoy) === 'vencido').length,
    hoy: controles.filter((c) => estadoProgramacionControl(c, hoy) === 'hoy').length,
    proximos: controles.filter((c) => estadoProgramacionControl(c, hoy) === 'proximo').length,
    realizados: ejecuciones.filter((e) => e.ejecutadoEn.slice(0, 10) >= desde30).length,
    noConformes: ejecuciones.filter((e) => e.ejecutadoEn.slice(0, 10) >= desde30 && e.resultado === 'no_conforme').length,
  }), [controles, ejecuciones, hoy, desde30])

  const q = buscar.trim().toLocaleLowerCase('es')
  const visibles = controles.filter((c) => {
    const programacion = estadoProgramacionControl(c, hoy)
    if (area && c.areaId !== area) return false
    if (estado === 'activos' && !c.activo) return false
    if (estado === 'vencidos' && programacion !== 'vencido') return false
    if (estado === 'inactivos' && c.activo) return false
    if (q && !`${c.titulo} ${c.responsable} ${c.requisito ?? ''} ${areaSGOLabel(c.areaId)}`.toLocaleLowerCase('es').includes(q)) return false
    return true
  }).sort((a, b) => {
    const rango = { vencido: 0, hoy: 1, proximo: 2, programado: 3, inactivo: 4 }
    return rango[estadoProgramacionControl(a, hoy)] - rango[estadoProgramacionControl(b, hoy)] || a.proximaFecha.localeCompare(b.proximaFecha)
  })

  const historial = [...ejecuciones].sort((a, b) => b.ejecutadoEn.localeCompare(a.ejecutadoEn)).slice(0, 100)

  return <div className="sgo-controles">
    <div className="card sgo-controles-cabecera">
      <div>
        <div className="section-title">Controles programados</div>
        <div className="meta">Agenda de verificaciones de procesos, semielaborados, administración y sistemas ISO.</div>
      </div>
      <button className="btn btn-primary" onClick={() => setEditor(null)}>+ Nuevo control</button>
    </div>

    <div className="sgo-controles-resumen">
      <ResumenControl valor={resumen.vencidos} label="Vencidos" tono="rojo" />
      <ResumenControl valor={resumen.hoy} label="Para hoy" tono="amarillo" />
      <ResumenControl valor={resumen.proximos} label="Próximos 7 días" tono="azul" />
      <ResumenControl valor={resumen.realizados} label="Realizados 30 días" tono="verde" />
      <ResumenControl valor={resumen.noConformes} label="No conformes 30 días" tono="rojo" />
    </div>

    <div className="card sgo-controles-filtros">
      <input className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar control, responsable o requisito…" aria-label="Buscar control" />
      <select className="input" value={area} onChange={(e) => setArea(e.target.value as AreaSGOId | '')} aria-label="Filtrar área">
        <option value="">Todas las áreas</option>{AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select>
      <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar programación">
        <option value="activos">Controles activos</option><option value="vencidos">Sólo vencidos</option><option value="todos">Todos</option><option value="inactivos">Inactivos</option>
      </select>
    </div>

    <div className="section-title">Agenda ({visibles.length})</div>
    {visibles.length === 0 ? <div className="empty">No existen controles que coincidan con los filtros.</div> : <div className="sgo-controles-lista">
      {visibles.map((control) => {
        const programacion = estadoProgramacionControl(control, hoy)
        const ultima = historial.find((e) => e.controlId === control.id)
        return <article className={`card sgo-control-card control-${ESTADO_CONTROL[programacion].clase}`} key={control.id}>
          <div className="sgo-control-card-principal">
            <div className="sgo-control-fecha"><strong>{control.proximaFecha.slice(8, 10)}</strong><span>{new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(new Date(`${control.proximaFecha}T12:00:00`))}</span></div>
            <div>
              <div className="sgo-control-titulo"><strong>{control.titulo}</strong><span className={`estado-chip control-chip-${ESTADO_CONTROL[programacion].clase}`}>{ESTADO_CONTROL[programacion].label}</span></div>
              <div className="meta">{areaSGOLabel(control.areaId)} · {PILARES_SGO.find((p) => p.id === control.pilar)?.label} · {frecuenciaLabel(control.frecuencia)} · Responsable: <strong>{control.responsable}</strong></div>
              {(control.norma || control.requisito) && <div className="meta">{NORMAS_CONTROL_SGO.find((n) => n.id === control.norma)?.label ?? 'SGO'}{control.requisito ? ` · ${control.requisito}` : ''}</div>}
              <p>{control.instrucciones}</p>
              {ultima && <div className="meta">Último control: {fechaHoraLabel(ultima.ejecutadoEn)} · <strong>{resultadoLabel(ultima.resultado)}</strong> · {ultima.ejecutadoPor}</div>}
            </div>
          </div>
          <div className="row-actions">
            <button className="btn" onClick={() => setEditor(control)}>Editar</button>
            {control.activo && control.tipo !== 'auditoria_campo' && <button className="btn btn-primary" onClick={() => setEjecutando(control)}>Ejecutar control</button>}
            {control.activo && control.tipo === 'auditoria_campo' && <span className="meta">Ejecutar desde “Controles de campo”</span>}
          </div>
        </article>
      })}
    </div>}

    <div className="section-title" style={{ marginTop: 22 }}>Historial reciente</div>
    {historial.length === 0 ? <div className="empty">Todavía no hay controles ejecutados.</div> : <div className="card sgo-controles-historial">
      {historial.map((e) => {
        const control = controles.find((c) => c.id === e.controlId)
        return <div className="sgo-control-historial-fila" key={e.id}>
          <span className={`sgo-resultado-dot resultado-${RESULTADO_CLASE[e.resultado]}`} />
          <div><strong>{control?.titulo ?? 'Control histórico'}</strong><div className="meta">{fechaHoraLabel(e.ejecutadoEn)} · {e.ejecutadoPor} · {resultadoLabel(e.resultado)}{e.nroSerie ? ` · Serie ${e.nroSerie}` : ''}{e.semielaboradoCodigo ? ` · ${e.semielaboradoCodigo}` : ''}</div><div>{e.detalle}</div></div>
          {e.eventoId && <button className="btn" onClick={() => onOpenEvento(e.eventoId!)}>Abrir expediente</button>}
        </div>
      })}
    </div>}

    {editor !== undefined && <EditorControl registro={editor} usuario={usuario} onClose={() => setEditor(undefined)} />}
    {ejecutando && <EjecutarControl control={ejecutando} usuario={usuario} onClose={() => setEjecutando(undefined)} onOpenEvento={onOpenEvento} />}
  </div>
}

function ResumenControl({ valor, label, tono }: { valor: number; label: string; tono: string }) {
  return <div className={`card sgo-control-resumen tono-${tono}`}><strong>{valor}</strong><span>{label}</span></div>
}

function EditorControl({ registro, usuario, onClose }: { registro: ControlProgramadoSGO | null; usuario: string; onClose: () => void }) {
  const ahora = new Date().toISOString()
  const [titulo, setTitulo] = useState(registro?.titulo ?? '')
  const [tipo, setTipo] = useState<TipoControlSGO>(registro?.tipo ?? 'proceso_productivo')
  const [area, setArea] = useState<AreaSGOId>(registro?.areaId ?? 'bobinado_distribucion')
  const [pilar, setPilar] = useState<PilarSGO>(registro?.pilar ?? 'calidad')
  const [norma, setNorma] = useState<NormaControlSGO | ''>(registro?.norma ?? 'sgo_integral')
  const [requisito, setRequisito] = useState(registro?.requisito ?? '')
  const [instrucciones, setInstrucciones] = useState(registro?.instrucciones ?? '')
  const [responsable, setResponsable] = useState(registro?.responsable ?? '')
  const [frecuencia, setFrecuencia] = useState<FrecuenciaControlSGO>(registro?.frecuencia ?? 'semanal')
  const [proximaFecha, setProximaFecha] = useState(registro?.proximaFecha ?? fechaLocalISO())
  const [tolerancia, setTolerancia] = useState(String(registro?.toleranciaDias ?? 0))
  const [activo, setActivo] = useState(registro?.activo ?? true)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (!titulo.trim() || !instrucciones.trim() || !responsable.trim() || !proximaFecha) {
      window.alert('Completá título, instrucciones, responsable y próxima fecha.')
      return
    }
    setGuardando(true)
    const control: ControlProgramadoSGO = {
      id: registro?.id ?? crypto.randomUUID(), titulo: titulo.trim(), tipo, areaId: area, pilar,
      norma: norma || undefined, requisito: requisito.trim() || undefined, instrucciones: instrucciones.trim(),
      responsable: responsable.trim(), frecuencia, proximaFecha, toleranciaDias: Math.max(0, Math.trunc(Number(tolerancia) || 0)), activo,
      creadoEn: registro?.creadoEn ?? ahora, creadoPor: registro?.creadoPor ?? usuario,
      actualizadoEn: new Date().toISOString(), actualizadoPor: usuario,
    }
    await guardarControlProgramadoSGO(control)
    setGuardando(false); onClose()
  }

  return <Modal titulo={registro ? 'Editar control programado' : 'Nuevo control programado'} onClose={onClose}>
    <div className="field"><label>Título *</label><input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Verificación dimensional de bobinas terminadas" /></div>
    <div className="sgo-control-form-grid">
      <div className="field"><label>Tipo</label><select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoControlSGO)}>{TIPOS_CONTROL_SGO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
      <div className="field"><label>Área</label><select className="input" value={area} onChange={(e) => setArea(e.target.value as AreaSGOId)}>{AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
      <div className="field"><label>Pilar</label><select className="input" value={pilar} onChange={(e) => setPilar(e.target.value as PilarSGO)}>{PILARES_SGO.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
      <div className="field"><label>Norma / sistema</label><select className="input" value={norma} onChange={(e) => setNorma(e.target.value as NormaControlSGO | '')}><option value="">Sin norma asociada</option>{NORMAS_CONTROL_SGO.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select></div>
      <div className="field"><label>Cláusula / requisito</label><input className="input" value={requisito} onChange={(e) => setRequisito(e.target.value)} placeholder="Ej. 8.5.1 / IT-B08" /></div>
      <div className="field"><label>Responsable *</label><input className="input" value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Lara, Azul…" /></div>
      <div className="field"><label>Frecuencia</label><select className="input" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaControlSGO)}>{FRECUENCIAS_CONTROL_SGO.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
      <div className="field"><label>Próxima fecha *</label><input className="input" type="date" value={proximaFecha} onChange={(e) => setProximaFecha(e.target.value)} /></div>
      <div className="field"><label>Tolerancia (días)</label><input className="input" type="number" min="0" step="1" value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} /></div>
    </div>
    <div className="field"><label>Qué se debe controlar *</label><textarea className="input" rows={4} value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} placeholder="Método, muestra, característica, documento o evidencia esperada." /></div>
    <label className="check-inline"><input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Control activo</label>
    <div className="row-actions" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar control'}</button></div>
  </Modal>
}

function EjecutarControl({ control, usuario, onClose, onOpenEvento }: { control: ControlProgramadoSGO; usuario: string; onClose: () => void; onOpenEvento: (id: string) => void }) {
  const [resultado, setResultado] = useState<ResultadoControlSGO>('conforme')
  const [detalle, setDetalle] = useState('')
  const [evidencia, setEvidencia] = useState('')
  const [ordenId, setOrdenId] = useState('')
  const [nroSerie, setNroSerie] = useState('')
  const [semi, setSemi] = useState('')
  const [esperado, setEsperado] = useState('')
  const [encontrado, setEncontrado] = useState('')
  const [unidad, setUnidad] = useState('')
  const [eventoObservacion, setEventoObservacion] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), []) ?? []
  const semis = useLiveQuery(() => db.semielaborados.toArray(), []) ?? []

  async function guardar() {
    const generaEvento = resultadoControlRequiereEvento(resultado) || (resultado === 'observacion' && eventoObservacion)
    if (!detalle.trim()) { window.alert('Describí el resultado del control.'); return }
    if (generaEvento && !evidencia.trim()) { window.alert('Un desvío debe incluir evidencia o una referencia verificable.'); return }
    setGuardando(true)
    const now = new Date().toISOString()
    let eventoId: string | undefined
    if (generaEvento) {
      eventoId = crypto.randomUUID()
      const tipo = tipoEventoDesdeControl(control.pilar)
      const referencias = [ordenId && `Orden: ${ordenId}`, nroSerie && `Serie: ${nroSerie}`, semi && `Semielaborado: ${semi}`].filter(Boolean).join(' · ')
      const medicion = esperado || encontrado ? `Esperado: ${esperado || 'sin definir'}${unidad ? ` ${unidad}` : ''}. Encontrado: ${encontrado || 'sin dato'}${unidad ? ` ${unidad}` : ''}.` : ''
      const evento: EventoSGO = {
        id: eventoId, codigo: codigoEventoSGO(new Date(), eventoId), tipo, pilar: control.pilar,
        titulo: `${resultado === 'no_conforme' ? 'Control no conforme' : 'Observación'} · ${control.titulo}`,
        descripcion: [`Control programado para ${fechaLabel(control.proximaFecha)}.`, detalle.trim(), medicion, referencias].filter(Boolean).join('\n'),
        severidad: resultado === 'no_conforme' ? 'media' : 'baja', estado: 'abierto', areaId: control.areaId,
        areaOrigenId: tipo === 'no_conformidad' ? control.areaId : undefined, ordenId: ordenId || undefined,
        nroSerie: nroSerie.trim() || undefined, controlId: control.id, responsable: control.responsable,
        seguridad: tipo === 'observacion_preventiva' ? {
          fechaHoraHecho: now, lugarExacto: areaSGOLabel(control.areaId), tareaActividad: control.titulo,
          tipoObservacion: 'insegura', condicionObservada: detalle.trim(), accionInmediata: 'Pendiente de definir en el expediente SGO',
        } : undefined,
        evidenciaUrls: [evidencia.trim()], detectadoEn: now, detectadoPor: usuario, creadoEn: now, actualizadoEn: now,
      }
      await guardarEventoSGO(evento)
    }
    const ejecucion: EjecucionControlSGO = {
      id: `${control.id}__${control.proximaFecha}`, controlId: control.id, fechaProgramada: control.proximaFecha,
      ejecutadoEn: now, ejecutadoPor: usuario, resultado, detalle: detalle.trim(), evidencia: evidencia.trim() || undefined,
      ordenId: ordenId || undefined, nroSerie: nroSerie.trim() || undefined, semielaboradoCodigo: semi.trim() || undefined,
      valorEsperado: esperado.trim() || undefined, valorEncontrado: encontrado.trim() || undefined, unidad: unidad.trim() || undefined, eventoId,
    }
    await guardarEjecucionControlSGO(ejecucion)
    const siguiente = proximaFechaControl(control)
    await guardarControlProgramadoSGO({ ...control, proximaFecha: siguiente ?? control.proximaFecha, activo: Boolean(siguiente) && control.activo, actualizadoEn: now, actualizadoPor: usuario })
    setGuardando(false)
    onClose()
    if (eventoId && window.confirm('Se generó un expediente SGO. ¿Querés abrirlo ahora?')) onOpenEvento(eventoId)
  }

  return <Modal titulo={`Ejecutar · ${control.titulo}`} onClose={onClose} ancho={820}>
    <div className="sgo-control-contexto"><strong>{areaSGOLabel(control.areaId)}</strong><span>Programado: {fechaLabel(control.proximaFecha)}</span><span>{control.instrucciones}</span></div>
    <div className="field"><label>Resultado *</label><div className="sgo-resultados-selector">{RESULTADOS_CONTROL_SGO.map((r) => <button key={r.id} className={`btn resultado-${RESULTADO_CLASE[r.id]} ${resultado === r.id ? 'activo' : ''}`} onClick={() => { setResultado(r.id); if (r.id !== 'observacion') setEventoObservacion(false) }}>{r.label}</button>)}</div></div>
    <div className="field"><label>Resultado observado *</label><textarea className="input" rows={4} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Qué se verificó, sobre qué muestra y cuál fue el resultado." /></div>
    <div className="sgo-control-form-grid">
      <div className="field"><label>Orden / referencia SAP</label><input className="input" list="sgo-control-ordenes" value={ordenId} onChange={(e) => setOrdenId(e.target.value)} /><datalist id="sgo-control-ordenes">{ordenes.map((o) => <option key={o.id} value={o.id}>{o.nroOrden} · {o.modelo}</option>)}</datalist></div>
      <div className="field"><label>N° de serie</label><input className="input" value={nroSerie} onChange={(e) => setNroSerie(e.target.value)} /></div>
      <div className="field"><label>Semielaborado</label><input className="input" list="sgo-control-semis" value={semi} onChange={(e) => setSemi(e.target.value)} /><datalist id="sgo-control-semis">{semis.map((s) => <option key={s.id} value={s.codigo}>{s.descripcion}</option>)}</datalist></div>
      <div className="field"><label>Valor esperado</label><input className="input" value={esperado} onChange={(e) => setEsperado(e.target.value)} /></div>
      <div className="field"><label>Valor encontrado</label><input className="input" value={encontrado} onChange={(e) => setEncontrado(e.target.value)} /></div>
      <div className="field"><label>Unidad</label><input className="input" value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="mm, %, cantidad…" /></div>
    </div>
    <div className="field"><label>Evidencia / referencia</label><textarea className="input" rows={2} value={evidencia} onChange={(e) => setEvidencia(e.target.value)} placeholder="Acta, foto, protocolo, documento SAP o ubicación del registro." /></div>
    {resultado === 'no_conforme' && <div className="sgo-control-aviso error">Se generará obligatoriamente un expediente SGO para investigar y cerrar el desvío.</div>}
    {resultado === 'observacion' && <label className="check-inline"><input type="checkbox" checked={eventoObservacion} onChange={(e) => setEventoObservacion(e.target.checked)} /> Generar expediente SGO para dar seguimiento</label>}
    <div className="row-actions" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Registrando…' : 'Registrar ejecución'}</button></div>
  </Modal>
}

function Modal({ titulo, onClose, ancho = 720, children }: { titulo: string; onClose: () => void; ancho?: number; children: React.ReactNode }) {
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: ancho, width: '96%', maxHeight: '94vh', overflow: 'auto' }}><div className="card-header" style={{ marginBottom: 12 }}><div className="section-title" style={{ margin: 0 }}>{titulo}</div><button className="btn" onClick={onClose}>×</button></div>{children}</div></div>
}
