import { useState } from 'react'
import { detalleKPIAutomatico, type DatosKPIAutomaticos, type RegistroDetalleKPI } from '../../sgo/kpiAutomaticos'
import { estadoIndicador, periodoKPILabel, type EstadoSemaforo, type IndicadorSGO } from '../../sgo/indicadores'
import { AREAS_SGO, PILARES_SGO, type AccionSGO, type AreaSGOId, type EventoSGO, type PilarSGO } from '../../sgo/types'
import { eliminarIndicadorSGO } from '../../sync/syncEngine'
import { fechaLocalISO, sumarDiasLocalISO } from '../../lib/time'
import { estadoProgramacionControl, type ControlProgramadoSGO } from '../../sgo/controles'
import { usuarioEsLorenzo } from '../../sgo/permisos'
import { accionPendiente, comparacionIndicador, diasAtraso, evidenciaIndicador, evolucionIndicador, indicadorEnPeriodo, ordenarAcciones } from '../../sgo/fichaGestion'
import { abrirInformeFicha } from './InformeFichaSGO'
import './fichaGestion.css'

const PALETA: Record<EstadoSemaforo, { color: string; fondo: string; label: string }> = {
  verde: { color: '#15803d', fondo: '#dcfce7', label: 'Conforme' },
  amarillo: { color: '#b45309', fondo: '#fef3c7', label: 'En alerta' },
  rojo: { color: '#dc2626', fondo: '#fee2e2', label: 'Fuera de meta' },
  sin_dato: { color: '#64748b', fondo: '#f1f5f9', label: 'Sin datos' },
}
const formatoValor = (valor: number | undefined, unidad: string) => valor === undefined ? 'Sin datos' : `${valor.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${unidad}`
const formatoFecha = (fecha?: string) => fecha ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' }).format(new Date(`${fecha.slice(0, 10)}T12:00:00`)) : '—'
const accionVencida = (a: AccionSGO) => accionPendiente(a) && diasAtraso(a.fechaCompromiso) > 0

export default function FichaCeldaSGO({ areaId, pilarId, indicadores, eventos, acciones, controles, datos, usuario, onClose, onFiltrarEventos, onOpenEvento, onOpenControl }: {
  areaId: AreaSGOId; pilarId: PilarSGO; indicadores: IndicadorSGO[]; eventos: EventoSGO[]; acciones: AccionSGO[]
  controles: ControlProgramadoSGO[]; datos: DatosKPIAutomaticos; usuario: string
  onClose: () => void; onFiltrarEventos: () => void; onOpenEvento: (id: string) => void; onOpenControl: (id?: string) => void
}) {
  const [vista, setVista] = useState<'resumen' | 'pendientes' | 'historial'>('resumen')
  const [filtro, setFiltro] = useState<'todos' | 'vencidas' | 'proximas' | 'eventos' | 'controles'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [error, setError] = useState('')
  const area = AREAS_SGO.find(a => a.id === areaId)!
  const pilar = PILARES_SGO.find(p => p.id === pilarId)!
  const originales = indicadores.filter(i => i.activo && i.areaId === areaId && i.pilar === pilarId)
  const kpis = originales.map(i => periodo ? indicadorEnPeriodo(i, periodo, datos) : i)
  const eventosCelda = eventos.filter(e => (e.areaOrigenId ?? e.areaId) === areaId && e.pilar === pilarId)
  const abiertos = eventosCelda.filter(e => e.estado !== 'cerrado')
  const ids = new Set(eventosCelda.map(e => e.id))
  const accionesCelda = acciones.filter(a => ids.has(a.eventoId))
  const pendientes = ordenarAcciones(accionesCelda.filter(accionPendiente), eventosCelda)
  const vencidas = pendientes.filter(accionVencida)
  const hoy = fechaLocalISO()
  const proximas = pendientes.filter(a => a.fechaCompromiso >= hoy && a.fechaCompromiso <= sumarDiasLocalISO(7))
  const controlesCelda = controles.filter(c => c.activo && c.areaId === areaId && c.pilar === pilarId).sort((a, b) => a.proximaFecha.localeCompare(b.proximaFecha))
  const controlesVencidos = controlesCelda.filter(c => estadoProgramacionControl(c) === 'vencido')
  const criticos = abiertos.filter(e => ['alta', 'critica'].includes(e.severidad))
  const q = busqueda.trim().toLocaleLowerCase('es')
  const coincide = (...textos: (string | undefined)[]) => !q || textos.some(t => t?.toLocaleLowerCase('es').includes(q))
  const irPendientes = (f: typeof filtro) => { setFiltro(f); setBusqueda(''); setVista('pendientes') }
  const exportar = (completo: boolean) => {
    setError('')
    try {
      if (!abrirInformeFicha({ area: area.label, pilar: pilar.label, periodo: periodo ? periodoKPILabel(periodo) : 'Período configurado en cada KPI',
        emitido: new Date().toLocaleString('es-AR'), kpis, acciones: pendientes, eventos: eventosCelda, controles: controlesCelda, datos }, completo))
        setError('El navegador bloqueó la ventana del informe. Permití ventanas emergentes para esta PWA y volvé a exportar.')
    } catch { setError('No se pudo generar el informe. Los datos siguen disponibles; intentá nuevamente.') }
  }
  const tablaAcciones = (lista: AccionSGO[]) => lista.length ? <div className="sgo-fg-tabla"><table><thead><tr><th>Acción / expediente</th><th>Responsable</th><th>Compromiso</th><th>Estado / atraso</th><th></th></tr></thead><tbody>{lista.map(a => {
    const e = eventosCelda.find(e => e.id === a.eventoId)
    return <tr key={a.id}><td><strong>{a.descripcion}</strong><small>{e?.codigo} · Riesgo {e?.severidad}</small></td><td>{a.responsable || 'Sin asignar'}</td><td>{formatoFecha(a.fechaCompromiso)}</td><td><span className={accionVencida(a) ? 'sgo-fg-rojo' : ''}>{a.estado.replaceAll('_', ' ')}{accionVencida(a) && ` · ${diasAtraso(a.fechaCompromiso)} días de atraso`}</span></td><td><button className="btn" onClick={() => onOpenEvento(a.eventoId)}>Abrir expediente</button></td></tr>
  })}</tbody></table></div> : <p className="meta">No hay acciones para este filtro.</p>
  const listaEventos = (lista: EventoSGO[]) => lista.length ? lista.map(e => <button key={e.id} className="sgo-fg-evento" onClick={() => onOpenEvento(e.id)}><strong>{e.codigo} · {e.titulo}</strong><span>{e.estado.replaceAll('_', ' ')} · Riesgo {e.severidad} · {e.responsable || 'Sin asignar'} · {formatoFecha(e.detectadoEn)}</span></button>) : <p className="meta">Sin expedientes para este filtro.</p>
  return <div className="modal-overlay sgo-fg-overlay">
    <div className="modal sgo-fg" role="dialog" aria-modal="true" aria-labelledby="sgo-fg-titulo">
      <header className="sgo-fg-header">
        <div><small>FICHA DE GESTIÓN · {pilar.label}</small><h2 id="sgo-fg-titulo">{area.label}</h2><span className="meta">Resultados por período · Pendientes actuales acumulados</span></div>
        <div className="row-actions"><details className="sgo-fg-export"><summary className="btn btn-primary">Exportar PDF</summary><div><button className="btn" onClick={() => exportar(false)}>Resumen para reunión</button><button className="btn" onClick={() => exportar(true)}>Informe detallado con referencias</button></div></details><button className="btn" onClick={onClose} aria-label="Cerrar ficha">×</button></div>
      </header>
      <div className="sgo-fg-body">
        {error && <p role="alert" className="sgo-fg-alerta">{error}</p>}
        <div className="sgo-fg-alerta"><strong>{vencidas.length || controlesVencidos.length || criticos.length ? 'Requiere atención' : abiertos.length ? 'Seguimiento en curso' : 'Sin pendientes críticos registrados'}</strong><span>{vencidas.length} acciones vencidas · {criticos.length} eventos de riesgo alto/crítico · {controlesVencidos.length} controles vencidos. Un KPI conforme no implica que los pendientes estén resueltos.</span></div>
        <div className="sgo-fg-metricas">
          <button onClick={() => irPendientes('vencidas')}><b>{vencidas.length}</b>Acciones vencidas</button>
          <button onClick={() => irPendientes('proximas')}><b>{proximas.length}</b>Compromisos a 7 días</button>
          <button onClick={() => irPendientes('eventos')}><b>{abiertos.length}</b>Eventos abiertos</button>
          <button onClick={() => irPendientes('controles')}><b>{controlesVencidos.length}</b>Controles vencidos</button>
        </div>
        <nav className="sgo-fg-nav" aria-label="Secciones de la ficha">{(['resumen', 'pendientes', 'historial'] as const).map(v => <button className={vista === v ? 'btn btn-primary' : 'btn'} aria-pressed={vista === v} key={v} onClick={() => setVista(v)}>{v === 'resumen' ? 'Resumen' : v === 'pendientes' ? 'Pendientes' : 'Historial y evidencias'}</button>)}</nav>
        {vista === 'resumen' && <>
          <h3>Qué requiere atención</h3>{tablaAcciones(pendientes.slice(0, 5))}
          {pendientes.length > 5 && <button className="btn" onClick={() => irPendientes('todos')}>Ver las {pendientes.length} acciones pendientes</button>}
          {!!criticos.length && <details><summary>Eventos de riesgo alto/crítico ({criticos.length})</summary>{listaEventos(criticos)}</details>}
          <div className="sgo-fg-periodo"><h3>Resultados y tendencia</h3><label>Consultar mes <input className="input" type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} /></label>{periodo && <button className="btn" onClick={() => setPeriodo('')}>Volver a períodos configurados</button>}</div>
          <p className="meta">Las comparaciones respetan la frecuencia de cada KPI. Cambiar el mes no oculta pendientes anteriores.</p>
          <div className="sgo-fg-indicadores">{kpis.map(k => <DetalleIndicador key={k.id} indicador={k} datos={datos} usuario={usuario} />)}</div>
          {!kpis.length && <p className="meta">Sin indicadores configurados. Los pendientes siguen visibles.</p>}
          {!controlesCelda.length && <p className="meta">Sin controles programados activos para esta área y pilar.</p>}
        </>}
        {vista === 'pendientes' && <>
          <div className="sgo-fg-filtros"><input className="input" aria-label="Buscar pendiente o responsable" placeholder="Buscar acción, expediente o responsable…" value={busqueda} onChange={e => setBusqueda(e.target.value)} /><select className="input" aria-label="Tipo de pendiente" value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)}><option value="todos">Todas las acciones pendientes</option><option value="vencidas">Acciones vencidas</option><option value="proximas">Compromisos a 7 días</option><option value="eventos">Eventos abiertos</option><option value="controles">Controles programados</option></select></div>
          {['todos', 'vencidas', 'proximas'].includes(filtro) && tablaAcciones((filtro === 'vencidas' ? vencidas : filtro === 'proximas' ? proximas : pendientes).filter(a => coincide(a.descripcion, a.responsable, eventosCelda.find(e => e.id === a.eventoId)?.codigo)))}
          {filtro === 'eventos' && listaEventos(abiertos.filter(e => coincide(e.titulo, e.codigo, e.responsable)))}
          {filtro === 'controles' && <>{controlesCelda.filter(c => coincide(c.titulo, c.responsable)).map(c => <button key={c.id} className="sgo-fg-evento" onClick={() => onOpenControl(c.id)}><strong>{c.titulo}</strong><span>{c.responsable} · {formatoFecha(c.proximaFecha)} · {estadoProgramacionControl(c)}</span></button>)}{!controlesCelda.length && <p className="meta">Sin controles activos.</p>}</>}
          <button className="btn" onClick={onFiltrarEventos}>Ir al listado general de esta área y pilar</button>
        </>}
        {vista === 'historial' && <>
          <h3>Expedientes cerrados</h3><p className="meta">Historial acumulado de esta área y pilar.</p>{listaEventos(eventosCelda.filter(e => e.estado === 'cerrado').sort((a, b) => (b.cerradoEn ?? '').localeCompare(a.cerradoEn ?? '')))}
          <details><summary>Acciones verificadas o canceladas ({accionesCelda.filter(a => !accionPendiente(a)).length})</summary>{tablaAcciones(accionesCelda.filter(a => !accionPendiente(a)))}</details>
          <h3>Fuentes de los KPI consultados</h3>{kpis.map(k => <section className="card" key={k.id}><strong>{k.nombre} · {periodoKPILabel(k.periodo, k.frecuencia)}</strong><p className="meta">{evidenciaIndicador(k, datos)}</p><Registros registros={detalleKPIAutomatico(k, datos).registros} /></section>)}
        </>}
      </div>
    </div>
  </div>
}

function DetalleIndicador({ indicador, datos, usuario }: { indicador: IndicadorSGO; datos: DatosKPIAutomaticos; usuario: string }) {
  const estado = estadoIndicador(indicador)
  const paleta = PALETA[estado]
  const detalle = detalleKPIAutomatico(indicador, datos)
  const comparacion = comparacionIndicador(indicador, datos)
  const puedeEliminar = usuarioEsLorenzo(usuario)
  async function eliminar() {
    if (!puedeEliminar || !window.confirm(`¿Eliminar definitivamente el indicador "${indicador.nombre}"?`)) return
    await eliminarIndicadorSGO(indicador, usuario)
  }
  return <div className="card" style={{ borderLeft: `5px solid ${paleta.color}` }}>
    <div className="card-header">
      <div>
        <strong>{indicador.nombre}</strong>
        <div className="meta">{indicador.origen === 'automatico' ? '⚡ Cálculo automático' : 'Carga manual'} · {periodoKPILabel(indicador.periodo, indicador.frecuencia)}</div>
      </div>
      <div className="row-actions no-print">
        <span className="estado-chip" style={{ color: paleta.color, background: paleta.fondo }}>{paleta.label}</span>
        {puedeEliminar && <details><summary aria-label="Opciones del indicador">Opciones</summary><button className="btn" style={{ color: '#fca5a5' }} onClick={() => void eliminar()}>Eliminar KPI</button></details>}
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 8, marginTop: 10 }}>
      <Dato label="Resultado" valor={formatoValor(indicador.valorActual, indicador.unidad)} destacado />
      <Dato label="Meta verde" valor={formatoValor(indicador.meta, indicador.unidad)} />
      <Dato label="Umbral amarillo" valor={formatoValor(indicador.umbralAmarillo, indicador.unidad)} />
      <Dato label="Período anterior" valor={formatoValor(comparacion.anterior, indicador.unidad)} />
    </div>
    <p className={comparacion.mejora === true ? 'sgo-fg-mejora' : comparacion.mejora === false ? 'sgo-fg-rojo' : 'meta'}>{comparacion.diferencia === undefined ? 'Sin comparación disponible con el período anterior.' : `${comparacion.diferencia > 0 ? '+' : ''}${formatoValor(comparacion.diferencia, indicador.unidad === '%' ? 'puntos porcentuales' : indicador.unidad)} vs período anterior · ${comparacion.diferencia === 0 ? 'Sin variación' : comparacion.mejora ? 'Mejora' : 'Retroceso'}`}</p>
    <p className="meta">{evidenciaIndicador(indicador, datos)}</p>
    <Evolucion valores={evolucionIndicador(indicador, datos)} unidad={indicador.unidad} meta={indicador.meta} />
    <details style={{ marginTop: 12 }}><summary>Cómo se calcula y registros fuente</summary><p className="meta">{detalle.formula}</p><Registros registros={detalle.registros} /></details>
  </div>
}

function Dato({ label, valor, destacado = false }: { label: string; valor: string; destacado?: boolean }) {
  return <div style={{ padding: 8, border: '1px solid var(--borde)', borderRadius: 7 }}><div className="meta">{label}</div><strong style={{ fontSize: destacado ? '1.2rem' : undefined }}>{valor}</strong></div>
}

function Evolucion({ valores, unidad, meta }: { valores: { periodo: string; etiqueta: string; valor?: number }[]; unidad: string; meta: number }) {
  const disponibles = valores.flatMap((v) => v.valor === undefined ? [] : [v.valor])
  const maximo = Math.max(1, meta, ...disponibles)
  return <div style={{ marginTop: 12 }}>
    <strong>Evolución histórica</strong>
    <div className="sgo-fg-historico">
      <div className="sgo-fg-meta-linea" style={{ bottom: 22 + Math.max(0, meta / maximo * 85) }}><span>Meta {formatoValor(meta, unidad)}</span></div>
      {valores.map((v) => {
        const alto = v.valor === undefined ? 4 : Math.max(6, Math.round(v.valor / maximo * 85))
        return <div key={v.periodo} title={`${v.periodo}: ${formatoValor(v.valor, unidad)}`} style={{ flex: 1, minWidth: 42, textAlign: 'center' }}>
          <div className="meta" style={{ fontSize: '.64rem' }}>{v.valor === undefined ? '—' : v.valor.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</div>
          <div style={{ height: alto, maxWidth: 44, margin: '3px auto 0', background: v.valor === undefined ? '#cbd5e1' : '#2563eb', borderRadius: '5px 5px 0 0' }} />
          <div className="meta" style={{ fontSize: '.61rem', whiteSpace: 'nowrap' }}>{v.etiqueta}</div>
        </div>
      })}
    </div>
  </div>
}

function Registros({ registros }: { registros: RegistroDetalleKPI[] }) {
  if (!registros.length) return <div className="meta" style={{ marginTop: 10 }}>No existen registros fuente para el período seleccionado.</div>
  const ordenados = [...registros].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  return <details style={{ marginTop: 12 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Ver registros fuente ({registros.length})</summary>
    <div style={{ overflow: 'auto', marginTop: 8 }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
      <thead><tr><th style={{ textAlign: 'left' }}>Fecha</th><th style={{ textAlign: 'left' }}>Referencia</th><th style={{ textAlign: 'left' }}>Detalle</th><th>Resultado</th></tr></thead>
      <tbody>{ordenados.slice(0, 100).map((r) => <tr key={`${r.id}-${r.fecha ?? ''}`}>
        <td>{formatoFecha(r.fecha)}</td><td><strong>{r.referencia}</strong></td><td>{r.detalle}</td><td style={{ textAlign: 'center' }}><span className="estado-chip" style={{ color: r.resultado === 'cumple' ? '#15803d' : r.resultado === 'no_cumple' ? '#dc2626' : '#475569' }}>{r.resultado === 'cumple' ? 'Cumple' : r.resultado === 'no_cumple' ? 'No cumple' : 'Informativo'}</span></td>
      </tr>)}</tbody>
    </table>{ordenados.length > 100 && <div className="meta">Se muestran los 100 registros más recientes de {ordenados.length}.</div>}</div>
  </details>
}
