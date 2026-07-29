import { useState } from 'react'
import { guardarIndicadorSGO } from '../../sync/syncEngine'
import { AREAS_SGO, PILARES_SGO, type AreaSGOId, type PilarSGO } from '../../sgo/types'
import { KPI_SUGERIDOS, configuracionUmbralValida, estadoIndicador, type DireccionKPI, type IndicadorSGO } from '../../sgo/indicadores'
import { plantillasKPIAutomaticos } from '../../sgo/kpiAutomaticos'

const periodoActual = () => new Date().toISOString().slice(0, 7)

export default function IndicadoresSGO({ indicadores, usuario, onClose }: { indicadores: IndicadorSGO[]; usuario: string; onClose: () => void }) {
  const [area, setArea] = useState<AreaSGOId>('bobinado_distribucion')
  const [pilar, setPilar] = useState<PilarSGO>('calidad')
  const [nombre, setNombre] = useState('')
  const [unidad, setUnidad] = useState('%')
  const [direccion, setDireccion] = useState<DireccionKPI>('mayor_mejor')
  const [meta, setMeta] = useState('95')
  const [amarillo, setAmarillo] = useState('90')
  const [valor, setValor] = useState('')
  const [periodo, setPeriodo] = useState(periodoActual())

  function aplicarSugerencia(v: string) {
    setNombre(v)
    const s = KPI_SUGERIDOS[pilar].find((x) => x.nombre === v)
    if (s) { setUnidad(s.unidad); setDireccion(s.direccion) }
  }

  async function crear() {
    const i: IndicadorSGO = {
      id: crypto.randomUUID(), areaId: area, pilar, nombre: nombre.trim(), unidad: unidad.trim(), direccion,
      meta: Number(meta), umbralAmarillo: Number(amarillo), valorActual: valor === '' ? undefined : Number(valor),
      periodo, activo: true, actualizadoEn: new Date().toISOString(), actualizadoPor: usuario,
      origen: 'manual',
    }
    if (!i.nombre || !i.unidad || !Number.isFinite(i.meta) || !Number.isFinite(i.umbralAmarillo) || !configuracionUmbralValida(i)) {
      window.alert(direccion === 'mayor_mejor' ? 'El umbral amarillo debe ser menor o igual que la meta.' : 'El umbral amarillo debe ser mayor o igual que la meta.')
      return
    }
    if (indicadores.some((x) => x.areaId === area && x.pilar === pilar && x.nombre.trim().toLowerCase() === i.nombre.toLowerCase())) {
      window.alert('Ya existe un indicador con ese nombre para el área y pilar seleccionados.')
      return
    }
    await guardarIndicadorSGO(i)
    setNombre(''); setValor('')
  }

  const visibles = indicadores.filter((i) => i.areaId === area && i.pilar === pilar)

  async function instalarAutomaticos() {
    const existentes = new Set(indicadores.map((i) => `${i.areaId}|${i.pilar}|${i.nombre.trim().toLowerCase()}`))
    const nuevas = plantillasKPIAutomaticos(usuario).filter((i) => !existentes.has(`${i.areaId}|${i.pilar}|${i.nombre.toLowerCase()}`))
    for (const i of nuevas) await guardarIndicadorSGO(i)
    window.alert(nuevas.length ? `${nuevas.length} KPI automáticos instalados. Revisá y ajustá sus metas iniciales.` : 'Los KPI automáticos recomendados ya están instalados.')
  }

  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: '97%', maxHeight: '94vh', overflow: 'auto' }}>
    <div className="card-header"><div><div className="section-title" style={{ margin: 0 }}>Configurar indicadores y metas</div><div className="meta">Los automáticos se recalculan desde Producción, Laboratorio, Logística y SGO.</div></div><div className="row-actions"><button className="btn btn-primary" onClick={() => void instalarAutomaticos()}>⚡ Instalar KPI automáticos</button><button className="btn" onClick={onClose}>×</button></div></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10, marginTop: 12 }}>
      <div className="field"><label>Área</label><select className="input" value={area} onChange={(e) => setArea(e.target.value as AreaSGOId)}>{AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
      <div className="field"><label>Pilar</label><select className="input" value={pilar} onChange={(e) => { setPilar(e.target.value as PilarSGO); setNombre('') }}>{PILARES_SGO.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
    </div>

    <div className="section-title">Indicadores configurados ({visibles.length})</div>
    {visibles.length === 0 ? <div className="empty">Esta celda todavía no tiene KPI. Permanecerá gris.</div> : visibles.map((i) => <IndicadorFila key={i.id} indicador={i} usuario={usuario} />)}

    <div className="card" style={{ marginTop: 14, borderLeft: '4px solid #2563eb' }}>
      <div className="section-title" style={{ marginTop: 0 }}>Nuevo indicador</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
        <div className="field" style={{ gridColumn: 'span 2' }}><label>Nombre</label><input className="input" list="kpi-sugeridos" value={nombre} onChange={(e) => aplicarSugerencia(e.target.value)} placeholder="Elegir sugerido o escribir otro" /><datalist id="kpi-sugeridos">{KPI_SUGERIDOS[pilar].map((s) => <option key={s.nombre} value={s.nombre} />)}</datalist></div>
        <div className="field"><label>Unidad</label><input className="input" value={unidad} onChange={(e) => setUnidad(e.target.value)} /></div>
        <div className="field"><label>Regla</label><select className="input" value={direccion} onChange={(e) => setDireccion(e.target.value as DireccionKPI)}><option value="mayor_mejor">Mayor es mejor</option><option value="menor_mejor">Menor es mejor</option></select></div>
        <div className="field"><label>Meta verde</label><input className="input" type="number" value={meta} onChange={(e) => setMeta(e.target.value)} /></div>
        <div className="field"><label>Umbral amarillo</label><input className="input" type="number" value={amarillo} onChange={(e) => setAmarillo(e.target.value)} /></div>
        <div className="field"><label>Valor actual</label><input className="input" type="number" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Sin dato" /></div>
        <div className="field"><label>Período</label><input className="input" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></div>
      </div>
      <div className="row-actions" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={() => void crear()}>Crear indicador</button></div>
    </div>
  </div></div>
}

function IndicadorFila({ indicador: i, usuario }: { indicador: IndicadorSGO; usuario: string }) {
  const [valor, setValor] = useState(i.valorActual?.toString() ?? '')
  const [meta, setMeta] = useState(i.meta.toString())
  const [amarillo, setAmarillo] = useState(i.umbralAmarillo.toString())
  const [periodo, setPeriodo] = useState(i.periodo)
  async function actualizar() {
    const nuevo = { ...i, valorActual: i.origen === 'automatico' ? undefined : valor === '' ? undefined : Number(valor), meta: Number(meta), umbralAmarillo: Number(amarillo), periodo, actualizadoEn: new Date().toISOString(), actualizadoPor: usuario }
    if (!configuracionUmbralValida(nuevo)) { window.alert(i.direccion === 'mayor_mejor' ? 'El amarillo debe ser ≤ meta.' : 'El amarillo debe ser ≥ meta.'); return }
    await guardarIndicadorSGO(nuevo)
  }
  async function alternar() { await guardarIndicadorSGO({ ...i, activo: !i.activo, actualizadoEn: new Date().toISOString(), actualizadoPor: usuario }) }
  return <div className="card" style={{ marginBottom: 8, opacity: i.activo ? 1 : .6 }}>
    <div className="card-header"><div><strong>{i.nombre}</strong><div className="meta">{i.origen === 'automatico' ? '⚡ Automático' : 'Manual'} · {i.direccion === 'mayor_mejor' ? 'Mayor es mejor' : 'Menor es mejor'} · Estado: {estadoIndicador({ ...i, valorActual: valor === '' ? undefined : Number(valor), meta: Number(meta), umbralAmarillo: Number(amarillo) })}</div></div><button className="btn" onClick={() => void alternar()}>{i.activo ? 'Desactivar' : 'Activar'}</button></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
      <div className="field"><label>Actual ({i.unidad})</label><input className="input" type="number" value={valor} disabled={i.origen === 'automatico'} onChange={(e) => setValor(e.target.value)} placeholder={i.origen === 'automatico' ? 'Calculado por el sistema' : ''} /></div>
      <div className="field"><label>Meta verde</label><input className="input" type="number" value={meta} onChange={(e) => setMeta(e.target.value)} /></div>
      <div className="field"><label>Umbral amarillo</label><input className="input" type="number" value={amarillo} onChange={(e) => setAmarillo(e.target.value)} /></div>
      <div className="field"><label>Período</label><input className="input" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></div>
    </div>
    <div className="row-actions" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={() => void actualizar()}>Actualizar KPI</button></div>
  </div>
}
