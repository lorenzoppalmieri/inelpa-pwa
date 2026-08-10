import { useEffect, useState } from 'react'
import { eliminarIndicadorSGO, guardarIndicadorSGO, guardarMedicionIndicadorSGO } from '../../sync/syncEngine'
import { periodoLocalISO } from '../../lib/time'
import { AREAS_SGO, PILARES_SGO, type AreaSGOId, type PilarSGO } from '../../sgo/types'
import { FRECUENCIAS_KPI, KPI_SUGERIDOS, configuracionUmbralValida, estadoIndicador, idMedicionIndicador, normalizarPeriodoKPI, periodoKPILabel, type DireccionKPI, type FrecuenciaKPI, type IndicadorSGO, type MedicionIndicadorSGO } from '../../sgo/indicadores'
import { plantillasKPIAutomaticos } from '../../sgo/kpiAutomaticos'
import { usuarioEsLorenzo } from '../../sgo/permisos'

const periodoActual = () => periodoLocalISO()

export default function IndicadoresSGO({ indicadores, mediciones, usuario, onClose }: { indicadores: IndicadorSGO[]; mediciones: MedicionIndicadorSGO[]; usuario: string; onClose: () => void }) {
  const [area, setArea] = useState<AreaSGOId>('bobinado_distribucion')
  const [pilar, setPilar] = useState<PilarSGO>('calidad')
  const [nombre, setNombre] = useState('')
  const [unidad, setUnidad] = useState('%')
  const [direccion, setDireccion] = useState<DireccionKPI>('mayor_mejor')
  const [meta, setMeta] = useState('95')
  const [amarillo, setAmarillo] = useState('90')
  const [valor, setValor] = useState('')
  const [periodo, setPeriodo] = useState(periodoActual())
  const [frecuencia, setFrecuencia] = useState<FrecuenciaKPI>('mensual')

  function aplicarSugerencia(v: string) {
    setNombre(v)
    const s = KPI_SUGERIDOS[pilar].find((x) => x.nombre === v)
    if (s) { setUnidad(s.unidad); setDireccion(s.direccion) }
  }

  async function crear() {
    const i: IndicadorSGO = {
      id: crypto.randomUUID(), areaId: area, pilar, nombre: nombre.trim(), unidad: unidad.trim(), direccion,
      meta: Number(meta), umbralAmarillo: Number(amarillo), valorActual: valor === '' ? undefined : Number(valor),
      periodo: normalizarPeriodoKPI(periodo, frecuencia), frecuencia, activo: true, actualizadoEn: new Date().toISOString(), actualizadoPor: usuario,
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
    if (i.valorActual !== undefined) {
      const now = new Date().toISOString()
      await guardarMedicionIndicadorSGO({
        id: idMedicionIndicador(i.id, i.periodo), indicadorId: i.id, periodo: i.periodo,
        valor: i.valorActual, cerrado: false, registradoEn: now, registradoPor: usuario,
        actualizadoEn: now, actualizadoPor: usuario,
      })
    }
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
    {visibles.length === 0 ? <div className="empty">Esta celda todavía no tiene KPI. Permanecerá gris.</div> : visibles.map((i) => <IndicadorFila key={i.id} indicador={i} mediciones={mediciones.filter((m) => m.indicadorId === i.id)} usuario={usuario} puedeEliminar={usuarioEsLorenzo(usuario)} />)}

    <div className="card" style={{ marginTop: 14, borderLeft: '4px solid #2563eb' }}>
      <div className="section-title" style={{ marginTop: 0 }}>Nuevo indicador</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
        <div className="field" style={{ gridColumn: 'span 2' }}><label>Nombre</label><input className="input" list="kpi-sugeridos" value={nombre} onChange={(e) => aplicarSugerencia(e.target.value)} placeholder="Elegir sugerido o escribir otro" /><datalist id="kpi-sugeridos">{KPI_SUGERIDOS[pilar].map((s) => <option key={s.nombre} value={s.nombre} />)}</datalist></div>
        <div className="field"><label>Unidad</label><input className="input" value={unidad} onChange={(e) => setUnidad(e.target.value)} /></div>
        <div className="field"><label>Regla</label><select className="input" value={direccion} onChange={(e) => setDireccion(e.target.value as DireccionKPI)}><option value="mayor_mejor">Mayor es mejor</option><option value="menor_mejor">Menor es mejor</option></select></div>
        <div className="field"><label>Meta verde</label><input className="input" type="number" value={meta} onChange={(e) => setMeta(e.target.value)} /></div>
        <div className="field"><label>Umbral amarillo</label><input className="input" type="number" value={amarillo} onChange={(e) => setAmarillo(e.target.value)} /></div>
        <div className="field"><label>Valor actual</label><input className="input" type="number" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Sin dato" /></div>
        <div className="field"><label>Periodicidad</label><select className="input" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaKPI)}>{FRECUENCIAS_KPI.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
        <div className="field"><label>Mes de referencia</label><input className="input" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></div>
      </div>
      <div className="meta" style={{ marginTop: 8 }}>Período que se medirá: <strong>{periodoKPILabel(periodo, frecuencia)}</strong>.</div>
      <div className="row-actions" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={() => void crear()}>Crear indicador</button></div>
    </div>
  </div></div>
}

function IndicadorFila({ indicador: i, mediciones, usuario, puedeEliminar }: { indicador: IndicadorSGO; mediciones: MedicionIndicadorSGO[]; usuario: string; puedeEliminar: boolean }) {
  const [valor, setValor] = useState(i.valorActual?.toString() ?? '')
  const [meta, setMeta] = useState(i.meta.toString())
  const [amarillo, setAmarillo] = useState(i.umbralAmarillo.toString())
  const [periodo, setPeriodo] = useState(i.periodo)
  const [frecuencia, setFrecuencia] = useState<FrecuenciaKPI>(i.frecuencia ?? 'mensual')
  const periodoNormalizado = normalizarPeriodoKPI(periodo, frecuencia)
  const medicion = mediciones.find((m) => m.periodo === periodoNormalizado)
  const [explicacion, setExplicacion] = useState(medicion?.explicacion ?? '')
  const [evidencia, setEvidencia] = useState(medicion?.evidencia ?? '')
  const [cerrado, setCerrado] = useState(medicion?.cerrado ?? false)
  const bloqueado = Boolean(medicion?.cerrado && !puedeEliminar)

  useEffect(() => {
    if (i.origen === 'automatico') return
    setValor(medicion?.valor.toString() ?? '')
    setExplicacion(medicion?.explicacion ?? '')
    setEvidencia(medicion?.evidencia ?? '')
    setCerrado(medicion?.cerrado ?? false)
  }, [i.origen, medicion?.id, medicion?.valor, medicion?.explicacion, medicion?.evidencia, medicion?.cerrado, periodoNormalizado])

  async function actualizar() {
    const now = new Date().toISOString()
    const nuevo = { ...i, valorActual: undefined, meta: Number(meta), umbralAmarillo: Number(amarillo), periodo: periodoNormalizado, frecuencia, actualizadoEn: now, actualizadoPor: usuario }
    if (!configuracionUmbralValida(nuevo)) { window.alert(i.direccion === 'mayor_mejor' ? 'El amarillo debe ser ≤ meta.' : 'El amarillo debe ser ≥ meta.'); return }
    if (i.origen !== 'automatico' && (valor === '' || !Number.isFinite(Number(valor)))) { window.alert('Ingresá un resultado válido para el período.'); return }
    if (cerrado && !explicacion.trim()) { window.alert('Para cerrar la medición, explicá el resultado.'); return }
    await guardarIndicadorSGO(nuevo)
    if (i.origen !== 'automatico') {
      await guardarMedicionIndicadorSGO({
        id: idMedicionIndicador(i.id, periodoNormalizado), indicadorId: i.id, periodo: periodoNormalizado,
        valor: Number(valor), explicacion: explicacion.trim() || undefined, evidencia: evidencia.trim() || undefined,
        cerrado, registradoEn: medicion?.registradoEn ?? now, registradoPor: medicion?.registradoPor ?? usuario,
        actualizadoEn: now, actualizadoPor: usuario,
      })
    }
  }
  async function alternar() { await guardarIndicadorSGO({ ...i, activo: !i.activo, actualizadoEn: new Date().toISOString(), actualizadoPor: usuario }) }
  async function eliminar() {
    if (!puedeEliminar || !window.confirm(`¿Eliminar definitivamente el indicador "${i.nombre}"? Esta acción no se puede deshacer.`)) return
    await eliminarIndicadorSGO(i, usuario)
  }
  return <div className="card" style={{ marginBottom: 8, opacity: i.activo ? 1 : .6 }}>
    <div className="card-header"><div><strong>{i.nombre}</strong><div className="meta">{i.origen === 'automatico' ? '⚡ Automático' : 'Manual'} · {i.direccion === 'mayor_mejor' ? 'Mayor es mejor' : 'Menor es mejor'} · Estado: {estadoIndicador({ ...i, valorActual: valor === '' ? undefined : Number(valor), meta: Number(meta), umbralAmarillo: Number(amarillo) })}</div></div><div className="row-actions"><button className="btn" onClick={() => void alternar()}>{i.activo ? 'Desactivar' : 'Activar'}</button>{puedeEliminar && <button className="btn" style={{ color: 'var(--rojo)', borderColor: 'var(--rojo)' }} onClick={() => void eliminar()}>Eliminar</button>}</div></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8 }}>
      <div className="field"><label>Actual ({i.unidad})</label><input className="input" type="number" value={valor} disabled={i.origen === 'automatico' || bloqueado} onChange={(e) => setValor(e.target.value)} placeholder={i.origen === 'automatico' ? 'Calculado por el sistema' : ''} /></div>
      <div className="field"><label>Meta verde</label><input className="input" type="number" value={meta} disabled={bloqueado} onChange={(e) => setMeta(e.target.value)} /></div>
      <div className="field"><label>Umbral amarillo</label><input className="input" type="number" value={amarillo} disabled={bloqueado} onChange={(e) => setAmarillo(e.target.value)} /></div>
      <div className="field"><label>Periodicidad</label><select className="input" value={frecuencia} disabled={bloqueado} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaKPI)}>{FRECUENCIAS_KPI.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
      <div className="field"><label>Mes de referencia</label><input className="input" type="month" value={periodo} disabled={bloqueado} onChange={(e) => setPeriodo(e.target.value)} /></div>
    </div>
    {i.origen !== 'automatico' && <div className="sgo-medicion-grid">
      <div className="field"><label>Explicación del resultado</label><textarea className="input" rows={2} value={explicacion} disabled={bloqueado} onChange={(e) => setExplicacion(e.target.value)} placeholder="Qué ocurrió y por qué se obtuvo este resultado" /></div>
      <div className="field"><label>Evidencia / referencia</label><textarea className="input" rows={2} value={evidencia} disabled={bloqueado} onChange={(e) => setEvidencia(e.target.value)} placeholder="Informe, acta, archivo o enlace de respaldo" /></div>
      <label className="check-inline"><input type="checkbox" checked={cerrado} disabled={bloqueado} onChange={(e) => setCerrado(e.target.checked)} /> Cerrar medición del período</label>
    </div>}
    <div className="meta" style={{ marginTop: 7 }}>Mide: <strong>{periodoKPILabel(periodo, frecuencia)}</strong>.</div>
    <div className="meta">Historial conservado: {mediciones.length} medición(es).</div>
    <div className="row-actions" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" disabled={bloqueado} onClick={() => void actualizar()}>{bloqueado ? 'Período cerrado' : 'Actualizar KPI'}</button></div>
  </div>
}
