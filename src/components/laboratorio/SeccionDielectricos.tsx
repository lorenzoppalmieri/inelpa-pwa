import type { MedicionesEnsayo } from '../../types'

// ============================================================
// 6 y 7. ENSAYOS DIELÉCTRICOS (v1.100)
//
// Del documento de Laboratorio:
//
//   TENSIÓN APLICADA — "se realiza tanto al arrollamiento de alta como al de
//   baja tensión (...) Máxima tensión eficaz aplicada alcanzada durante el
//   ensayo, en kV; corriente demandada durante el ensayo, en mA; tiempo
//   alcanzado en el ensayo, en s; si el ensayo fue o no satisfactorio."
//
//   TENSIÓN INDUCIDA — "Tensión eficaz aplicada al arrollamiento bajo ensayo,
//   en V. Si el ensayo fue o no satisfactorio."
//
// LO NUEVO ACÁ ES LA CORRIENTE. La app venía guardando sólo tensión y tiempo,
// que es lo que dice si el trafo aguantó. La corriente demandada es lo que
// dice CÓMO lo aguantó: una aislación en camino de fallar puede pasar el
// ensayo pidiendo bastante más corriente que sus hermanas, y eso sólo se ve si
// queda registrado y se puede comparar contra el histórico.
//
// El veredicto es de tres estados (sin cargar / satisfactorio / no) y no de dos:
// un checkbox obligaría a que "todavía no lo hice" y "no pasó" se vean igual.
// ============================================================

export type Veredicto = 'sin' | 'si' | 'no'

export interface DielState {
  // tensión aplicada
  apAtKV: string; apAtMA: string; apAtOk: Veredicto
  apBtKV: string; apBtMA: string; apBtOk: Veredicto
  apTiempoS: string
  // tensión inducida
  inTensionV: string; inTiempoS: string; inOk: Veredicto
}

function n(v: string): number | undefined {
  const s = (v ?? '').trim().replace(',', '.')
  if (!s) return undefined
  const x = Number(s)
  return Number.isFinite(x) ? x : undefined
}
const s = (x?: number) => (x === undefined ? '' : String(x))
const ver = (b?: boolean): Veredicto => (b === undefined ? 'sin' : b ? 'si' : 'no')
const desVer = (v: Veredicto): boolean | undefined => (v === 'sin' ? undefined : v === 'si')

export function dielInicial(g?: MedicionesEnsayo): DielState {
  const a = g?.aplicada, i = g?.inducida
  return {
    apAtKV: s(a?.atKV), apAtMA: s(a?.atMA), apAtOk: ver(a?.atOk),
    apBtKV: s(a?.btKV), apBtMA: s(a?.btMA), apBtOk: ver(a?.btOk),
    apTiempoS: String(a?.tiempoS ?? 60),
    inTensionV: s(i?.tensionV), inTiempoS: String(i?.tiempoS ?? 60), inOk: ver(i?.ok),
  }
}

export function dielAplicada(v: DielState, frecuencia?: number): NonNullable<MedicionesEnsayo['aplicada']> {
  return {
    atKV: n(v.apAtKV), btKV: n(v.apBtKV),
    atMA: n(v.apAtMA), btMA: n(v.apBtMA),
    atOk: desVer(v.apAtOk), btOk: desVer(v.apBtOk),
    tiempoS: n(v.apTiempoS), frecuencia,
  }
}
export function dielInducida(
  v: DielState, previa: MedicionesEnsayo['inducida'], frecuencia?: number,
): NonNullable<MedicionesEnsayo['inducida']> {
  return {
    // Se conservan atKV/btKV: los usa la planilla del protocolo ya cargada.
    atKV: previa?.atKV, btKV: previa?.btKV,
    tensionV: n(v.inTensionV), ok: desVer(v.inOk),
    tiempoS: n(v.inTiempoS), frecuencia,
  }
}

/** ¿Algún dieléctrico quedó marcado como NO satisfactorio? */
export function dielRechazado(v: DielState): { aplicada: boolean; inducida: boolean } {
  return {
    aplicada: v.apAtOk === 'no' || v.apBtOk === 'no',
    inducida: v.inOk === 'no',
  }
}

function SelVeredicto({ v, set, dis }: { v: Veredicto; set: (x: Veredicto) => void; dis?: boolean }) {
  return (
    <select className="input" value={v} disabled={dis}
      style={{
        color: v === 'no' ? 'var(--rojo)' : v === 'si' ? 'var(--estado-fin)' : undefined,
        fontWeight: v === 'sin' ? undefined : 700,
      }}
      onChange={(e) => set(e.target.value as Veredicto)}>
      <option value="sin">— sin cargar —</option>
      <option value="si">Satisfactorio</option>
      <option value="no">NO satisfactorio</option>
    </select>
  )
}

export default function SeccionDielectricos({ v, set, soloLectura = false }: {
  v: DielState
  set: (s: DielState) => void
  soloLectura?: boolean
}) {
  const up = <K extends keyof DielState>(k: K, val: DielState[K]) => set({ ...v, [k]: val })
  const num = (label: string, k: keyof DielState, unidad: string, paso = 'any') => (
    <div className="field" key={k as string}>
      <label>{label} [{unidad}]</label>
      <input className="input" type="number" inputMode="decimal" step={paso}
        value={v[k] as string} disabled={soloLectura}
        onChange={(e) => up(k, e.target.value as DielState[typeof k])} />
    </div>
  )
  const r = dielRechazado(v)

  return (
    <div>
      {/* ============ TENSIÓN APLICADA ============ */}
      <div className="section-title" style={{ margin: '18px 0 8px' }}>Ensayo con tensión aplicada</div>
      <div className="card" style={r.aplicada ? { borderLeft: '4px solid var(--rojo)' } : undefined}>
        <div className="meta" style={{ marginBottom: 8 }}>
          Se corre sobre los dos arrollamientos. Anotá la <strong>corriente demandada</strong>:
          es lo que después permite comparar esta máquina contra las de su mismo modelo.
        </div>

        <div className="meta" style={{ margin: '6px 0 4px', fontWeight: 700 }}>Arrollamiento de alta</div>
        <div className="form-grid">
          {num('Máxima tensión eficaz alcanzada', 'apAtKV', 'kV', '0.1')}
          {num('Corriente demandada', 'apAtMA', 'mA', '0.01')}
          <div className="field">
            <label>Resultado</label>
            <SelVeredicto v={v.apAtOk} set={(x) => up('apAtOk', x)} dis={soloLectura} />
          </div>
        </div>

        <div className="meta" style={{ margin: '12px 0 4px', fontWeight: 700 }}>Arrollamiento de baja</div>
        <div className="form-grid">
          {num('Máxima tensión eficaz alcanzada', 'apBtKV', 'kV', '0.1')}
          {num('Corriente demandada', 'apBtMA', 'mA', '0.01')}
          <div className="field">
            <label>Resultado</label>
            <SelVeredicto v={v.apBtOk} set={(x) => up('apBtOk', x)} dis={soloLectura} />
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 12 }}>
          {num('Tiempo alcanzado en el ensayo', 'apTiempoS', 's', '1')}
        </div>

        {r.aplicada && (
          <div className="meta" style={{ marginTop: 8, color: 'var(--rojo)', fontWeight: 700 }}>
            ✗ Marcaste el ensayo como no satisfactorio. Acordate de dejarlo también en los
            toggles de la ficha: es ahí donde se decide si el trafo va a retrabajo.
          </div>
        )}
      </div>

      {/* ============ TENSIÓN INDUCIDA ============ */}
      <div className="section-title" style={{ margin: '18px 0 8px' }}>Ensayo con tensión inducida</div>
      <div className="card" style={r.inducida ? { borderLeft: '4px solid var(--rojo)' } : undefined}>
        <div className="form-grid">
          {num('Tensión eficaz aplicada al arrollamiento bajo ensayo', 'inTensionV', 'V', '1')}
          {num('Tiempo del ensayo', 'inTiempoS', 's', '1')}
          <div className="field">
            <label>Resultado</label>
            <SelVeredicto v={v.inOk} set={(x) => up('inOk', x)} dis={soloLectura} />
          </div>
        </div>
        {r.inducida && (
          <div className="meta" style={{ marginTop: 8, color: 'var(--rojo)', fontWeight: 700 }}>
            ✗ Marcaste el ensayo como no satisfactorio.
          </div>
        )}
      </div>
    </div>
  )
}
