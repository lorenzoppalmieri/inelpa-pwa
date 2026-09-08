import { useMemo } from 'react'
import type { RegistroLab } from '../../lib/registroLab'

// ============================================================
// EVOLUCIÓN DE UN VALOR EN EL TIEMPO (v1.99)
//
// "Filtrar por modelos y versión de diseño, y conocer la evolución en valores
//  como tensión de cortocircuito, pérdidas en vacío y en cortocircuito, pero
//  también caída de tensión en reactancia o inductancia."
//
// SVG a mano, sin librería de gráficos: el proyecto no tiene ninguna y no se
// agregan dependencias (mismo criterio que la aguja del panel de ensayo).
//
// UNA SERIE POR VERSIÓN DE DISEÑO, que es justo la comparación que le interesa
// a Diseño: si la v3 bajó las pérdidas respecto de la v2, tiene que verse como
// dos nubes de puntos a distinta altura, no como una sola línea promediada.
// ============================================================

export type MetricaKey = 'uccPct' | 'po' | 'pcc' | 'urccPct' | 'uxccPct' | 'ioPct' | 'pTotal' | 'rendimientoPct'

export const METRICAS: { key: MetricaKey; label: string; unidad: string; dec: number }[] = [
  { key: 'uccPct', label: 'Tensión de cortocircuito ucc', unidad: '%', dec: 2 },
  { key: 'po', label: 'Pérdidas en vacío P0', unidad: 'W', dec: 1 },
  { key: 'pcc', label: 'Pérdidas en carga Pcc', unidad: 'W', dec: 1 },
  { key: 'uxccPct', label: 'Caída de tensión reactiva uX', unidad: '%', dec: 2 },
  { key: 'urccPct', label: 'Caída de tensión resistiva uR', unidad: '%', dec: 2 },
  { key: 'ioPct', label: 'Corriente de vacío io', unidad: '%', dec: 2 },
  { key: 'pTotal', label: 'Pérdidas totales', unidad: 'W', dec: 1 },
  { key: 'rendimientoPct', label: 'Rendimiento', unidad: '%', dec: 2 },
]

const COLORES = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#f87171', '#facc15', '#fb923c', '#22d3ee']

// Tope de series dibujadas. Sin filtrar por modelo hay cientos de combinaciones
// modelo×versión: se dibujarían cientos de líneas y una referencia infinita, y
// no se entendería nada. Se muestran las que más ensayos tienen y se avisa.
const MAX_SERIES = COLORES.length

const W = 900, H = 300
const M = { top: 14, right: 16, bottom: 34, left: 56 }
const IW = W - M.left - M.right
const IH = H - M.top - M.bottom

interface Punto { t: number; v: number; f: RegistroLab }

export default function EvolucionRegistro({ filas, metrica }: {
  filas: RegistroLab[]
  metrica: MetricaKey
}) {
  const def = METRICAS.find((m) => m.key === metrica) ?? METRICAS[0]

  // Agrupado por "modelo · versión": si no se filtró por modelo, dos modelos
  // distintos NO pueden compartir serie — sus valores no son comparables.
  const { series, ocultas } = useMemo(() => {
    const mapa = new Map<string, Punto[]>()
    for (const f of filas) {
      const v = f[metrica]
      if (v === undefined || !Number.isFinite(v)) continue
      const t = Date.parse(f.fecha)
      if (!Number.isFinite(t)) continue
      const clave = `${f.modelo} · v${f.versionDiseno}`
      const arr = mapa.get(clave) ?? []
      arr.push({ t, v, f })
      mapa.set(clave, arr)
    }
    const todas = [...mapa.entries()]
      .map(([clave, pts]) => ({ clave, pts: pts.sort((a, b) => a.t - b.t) }))
      // Las que más ensayos tienen son las que algo pueden decir: son las que
      // sobreviven al recorte.
      .sort((a, b) => b.pts.length - a.pts.length)
      .slice(0, MAX_SERIES)
    // Recién ACÁ se ordena alfabético. Si el color saliera del orden por
    // cantidad, agregar un ensayo podría reordenar las series y cambiarle el
    // color a todas: una versión no tendría color propio de una visita a otra.
    todas.sort((a, b) => a.clave.localeCompare(b.clave))
    return { series: todas, ocultas: mapa.size - todas.length }
  }, [filas, metrica])

  const todos = useMemo(() => series.flatMap((s) => s.pts), [series])

  if (todos.length === 0) {
    return (
      <div className="card">
        <div className="meta">
          No hay ensayos con <strong>{def.label}</strong> cargado para los filtros actuales.
        </div>
      </div>
    )
  }

  // ---------- escalas ----------
  const tMin = Math.min(...todos.map((p) => p.t))
  const tMax = Math.max(...todos.map((p) => p.t))
  const vMinReal = Math.min(...todos.map((p) => p.v))
  const vMaxReal = Math.max(...todos.map((p) => p.v))
  // Un 8% de aire arriba y abajo para que los puntos no queden pegados al borde.
  const pad = (vMaxReal - vMinReal) * 0.08 || Math.abs(vMaxReal) * 0.08 || 1
  const vMin = vMinReal - pad
  const vMax = vMaxReal + pad

  // Con una sola fecha (o un solo ensayo) el rango temporal es 0: se centra el
  // punto en vez de dividir por cero y mandarlo al infinito.
  const x = (t: number) => tMax === tMin ? M.left + IW / 2 : M.left + ((t - tMin) / (tMax - tMin)) * IW
  const y = (v: number) => vMax === vMin ? M.top + IH / 2 : M.top + IH - ((v - vMin) / (vMax - vMin)) * IH

  // 5 marcas horizontales, redondeadas para que el eje se lea.
  const ticks = Array.from({ length: 5 }, (_, i) => vMin + ((vMax - vMin) * i) / 4)
  const fechaCorta = (t: number) => new Date(t).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const fmtV = (v: number) => v.toFixed(def.dec).replace('.', ',')

  return (
    <div className="card">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`Evolución de ${def.label} por versión de diseño`}
        style={{ display: 'block', overflow: 'visible' }}>
        {/* grilla + eje Y */}
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)}
              stroke="var(--borde)" strokeWidth={1} strokeDasharray={i === 0 ? undefined : '3 4'} />
            <text x={M.left - 8} y={y(v) + 4} textAnchor="end"
              fill="var(--texto-tenue)" fontSize={11}>{fmtV(v)}</text>
          </g>
        ))}
        {/* eje X: primera y última fecha alcanzan; el detalle está en la tabla */}
        <text x={M.left} y={H - 10} fill="var(--texto-tenue)" fontSize={11}>{fechaCorta(tMin)}</text>
        {tMax !== tMin && (
          <text x={W - M.right} y={H - 10} textAnchor="end"
            fill="var(--texto-tenue)" fontSize={11}>{fechaCorta(tMax)}</text>
        )}
        <text x={M.left} y={M.top - 2} fill="var(--texto-tenue)" fontSize={11}>
          {def.label} [{def.unidad}]
        </text>

        {/* series */}
        {series.map((s, i) => {
          const color = COLORES[i % COLORES.length]
          const d = s.pts.map((p, k) => `${k === 0 ? 'M' : 'L'} ${x(p.t)} ${y(p.v)}`).join(' ')
          return (
            <g key={s.clave}>
              {s.pts.length > 1 && (
                <path d={d} fill="none" stroke={color} strokeWidth={2}
                  strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
              )}
              {s.pts.map((p) => (
                <circle key={p.f.id} cx={x(p.t)} cy={y(p.v)} r={4}
                  fill={p.f.fueraDeNorma ? 'var(--rojo)' : color}
                  stroke="var(--panel)" strokeWidth={1.5}>
                  <title>
                    {`${p.f.modelo} · v${p.f.versionDiseno}\n`}
                    {`${def.label}: ${fmtV(p.v)} ${def.unidad}\n`}
                    {`${p.f.fecha}${p.f.nroFabricacion ? ` · N° ${p.f.nroFabricacion}` : ''}`}
                    {p.f.fueraDeNorma ? '\n⚠ Fuera de norma' : ''}
                  </title>
                </circle>
              ))}
            </g>
          )
        })}
      </svg>

      {/* referencias */}
      <div className="row-actions" style={{ marginTop: 10, flexWrap: 'wrap', gap: 14 }}>
        {series.map((s, i) => (
          <span key={s.clave} className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 12, height: 12, borderRadius: 3, display: 'inline-block',
              background: COLORES[i % COLORES.length],
            }} />
            {s.clave} <span style={{ opacity: .7 }}>({s.pts.length})</span>
          </span>
        ))}
      </div>
      <div className="meta" style={{ marginTop: 8 }}>
        Cada línea es una <strong>versión de diseño</strong>. Los puntos rojos quedaron fuera de norma.
        Pasá el mouse por un punto para ver de qué transformador es.
      </div>
      {ocultas > 0 && (
        <div className="meta" style={{ marginTop: 6, color: 'var(--naranja)' }}>
          ⚠ Se están dibujando las {series.length} combinaciones modelo·versión con más ensayos.
          Quedaron {ocultas} afuera — filtrá por modelo para verlas.
        </div>
      )}
    </div>
  )
}
