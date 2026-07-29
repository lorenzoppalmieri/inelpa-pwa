import { detalleKPIAutomatico, type DatosKPIAutomaticos, type RegistroDetalleKPI } from '../../sgo/kpiAutomaticos'
import { estadoIndicador, type EstadoSemaforo, type IndicadorSGO } from '../../sgo/indicadores'
import { AREAS_SGO, PILARES_SGO, type AccionSGO, type AreaSGOId, type EventoSGO, type PilarSGO } from '../../sgo/types'

const PALETA: Record<EstadoSemaforo, { color: string; fondo: string; label: string }> = {
  verde: { color: '#15803d', fondo: '#dcfce7', label: 'Conforme' },
  amarillo: { color: '#b45309', fondo: '#fef3c7', label: 'En alerta' },
  rojo: { color: '#dc2626', fondo: '#fee2e2', label: 'Fuera de meta' },
  sin_dato: { color: '#64748b', fondo: '#f1f5f9', label: 'Sin datos' },
}

const formatoValor = (valor: number | undefined, unidad: string) => valor === undefined
  ? 'Sin datos'
  : `${valor.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${unidad}`

const formatoFecha = (fecha?: string) => fecha
  ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' }).format(new Date(`${fecha.slice(0, 10)}T12:00:00`))
  : '—'

function accionVencida(a: AccionSGO) {
  return !['verificada', 'cancelada'].includes(a.estado) && a.fechaCompromiso < new Date().toISOString().slice(0, 10)
}

export default function FichaCeldaSGO({ areaId, pilarId, indicadores, eventos, acciones, datos, onClose, onFiltrarEventos, onOpenEvento }: {
  areaId: AreaSGOId
  pilarId: PilarSGO
  indicadores: IndicadorSGO[]
  eventos: EventoSGO[]
  acciones: AccionSGO[]
  datos: DatosKPIAutomaticos
  onClose: () => void
  onFiltrarEventos: () => void
  onOpenEvento: (id: string) => void
}) {
  const area = AREAS_SGO.find((a) => a.id === areaId)!
  const pilar = PILARES_SGO.find((p) => p.id === pilarId)!
  const kpis = indicadores.filter((i) => i.activo && i.areaId === areaId && i.pilar === pilarId)
  const eventosCelda = eventos.filter((e) => (e.areaOrigenId ?? e.areaId) === areaId && e.pilar === pilarId)
  const abiertos = eventosCelda.filter((e) => e.estado !== 'cerrado')
  const ids = new Set(eventosCelda.map((e) => e.id))
  const accionesCelda = acciones.filter((a) => ids.has(a.eventoId))
  const vencidas = accionesCelda.filter(accionVencida)

  return <div className="modal-overlay" onClick={onClose}>
    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1100, width: '97%', maxHeight: '95vh', overflow: 'auto' }}>
      <div className="card-header" style={{ borderBottom: `4px solid ${pilar.color}`, paddingBottom: 10 }}>
        <div>
          <div className="section-title" style={{ margin: 0 }}>Ficha de gestión · {area.label}</div>
          <div className="meta">Pilar: <strong>{pilar.label}</strong> · información trazable a los registros operativos</div>
        </div>
        <button className="btn" onClick={onClose}>×</button>
      </div>

      <div className="logi-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', marginTop: 14 }}>
        <div className="logi-kpi"><div className="n">{kpis.length}</div><div className="l">KPI activos</div></div>
        <div className="logi-kpi"><div className="n">{abiertos.length}</div><div className="l">Eventos abiertos</div></div>
        <div className="logi-kpi"><div className="n">{accionesCelda.length}</div><div className="l">Acciones</div></div>
        <div className="logi-kpi" style={{ borderTop: vencidas.length ? '4px solid #dc2626' : undefined }}><div className="n">{vencidas.length}</div><div className="l">Acciones vencidas</div></div>
      </div>

      <div className="section-title">Indicadores y explicación del resultado</div>
      {kpis.length === 0 ? <div className="empty">Esta celda todavía no tiene indicadores configurados. Los eventos y acciones igualmente afectan su semáforo.</div> :
        <div style={{ display: 'grid', gap: 12 }}>
          {kpis.map((kpi) => <DetalleIndicador key={kpi.id} indicador={kpi} datos={datos} />)}
        </div>}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div className="section-title" style={{ margin: 0 }}>Eventos y acciones que impactan la celda</div>
          <button className="btn" onClick={onFiltrarEventos}>Ver en el listado</button>
        </div>
        {eventosCelda.length === 0 ? <div className="empty">No hay eventos registrados para esta área y pilar.</div> :
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {[...eventosCelda].sort((a, b) => b.detectadoEn.localeCompare(a.detectadoEn)).map((evento) => {
              const acc = accionesCelda.filter((a) => a.eventoId === evento.id)
              return <button key={evento.id} className="card" onClick={() => onOpenEvento(evento.id)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', borderLeft: `4px solid ${evento.estado === 'cerrado' ? '#94a3b8' : pilar.color}` }}>
                <div className="card-header"><strong>{evento.codigo} · {evento.titulo}</strong><span className="estado-chip">{evento.estado.replace('_', ' ')}</span></div>
                <div className="meta">{formatoFecha(evento.detectadoEn)} · Severidad {evento.severidad} · Responsable: {evento.responsable || 'Sin asignar'} · {acc.length} acción(es), {acc.filter(accionVencida).length} vencida(s)</div>
              </button>
            })}
          </div>}
      </div>
    </div>
  </div>
}

function DetalleIndicador({ indicador, datos }: { indicador: IndicadorSGO; datos: DatosKPIAutomaticos }) {
  const estado = estadoIndicador(indicador)
  const paleta = PALETA[estado]
  const detalle = detalleKPIAutomatico(indicador, datos)
  return <div className="card" style={{ borderLeft: `5px solid ${paleta.color}` }}>
    <div className="card-header">
      <div>
        <strong>{indicador.nombre}</strong>
        <div className="meta">{indicador.origen === 'automatico' ? '⚡ Cálculo automático' : 'Carga manual'} · Período {indicador.periodo}</div>
      </div>
      <span className="estado-chip" style={{ color: paleta.color, background: paleta.fondo }}>{paleta.label}</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 8, marginTop: 10 }}>
      <Dato label="Resultado" valor={formatoValor(indicador.valorActual, indicador.unidad)} destacado />
      <Dato label="Meta verde" valor={formatoValor(indicador.meta, indicador.unidad)} />
      <Dato label="Umbral amarillo" valor={formatoValor(indicador.umbralAmarillo, indicador.unidad)} />
      <Dato label="Evidencia" valor={detalle.denominador !== undefined ? `${detalle.numerador ?? 0} de ${detalle.denominador}` : detalle.numerador !== undefined ? detalle.numerador.toLocaleString('es-AR') : 'No disponible'} />
    </div>
    <div style={{ marginTop: 10, padding: 9, background: 'var(--bg)', borderRadius: 7 }}><strong>Fórmula:</strong> {detalle.formula}</div>
    <Evolucion valores={detalle.evolucion} unidad={indicador.unidad} meta={indicador.meta} />
    <Registros registros={detalle.registros} />
  </div>
}

function Dato({ label, valor, destacado = false }: { label: string; valor: string; destacado?: boolean }) {
  return <div style={{ padding: 8, border: '1px solid var(--borde)', borderRadius: 7 }}><div className="meta">{label}</div><strong style={{ fontSize: destacado ? '1.2rem' : undefined }}>{valor}</strong></div>
}

function Evolucion({ valores, unidad, meta }: { valores: { periodo: string; valor?: number }[]; unidad: string; meta: number }) {
  const disponibles = valores.flatMap((v) => v.valor === undefined ? [] : [v.valor])
  const maximo = Math.max(1, meta, ...disponibles)
  return <div style={{ marginTop: 12 }}>
    <strong>Evolución mensual</strong>
    <div style={{ display: 'flex', alignItems: 'end', gap: 8, height: 120, marginTop: 8, borderBottom: '1px solid var(--borde)', padding: '0 6px' }}>
      {valores.map((v) => {
        const alto = v.valor === undefined ? 4 : Math.max(6, Math.round(v.valor / maximo * 85))
        return <div key={v.periodo} title={`${v.periodo}: ${formatoValor(v.valor, unidad)}`} style={{ flex: 1, minWidth: 42, textAlign: 'center' }}>
          <div className="meta" style={{ fontSize: '.64rem' }}>{v.valor === undefined ? '—' : v.valor.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</div>
          <div style={{ height: alto, maxWidth: 44, margin: '3px auto 0', background: v.valor === undefined ? '#cbd5e1' : '#2563eb', borderRadius: '5px 5px 0 0' }} />
          <div className="meta" style={{ fontSize: '.61rem', whiteSpace: 'nowrap' }}>{v.periodo.slice(5)}/{v.periodo.slice(2, 4)}</div>
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
