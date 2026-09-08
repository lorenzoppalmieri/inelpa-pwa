import { useMemo } from 'react'
import type { MedicionesEnsayo } from '../../types'
import {
  FACTORES_CONMUTACION, POSICIONES, TOL_RELACION_PCT,
  tensionTeorica, relacionTeorica, desvioPct, relacionEnNorma,
} from '../../lib/ensayosNorma'

// ============================================================
// 1. MEDICIÓN DE RELACIÓN DE TRANSFORMACIÓN (v1.100)
//
// Del documento de Laboratorio:
//   "Se dispondrá de una tabla donde se indique para todos los puntos de
//    conmutación la tensión y relación de transformación teórica. Luego de
//    ingresar los valores medidos, se indicará para cada punto el desvío por
//    sobre el valor teórico, e indicar si este se encuentra dentro de norma."
//
// La teórica NO se guarda: se deriva de la tensión nominal y del divisor de BT,
// exactamente como ya lo hacía la planilla del protocolo. Guardar un número que
// se puede calcular es pedir que algún día quede desactualizado respecto de la
// fórmula que lo generó.
// ============================================================

const FASES = ['U', 'V', 'W']

export interface RelState {
  tensionNominal: string     // tensión de AT, en V
  divisor: string            // tensión de BT por fase (400/√3 = 231)
  medidas: string[][]        // [fase][posición]
}

function n(v: string): number | undefined {
  const s = (v ?? '').trim().replace(',', '.')
  if (!s) return undefined
  const x = Number(s)
  return Number.isFinite(x) ? x : undefined
}
function f(v?: number, d = 3): string {
  return v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ',')
}

/**
 * SIEMPRE arma 3 filas, aunque el transformador sea monofásico. Si el estado
 * se dimensionara según `nf`, pasar de monofásico a trifásico dejaría las filas
 * 2 y 3 inexistentes y no habría dónde escribir: el input se vería pero el
 * `setMedida` no tendría fila que mapear. El componente decide cuántas MUESTRA.
 */
export function relInicial(g?: MedicionesEnsayo): RelState {
  const r = g?.relacion
  const base = Array.from({ length: 3 }, (_, i) =>
    POSICIONES.map((_, j) => {
      const x = r?.medidas?.[i]?.[j]
      return x === null || x === undefined ? '' : String(x)
    }))
  return {
    tensionNominal: r?.tensionNominal === undefined ? '' : String(r.tensionNominal),
    divisor: String(r?.relDivisor ?? 231),
    medidas: base,
  }
}

/** `nf` recorta a una sola fila en monofásico: no se guardan fases que no existen. */
export function relAMediciones(v: RelState, nf: 1 | 3): NonNullable<MedicionesEnsayo['relacion']> {
  return {
    tensionNominal: n(v.tensionNominal),
    relDivisor: n(v.divisor),
    medidas: v.medidas.slice(0, nf === 3 ? 3 : 1).map((fila) => fila.map((x) => n(x) ?? null)),
  }
}

export default function SeccionRelacion({ v, set, nf, soloLectura = false }: {
  v: RelState
  set: (s: RelState) => void
  nf: 1 | 3
  soloLectura?: boolean
}) {
  const un = n(v.tensionNominal)
  const div = n(v.divisor)

  const teoricas = useMemo(
    () => FACTORES_CONMUTACION.map((_, j) => relacionTeorica(un, div, j)),
    [un, div])
  const tensiones = useMemo(
    () => FACTORES_CONMUTACION.map((_, j) => tensionTeorica(un, j)),
    [un])

  const filas = nf === 3 ? FASES : ['—']

  // Resumen: cuántos puntos medidos se fueron de tolerancia.
  const fuera = useMemo(() => {
    let mal = 0, total = 0
    v.medidas.forEach((fila) => fila.forEach((x, j) => {
      const d = desvioPct(n(x), teoricas[j])
      if (d === undefined) return
      total++
      if (relacionEnNorma(d) === false) mal++
    }))
    return { mal, total }
  }, [v.medidas, teoricas])

  const setMedida = (i: number, j: number, val: string) =>
    set({ ...v, medidas: v.medidas.map((fila, a) => fila.map((x, b) => (a === i && b === j ? val : x))) })

  return (
    <div>
      <div className="section-title" style={{ margin: '18px 0 8px' }}>
        Medición de relación de transformación
      </div>

      <div className="form-grid">
        <div className="field">
          <label>Tensión nominal de AT [V]</label>
          <input className="input" type="number" inputMode="decimal" value={v.tensionNominal}
            disabled={soloLectura} placeholder="ej. 13200"
            onChange={(e) => set({ ...v, tensionNominal: e.target.value })} />
        </div>
        <div className="field">
          <label>Divisor · tensión de BT por fase [V]</label>
          <input className="input" type="number" inputMode="decimal" value={v.divisor}
            disabled={soloLectura}
            onChange={(e) => set({ ...v, divisor: e.target.value })} />
          <div className="meta" style={{ marginTop: 4 }}>231 V = 400 / √3 (secundario en estrella)</div>
        </div>
      </div>

      {(un === undefined || div === undefined) ? (
        <div className="card" style={{ marginTop: 10, borderLeft: '4px solid var(--naranja)' }}>
          <div className="meta">
            Cargá la tensión nominal y el divisor para que aparezcan la relación teórica
            y el desvío de cada punto.
          </div>
        </div>
      ) : null}

      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <table className="tabla-detalle">
          <thead>
            <tr>
              <th>Posición del conmutador</th>
              {POSICIONES.map((p, j) => (
                <th key={p} className="num">
                  {p}
                  <div className="meta" style={{ fontWeight: 400 }}>
                    {((FACTORES_CONMUTACION[j] - 1) * 100).toFixed(1).replace('.', ',').replace('-', '−')}%
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th style={{ textAlign: 'left' }}>Tensión teórica [V]</th>
              {tensiones.map((t, j) => <td key={j} className="num">{f(t, 0)}</td>)}
            </tr>
            <tr>
              <th style={{ textAlign: 'left' }}>Relación teórica</th>
              {teoricas.map((t, j) => <td key={j} className="num"><strong>{f(t)}</strong></td>)}
            </tr>

            {filas.map((fa, i) => (
              <tr key={fa}>
                <th style={{ textAlign: 'left' }}>{nf === 3 ? `Medida · fase ${fa}` : 'Medida'}</th>
                {POSICIONES.map((_, j) => (
                  <td key={j} className="num">
                    <input className="input" type="number" inputMode="decimal" step="0.001"
                      value={v.medidas[i]?.[j] ?? ''} disabled={soloLectura}
                      style={{ width: 92, padding: '2px 6px' }}
                      onChange={(e) => setMedida(i, j, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}

            {filas.map((fa, i) => (
              <tr key={`d-${fa}`}>
                <th style={{ textAlign: 'left' }}>
                  Desvío {nf === 3 ? `· fase ${fa}` : ''} [%]
                </th>
                {POSICIONES.map((_, j) => {
                  const d = desvioPct(n(v.medidas[i]?.[j] ?? ''), teoricas[j])
                  const ok = relacionEnNorma(d)
                  return (
                    <td key={j} className="num" style={{
                      color: ok === false ? 'var(--rojo)' : ok === true ? 'var(--estado-fin)' : undefined,
                      fontWeight: ok === undefined ? undefined : 700,
                    }} title={ok === false ? `Supera la tolerancia de ±${TOL_RELACION_PCT}%` : undefined}>
                      {d === undefined ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(2).replace('.', ',')}`}
                      {ok === false ? ' ✗' : ok === true ? ' ✓' : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="meta" style={{ marginTop: 8 }}>
        Tolerancia de norma: <strong>±{TOL_RELACION_PCT}%</strong> sobre la relación declarada
        (IRAM 2250 / IEC 60076-1).
        {fuera.total > 0 && (
          <> · {fuera.total} punto{fuera.total === 1 ? '' : 's'} medido{fuera.total === 1 ? '' : 's'},{' '}
            {fuera.mal === 0
              ? <strong style={{ color: 'var(--estado-fin)' }}>todos en tolerancia</strong>
              : <strong style={{ color: 'var(--rojo)' }}>{fuera.mal} fuera de tolerancia</strong>}
          </>
        )}
      </div>
    </div>
  )
}
