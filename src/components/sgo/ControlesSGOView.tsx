import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { fechaLocalISO, sumarDiasLocalISO } from '../../lib/time'
import {
  FRECUENCIAS_CONTROL_SGO, RESULTADOS_CONTROL_SGO, TIPOS_CONTROL_SGO,
  estadoProgramacionControl, type ControlProgramadoSGO, type EjecucionControlSGO,
  type EstadoProgramacionControl, type ResultadoControlSGO, type TipoControlSGO,
} from '../../sgo/controles'
import { AREAS_5S_POR_AUDITOR, PLANTILLA_5S_RIT_9_2_12, respuestaEsHallazgo, semaforoCampo } from '../../sgo/controlesCampo'
import {
  compararMeses5S, periodoAnterior5S, promedioGeneralAreas5S, resumirMes5S, type ComparativoMensualArea5S,
} from '../../sgo/kpi5S'
import { usuarioEsLorenzo } from '../../sgo/permisos'
import { AREAS_SGO, areaSGOLabel, type AreaSGOId } from '../../sgo/types'
import { EditorControl, EjecutarControl } from './ControlesProgramadosView'
import {
  EjecutarControlCampo, InformeControlCampo, ProgramarControlCampo, SolicitarAuditoriaEspecial,
} from './ControlesCampoView'

type SeccionControles = 'agenda' | 'programacion' | 'kpi5s' | 'historial'
type FiltroEstado = 'pendientes' | EstadoProgramacionControl | 'todos'

const ESTADOS: Record<EstadoProgramacionControl, { label: string; clase: string }> = {
  vencido: { label: 'Vencido', clase: 'vencido' }, hoy: { label: 'Para hoy', clase: 'hoy' },
  proximo: { label: 'Próximo', clase: 'proximo' }, programado: { label: 'Programado', clase: 'programado' },
  inactivo: { label: 'Inactivo', clase: 'inactivo' },
}

const RESULTADO_CLASE: Record<ResultadoControlSGO, string> = {
  conforme: 'conforme', observacion: 'observacion', no_conforme: 'no-conforme', no_aplica: 'no-aplica',
}

const fechaHora = (iso: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
const fechaLarga = (iso: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(`${iso.slice(0, 10)}T12:00:00`))
const frecuenciaLabel = (id: ControlProgramadoSGO['frecuencia']) => FRECUENCIAS_CONTROL_SGO.find((f) => f.id === id)?.label ?? id
const resultadoLabel = (id: ResultadoControlSGO) => RESULTADOS_CONTROL_SGO.find((r) => r.id === id)?.label ?? id
const esAuditoriaCampo = (control?: ControlProgramadoSGO) => Boolean(control && (control.tipo === 'auditoria_campo' || control.plantillaCampoId === PLANTILLA_5S_RIT_9_2_12.id))

function tipoLabel(control: ControlProgramadoSGO) {
  if (esAuditoriaCampo(control) && control.frecuencia === 'unico') return 'Auditoría 5S especial'
  if (esAuditoriaCampo(control)) return 'Auditoría 5S'
  return TIPOS_CONTROL_SGO.find((tipo) => tipo.id === control.tipo)?.label ?? 'Control SGO'
}

export default function ControlesSGOView({ usuario, onOpenEvento, controlInicialId, onControlInicialConsumido, ejecucionInicialId, onEjecucionInicialConsumida }: {
  usuario: string
  onOpenEvento: (id: string) => void
  controlInicialId?: string
  onControlInicialConsumido?: () => void
  ejecucionInicialId?: string
  onEjecucionInicialConsumida?: () => void
}) {
  const controles = useLiveQuery(() => db.controlesProgramadosSGO.toArray(), []) ?? []
  const ejecuciones = useLiveQuery(() => db.ejecucionesControlesSGO.toArray(), []) ?? []
  const [seccion, setSeccion] = useState<SeccionControles>('agenda')
  const [periodo5S, setPeriodo5S] = useState(fechaLocalISO().slice(0, 7))
  const [buscar, setBuscar] = useState('')
  const [area, setArea] = useState<AreaSGOId | ''>('')
  const [tipo, setTipo] = useState<TipoControlSGO | ''>('')
  const [responsable, setResponsable] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('pendientes')
  const [resultado, setResultado] = useState<ResultadoControlSGO | ''>('')
  const [editor, setEditor] = useState<ControlProgramadoSGO | null | undefined>()
  const [ejecutando, setEjecutando] = useState<ControlProgramadoSGO>()
  const [ejecutandoCampo, setEjecutandoCampo] = useState<ControlProgramadoSGO>()
  const [programandoCampo, setProgramandoCampo] = useState(false)
  const [auditoriaEspecial, setAuditoriaEspecial] = useState(false)
  const [informeCampo, setInformeCampo] = useState<EjecucionControlSGO>()
  const lorenzo = usuarioEsLorenzo(usuario)
  const hoy = fechaLocalISO()
  const desde30 = sumarDiasLocalISO(-30)
  const historialCampo = ejecuciones.filter((e) => Boolean(e.auditoriaCampo)).sort((a, b) => b.ejecutadoEn.localeCompare(a.ejecutadoEn))

  useEffect(() => {
    if (!controlInicialId || !controles.length) return
    const control = controles.find((item) => item.id === controlInicialId)
    if (control) {
      setSeccion('agenda')
      setBuscar(control.titulo)
      setArea('')
      setTipo('')
      setResponsable('')
      setEstado('todos')
      if (lorenzo) setEditor(control)
    }
    onControlInicialConsumido?.()
  }, [controlInicialId, controles, lorenzo, onControlInicialConsumido])

  useEffect(() => {
    if (!ejecucionInicialId) return
    const ejecucion = ejecuciones.find((item) => item.id === ejecucionInicialId)
    if (!ejecucion?.auditoriaCampo) return
    setSeccion('historial')
    setInformeCampo(ejecucion)
    onEjecucionInicialConsumida?.()
  }, [ejecucionInicialId, ejecuciones, onEjecucionInicialConsumida])

  const resumen = useMemo(() => {
    const recientes = ejecuciones.filter((e) => e.ejecutadoEn.slice(0, 10) >= desde30)
    return {
      vencidos: controles.filter((c) => estadoProgramacionControl(c, hoy) === 'vencido').length,
      hoy: controles.filter((c) => estadoProgramacionControl(c, hoy) === 'hoy').length,
      proximos: controles.filter((c) => estadoProgramacionControl(c, hoy) === 'proximo').length,
      realizados: recientes.length,
      hallazgos: recientes.filter((e) => e.resultado === 'no_conforme' || e.resultado === 'observacion').length,
      enFecha: recientes.length ? Math.round(recientes.filter((e) => e.ejecutadoEn.slice(0, 10) <= e.fechaProgramada).length / recientes.length * 100) : 0,
    }
  }, [controles, ejecuciones, desde30, hoy])

  const responsables = useMemo(() => [...new Set(controles.map((c) => c.responsable).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [controles])
  const q = buscar.trim().toLocaleLowerCase('es')
  const controlesVisibles = controles.filter((control) => {
    const programacion = estadoProgramacionControl(control, hoy)
    if (area && control.areaId !== area) return false
    if (tipo && control.tipo !== tipo) return false
    if (responsable && control.responsable !== responsable) return false
    if (estado === 'pendientes' && !control.activo) return false
    if (!['pendientes', 'todos'].includes(estado) && programacion !== estado) return false
    if (q && !`${control.titulo} ${control.responsable} ${control.requisito ?? ''} ${areaSGOLabel(control.areaId)} ${tipoLabel(control)}`.toLocaleLowerCase('es').includes(q)) return false
    return true
  }).sort((a, b) => {
    const orden = { vencido: 0, hoy: 1, proximo: 2, programado: 3, inactivo: 4 }
    return orden[estadoProgramacionControl(a, hoy)] - orden[estadoProgramacionControl(b, hoy)] || a.proximaFecha.localeCompare(b.proximaFecha)
  })

  const historial = [...ejecuciones].filter((ejecucion) => {
    const control = controles.find((item) => item.id === ejecucion.controlId)
    if (area && control?.areaId !== area) return false
    if (tipo && control?.tipo !== tipo) return false
    if (responsable && control?.responsable !== responsable && ejecucion.ejecutadoPor !== responsable) return false
    if (resultado && ejecucion.resultado !== resultado) return false
    if (q && !`${control?.titulo ?? ''} ${ejecucion.detalle} ${ejecucion.ejecutadoPor} ${ejecucion.nroSerie ?? ''} ${ejecucion.semielaboradoCodigo ?? ''}`.toLocaleLowerCase('es').includes(q)) return false
    return true
  }).sort((a, b) => b.ejecutadoEn.localeCompare(a.ejecutadoEn)).slice(0, 200)

  function realizar(control: ControlProgramadoSGO) {
    if (esAuditoriaCampo(control)) setEjecutandoCampo(control)
    else setEjecutando(control)
  }

  return <div className="sgo-controles sgo-controles-unificados">
    <div className="card sgo-controles-unificados-cabecera">
      <div><div className="section-title">CONTROLES SGO</div><div className="meta">Una sola agenda para programar, realizar y consultar controles y auditorías.</div></div>
      <div className="row-actions">
        {lorenzo && <button className="btn btn-primary" onClick={() => { setSeccion('programacion'); setEditor(null) }}>+ Nuevo control</button>}
      </div>
    </div>

    <div className="sgo-controles-resumen">
      <Resumen valor={resumen.vencidos} label="Vencidos" tono={resumen.vencidos ? 'rojo' : 'verde'} />
      <Resumen valor={resumen.hoy} label="Para hoy" tono="amarillo" />
      <Resumen valor={resumen.proximos} label="Próximos 7 días" tono="azul" />
      <Resumen valor={resumen.realizados} label="Realizados 30 días" tono="verde" />
      <Resumen valor={resumen.hallazgos} label="Hallazgos 30 días" tono={resumen.hallazgos ? 'rojo' : 'verde'} />
      <Resumen valor={`${resumen.enFecha}%`} label="Ejecutados en fecha" tono={resumen.enFecha >= 90 ? 'verde' : resumen.enFecha >= 75 ? 'amarillo' : 'rojo'} />
    </div>

    <div className="tabs sgo-controles-nav" role="tablist" aria-label="Flujo de controles SGO">
      <button className={`tab ${seccion === 'agenda' ? 'active' : ''}`} onClick={() => { setSeccion('agenda'); setEstado('pendientes') }}>Pendientes y agenda</button>
      <button className={`tab ${seccion === 'programacion' ? 'active' : ''}`} onClick={() => { setSeccion('programacion'); setEstado('todos') }}>Programación</button>
      <button className={`tab ${seccion === 'kpi5s' ? 'active' : ''}`} onClick={() => setSeccion('kpi5s')}>KPI mensual 5S</button>
      <button className={`tab ${seccion === 'historial' ? 'active' : ''}`} onClick={() => setSeccion('historial')}>Informes e historial</button>
    </div>

    {seccion !== 'kpi5s' && <div className="card sgo-controles-filtros sgo-controles-filtros-unificados">
      <input className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar control, auditor, requisito o evidencia…" aria-label="Buscar controles SGO" />
      <select className="input" value={area} onChange={(e) => setArea(e.target.value as AreaSGOId | '')} aria-label="Filtrar por área"><option value="">Todas las áreas</option>{AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
      <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoControlSGO | '')} aria-label="Filtrar por tipo"><option value="">Todos los tipos</option>{TIPOS_CONTROL_SGO.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      <select className="input" value={responsable} onChange={(e) => setResponsable(e.target.value)} aria-label="Filtrar por responsable"><option value="">Todo el equipo</option>{responsables.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}</select>
      {seccion !== 'historial' ? <select className="input" value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)} aria-label="Filtrar por programación"><option value="pendientes">Controles activos</option><option value="vencido">Sólo vencidos</option><option value="hoy">Para hoy</option><option value="proximo">Próximos</option><option value="programado">Programados</option><option value="inactivo">Inactivos</option><option value="todos">Todos</option></select>
        : <select className="input" value={resultado} onChange={(e) => setResultado(e.target.value as ResultadoControlSGO | '')} aria-label="Filtrar por resultado"><option value="">Todos los resultados</option>{RESULTADOS_CONTROL_SGO.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}
    </div>}

    {seccion === 'programacion' && <div className="card sgo-control-programacion-toolbar">
      <div><strong>Programación de controles</strong><div className="meta">La agenda es visible para todo SGO. Solamente Lorenzo puede crear o modificar programaciones.</div></div>
      {lorenzo && <div className="row-actions"><button className="btn" onClick={() => setEditor(null)}>+ Control general</button><button className="btn" onClick={() => setProgramandoCampo(true)}>Programar área 5S</button><button className="btn" onClick={() => setAuditoriaEspecial(true)}>+ Auditoría especial</button></div>}
    </div>}

    {(seccion === 'agenda' || seccion === 'programacion') && <>
      <div className="section-title">{seccion === 'agenda' ? 'Pendientes y agenda' : 'Programación'} ({controlesVisibles.length})</div>
      {!controlesVisibles.length ? <div className="empty">No existen controles que coincidan con los filtros.</div> : <div className="sgo-controles-lista">
        {controlesVisibles.map((control) => <ControlCard key={control.id} control={control} hoy={hoy} seccion={seccion} lorenzo={lorenzo} ultima={ejecuciones.filter((e) => e.controlId === control.id).sort((a, b) => b.ejecutadoEn.localeCompare(a.ejecutadoEn))[0]} onRealizar={() => realizar(control)} onEditar={() => setEditor(control)} />)}
      </div>}
    </>}

    {seccion === 'kpi5s' && <TableroMensual5S ejecuciones={ejecuciones} periodo={periodo5S} onPeriodo={setPeriodo5S} />}

    {seccion === 'historial' && <>
      <div className="section-title">Informes e historial ({historial.length})</div>
      {!historial.length ? <div className="empty">Todavía no hay controles ejecutados con estos filtros.</div> : <div className="card sgo-controles-historial">
        {historial.map((ejecucion) => {
          const control = controles.find((item) => item.id === ejecucion.controlId)
          const auditoria = ejecucion.auditoriaCampo
          const hallazgos = auditoria?.respuestas.filter(respuestaEsHallazgo).length ?? 0
          return <div className="sgo-control-historial-fila" key={ejecucion.id}>
            {auditoria ? <span className={`sgo-campo-score score-${semaforoCampo(auditoria.porcentajeCumplimiento)}`}>{auditoria.porcentajeCumplimiento}%</span> : <span className={`sgo-resultado-dot resultado-${RESULTADO_CLASE[ejecucion.resultado]}`} />}
            <div><div className="sgo-control-titulo"><strong>{control?.titulo ?? 'Control histórico'}</strong><span className="sgo-control-tipo-chip">{control ? tipoLabel(control) : 'Histórico'}</span></div><div className="meta">{fechaHora(ejecucion.ejecutadoEn)} · {ejecucion.ejecutadoPor} · {resultadoLabel(ejecucion.resultado)}{auditoria ? ` · ${hallazgos} hallazgo(s)` : ''}{ejecucion.nroSerie ? ` · Serie ${ejecucion.nroSerie}` : ''}</div><div>{ejecucion.detalle}</div></div>
            <div className="row-actions">{ejecucion.eventoId && <button className="btn" onClick={() => onOpenEvento(ejecucion.eventoId!)}>Abrir expediente</button>}{auditoria && <button className="btn" onClick={() => setInformeCampo(ejecucion)}>Ver / Exportar</button>}</div>
          </div>
        })}
      </div>}
    </>}

    {editor !== undefined && <EditorControl registro={editor} usuario={usuario} onClose={() => setEditor(undefined)} />}
    {ejecutando && <EjecutarControl control={ejecutando} usuario={usuario} onClose={() => setEjecutando(undefined)} onOpenEvento={onOpenEvento} />}
    {ejecutandoCampo && <EjecutarControlCampo control={ejecutandoCampo} usuario={usuario} historial={historialCampo} onClose={() => setEjecutandoCampo(undefined)} />}
    {programandoCampo && <ProgramarControlCampo usuario={usuario} controles={controles.filter(esAuditoriaCampo)} onClose={() => setProgramandoCampo(false)} />}
    {auditoriaEspecial && <SolicitarAuditoriaEspecial usuario={usuario} onClose={() => setAuditoriaEspecial(false)} />}
    {informeCampo?.auditoriaCampo && <InformeControlCampo ejecucion={informeCampo} usuario={usuario} onUpdated={setInformeCampo} onClose={() => setInformeCampo(undefined)} />}
  </div>
}

function Resumen({ valor, label, tono }: { valor: number | string; label: string; tono: string }) {
  return <div className={`card sgo-control-resumen tono-${tono}`}><strong>{valor}</strong><span>{label}</span></div>
}

function TableroMensual5S({ ejecuciones, periodo, onPeriodo }: {
  ejecuciones: EjecucionControlSGO[]
  periodo: string
  onPeriodo: (periodo: string) => void
}) {
  const actual = useMemo(() => resumirMes5S(ejecuciones, periodo), [ejecuciones, periodo])
  const anterior = useMemo(() => resumirMes5S(ejecuciones, periodoAnterior5S(periodo)), [ejecuciones, periodo])
  const comparativo = useMemo(() => compararMeses5S(ejecuciones, periodo).sort(ordenComparativo5S), [ejecuciones, periodo])
  const generalActual = promedioGeneralAreas5S(actual, 'promedioPremiable')
  const generalAnterior = promedioGeneralAreas5S(anterior, 'promedioPremiable')
  const variacionGeneral = generalActual !== undefined && generalAnterior !== undefined
    ? Math.round((generalActual - generalAnterior) * 10) / 10 : undefined
  const totalAuditorias = actual.reduce((total, resumen) => total + resumen.auditorias, 0)
  const areasConMejora = comparativo.filter((fila) => (fila.variacionPremiable ?? 0) > 0).length
  const periodoLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(`${periodo}-01T12:00:00`))

  return <section className="sgo-kpi-5s">
    <div className="card sgo-kpi-5s-cabecera">
      <div><div className="section-title">RESULTADO MENSUAL 5S</div><div className="meta">Promedio de todas las auditorías del mes por área. La variación se expresa en puntos porcentuales (pp).</div></div>
      <div className="field"><label>Mes analizado</label><input className="input" type="month" value={periodo} onChange={(e) => onPeriodo(e.target.value)} /></div>
    </div>
    <div className="sgo-controles-resumen sgo-kpi-5s-resumen">
      <Resumen valor={generalActual === undefined ? 'Sin datos' : `${generalActual}%`} label={`Promedio premiable · ${periodoLabel}`} tono={tonoPuntaje5S(generalActual)} />
      <Resumen valor={generalAnterior === undefined ? 'Sin datos' : `${generalAnterior}%`} label="Promedio mes anterior" tono={tonoPuntaje5S(generalAnterior)} />
      <Resumen valor={variacionGeneral === undefined ? 'Sin comparación' : `${variacionGeneral > 0 ? '+' : ''}${variacionGeneral} pp`} label="Variación mensual" tono={variacionGeneral === undefined ? 'azul' : variacionGeneral > 0 ? 'verde' : variacionGeneral < 0 ? 'rojo' : 'amarillo'} />
      <Resumen valor={totalAuditorias} label="Auditorías del mes" tono="azul" />
      <Resumen valor={`${actual.length}/${comparativo.length}`} label="Áreas auditadas" tono={actual.length === comparativo.length ? 'verde' : 'amarillo'} />
      <Resumen valor={areasConMejora} label="Áreas que mejoraron" tono="verde" />
    </div>
    <div className="card sgo-kpi-5s-tabla-wrap">
      <div className="sgo-kpi-5s-leyenda"><strong>Detalle por área</strong><span><i className="sgo-kpi-dot fisico" /> Físico observado</span><span><i className="sgo-kpi-dot premiable" /> Premiable luego de revisiones aprobadas</span></div>
      <table className="sgo-kpi-5s-tabla">
        <thead><tr><th>Área</th><th>Responsable</th><th>Auditorías</th><th>Físico</th><th>Premiable</th><th>Mes anterior</th><th>Variación</th><th>Estado</th></tr></thead>
        <tbody>{comparativo.map((fila) => <FilaKPI5S key={fila.areaId} fila={fila} />)}</tbody>
      </table>
    </div>
    <div className="meta sgo-kpi-5s-nota">El promedio general pondera a todas las áreas por igual. Las auditorías especiales también integran el promedio del mes.</div>
  </section>
}

function ordenComparativo5S(a: ComparativoMensualArea5S, b: ComparativoMensualArea5S) {
  if (!a.actual && b.actual) return -1
  if (a.actual && !b.actual) return 1
  return (a.actual?.promedioPremiable ?? 101) - (b.actual?.promedioPremiable ?? 101)
}

function responsableArea5S(areaId: AreaSGOId): string {
  if (AREAS_5S_POR_AUDITOR.lara.includes(areaId)) return 'Lara'
  if (AREAS_5S_POR_AUDITOR.nicolas.includes(areaId)) return 'Nicolás'
  return 'Azul'
}

function tonoPuntaje5S(valor?: number): string {
  if (valor === undefined) return 'azul'
  return valor >= 90 ? 'verde' : valor >= 75 ? 'amarillo' : 'rojo'
}

function FilaKPI5S({ fila }: { fila: ComparativoMensualArea5S }) {
  const variacion = fila.variacionPremiable
  const tendencia = variacion === undefined ? 'sin-comparacion' : variacion > 0 ? 'sube' : variacion < 0 ? 'baja' : 'igual'
  return <tr className={!fila.actual ? 'sin-datos' : ''}>
    <td><strong>{areaSGOLabel(fila.areaId)}</strong></td>
    <td>{responsableArea5S(fila.areaId)}</td>
    <td>{fila.actual?.auditorias ?? 0}</td>
    <td>{fila.actual ? `${fila.actual.promedioFisico}%` : 'Sin datos'}</td>
    <td><strong>{fila.actual ? `${fila.actual.promedioPremiable}%` : 'Sin datos'}</strong></td>
    <td>{fila.anterior ? `${fila.anterior.promedioPremiable}%` : 'Sin datos'}</td>
    <td><span className={`sgo-kpi-tendencia ${tendencia}`}>{variacion === undefined ? '—' : `${variacion > 0 ? '▲ +' : variacion < 0 ? '▼ ' : '= '}${variacion} pp`}</span></td>
    <td>{fila.actual ? <span className={`estado-chip score-${semaforoCampo(fila.actual.promedioPremiable)}`}>{fila.actual.promedioPremiable >= 90 ? 'Conforme' : fila.actual.promedioPremiable >= 75 ? 'En alerta' : 'Fuera de meta'}</span> : <span className="estado-chip">Pendiente de auditar</span>}</td>
  </tr>
}

function ControlCard({ control, ultima, hoy, seccion, lorenzo, onRealizar, onEditar }: {
  control: ControlProgramadoSGO
  ultima?: EjecucionControlSGO
  hoy: string
  seccion: 'agenda' | 'programacion'
  lorenzo: boolean
  onRealizar: () => void
  onEditar: () => void
}) {
  const programacion = estadoProgramacionControl(control, hoy)
  const estado = ESTADOS[programacion]
  return <article className={`card sgo-control-card control-${estado.clase}`}>
    <div className="sgo-control-card-principal">
      <div className="sgo-control-fecha"><strong>{control.proximaFecha.slice(8, 10)}</strong><span>{new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(new Date(`${control.proximaFecha}T12:00:00`))}</span></div>
      <div><div className="sgo-control-titulo"><strong>{control.titulo}</strong><span className={`estado-chip control-chip-${estado.clase}`}>{estado.label}</span></div><div className="sgo-control-etiquetas"><span className="sgo-control-tipo-chip">{tipoLabel(control)}</span>{control.frecuencia === 'unico' && <span className="sgo-control-tipo-chip especial">Especial</span>}</div><div className="meta">{areaSGOLabel(control.areaId)} · {frecuenciaLabel(control.frecuencia)} · Responsable: <strong>{control.responsable}</strong> · Próximo: {fechaLarga(control.proximaFecha)}</div><p>{control.instrucciones}</p>{ultima && <div className="meta">Último control: {fechaHora(ultima.ejecutadoEn)} · <strong>{resultadoLabel(ultima.resultado)}</strong> · {ultima.ejecutadoPor}</div>}</div>
    </div>
    <div className="row-actions">{seccion === 'programacion' && lorenzo && <button className="btn" onClick={onEditar}>Editar programación</button>}{seccion === 'agenda' && control.activo && <button className="btn btn-primary" onClick={onRealizar}>Realizar</button>}</div>
  </article>
}
