import { useMemo, useState } from 'react'
import { fechaLocalISO } from '../../lib/time'
import { estadoIndicador, type EstadoSemaforo, type IndicadorSGO } from '../../sgo/indicadores'
import { AREAS_SGO, PILARES_SGO, type AccionSGO, type AreaSGOId, type EventoSGO, type PilarSGO } from '../../sgo/types'

type EstadoCelda = EstadoSemaforo

interface CeldaMatriz {
  areaId: AreaSGOId
  pilarId: PilarSGO
  estado: EstadoCelda
  eventos: EventoSGO[]
  vencidas: number
  criticos: number
  kpis: IndicadorSGO[]
  principal?: IndicadorSGO
}

const ESTADOS: Record<EstadoCelda, { label: string; corto: string; icono: string }> = {
  rojo: { label: 'Requiere intervención', corto: 'Crítico', icono: '!' },
  amarillo: { label: 'Requiere seguimiento', corto: 'Alerta', icono: '●' },
  verde: { label: 'Desempeño conforme', corto: 'Conforme', icono: '✓' },
  sin_dato: { label: 'Falta configurar o medir', corto: 'Sin datos', icono: '—' },
}

const GRUPOS: { id: string; label: string; areas: AreaSGOId[] }[] = [
  { id: 'operacion', label: 'Operación productiva', areas: ['bobinado_rural','bobinado_distribucion','montaje_distribucion','montaje_rural','herreria_pintura','laminado','laboratorio'] },
  { id: 'soporte', label: 'Servicios y soporte', areas: ['logistica_operativa','logistica_administrativa','mantenimiento','automatismo','it'] },
  { id: 'gestion', label: 'Gestión y dirección', areas: ['administracion','planificacion_produccion','diseno','gerencia_directorio'] },
]

function accionVencida(a: AccionSGO) {
  return !['verificada', 'cancelada'].includes(a.estado) && a.fechaCompromiso < fechaLocalISO()
}

export function construirCelda(areaId: AreaSGOId, pilarId: PilarSGO, eventos: EventoSGO[], acciones: AccionSGO[], indicadores: IndicadorSGO[]): CeldaMatriz {
  const abiertos = eventos.filter((e) => e.estado !== 'cerrado' && (e.areaOrigenId ?? e.areaId) === areaId && e.pilar === pilarId)
  const ids = new Set(abiertos.map((e) => e.id))
  const vencidas = acciones.filter((a) => ids.has(a.eventoId) && accionVencida(a)).length
  const criticos = abiertos.filter((e) => ['alta', 'critica'].includes(e.severidad)).length
  const kpis = indicadores.filter((i) => i.activo && i.areaId === areaId && i.pilar === pilarId)
  const estados = kpis.map(estadoIndicador)
  const kpiRojo = estados.includes('rojo')
  const kpiAmarillo = estados.includes('amarillo')
  const kpiSinDato = kpis.length === 0 || estados.includes('sin_dato')
  const estado: EstadoCelda = vencidas || criticos || kpiRojo ? 'rojo'
    : abiertos.length || kpiAmarillo ? 'amarillo'
      : kpiSinDato ? 'sin_dato' : 'verde'
  const rango: Record<EstadoCelda, number> = { rojo: 3, amarillo: 2, sin_dato: 1, verde: 0 }
  const principal = [...kpis].sort((a, b) => rango[estadoIndicador(b)] - rango[estadoIndicador(a)])[0]
  return { areaId, pilarId, estado, eventos: abiertos, vencidas, criticos, kpis, principal }
}

export default function MatrizSGO({ eventos, acciones, indicadores, onSelect }: {
  eventos: EventoSGO[]
  acciones: AccionSGO[]
  indicadores: IndicadorSGO[]
  onSelect: (area: AreaSGOId, pilar: PilarSGO) => void
}) {
  const [buscar, setBuscar] = useState('')
  const [pilarVisible, setPilarVisible] = useState<PilarSGO | 'todos'>('todos')
  const [estadoVisible, setEstadoVisible] = useState<EstadoCelda | 'todos'>('todos')

  const celdas = useMemo(() => AREAS_SGO.flatMap((area) =>
    PILARES_SGO.map((pilar) => construirCelda(area.id, pilar.id, eventos, acciones, indicadores)),
  ), [eventos, acciones, indicadores])

  const resumen = useMemo(() => ({
    rojo: celdas.filter((c) => c.estado === 'rojo').length,
    amarillo: celdas.filter((c) => c.estado === 'amarillo').length,
    verde: celdas.filter((c) => c.estado === 'verde').length,
    sin_dato: celdas.filter((c) => c.estado === 'sin_dato').length,
  }), [celdas])
  const cobertura = Math.round((celdas.length - resumen.sin_dato) / celdas.length * 100)
  const pilares = pilarVisible === 'todos' ? PILARES_SGO : PILARES_SGO.filter((p) => p.id === pilarVisible)
  const q = buscar.trim().toLocaleLowerCase('es')

  const areaVisible = (areaId: AreaSGOId) => {
    const area = AREAS_SGO.find((a) => a.id === areaId)!
    if (q && !area.label.toLocaleLowerCase('es').includes(q)) return false
    if (estadoVisible === 'todos') return true
    return celdas.some((c) => c.areaId === areaId && (pilarVisible === 'todos' || c.pilarId === pilarVisible) && c.estado === estadoVisible)
  }

  return <section className="sgo-matriz card">
    <div className="sgo-matriz-encabezado">
      <div>
        <div className="section-title">Tablero integral · Área × Pilares</div>
        <div className="meta">Lectura ejecutiva del desempeño, los eventos abiertos y las acciones vencidas.</div>
      </div>
      <div className="sgo-cobertura" title="Celdas con al menos un KPI y valor disponible">
        <span>Cobertura de medición</span><strong>{cobertura}%</strong>
        <div><i style={{ width: `${cobertura}%` }} /></div>
      </div>
    </div>

    <div className="sgo-matriz-resumen">
      {(Object.keys(ESTADOS) as EstadoCelda[]).map((estado) => <button key={estado}
        className={`sgo-resumen-estado estado-${estado} ${estadoVisible === estado ? 'activo' : ''}`}
        onClick={() => setEstadoVisible(estadoVisible === estado ? 'todos' : estado)}>
        <span className="sgo-resumen-icono">{ESTADOS[estado].icono}</span>
        <span><strong>{resumen[estado]}</strong><small>{ESTADOS[estado].corto}</small></span>
      </button>)}
    </div>

    <div className="sgo-matriz-herramientas">
      <div className="sgo-matriz-buscar"><span>⌕</span><input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar área…" aria-label="Buscar área" /></div>
      <select className="input" value={pilarVisible} onChange={(e) => setPilarVisible(e.target.value as PilarSGO | 'todos')} aria-label="Filtrar pilar">
        <option value="todos">Todos los pilares</option>{PILARES_SGO.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <select className="input" value={estadoVisible} onChange={(e) => setEstadoVisible(e.target.value as EstadoCelda | 'todos')} aria-label="Filtrar estado">
        <option value="todos">Todos los estados</option>{(Object.keys(ESTADOS) as EstadoCelda[]).map((e) => <option key={e} value={e}>{ESTADOS[e].corto}</option>)}
      </select>
      {(buscar || pilarVisible !== 'todos' || estadoVisible !== 'todos') && <button className="btn" onClick={() => { setBuscar(''); setPilarVisible('todos'); setEstadoVisible('todos') }}>Limpiar filtros</button>}
    </div>

    <div className="sgo-matriz-scroll">
      <table className="sgo-matriz-tabla">
        <thead><tr><th className="sgo-col-area">Área</th>{pilares.map((p) => <th key={p.id}><span className="sgo-pilar-dot" style={{ background: p.color }} />{p.label}</th>)}</tr></thead>
        <tbody>{GRUPOS.map((grupo) => {
          const areas = grupo.areas.filter(areaVisible)
          if (!areas.length) return null
          return [
            <tr className="sgo-grupo-fila" key={`${grupo.id}-titulo`}><th colSpan={pilares.length + 1}>{grupo.label}<span>{areas.length} área(s)</span></th></tr>,
            ...areas.map((areaId) => {
              const area = AREAS_SGO.find((a) => a.id === areaId)!
              const eventosArea = eventos.filter((e) => e.estado !== 'cerrado' && (e.areaOrigenId ?? e.areaId) === areaId).length
              return <tr key={areaId}>
                <th className="sgo-col-area"><span>{area.label}</span>{eventosArea > 0 && <small>{eventosArea} abierto(s)</small>}</th>
                {pilares.map((pilar) => {
                  const celda = celdas.find((c) => c.areaId === areaId && c.pilarId === pilar.id)!
                  const info = ESTADOS[celda.estado]
                  const atenuada = estadoVisible !== 'todos' && celda.estado !== estadoVisible
                  return <td key={pilar.id} className={atenuada ? 'sgo-celda-atenuada' : undefined}>
                    <button className={`sgo-celda estado-${celda.estado}`} onClick={() => onSelect(areaId, pilar.id)}
                      aria-label={`${area.label}, ${pilar.label}: ${info.label}. ${celda.kpis.length} KPI y ${celda.eventos.length} eventos abiertos.`}>
                      <span className="sgo-celda-superior"><span className="sgo-celda-estado"><i>{info.icono}</i>{info.corto}</span>{celda.kpis.length > 1 && <b>{celda.kpis.length} KPI</b>}</span>
                      {celda.principal?.valorActual !== undefined
                        ? <span className="sgo-celda-kpi"><strong>{celda.principal.valorActual.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</strong><small>{celda.principal.unidad} · meta {celda.principal.meta.toLocaleString('es-AR')}</small></span>
                        : <span className="sgo-celda-vacia">{celda.kpis.length ? 'Pendiente de medición' : 'Configurar KPI'}</span>}
                      {(celda.eventos.length > 0 || celda.vencidas > 0) && <span className="sgo-celda-alertas">
                        {celda.eventos.length > 0 && <em>{celda.eventos.length} evento(s)</em>}
                        {celda.vencidas > 0 && <em className="vencida">{celda.vencidas} vencida(s)</em>}
                      </span>}
                    </button>
                  </td>
                })}
              </tr>
            }),
          ]
        })}</tbody>
      </table>
    </div>

    <div className="sgo-matriz-leyenda">{(Object.keys(ESTADOS) as EstadoCelda[]).map((estado) =>
      <span key={estado}><i className={`estado-${estado}`} /> <strong>{ESTADOS[estado].corto}:</strong> {ESTADOS[estado].label}</span>)}
    </div>
  </section>
}
