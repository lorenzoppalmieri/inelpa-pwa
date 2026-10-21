import { useEffect, useRef, useState } from 'react'
import { planoVigente, descargarPlano, type Plano } from '../../lib/planos'
import { abrirPdf, type PdfDocumento, type PdfRenderTask } from '../../lib/pdfjs'

// ============================================================
// VISOR DE PLANO INCRUSTADO (v2.38)
//
// Muestra el plano vigente del semielaborado ADENTRO de la tarjeta de la tarea:
// sin links externos, sin descargas, sin salir de la app. Cada página se dibuja
// en un <canvas> con pdf.js (ver lib/pdfjs.ts por qué no un <iframe>).
//
//  - Ajustado al ancho de la tarjeta; se vuelve a dibujar si cambia el ancho
//    (ej. girar la tablet) o el zoom.
//  - Zoom con botones (−, Ajustar, +) y "Pantalla completa" para mirar detalle.
//  - Solo con conexión (decisión de Lorenzo). Sin señal muestra un aviso y se
//    reintenta solo cuando vuelve la red.
//
// `autoCargar`: true = lo baja apenas la tarjeta entra en pantalla (tarea en
// curso). false = muestra un botón "Ver plano" y recién ahí lo baja. Así una
// lista de 10 tareas pendientes no baja 10 planos de golpe por el Wi-Fi de planta.
// ============================================================

type Estado = 'espera' | 'cargando' | 'listo' | 'sin_plano' | 'sin_conexion' | 'error'

const ZOOMS = [1, 1.5, 2, 3, 4]
// Tope de píxeles por página: un plano A1 con zoom 4 en una tablet con pantalla
// de alta densidad pide un canvas de >20 millones de píxeles, y el navegador lo
// deja en blanco (o se cierra la pestaña). Por encima de esto se baja la nitidez.
const MAX_PIXELES = 12_000_000

export default function VisorPlano({ componenteCodigo, autoCargar = true }: {
  componenteCodigo?: string
  autoCargar?: boolean
}) {
  const [pedido, setPedido] = useState(autoCargar)
  const [visible, setVisible] = useState(false)
  const [estado, setEstado] = useState<Estado>('espera')
  const [error, setError] = useState('')
  const [plano, setPlano] = useState<Plano | null>(null)
  const [doc, setDoc] = useState<PdfDocumento | null>(null)
  const [zoomIdx, setZoomIdx] = useState(0)
  const [completa, setCompleta] = useState(false)
  const [ancho, setAncho] = useState(0)
  const [reintento, setReintento] = useState(0)
  const cajaRef = useRef<HTMLDivElement>(null)
  const paginasRef = useRef<HTMLDivElement>(null)

  // Si la tarea pasa a "en proceso", el plano se abre solo.
  useEffect(() => { if (autoCargar) setPedido(true) }, [autoCargar])

  // 0) ¿Ya está en pantalla? No se baja nada para tarjetas que nadie miró.
  useEffect(() => {
    const el = cajaRef.current
    if (!el || visible) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect() }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible, componenteCodigo])

  // 1) Buscar el plano vigente, bajarlo y abrirlo.
  useEffect(() => {
    if (!componenteCodigo || !pedido || !visible) return
    let cancelado = false
    let abierto: PdfDocumento | null = null
    setDoc(null)
    setError('')
    if (!navigator.onLine) { setEstado('sin_conexion'); return }
    setEstado('cargando')
    ;(async () => {
      const r = await planoVigente(componenteCodigo)
      if (cancelado) return
      if (r.error) { setError(r.error); setEstado(navigator.onLine ? 'error' : 'sin_conexion'); return }
      if (!r.plano) { setPlano(null); setEstado('sin_plano'); return }
      setPlano(r.plano)
      const bytes = await descargarPlano(r.plano.ruta)
      if (cancelado) return
      abierto = await abrirPdf(bytes)
      if (cancelado) { void abierto.destroy(); return }
      setDoc(abierto)
      setEstado('listo')
    })().catch((e: unknown) => {
      if (cancelado) return
      setError(e instanceof Error ? e.message : 'No se pudo mostrar el plano.')
      setEstado(navigator.onLine ? 'error' : 'sin_conexion')
    })
    return () => { cancelado = true; if (abierto) void abierto.destroy() }
  }, [componenteCodigo, pedido, visible, reintento])

  // Sin señal: se reintenta solo cuando vuelve la red.
  useEffect(() => {
    if (estado !== 'sin_conexion') return
    const alVolver = () => setReintento((n) => n + 1)
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [estado])

  // 2) Ancho disponible (se vuelve a dibujar al girar la tablet o en pantalla completa).
  useEffect(() => {
    const el = cajaRef.current
    if (!el || typeof ResizeObserver === 'undefined') { if (el) setAncho(el.clientWidth); return }
    let t: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver((ents) => {
      const w = Math.floor(ents[0]?.contentRect.width ?? 0)
      clearTimeout(t)
      // v2.40: cambios de pocos píxeles (aparece/desaparece una barra de
      // scroll) no justifican redibujar el plano entero.
      t = setTimeout(() => setAncho((prev) => (Math.abs(w - prev) < 24 ? prev : w)), 150)
    })
    ro.observe(el)
    setAncho(el.clientWidth)
    return () => { clearTimeout(t); ro.disconnect() }
  }, [estado])

  // 3) Dibujar las páginas.
  useEffect(() => {
    const cont = paginasRef.current
    if (!doc || !cont || ancho <= 0) return
    let cancelado = false
    const tareas: PdfRenderTask[] = []
    const zoom = ZOOMS[zoomIdx]
    // Ancho útil: el de la caja menos el padding de la zona de páginas.
    const util = Math.max(200, ancho - 16)
    cont.replaceChildren()
    ;(async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      for (let n = 1; n <= doc.numPages; n++) {
        if (cancelado) return
        const pagina = await doc.getPage(n)
        if (cancelado) return
        const base = pagina.getViewport({ scale: 1 })
        const escalaCss = (util / base.width) * zoom
        let escala = escalaCss * dpr
        if (base.width * base.height * escala * escala > MAX_PIXELES) {
          escala = Math.sqrt(MAX_PIXELES / (base.width * base.height))
        }
        const vp = pagina.getViewport({ scale: escala })
        const canvas = document.createElement('canvas')
        canvas.className = 'visor-plano-pagina'
        canvas.width = Math.floor(vp.width)
        canvas.height = Math.floor(vp.height)
        // v2.40 — BUG "el zoom no se detiene": antes el ancho iba en PÍXELES
        // fijos (= ancho medido). Adentro de una tabla (panel Planos) o de una
        // grilla, ese ancho fijo + la barra de scroll empujaba la celda unos
        // píxeles; el observador medía la caja más ancha, redibujaba más grande,
        // la celda volvía a crecer... y así sin fin.
        // Ahora el ancho es un PORCENTAJE del contenedor: el canvas nunca empuja
        // el layout (un canvas con ancho en % no aporta ancho mínimo), así que
        // la medición no puede realimentarse. El ancho medido solo define la
        // NITIDEZ (píxeles internos del canvas), no el tamaño en pantalla.
        canvas.style.width = `${Math.round(zoom * 100)}%`
        canvas.style.height = 'auto'
        cont.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        const tarea = pagina.render({ canvasContext: ctx, viewport: vp, canvas })
        tareas.push(tarea)
        try { await tarea.promise } catch { /* cancelada por un redibujo: normal */ }
      }
    })().catch(() => { /* página dañada: se ve lo que se pudo dibujar */ })
    return () => { cancelado = true; tareas.forEach((t) => t.cancel()) }
  }, [doc, ancho, zoomIdx])

  // Escape cierra la pantalla completa.
  useEffect(() => {
    if (!completa) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setCompleta(false) }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [completa])

  if (!componenteCodigo) return null

  const titulo = `📐 Plano${plano?.revision ? ` · Rev ${plano.revision}` : ''}`

  return (
    <div className={'visor-plano' + (completa ? ' pantalla-completa' : '')} ref={cajaRef}>
      {!pedido ? (
        <button className="btn btn-bloque" onClick={() => setPedido(true)}>📐 Ver plano</button>
      ) : (
        <>
          <div className="visor-plano-head">
            <span className="visor-plano-titulo">{titulo}</span>
            {estado === 'listo' && (
              <div className="visor-plano-ctrl">
                <button className="btn" disabled={zoomIdx === 0} onClick={() => setZoomIdx((z) => Math.max(0, z - 1))} aria-label="Alejar">−</button>
                <button className="btn" disabled={zoomIdx === 0} onClick={() => setZoomIdx(0)}>Ajustar</button>
                <button className="btn" disabled={zoomIdx === ZOOMS.length - 1} onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))} aria-label="Acercar">＋</button>
                <span className="meta">{Math.round(ZOOMS[zoomIdx] * 100)}%</span>
                <button className="btn" onClick={() => setCompleta((c) => !c)}>{completa ? '✕ Cerrar' : '⛶ Pantalla completa'}</button>
              </div>
            )}
          </div>

          {estado === 'espera' || estado === 'cargando' ? (
            <div className="visor-plano-aviso">Cargando plano…</div>
          ) : estado === 'sin_plano' ? (
            <div className="visor-plano-aviso">Este semielaborado todavía no tiene plano cargado.</div>
          ) : estado === 'sin_conexion' ? (
            <div className="visor-plano-aviso">
              Sin conexión: el plano se va a ver cuando vuelva la señal.{' '}
              <button className="btn-link" onClick={() => setReintento((n) => n + 1)}>Reintentar</button>
            </div>
          ) : estado === 'error' ? (
            <div className="visor-plano-aviso error">
              {error || 'No se pudo mostrar el plano.'}{' '}
              <button className="btn-link" onClick={() => setReintento((n) => n + 1)}>Reintentar</button>
            </div>
          ) : null}

          {/* Las páginas las agrega el efecto (3) como <canvas>. React no pone
              hijos acá adentro, así que no se pisan. */}
          <div className="visor-plano-paginas" ref={paginasRef} hidden={estado !== 'listo'} />
        </>
      )}
    </div>
  )
}
