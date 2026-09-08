import type { MedicionesEnsayo } from '../../types'
import {
  radDe, ipDe, lecturaIP, LABEL_AISLAMIENTO, colorAislamiento,
} from '../../lib/ensayosNorma'

// ============================================================
// 3. MEDICIÓN DE RESISTENCIA DE AISLAMIENTO (v1.100)
//
// Del documento de Laboratorio:
//   "De forma indispensable se deberá ingresar la temperatura de la máquina, y
//    un valor mínimo medido, para cada una de las tres mediciones: entre AT-BT,
//    entre AT-masa y entre BT-masa. Adicionalmente se podrán ingresar valores
//    medidos a tiempos específicos: 30 s, 60 s y 600 s (...) Y también de forma
//    adicional se podrá ingresar el RAD y el IP para las tres mediciones."
//
// Por eso la pantalla está partida en dos: arriba lo indispensable, siempre
// visible y marcado en rojo si falta; abajo, plegado, lo adicional. Si el
// laboratorista sólo hizo la medición rápida, no tiene que mirar 12 casilleros
// vacíos para cargar 4 números.
// ============================================================

/** Los tres pares que se miden. El orden es el del documento. */
export const PARES = [
  { key: 'atbt', label: 'AT / BT' },
  { key: 'atMasa', label: 'AT / masa' },
  { key: 'btMasa', label: 'BT / masa' },
] as const

export type ParKey = typeof PARES[number]['key']

export interface AisState {
  temp: string
  tensionKV: string
  tiempos: string[]                        // 3 tiempos de lectura, en s
  valores: Record<ParKey, string[]>        // 3 lecturas por par, en MΩ
  min: Record<ParKey, string>              // valor mínimo medido, en MΩ
  rad: Record<ParKey, string>              // override manual del RAD
  ip: Record<ParKey, string>               // override manual del IP
}

function n(v: string): number | undefined {
  const s = (v ?? '').trim().replace(',', '.')
  if (!s) return undefined
  const x = Number(s)
  return Number.isFinite(x) ? x : undefined
}
function f(v?: number, d = 2): string {
  return v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ',')
}
const vacio = (): Record<ParKey, string> => ({ atbt: '', atMasa: '', btMasa: '' })

/** Estado inicial a partir de lo que haya guardado (o vacío). */
export function aisInicial(g?: MedicionesEnsayo): AisState {
  const a = g?.aislamiento
  const tres = (xs?: (string | null)[]) => [0, 1, 2].map((i) => xs?.[i] ?? '')
  const s = (x?: number) => (x === undefined ? '' : String(x))
  return {
    temp: s(a?.temp),
    tensionKV: s(a?.tensionKV ?? 2.5),
    tiempos: (a?.tiempos ?? [30, 60, 600]).map(String),
    valores: { atbt: tres(a?.atbt), atMasa: tres(a?.atMasa), btMasa: tres(a?.btMasa) },
    min: { atbt: s(a?.minAtbt), atMasa: s(a?.minAtMasa), btMasa: s(a?.minBtMasa) },
    rad: { atbt: s(a?.radAtbt), atMasa: s(a?.radAtMasa), btMasa: s(a?.radBtMasa) },
    ip: { atbt: s(a?.ipAtbt), atMasa: s(a?.ipAtMasa), btMasa: s(a?.ipBtMasa) },
  }
}

/** RAD e IP efectivos: lo tipeado a mano gana sobre lo calculado. */
export function radIpDe(v: AisState, k: ParKey): { rad?: number; ip?: number; calculado: boolean } {
  const manualRad = n(v.rad[k])
  const manualIp = n(v.ip[k])
  const [r30, r60, r600] = v.valores[k].map(n)
  const calcRad = radDe(r30, r60)
  const calcIp = ipDe(r60, r600)
  return {
    rad: manualRad ?? calcRad,
    ip: manualIp ?? calcIp,
    calculado: (manualRad === undefined && calcRad !== undefined)
      || (manualIp === undefined && calcIp !== undefined),
  }
}

/** ¿Falta algo de lo indispensable? */
export function aisIncompleto(v: AisState): boolean {
  return n(v.temp) === undefined || PARES.some((p) => n(v.min[p.key]) === undefined)
}

/**
 * ¿Se cargó algo de este ensayo?
 *
 * Los ensayos de `ENSAYOS_LAB` son todos OPCIONALES: a los trafos chicos no se
 * les corren todos. Así que exigir temperatura y mínimos siempre bloquearía el
 * guardado de una ficha donde el aislamiento sencillamente no se midió. La
 * obligatoriedad del documento aplica cuando el ensayo SE HIZO, y eso se
 * detecta porque hay al menos un número cargado.
 */
export function aisIniciado(v: AisState): boolean {
  const algo = (x: string) => n(x) !== undefined
  return algo(v.temp)
    || PARES.some((p) => algo(v.min[p.key]) || algo(v.rad[p.key]) || algo(v.ip[p.key])
      || v.valores[p.key].some(algo))
}

/** Vuelca el estado al formato que se guarda. */
export function aisAMediciones(v: AisState): NonNullable<MedicionesEnsayo['aislamiento']> {
  const rr = (k: ParKey) => radIpDe(v, k)
  return {
    temp: n(v.temp),
    tensionKV: n(v.tensionKV),
    tiempos: v.tiempos.map((x) => n(x) ?? 0),
    atbt: v.valores.atbt,
    atMasa: v.valores.atMasa,
    btMasa: v.valores.btMasa,
    minAtbt: n(v.min.atbt), minAtMasa: n(v.min.atMasa), minBtMasa: n(v.min.btMasa),
    radAtbt: rr('atbt').rad, radAtMasa: rr('atMasa').rad, radBtMasa: rr('btMasa').rad,
    ipAtbt: rr('atbt').ip, ipAtMasa: rr('atMasa').ip, ipBtMasa: rr('btMasa').ip,
  }
}

export default function SeccionAislamiento({ v, set, soloLectura = false }: {
  v: AisState
  set: (s: AisState) => void
  soloLectura?: boolean
}) {
  const setCampo = <K extends keyof AisState>(k: K, val: AisState[K]) => set({ ...v, [k]: val })
  const setMapa = (k: 'min' | 'rad' | 'ip', par: ParKey, val: string) =>
    set({ ...v, [k]: { ...v[k], [par]: val } })
  const setValor = (par: ParKey, i: number, val: string) =>
    set({ ...v, valores: { ...v.valores, [par]: v.valores[par].map((x, j) => (j === i ? val : x)) } })
  const setTiempo = (i: number, val: string) =>
    set({ ...v, tiempos: v.tiempos.map((x, j) => (j === i ? val : x)) })

  const faltaTemp = n(v.temp) === undefined

  return (
    <div>
      <div className="section-title" style={{ margin: '18px 0 8px' }}>
        Medición de resistencia de aislamiento
      </div>

      {/* ---------- indispensable ---------- */}
      <div className="card" style={{ borderLeft: '4px solid ' + (aisIncompleto(v) ? 'var(--rojo)' : 'var(--estado-fin)') }}>
        <div className="meta" style={{ marginBottom: 8 }}>
          Indispensable: la temperatura de la máquina y el <strong>valor mínimo medido</strong> de
          cada par. Sin esto la medición no queda registrada.
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Temperatura de la máquina <span style={{ color: 'var(--rojo)' }}>*</span></label>
            <input className="input" type="number" inputMode="decimal" step="0.1"
              value={v.temp} disabled={soloLectura}
              style={faltaTemp ? { borderColor: 'var(--rojo)' } : undefined}
              onChange={(e) => setCampo('temp', e.target.value)} />
          </div>
          <div className="field">
            <label>Tensión de ensayo [kV]</label>
            <input className="input" type="number" inputMode="decimal" step="0.1"
              value={v.tensionKV} disabled={soloLectura}
              onChange={(e) => setCampo('tensionKV', e.target.value)} />
          </div>
        </div>
        <div className="form-grid" style={{ marginTop: 4 }}>
          {PARES.map((p) => {
            const falta = n(v.min[p.key]) === undefined
            return (
              <div className="field" key={p.key}>
                <label>Mínimo {p.label} [MΩ] <span style={{ color: 'var(--rojo)' }}>*</span></label>
                <input className="input" type="number" inputMode="decimal" step="0.01"
                  value={v.min[p.key]} disabled={soloLectura}
                  style={falta ? { borderColor: 'var(--rojo)' } : undefined}
                  onChange={(e) => setMapa('min', p.key, e.target.value)} />
              </div>
            )
          })}
        </div>
      </div>

      {/* ---------- adicional ---------- */}
      <details style={{ marginTop: 10 }}>
        <summary className="meta" style={{ cursor: 'pointer' }}>
          Valores a tiempos específicos, RAD e IP (opcional)
        </summary>

        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table className="tabla-detalle">
            <thead>
              <tr>
                <th>Par</th>
                {v.tiempos.map((t, i) => (
                  <th key={i} className="num">
                    <input className="input" type="number" value={t} disabled={soloLectura}
                      style={{ width: 70, padding: '2px 6px' }}
                      onChange={(e) => setTiempo(i, e.target.value)} /> s
                  </th>
                ))}
                <th className="num" title="Relación de absorción dieléctrica = R60 / R30">RAD</th>
                <th className="num" title="Índice de polarización = R600 / R60">IP</th>
                <th>Lectura del IP</th>
              </tr>
            </thead>
            <tbody>
              {PARES.map((p) => {
                const { rad, ip, calculado } = radIpDe(v, p.key)
                const lec = lecturaIP(ip)
                return (
                  <tr key={p.key}>
                    <th style={{ textAlign: 'left' }}>{p.label} [MΩ]</th>
                    {v.valores[p.key].map((x, i) => (
                      <td key={i} className="num">
                        <input className="input" type="number" inputMode="decimal" step="0.01"
                          value={x} disabled={soloLectura} style={{ width: 90, padding: '2px 6px' }}
                          onChange={(e) => setValor(p.key, i, e.target.value)} />
                      </td>
                    ))}
                    <td className="num">
                      <input className="input" type="number" inputMode="decimal" step="0.01"
                        value={v.rad[p.key]} disabled={soloLectura}
                        placeholder={rad !== undefined ? f(rad) : ''}
                        style={{ width: 80, padding: '2px 6px' }}
                        onChange={(e) => setMapa('rad', p.key, e.target.value)} />
                    </td>
                    <td className="num">
                      <input className="input" type="number" inputMode="decimal" step="0.01"
                        value={v.ip[p.key]} disabled={soloLectura}
                        placeholder={ip !== undefined ? f(ip) : ''}
                        style={{ width: 80, padding: '2px 6px' }}
                        onChange={(e) => setMapa('ip', p.key, e.target.value)} />
                    </td>
                    <td style={{ color: colorAislamiento(lec), fontWeight: lec === 'sin_dato' ? undefined : 700 }}>
                      {LABEL_AISLAMIENTO[lec]}
                      {calculado && lec !== 'sin_dato'
                        ? <span className="meta" style={{ display: 'block', fontWeight: 400 }}>calculado</span>
                        : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="meta" style={{ marginTop: 8 }}>
          RAD e IP se calculan solos con los tiempos cargados (RAD = R60/R30, IP = R600/R60);
          el valor en gris es el calculado. Si el megóhmetro ya te los muestra, escribilos y
          mandan los tuyos.
        </div>
        <div className="meta" style={{ marginTop: 4 }}>
          La lectura del IP sigue los rangos clásicos de la <strong>IEEE 43</strong>. Es una
          orientación sobre el estado del aislamiento, <strong>no</strong> un criterio de
          aceptación de IRAM 2250: por eso no marca el ensayo como rechazado por su cuenta.
        </div>
      </details>
    </div>
  )
}
