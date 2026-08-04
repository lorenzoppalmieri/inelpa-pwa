import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  TARIMAS_INELPA, calcularCubicaje, evaluarDistribucion,
  type EspacioCarga, type ItemCarga, type PiezaUbicada, type TarimaInelpa, type TarimaInelpaId,
} from '../../sgo/logistica'
import { fechaLocalISO } from '../../lib/time'

// ============================================================
// CUBICAJE Y CARGA (v1.47) — planificador de cómo entra la carga en el camión.
//
// Vivía dentro de Auditoría de Logística (módulo SGO), pero no es una auditoría:
// es una herramienta operativa del día a día de Giuliano. Se movió al módulo de
// Logística. El cálculo sigue en sgo/logistica.ts, que es donde están los tests.
// ============================================================

const COLORES_CARGA = ['#2563eb', '#f59e0b', '#16a34a', '#7c3aed', '#dc2626', '#0891b2', '#db2777']

function Kpi({ valor, label, tono }: { valor: number | string; label: string; tono: string }) {
  return <div className={`sgo-log-kpi tono-${tono}`}><strong>{valor}</strong><span>{label}</span></div>
}

export default function CubicajeCarga() {
  const [espacio, setEspacio] = useState<EspacioCarga>({ nombre: 'Semirremolque orientativo', largoM: 13.6, anchoM: 2.45, altoM: 2.7, cargaMaxKg: 24000 })
  const tarimaInicial = TARIMAS_INELPA[0]
  const [items, setItems] = useState<ItemCarga[]>([
    { id: crypto.randomUUID(), descripcion: 'Transformador TTD16 a TTD40', tarimaId: tarimaInicial.id, cantidad: 1, largoM: tarimaInicial.largoM, anchoM: tarimaInicial.anchoM, altoM: 0, pesoKg: 0, rotatable: true, apilable: false, color: COLORES_CARGA[0] },
  ])
  const resultado = useMemo(() => calcularCubicaje(items, espacio), [items, espacio])
  const [ubicaciones, setUbicaciones] = useState<PiezaUbicada[]>([])
  const [seleccionadaId, setSeleccionadaId] = useState<string>()
  const planoRef = useRef<HTMLDivElement>(null)
  const arrastreRef = useRef<{ id: string; pointerId: number; offsetXM: number; offsetYM: number } | undefined>(undefined)
  const evaluacion = useMemo(() => evaluarDistribucion(ubicaciones, espacio), [ubicaciones, espacio])
  const conflictivas = useMemo(() => new Set([...evaluacion.fueraDeLimites, ...evaluacion.superpuestos]), [evaluacion])
  const seleccionada = ubicaciones.find((p) => p.id === seleccionadaId)

  useEffect(() => {
    setUbicaciones([...resultado.ubicaciones, ...resultado.pendientesUbicacion])
    setSeleccionadaId(undefined)
  }, [resultado])

  function setItem(id: string, campo: keyof ItemCarga, valor: string | number | boolean) {
    setItems((actuales) => actuales.map((i) => {
      if (i.id !== id) return i
      const actualizado = { ...i, [campo]: valor }
      if (campo === 'largoM' || campo === 'anchoM') actualizado.tarimaId = 'personalizada'
      return actualizado
    }))
  }
  function agregar() {
    setItems((actuales) => [...actuales, { id: crypto.randomUUID(), descripcion: 'Carga personalizada', tarimaId: 'personalizada', cantidad: 1, largoM: 1, anchoM: 1, altoM: 0, pesoKg: 0, rotatable: true, apilable: false, color: COLORES_CARGA[actuales.length % COLORES_CARGA.length] }])
  }
  function agregarTarima(tarima: TarimaInelpa) {
    setItems((actuales) => [...actuales, {
      id: crypto.randomUUID(), descripcion: 'Transformador ' + tarima.rangoTransformador, tarimaId: tarima.id,
      cantidad: 1, largoM: tarima.largoM, anchoM: tarima.anchoM, altoM: 0, pesoKg: 0,
      rotatable: true, apilable: false, color: COLORES_CARGA[actuales.length % COLORES_CARGA.length],
    }])
  }
  function aplicarTarima(id: string, tarimaId: TarimaInelpaId | 'personalizada') {
    const tarima = TARIMAS_INELPA.find((t) => t.id === tarimaId)
    setItems((actuales) => actuales.map((i) => i.id !== id ? i : tarima
      ? { ...i, tarimaId: tarima.id, largoM: tarima.largoM, anchoM: tarima.anchoM }
      : { ...i, tarimaId: 'personalizada' }))
  }
  function restablecerDistribucion() {
    setUbicaciones([...resultado.ubicaciones, ...resultado.pendientesUbicacion])
    setSeleccionadaId(undefined)
  }
  function iniciarArrastre(e: ReactPointerEvent<HTMLDivElement>, pieza: PiezaUbicada) {
    const rect = planoRef.current?.getBoundingClientRect()
    if (!rect || !espacio.largoM || !espacio.anchoM) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const puntoXM = ((e.clientX - rect.left) / rect.width) * espacio.largoM
    const puntoYM = ((e.clientY - rect.top) / rect.height) * espacio.anchoM
    arrastreRef.current = { id: pieza.id, pointerId: e.pointerId, offsetXM: puntoXM - pieza.xM, offsetYM: puntoYM - pieza.yM }
    setSeleccionadaId(pieza.id)
  }
  function arrastrar(e: ReactPointerEvent<HTMLDivElement>) {
    const arrastre = arrastreRef.current
    const rect = planoRef.current?.getBoundingClientRect()
    if (!arrastre || arrastre.pointerId !== e.pointerId || !rect || !espacio.largoM || !espacio.anchoM) return
    setUbicaciones((actuales) => actuales.map((p) => {
      if (p.id !== arrastre.id) return p
      const puntoXM = ((e.clientX - rect.left) / rect.width) * espacio.largoM
      const puntoYM = ((e.clientY - rect.top) / rect.height) * espacio.anchoM
      const maxX = Math.max(0, espacio.largoM - p.largoM)
      const maxY = Math.max(0, espacio.anchoM - p.anchoM)
      const xM = Math.round(Math.min(maxX, Math.max(0, puntoXM - arrastre.offsetXM)) * 100) / 100
      const yM = Math.round(Math.min(maxY, Math.max(0, puntoYM - arrastre.offsetYM)) * 100) / 100
      return { ...p, xM, yM }
    }))
  }
  function terminarArrastre(e: ReactPointerEvent<HTMLDivElement>) {
    if (arrastreRef.current?.pointerId === e.pointerId) arrastreRef.current = undefined
  }
  function moverSeleccionada(dx: number, dy: number) {
    if (!seleccionadaId) return
    setUbicaciones((actuales) => actuales.map((p) => {
      if (p.id !== seleccionadaId) return p
      return {
        ...p,
        xM: Math.round(Math.min(Math.max(0, espacio.largoM - p.largoM), Math.max(0, p.xM + dx)) * 100) / 100,
        yM: Math.round(Math.min(Math.max(0, espacio.anchoM - p.anchoM), Math.max(0, p.yM + dy)) * 100) / 100,
      }
    }))
  }
  function rotarSeleccionada() {
    if (!seleccionadaId) return
    setUbicaciones((actuales) => actuales.map((p) => {
      if (p.id !== seleccionadaId) return p
      const largoM = p.anchoM
      const anchoM = p.largoM
      const centroX = p.xM + p.largoM / 2
      const centroY = p.yM + p.anchoM / 2
      return {
        ...p, largoM, anchoM,
        xM: Math.round(Math.min(Math.max(0, espacio.largoM - largoM), Math.max(0, centroX - largoM / 2)) * 100) / 100,
        yM: Math.round(Math.min(Math.max(0, espacio.anchoM - anchoM), Math.max(0, centroY - anchoM / 2)) * 100) / 100,
      }
    }))
  }
  function descargarCSV() {
    const lineas = [
      ['Descripción', 'Tarima', 'Cantidad', 'Largo m', 'Ancho m', 'Alto m', 'Peso unitario kg', 'Rotable', 'Apilable'],
      ...items.map((i) => [i.descripcion, i.tarimaId ?? 'personalizada', i.cantidad, i.largoM, i.anchoM, i.altoM, i.pesoKg, i.rotatable ? 'Sí' : 'No', i.apilable ? 'Sí' : 'No']),
      [],
      ['Vehículo', espacio.nombre], ['Dimensiones', `${espacio.largoM} x ${espacio.anchoM} x ${espacio.altoM} m`],
      ['Volumen utilizado', `${resultado.usoVolumenPct}%`], ['Peso utilizado', `${resultado.usoPesoPct}%`], ['Unidades no ubicadas', resultado.unidadesNoUbicadas],
      [],
      ['Posición', 'Descripción', 'X desde frente (m)', 'Y desde lateral (m)', 'Largo ocupado (m)', 'Ancho ocupado (m)', 'Unidades apiladas'],
      ...ubicaciones.map((p, index) => [index + 1, p.descripcion, p.xM, p.yM, p.largoM, p.anchoM, p.unidades]),
      [],
      ['Distribución válida', evaluacion.valida ? 'Sí' : 'No'],
    ]
    const csv = lineas.map((fila) => fila.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `plan-carga-${fechaLocalISO()}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <div>
    <div className="card sgo-carga-aviso"><strong>Calculadora orientativa</strong><span>Sirve para anticipar volumen, peso y ocupación de piso. No certifica estabilidad, amarre, centro de gravedad ni cargas por eje.</span></div>
    <div className="card-header" style={{ marginBottom: 8 }}><div><div className="section-title" style={{ margin: 0 }}>Tarimas normalizadas INELPA</div><div className="meta">Huella exterior según PLANOS DE TARIMAS · Diseño y Desarrollo · 29/01/2026</div></div></div>
    <div className="sgo-tarimas-biblioteca">
      {TARIMAS_INELPA.map((tarima) => <div className="card sgo-tarima-card" key={tarima.id}>
        <div><strong>{tarima.nombre}</strong><span>{tarima.rangoTransformador}</span></div>
        <b>{tarima.largoM.toFixed(2)} × {tarima.anchoM.toFixed(2)} m</b>
        <span className="meta">Plano · hoja {tarima.hojaPlano}</span>
        <button className="btn" onClick={() => agregarTarima(tarima)}>+ Agregar</button>
      </div>)}
    </div>
    <div className="section-title">Espacio de carga</div>
    <div className="meta" style={{ marginBottom: 7 }}>Ingresá las medidas interiores reales y la capacidad del camión contratado. La distribución se recalcula al modificarlas.</div>
    <div className="card sgo-carga-espacio">
      <div className="field"><label>Nombre / unidad</label><input className="input" value={espacio.nombre} onChange={(e) => setEspacio({ ...espacio, nombre: e.target.value })} /></div>
      {([['largoM', 'Largo interior (m)'], ['anchoM', 'Ancho interior (m)'], ['altoM', 'Alto útil (m)'], ['cargaMaxKg', 'Carga máxima (kg)']] as [keyof EspacioCarga, string][]).map(([campo, label]) => <div className="field" key={campo}><label>{label}</label><input className="input" type="number" min="0" step="0.01" value={espacio[campo]} onChange={(e) => setEspacio({ ...espacio, [campo]: Math.max(0, Number(e.target.value) || 0) })} /></div>)}
    </div>

    <div className="card-header" style={{ margin: '18px 0 8px' }}><div className="section-title" style={{ margin: 0 }}>Bultos y equipos</div><button className="btn" onClick={agregar}>+ Agregar bulto</button></div>
    <div className="sgo-carga-items">
      {items.map((i, index) => <div className="card sgo-carga-item" key={i.id} style={{ borderLeftColor: i.color }}>
        <div className="field sgo-carga-desc"><label>Descripción</label><input className="input" value={i.descripcion} onChange={(e) => setItem(i.id, 'descripcion', e.target.value)} /></div>
        <div className="field sgo-carga-tarima-select"><label>Tarima</label><select className="input" value={i.tarimaId ?? 'personalizada'} onChange={(e) => aplicarTarima(i.id, e.target.value as TarimaInelpaId | 'personalizada')}>
          {TARIMAS_INELPA.map((tarima) => <option value={tarima.id} key={tarima.id}>{tarima.id} · {tarima.rangoTransformador}</option>)}
          <option value="personalizada">Medida personalizada</option>
        </select></div>
        {([['cantidad', 'Cantidad', 1], ['largoM', 'Largo tarima m', .01], ['anchoM', 'Ancho tarima m', .01], ['altoM', 'Altura total m', .01], ['pesoKg', 'kg/unidad', .1]] as [keyof ItemCarga, string, number][]).map(([campo, label, step]) => <div className="field" key={campo}><label>{label}</label><input className="input" type="number" min={campo === 'cantidad' ? 1 : 0} step={step} value={i[campo] as number} onChange={(e) => setItem(i.id, campo, campo === 'cantidad' ? Math.max(1, Number(e.target.value) || 1) : Math.max(0, Number(e.target.value) || 0))} /></div>)}
        <label className="check-inline"><input type="checkbox" checked={i.rotatable} onChange={(e) => setItem(i.id, 'rotatable', e.target.checked)} /> Puede rotar en planta</label>
        <label className="check-inline"><input type="checkbox" checked={i.apilable} onChange={(e) => setItem(i.id, 'apilable', e.target.checked)} /> Apilable</label>
        <button className="btn" disabled={items.length === 1} onClick={() => setItems((a) => a.filter((x) => x.id !== i.id))}>Quitar {index + 1}</button>
        {(!i.altoM || !i.pesoKg) && <div className="meta sgo-carga-incompleto">Completá la altura total y el peso para calcular volumen y capacidad. La tarima ya puede acomodarse en el plano.</div>}
      </div>)}
    </div>

    <div className="sgo-log-kpis" style={{ marginTop: 16 }}>
      <Kpi valor={`${resultado.volumenCargaM3} m³`} label={`de ${resultado.volumenEspacioM3} m³`} tono={resultado.usoVolumenPct > 100 ? 'rojo' : 'azul'} />
      <Kpi valor={`${resultado.usoVolumenPct}%`} label="Ocupación volumétrica" tono={resultado.usoVolumenPct > 100 ? 'rojo' : resultado.usoVolumenPct > 85 ? 'amarillo' : 'verde'} />
      <Kpi valor={`${resultado.pesoTotalKg} kg`} label={`${resultado.usoPesoPct}% de carga máxima`} tono={resultado.usoPesoPct > 100 ? 'rojo' : resultado.usoPesoPct > 85 ? 'amarillo' : 'verde'} />
      <Kpi valor={`${resultado.usoPisoPct}%`} label="Ocupación de piso estimada" tono={resultado.unidadesNoUbicadas ? 'rojo' : 'azul'} />
    </div>

    <div className="sgo-carga-layout">
      <div>
        <div className="card-header sgo-carga-plano-header"><div><div className="section-title" style={{ margin: 0 }}>Plano de carga editable</div><div className="meta">Arrastrá cada pallet. Tocá uno para rotarlo o moverlo con precisión.</div></div><div className="row-actions"><button className="btn" onClick={restablecerDistribucion}>Distribución automática</button><button className="btn" onClick={descargarCSV}>Exportar plan CSV</button></div></div>
        <div ref={planoRef} className="sgo-carga-plano sgo-carga-plano-editable" style={{ aspectRatio: `${Math.max(.1, espacio.largoM)} / ${Math.max(.1, espacio.anchoM)}` }}>
          {ubicaciones.map((p) => <div
            className={`sgo-carga-bulto ${seleccionadaId === p.id ? 'seleccionado' : ''} ${conflictivas.has(p.id) ? 'conflicto' : ''}`}
            key={p.id} title={`${p.descripcion} · ${p.unidades} unidad(es)`}
            onPointerDown={(e) => iniciarArrastre(e, p)} onPointerMove={arrastrar} onPointerUp={terminarArrastre} onPointerCancel={terminarArrastre}
            style={{ left: `${(p.xM / Math.max(.01, espacio.largoM)) * 100}%`, top: `${(p.yM / Math.max(.01, espacio.anchoM)) * 100}%`, width: `${(p.largoM / Math.max(.01, espacio.largoM)) * 100}%`, height: `${(p.anchoM / Math.max(.01, espacio.anchoM)) * 100}%`, background: p.color }}
          ><span>{p.descripcion}</span><small>{p.largoM.toFixed(2)} × {p.anchoM.toFixed(2)} m</small>{p.unidades > 1 && <b>×{p.unidades}</b>}</div>)}
        </div>
        <div className="meta">Frente del camión a la izquierda · posición X desde el frente e Y desde el lateral superior.</div>
        {seleccionada && <div className="card sgo-carga-seleccion">
          <div><strong>{seleccionada.descripcion}</strong><span>Posición X {seleccionada.xM.toFixed(2)} m · Y {seleccionada.yM.toFixed(2)} m · huella {seleccionada.largoM.toFixed(2)} × {seleccionada.anchoM.toFixed(2)} m</span></div>
          <button className="btn" onClick={rotarSeleccionada}>↻ Rotar 90°</button>
          <div className="sgo-carga-nudges"><button className="btn" aria-label="Mover hacia el frente" onClick={() => moverSeleccionada(-.05, 0)}>←</button><button className="btn" aria-label="Mover hacia el lateral superior" onClick={() => moverSeleccionada(0, -.05)}>↑</button><button className="btn" aria-label="Mover hacia el lateral inferior" onClick={() => moverSeleccionada(0, .05)}>↓</button><button className="btn" aria-label="Mover hacia atrás" onClick={() => moverSeleccionada(.05, 0)}>→</button></div>
        </div>}
      </div>
      <div className="card sgo-carga-advertencias">
        <strong>Estado del plano</strong>
        <div className={evaluacion.valida ? 'sgo-carga-ok' : 'sgo-carga-error'}>{evaluacion.valida ? '✓ Distribución sin superposiciones' : `⚠ Revisar ${evaluacion.superpuestos.length} pallet(s) superpuestos y ${evaluacion.fueraDeLimites.length} fuera de límites`}</div>
        <strong>Verificaciones obligatorias</strong>{resultado.advertencias.map((a) => <div key={a}>• {a}</div>)}
      </div>
    </div>

    <div className="section-title" style={{ marginTop: 20 }}>Próxima evolución: optimización 3D</div>
    <div className="sgo-carga-integraciones">
      <div className="card"><strong>Goodloading · integración recomendada</strong><p>La API puede devolver coordenadas, utilización, cargas por eje, centro de gravedad y un enlace a la animación 3D.</p><a className="btn" href="https://www.goodloading.com/en/api/integrations/" target="_blank" rel="noreferrer">Ver integración</a></div>
      <div className="card"><strong>EasyCargo · piloto manual</strong><p>Muy útil para probar planificación 3D, restricciones, reportes y carga desde Excel antes de contratar una integración.</p><a className="btn" href="https://www.easycargo3d.com/en/" target="_blank" rel="noreferrer">Ver EasyCargo</a></div>
    </div>
  </div>
}
