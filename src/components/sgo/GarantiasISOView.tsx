import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { eliminarGarantiaISO, guardarGarantiaISO } from '../../sync/syncEngine'
import {
  CATEGORIAS_GARANTIA, COBERTURAS_GARANTIA, ESTADOS_GARANTIA,
  categoriaGarantiaLabel, diasEntreGarantia, estadoGarantiaLabel,
  type CategoriaGarantia, type CoberturaGarantia, type EstadoGarantia, type GarantiaISO,
} from '../../sgo/garantias'

const hoy = () => new Date().toISOString().slice(0, 10)
const coberturaLabel = (id: CoberturaGarantia) => COBERTURAS_GARANTIA.find((x) => x.id === id)?.label ?? id
const fechaAR = (fecha?: string) => fecha ? new Intl.DateTimeFormat('es-AR').format(new Date(`${fecha.slice(0, 10)}T12:00:00`)) : '—'
const cerrado = (g: GarantiaISO) => g.estado === 'resuelto' || g.estado === 'verificado'

export default function GarantiasISOView({ usuario }: { usuario: string }) {
  const registros = useLiveQuery(() => db.garantiasISO.toArray(), []) ?? []
  const [busqueda, setBusqueda] = useState('')
  const [anio, setAnio] = useState('todos')
  const [estado, setEstado] = useState('todos')
  const [cobertura, setCobertura] = useState('todos')
  const [categoria, setCategoria] = useState('todos')
  const [editando, setEditando] = useState<GarantiaISO | null | undefined>(undefined)

  const anios = useMemo(() => [...new Set(registros.map((r) => r.fechaDeteccion.slice(0, 4)).filter(Boolean))].sort().reverse(), [registros])
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return registros.filter((r) =>
      (anio === 'todos' || r.fechaDeteccion.startsWith(anio)) &&
      (estado === 'todos' || r.estado === estado) &&
      (cobertura === 'todos' || r.cobertura === cobertura) &&
      (categoria === 'todos' || r.categoria === categoria) &&
      (!q || `${r.codigo} ${r.tipo} ${r.nroSerie ?? ''} ${r.cliente ?? ''} ${r.diagnostico} ${r.causas ?? ''}`.toLowerCase().includes(q)))
  }, [registros, anio, estado, cobertura, categoria, busqueda])

  const evaluadas = filtrados.filter((r) => r.cobertura === 'si' || r.cobertura === 'no')
  const confirmadas = filtrados.filter((r) => r.cobertura === 'si').length
  const resueltas = filtrados.filter(cerrado)
  const duraciones = resueltas.flatMap((r) => { const d = diasEntreGarantia(r.fechaDeteccion, r.fechaResolucion); return d === undefined ? [] : [d] })
  const promedioResolucion = duraciones.length ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length) : undefined
  const verificacionPct = resueltas.length ? Math.round(resueltas.filter((r) => r.verificado).length / resueltas.length * 100) : undefined
  const reincidentes = new Set(registros.filter((r) => r.nroSerie).filter((r, _, arr) => arr.filter((x) => x.nroSerie === r.nroSerie).length > 1).map((r) => r.nroSerie)).size

  const categorias = agrupar(filtrados, (r) => categoriaGarantiaLabel(r.categoria)).slice(0, 8)
  const clientes = agrupar(filtrados.filter((r) => r.cliente), (r) => r.cliente || 'Sin cliente').slice(0, 8)
  const evolucion = agruparMes(filtrados)

  function exportarCSV() {
    const encabezados = ['Código','Tipo','N° serie','Fecha salida','Fecha detección','Cliente','Diagnóstico','Causas','Cobertura','Categoría','Estado','Responsable','Solución','Fecha resolución','Verificado']
    const filas = filtrados.map((r) => [r.codigo,r.tipo,r.nroSerie ?? '',r.fechaSalida ?? '',r.fechaDeteccion,r.cliente ?? '',r.diagnostico,r.causas ?? '',coberturaLabel(r.cobertura),categoriaGarantiaLabel(r.categoria),estadoGarantiaLabel(r.estado),r.responsable ?? '',r.solucion ?? '',r.fechaResolucion ?? '',r.verificado ? 'Sí' : 'No'])
    const csv = [encabezados, ...filas].map((fila) => fila.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `RIT_9.1.2_02_garantias_${hoy()}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <div>
    <div className="card sgo-garantias-cabecera">
      <div>
        <div className="section-title" style={{ margin: 0 }}>📋 Transformadores en garantía</div>
        <div className="meta">Registro ISO 9001:2015 · R.I.T. 9.1.2/02 · versión 01</div>
      </div>
      <div className="row-actions"><button className="btn" onClick={exportarCSV}>Exportar CSV</button><button className="btn btn-primary" onClick={() => setEditando(null)}>+ Nuevo reclamo</button></div>
    </div>

    <div className="garantias-kpis">
      <Kpi label="Reclamos" valor={filtrados.length} detalle={anio === 'todos' ? 'Histórico filtrado' : `Año ${anio}`} color="#2563eb" />
      <Kpi label="Casos abiertos" valor={filtrados.filter((r) => !cerrado(r)).length} detalle={`${filtrados.filter((r) => r.cobertura === 'en_evaluacion' || r.cobertura === 'sin_dato').length} sin definir cobertura`} color="#dc2626" />
      <Kpi label="Corresponde garantía" valor={evaluadas.length ? `${Math.round(confirmadas / evaluadas.length * 100)} %` : '—'} detalle={`${confirmadas} de ${evaluadas.length} evaluados`} color="#7c3aed" />
      <Kpi label="Resolución promedio" valor={promedioResolucion === undefined ? '—' : `${promedioResolucion} días`} detalle={`${duraciones.length} casos con fechas válidas`} color="#d97706" />
      <Kpi label="Verificación" valor={verificacionPct === undefined ? '—' : `${verificacionPct} %`} detalle={`${resueltas.filter((r) => r.verificado).length} de ${resueltas.length} resueltos`} color="#16a34a" />
      <Kpi label="Series reincidentes" valor={reincidentes} detalle="Más de un reclamo histórico" color="#0891b2" />
    </div>

    <div className="garantias-graficos">
      <div className="card"><div className="section-title">Evolución de reclamos</div><LineaMensual datos={evolucion} /></div>
      <div className="card"><div className="section-title">Pareto por categoría</div><Barras datos={categorias} /></div>
      <div className="card"><div className="section-title">Clientes con más reclamos</div><Barras datos={clientes} /></div>
    </div>

    <div className="card garantias-filtros">
      <input className="input" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar código, serie, cliente o diagnóstico…" />
      <select className="input" value={anio} onChange={(e) => setAnio(e.target.value)}><option value="todos">Todos los años</option>{anios.map((x) => <option key={x}>{x}</option>)}</select>
      <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="todos">Todos los estados</option>{ESTADOS_GARANTIA.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
      <select className="input" value={cobertura} onChange={(e) => setCobertura(e.target.value)}><option value="todos">Toda cobertura</option>{COBERTURAS_GARANTIA.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
      <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="todos">Todas las categorías</option>{CATEGORIAS_GARANTIA.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
    </div>

    <div className="meta" style={{ marginBottom: 8 }}>Mostrando {Math.min(filtrados.length, 150)} de {filtrados.length} registros · ordenados por fecha de detección.</div>
    <div className="garantias-listado">
      {[...filtrados].sort((a, b) => b.fechaDeteccion.localeCompare(a.fechaDeteccion)).slice(0, 150).map((g) => <button key={g.id} className="card garantia-registro" onClick={() => setEditando(g)}>
        <div className="card-header">
          <div><strong>{g.codigo} · {g.tipo}{g.nroSerie ? ` · Serie ${g.nroSerie}` : ''}</strong><div className="meta">{fechaAR(g.fechaDeteccion)} · {g.cliente || 'Cliente sin identificar'} · {categoriaGarantiaLabel(g.categoria)}</div></div>
          <div className="row-actions"><span className={`garantia-chip cobertura-${g.cobertura}`}>{coberturaLabel(g.cobertura)}</span><span className={`garantia-chip estado-${g.estado}`}>{estadoGarantiaLabel(g.estado)}</span></div>
        </div>
        <div className="garantia-diagnostico">{g.diagnostico || 'Diagnóstico pendiente'}</div>
        <div className="meta">Responsable: {g.responsable || 'Sin asignar'}{g.fechaResolucion ? ` · Resuelto ${fechaAR(g.fechaResolucion)}` : ''}</div>
      </button>)}
      {filtrados.length === 0 && <div className="empty">No hay reclamos que coincidan con los filtros.</div>}
    </div>
    {editando !== undefined && <EditorGarantia registro={editando} usuario={usuario} onClose={() => setEditando(undefined)} />}
  </div>
}

function Kpi({ label, valor, detalle, color }: { label: string; valor: string | number; detalle: string; color: string }) {
  return <div className="logi-kpi" style={{ borderTop: `4px solid ${color}` }}><div className="n">{valor}</div><div className="l">{label}</div><div className="meta">{detalle}</div></div>
}

function agrupar<T>(items: T[], clave: (item: T) => string) {
  const mapa = new Map<string, number>()
  items.forEach((x) => mapa.set(clave(x), (mapa.get(clave(x)) ?? 0) + 1))
  return [...mapa].map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor)
}

function agruparMes(items: GarantiaISO[]) {
  const datos = agrupar(items, (r) => r.fechaDeteccion.slice(0, 7)).sort((a, b) => a.label.localeCompare(b.label))
  return datos.slice(-18)
}

function Barras({ datos }: { datos: { label: string; valor: number }[] }) {
  const max = Math.max(1, ...datos.map((x) => x.valor))
  return <div className="garantia-barras">{datos.length ? datos.map((x) => <div className="garantia-barra" key={x.label}>
    <div className="garantia-barra-label" title={x.label}>{x.label}</div><div className="garantia-barra-pista"><div style={{ width: `${x.valor / max * 100}%` }} /></div><strong>{x.valor}</strong>
  </div>) : <div className="empty">Sin datos.</div>}</div>
}

function LineaMensual({ datos }: { datos: { label: string; valor: number }[] }) {
  if (!datos.length) return <div className="empty">Sin datos.</div>
  const w = 720, h = 190, pad = 28, max = Math.max(1, ...datos.map((x) => x.valor))
  const puntos = datos.map((x, i) => ({ ...x, x: pad + (datos.length === 1 ? 0 : i * (w - pad * 2) / (datos.length - 1)), y: h - pad - x.valor / max * (h - pad * 2) }))
  return <div className="garantia-linea-wrap"><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Evolución mensual de reclamos">
    <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#64748b" />
    <polyline fill="none" stroke="#3b82f6" strokeWidth="4" points={puntos.map((p) => `${p.x},${p.y}`).join(' ')} />
    {puntos.map((p, i) => <g key={p.label}><circle cx={p.x} cy={p.y} r="5" fill="#60a5fa" /><text x={p.x} y={p.y - 10} textAnchor="middle" fill="#e2e8f0" fontSize="11">{p.valor}</text>{(i % Math.max(1, Math.ceil(datos.length / 6)) === 0 || i === datos.length - 1) && <text x={p.x} y={h - 7} textAnchor="middle" fill="#94a3b8" fontSize="10">{p.label.slice(2)}</text>}</g>)}
  </svg></div>
}

function EditorGarantia({ registro, usuario, onClose }: { registro: GarantiaISO | null; usuario: string; onClose: () => void }) {
  const ahora = new Date().toISOString()
  const [dato, setDato] = useState<GarantiaISO>(registro ?? {
    id: crypto.randomUUID(), codigo: '', tipo: '', fechaDeteccion: hoy(), diagnostico: '', cobertura: 'en_evaluacion', categoria: 'otro', estado: 'abierto', verificado: false,
    creadoEn: ahora, actualizadoEn: ahora, actualizadoPor: usuario,
  })
  const [guardando, setGuardando] = useState(false)
  const set = <K extends keyof GarantiaISO>(campo: K, valor: GarantiaISO[K]) => setDato({ ...dato, [campo]: valor })
  const valido = dato.tipo.trim() && dato.fechaDeteccion && dato.diagnostico.trim()

  async function guardar() {
    if (!valido) return
    setGuardando(true)
    const codigo = dato.codigo || `GAR-${dato.fechaDeteccion.slice(0, 4)}-${dato.id.replaceAll('-', '').slice(0, 6).toUpperCase()}`
    await guardarGarantiaISO({ ...dato, codigo, actualizadoEn: new Date().toISOString(), actualizadoPor: usuario,
      estado: dato.verificado ? 'verificado' : dato.estado, fechaResolucion: dato.fechaResolucion || undefined })
    setGuardando(false); onClose()
  }
  async function eliminar() {
    if (!registro || usuario.trim().toLowerCase() !== 'lorenzo' || !window.confirm(`¿Eliminar ${registro.codigo}?`)) return
    await eliminarGarantiaISO(registro); onClose()
  }

  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '97%', maxWidth: 980, maxHeight: '94vh', overflow: 'auto' }}>
    <div className="card-header"><div><div className="section-title" style={{ margin: 0 }}>{registro ? `${registro.codigo} · Editar reclamo` : 'Nuevo reclamo de garantía'}</div><div className="meta">Registro controlado R.I.T. 9.1.2/02</div></div><button className="btn" onClick={onClose}>×</button></div>
    <div className="garantia-form-grid">
      <Campo label="Tipo / modelo *"><input className="input" value={dato.tipo} onChange={(e) => set('tipo', e.target.value)} /></Campo>
      <Campo label="N° de serie"><input className="input" value={dato.nroSerie ?? ''} onChange={(e) => set('nroSerie', e.target.value || undefined)} /></Campo>
      <Campo label="Fecha de salida"><input className="input" type="date" value={dato.fechaSalida ?? ''} onChange={(e) => set('fechaSalida', e.target.value || undefined)} /></Campo>
      <Campo label="Fecha de detección *"><input className="input" type="date" value={dato.fechaDeteccion} onChange={(e) => set('fechaDeteccion', e.target.value)} /></Campo>
      <Campo label="Cliente"><input className="input" value={dato.cliente ?? ''} onChange={(e) => set('cliente', e.target.value || undefined)} /></Campo>
      <Campo label="Ingresado por"><input className="input" value={dato.ingresadoPor ?? ''} onChange={(e) => set('ingresadoPor', e.target.value || undefined)} /></Campo>
      <Campo label="Cobertura"><select className="input" value={dato.cobertura} onChange={(e) => set('cobertura', e.target.value as CoberturaGarantia)}>{COBERTURAS_GARANTIA.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Campo>
      <Campo label="Categoría"><select className="input" value={dato.categoria} onChange={(e) => set('categoria', e.target.value as CategoriaGarantia)}>{CATEGORIAS_GARANTIA.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Campo>
      <Campo label="Estado"><select className="input" value={dato.estado} onChange={(e) => set('estado', e.target.value as EstadoGarantia)}>{ESTADOS_GARANTIA.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Campo>
      <Campo label="Responsable"><input className="input" value={dato.responsable ?? ''} onChange={(e) => set('responsable', e.target.value || undefined)} /></Campo>
      <Campo label="Fecha compromiso"><input className="input" type="date" value={dato.fechaCompromiso ?? ''} onChange={(e) => set('fechaCompromiso', e.target.value || undefined)} /></Campo>
      <Campo label="Costo estimado"><input className="input" type="number" min="0" value={dato.costoEstimado ?? ''} onChange={(e) => set('costoEstimado', e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)))} /></Campo>
    </div>
    <Campo label="Diagnóstico *"><textarea className="input" rows={3} value={dato.diagnostico} onChange={(e) => set('diagnostico', e.target.value)} /></Campo>
    <Campo label="Causa/s"><textarea className="input" rows={3} value={dato.causas ?? ''} onChange={(e) => set('causas', e.target.value || undefined)} /></Campo>
    <Campo label="Solución / tratamiento"><textarea className="input" rows={3} value={dato.solucion ?? ''} onChange={(e) => set('solucion', e.target.value || undefined)} /></Campo>
    <div className="garantia-form-grid">
      <Campo label="Fecha resolución"><input className="input" type="date" value={dato.fechaResolucion ?? ''} onChange={(e) => set('fechaResolucion', e.target.value || undefined)} /></Campo>
      <Campo label="Verificación"><label className="check-inline" style={{ minHeight: 56 }}><input type="checkbox" checked={dato.verificado} onChange={(e) => set('verificado', e.target.checked)} /> Solución verificada</label></Campo>
    </div>
    <Campo label="Detalle de verificación"><textarea className="input" rows={2} value={dato.verificacionDetalle ?? ''} onChange={(e) => set('verificacionDetalle', e.target.value || undefined)} /></Campo>
    <Campo label="Observaciones"><textarea className="input" rows={2} value={dato.observaciones ?? ''} onChange={(e) => set('observaciones', e.target.value || undefined)} /></Campo>
    <div className="row-actions" style={{ justifyContent: 'space-between' }}>
      <div>{registro && usuario.trim().toLowerCase() === 'lorenzo' && <button className="btn" style={{ color: '#fca5a5', borderColor: '#ef4444' }} onClick={() => void eliminar()}>Eliminar</button>}</div>
      <div className="row-actions"><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!valido || guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar registro'}</button></div>
    </div>
  </div></div>
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>
}
