import { useEffect, useMemo, useState } from 'react'
import { traerRegistro, type RegistroLab } from '../../lib/registroLab'
import { exportarRegistroLabCSV } from '../../lib/export'
import EvolucionRegistro, { METRICAS, type MetricaKey } from './EvolucionRegistro'

// ============================================================
// REGISTRO GENERAL DE LABORATORIO (v1.99) — vista de consulta.
//
// Responde al pedido del documento de Laboratorio:
//   "debe ser una base de datos fácil de consultar, de filtrar, y de extraer
//    datos. Esto será de mucha utilidad para el área de Diseño, para: filtrar
//    por modelos y versión de diseño, y conocer la evolución en valores como
//    tensión de cortocircuito, pérdidas en vacío y en cortocircuito (...);
//    filtrar transformadores con valores fuera de norma."
//
// DE DÓNDE SALEN LOS DATOS: de la tabla `lab_registro`, que NO está en el
// espejo Dexie (ver lib/registroLab.ts). Se pide a la nube al abrir la vista y
// queda en memoria; por eso hay un botón de recargar y un aviso si no hay red.
// Se trae entera una sola vez y se filtra en el navegador: son unos pocos miles
// de filas de números, y así los filtros responden al instante en vez de ir y
// volver a la nube en cada tecla.
//
// La lectura pasa por `traerRegistro`, que pagina: a +2000 ensayos por año, una
// consulta sin paginar devolvería 1000 filas y el resto desaparecería EN
// SILENCIO — que es exactamente lo que pasó cuando `paradas` cruzó ese límite.
// ============================================================

const PAGINA = 50

type OrdenKey = 'fecha' | 'modelo' | 'po' | 'pcc' | 'uccPct' | 'pTotal'

function fmt(v?: number, d = 2): string {
  return v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ',')
}
/** Compara dos valores que pueden faltar; los vacíos van siempre al final. */
function cmpNum(a?: number, b?: number): number {
  if (a === undefined && b === undefined) return 0
  if (a === undefined) return 1
  if (b === undefined) return -1
  return a - b
}

export default function RegistroGeneral() {
  const [filas, setFilas] = useState<RegistroLab[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  // ---------- filtros ----------
  const [buscar, setBuscar] = useState('')
  const [modelo, setModelo] = useState('')
  const [version, setVersion] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [soloFuera, setSoloFuera] = useState(false)
  const [soloMedidas, setSoloMedidas] = useState(false)
  const [metrica, setMetrica] = useState<MetricaKey>('uccPct')
  const [orden, setOrden] = useState<OrdenKey>('fecha')
  const [asc, setAsc] = useState(false)
  const [tope, setTope] = useState(PAGINA)

  async function cargar() {
    setCargando(true); setError('')
    try {
      if (!navigator.onLine) {
        setError('Estás sin conexión. El Registro General vive en la nube y no se guarda en este dispositivo.')
        setFilas([])
        return
      }
      setFilas(await traerRegistro())
    } catch (e) {
      setError(`No se pudo leer el registro: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => { void cargar() }, [])

  // Al mover cualquier filtro se vuelve a la primera tanda.
  useEffect(() => { setTope(PAGINA) }, [buscar, modelo, version, desde, hasta, soloFuera, soloMedidas])

  // Al cambiar de modelo, una versión de otro modelo dejaría la tabla vacía sin
  // que se entienda por qué. Se limpia sola.
  useEffect(() => { setVersion('') }, [modelo])

  const modelos = useMemo(
    () => [...new Set(filas.map((f) => f.modelo))].sort(),
    [filas])

  const versiones = useMemo(
    () => [...new Set(filas.filter((f) => !modelo || f.modelo === modelo).map((f) => f.versionDiseno))].sort(),
    [filas, modelo])

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return filas.filter((f) => {
      if (modelo && f.modelo !== modelo) return false
      if (version && f.versionDiseno !== version) return false
      if (desde && f.fecha < desde) return false
      if (hasta && f.fecha > hasta) return false
      if (soloFuera && !f.fueraDeNorma) return false
      if (soloMedidas && f.resOrigen !== 'medido') return false
      if (!q) return true
      return `${f.modelo} ${f.versionDiseno} ${f.nroFabricacion ?? ''} ${f.nroSerie ?? ''} ${f.cliente ?? ''} ${f.ot ?? ''} ${f.obsBobinado ?? ''}`
        .toLowerCase().includes(q)
    })
  }, [filas, buscar, modelo, version, desde, hasta, soloFuera, soloMedidas])

  const ordenadas = useMemo(() => {
    const xs = [...filtradas]
    xs.sort((a, b) => {
      let c = 0
      if (orden === 'fecha') c = a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0
      else if (orden === 'modelo') c = `${a.modelo} ${a.versionDiseno}`.localeCompare(`${b.modelo} ${b.versionDiseno}`)
      else c = cmpNum(a[orden], b[orden])
      return asc ? c : -c
    })
    return xs
  }, [filtradas, orden, asc])

  // ---------- resumen ----------
  const resumen = useMemo(() => {
    const n = filtradas.length
    const fuera = filtradas.filter((f) => f.fueraDeNorma).length
    const copiadas = filtradas.filter((f) => f.resOrigen === 'copiado').length
    const prom = (sel: (f: RegistroLab) => number | undefined) => {
      const xs = filtradas.map(sel).filter((x): x is number => x !== undefined && Number.isFinite(x))
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined
    }
    return {
      n, fuera, copiadas,
      pctFuera: n ? (fuera / n) * 100 : 0,
      po: prom((f) => f.po), pcc: prom((f) => f.pcc), ucc: prom((f) => f.uccPct),
    }
  }, [filtradas])

  const th = (key: OrdenKey, label: string, num = false) => (
    <th className={num ? 'num' : undefined}
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => { if (orden === key) setAsc((v) => !v); else { setOrden(key); setAsc(false) } }}
      title="Ordenar por esta columna">
      {label}{orden === key ? (asc ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const hayFiltro = !!(buscar || modelo || version || desde || hasta || soloFuera || soloMedidas)

  return (
    <div>
      <div className="section-title" style={{ margin: '0 0 4px' }}>Registro General de Laboratorio</div>
      <div className="meta" style={{ marginBottom: 12 }}>
        Valores <strong>reales</strong> de todos los ensayos, tal como se midieron. Es la fuente
        de consulta para Diseño; lo que se edita en un protocolo para el cliente no llega acá.
      </div>

      {/* ---------- filtros ---------- */}
      <div className="card">
        <div className="form-grid">
          <div className="field">
            <label>Buscar</label>
            <input className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)}
              placeholder="modelo, N° de fabricación, serie, cliente, OT…" />
          </div>
          <div className="field">
            <label>Modelo</label>
            <select className="input" value={modelo} onChange={(e) => setModelo(e.target.value)}>
              <option value="">Todos ({modelos.length})</option>
              {modelos.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Versión de diseño</label>
            <select className="input" value={version} onChange={(e) => setVersion(e.target.value)}>
              <option value="">Todas</option>
              {versiones.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Desde</label>
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="field">
            <label>Hasta</label>
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </div>
        <div className="row-actions" style={{ marginTop: 10, flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
          <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={soloFuera} onChange={(e) => setSoloFuera(e.target.checked)} />
            Solo fuera de norma
          </label>
          <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            title="Descarta los ensayos cuyas resistencias se copiaron de otra unidad">
            <input type="checkbox" checked={soloMedidas} onChange={(e) => setSoloMedidas(e.target.checked)} />
            Solo resistencias medidas
          </label>
          {hayFiltro && (
            <button className="btn" onClick={() => {
              setBuscar(''); setModelo(''); setVersion(''); setDesde(''); setHasta('')
              setSoloFuera(false); setSoloMedidas(false)
            }}>✕ Limpiar filtros</button>
          )}
          <button className="btn" disabled={cargando} onClick={() => void cargar()}>
            {cargando ? 'Cargando…' : '↻ Recargar'}
          </button>
          <button className="btn btn-primary" disabled={ordenadas.length === 0}
            onClick={() => exportarRegistroLabCSV(ordenadas)}
            title="Baja exactamente lo que estás viendo, con los filtros aplicados">
            ⬇ Exportar CSV ({ordenadas.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderLeft: '4px solid var(--rojo)', marginTop: 12 }}>
          <div className="meta" style={{ color: 'var(--rojo)', fontWeight: 700 }}>⚠ {error}</div>
        </div>
      )}

      {cargando ? (
        <div className="meta" style={{ marginTop: 14 }}>Leyendo el registro…</div>
      ) : filas.length === 0 && !error ? (
        <div className="card" style={{ marginTop: 12, borderLeft: '4px solid var(--naranja)' }}>
          <div className="meta">
            El registro está vacío. Se llena solo a medida que se guardan ensayos con
            versión de diseño cargada. Si ya hay ensayos viejos, hay que correr el backfill
            de <code>supabase_lab_registro_v1.99.sql</code> o volver a guardarlos desde la ficha.
          </div>
        </div>
      ) : (
        <>
          {/* ---------- resumen ---------- */}
          <div className="tot-cards" style={{ marginTop: 14 }}>
            <div className="tot-card">
              <div className="l">Ensayos</div>
              <div className="n">{resumen.n}</div>
            </div>
            <div className="tot-card" style={resumen.fuera ? { borderLeft: '4px solid var(--rojo)' } : undefined}>
              <div className="l">Fuera de norma</div>
              <div className="n" style={{ color: resumen.fuera ? 'var(--rojo)' : undefined }}>
                {resumen.fuera} <span style={{ fontSize: '.7em' }}>({fmt(resumen.pctFuera, 1)}%)</span>
              </div>
            </div>
            <div className="tot-card">
              <div className="l">Po promedio (W)</div>
              <div className="n">{fmt(resumen.po, 1)}</div>
            </div>
            <div className="tot-card">
              <div className="l">Pcc promedio (W)</div>
              <div className="n">{fmt(resumen.pcc, 1)}</div>
            </div>
            <div className="tot-card">
              <div className="l">ucc promedio (%)</div>
              <div className="n">{fmt(resumen.ucc)}</div>
            </div>
            <div className="tot-card" title="Ensayos cuyas resistencias no se midieron sobre la máquina">
              <div className="l">Con resistencias copiadas</div>
              <div className="n">{resumen.copiadas}</div>
            </div>
          </div>

          {/* ---------- evolución ---------- */}
          <div className="section-title" style={{ margin: '18px 0 8px' }}>Evolución</div>
          <div className="field" style={{ maxWidth: 340, marginBottom: 10 }}>
            <label>Valor a seguir</label>
            <select className="input" value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaKey)}>
              {METRICAS.map((m) => <option key={m.key} value={m.key}>{m.label} ({m.unidad})</option>)}
            </select>
          </div>
          <EvolucionRegistro filas={filtradas} metrica={metrica} />

          {/* ---------- tabla ---------- */}
          <div className="section-title" style={{ margin: '18px 0 8px' }}>
            Detalle · {ordenadas.length} {ordenadas.length === 1 ? 'ensayo' : 'ensayos'}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla-detalle tabla-cards">
              <thead>
                <tr>
                  {th('fecha', 'Fecha')}
                  {th('modelo', 'Modelo · versión')}
                  <th>N° fabr.</th>
                  <th>Serie</th>
                  <th>Cliente</th>
                  {th('po', 'Po (W)', true)}
                  <th className="num">io (%)</th>
                  {th('pcc', 'Pcc (W)', true)}
                  {th('uccPct', 'ucc (%)', true)}
                  <th className="num">uR (%)</th>
                  <th className="num">uX (%)</th>
                  {th('pTotal', 'PT (W)', true)}
                  <th>Resist.</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.slice(0, tope).map((f) => (
                  <tr key={f.id} className={f.fueraDeNorma ? 'fila-demora' : undefined}>
                    <td data-label="Fecha">{f.fecha}</td>
                    <td data-label="Modelo · versión">
                      {f.modelo} <span className="rol-badge">v{f.versionDiseno}</span>
                    </td>
                    <td data-label="N° fabr.">{f.nroFabricacion ?? '—'}</td>
                    <td data-label="Serie">{f.nroSerie ?? '—'}</td>
                    <td data-label="Cliente">{f.cliente ?? 'Stock'}</td>
                    <td data-label="Po (W)" className="num">{fmt(f.po, 1)}</td>
                    <td data-label="io (%)" className="num">{fmt(f.ioPct)}</td>
                    <td data-label="Pcc (W)" className="num">{fmt(f.pcc, 1)}</td>
                    <td data-label="ucc (%)" className="num">{fmt(f.uccPct)}</td>
                    <td data-label="uR (%)" className="num">{fmt(f.urccPct)}</td>
                    <td data-label="uX (%)" className="num">{fmt(f.uxccPct)}</td>
                    <td data-label="PT (W)" className="num">{fmt(f.pTotal, 1)}</td>
                    <td data-label="Resist." title={f.resOrigen === 'copiado'
                      ? 'Las resistencias se copiaron de otra unidad, no se midieron acá'
                      : 'Resistencias medidas sobre esta máquina'}>
                      {f.resOrigen === 'copiado' ? '📋 copiada' : f.resOrigen === 'medido' ? '✓ medida' : '—'}
                    </td>
                    <td data-label="Estado">
                      {f.fueraDeNorma
                        ? <span style={{ color: 'var(--rojo)', fontWeight: 700 }}>Fuera de norma</span>
                        : <span style={{ color: 'var(--estado-fin)' }}>En norma</span>}
                      {f.ensayosRechazados ? <div className="meta">{f.ensayosRechazados}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {ordenadas.length === 0 && (
            <div className="meta" style={{ marginTop: 10 }}>
              Ningún ensayo coincide con los filtros.
            </div>
          )}
          {tope < ordenadas.length && (
            <button className="btn btn-bloque" style={{ marginTop: 10 }}
              onClick={() => setTope((t) => t + PAGINA)}>
              Ver más ({ordenadas.length - tope} restantes)
            </button>
          )}
        </>
      )}
    </div>
  )
}
