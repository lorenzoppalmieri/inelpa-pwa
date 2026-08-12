import { useEffect, useMemo, useState } from 'react'
import type { TareaLaboratorio, MedicionesEnsayo, MaterialBobina } from '../../types'
import { MATERIALES } from '../../types'
import { guardarLaboratorio } from '../../sync/syncEngine'
import { useAuth } from '../../auth/AuthContext'
import {
  buscarDatosTecnicos, campoNum, codigoCorto,
  NOMINALES_TENSION, NOMINALES_PERDIDAS, NOMINALES_CONTEXTO, NOMINALES_TODOS, NOMINALES_FICHA, campo,
  type DatoTecnico, type CampoNominal,
} from '../../lib/datosTecnicos'
import {
  calcularVacio, calcularCortocircuito, perdidasTotales,
  porcentajeDeNominal, zonaDe, apruebaZona,
  ESCALA_PERDIDAS, ESCALA_IO, ESCALA_UCC, ESCALA_TOTALES,
  nfDesdeModelo, materialDesdeModelo,
  type Nominales, type ConfigEnsayo, type Nf, type Arrollamiento, type Conexion,
} from '../../lib/ensayoPerdidas'
import Aguja from './Aguja'

// ============================================================
// PANEL DE ENSAYO DE PERDIDAS (v1.82)
//
// Implementa el documento "CÁLCULO PARA ENSAYO DE PÉRDIDAS". El laboratorista
// carga SOLO lo que mide; todo lo demas se calcula (lib/ensayoPerdidas.ts) y se
// compara contra los valores garantizados de `datos_tecnicos`.
//
// v1.82 ademas ARREGLA que el panel no guardaba nada: `guardar()` hacia un
// console.log con un "pendiente: persistir el ensayo". Ahora las mediciones y
// los resultados van al campo `mediciones` de la ficha (columna jsonb).
// ============================================================

// Las constantes del banco de ensayo (potencia de los instrumentos) no dependen
// del transformador: se configuran una vez. Se guardan en el navegador del
// laboratorio y se COPIAN dentro de cada ensayo al guardar, asi el protocolo
// queda con el valor que realmente se uso aunque despues se cambie el banco.
const LS_PINS_O = 'inelpa_lab_pins_o'
const LS_PINS_CC = 'inelpa_lab_pins_cc'
const T_REF_DEFECTO = 75          // °C, valor habitual de norma en aceite

function leerLS(clave: string, porDefecto: number): number {
  const v = Number(localStorage.getItem(clave))
  return Number.isFinite(v) && v !== 0 ? v : porDefecto
}
/** Convierte lo tipeado a numero aceptando coma decimal. '' -> undefined. */
function n(v: string): number | undefined {
  const s = v.trim().replace(',', '.')
  if (!s) return undefined
  const x = Number(s)
  return Number.isFinite(x) ? x : undefined
}
function fmt(v?: number, d = 2): string {
  return v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d)
}

export default function PanelEnsayo({ tarea, soloLectura = false }: {
  tarea: TareaLaboratorio
  soloLectura?: boolean
}) {
  const { usuario } = useAuth()
  const [fila, setFila] = useState<DatoTecnico | undefined>()
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [origen, setOrigen] = useState<'local' | 'nube' | 'ninguno'>('ninguno')
  const [msg, setMsg] = useState('')

  const guardado = tarea.mediciones

  // ---------- Configuracion del ensayo ----------
  const [nf, setNf] = useState<Nf>(guardado?.nf ?? nfDesdeModelo(tarea.modelo) ?? 3)
  const [material, setMaterial] = useState<MaterialBobina>(
    guardado?.material ?? materialDesdeModelo(tarea.modelo) ?? 'cobre')
  const [tRef, setTRef] = useState(String(guardado?.tRef ?? T_REF_DEFECTO))
  const [pinsO, setPinsO] = useState(String(guardado?.pinsO ?? leerLS(LS_PINS_O, 0)))
  const [pinsCC, setPinsCC] = useState(String(guardado?.pinsCC ?? leerLS(LS_PINS_CC, 0)))

  // ---------- Ensayo de vacio (por defecto Baja / Y) ----------
  const [vArr, setVArr] = useState<Arrollamiento>(guardado?.vacio?.arrollamiento ?? 'baja')
  const [vCon, setVCon] = useState<Conexion>(guardado?.vacio?.conexion ?? 'Y')
  const [p0m, setP0m] = useState(guardado?.vacio?.p0m?.toString() ?? '')
  const [i0m, setI0m] = useState(guardado?.vacio?.i0m?.toString() ?? '')
  const [vUm, setVUm] = useState(guardado?.vacio?.um?.toString() ?? '')

  // ---------- Ensayo de cortocircuito (por defecto Alta / Δ) ----------
  const [cArr, setCArr] = useState<Arrollamiento>(guardado?.cc?.arrollamiento ?? 'alta')
  const [cCon, setCCon] = useState<Conexion>(guardado?.cc?.conexion ?? 'D')
  const [pccm, setPccm] = useState(guardado?.cc?.pccm?.toString() ?? '')
  const [cIm, setCIm] = useState(guardado?.cc?.im?.toString() ?? '')
  const [cUm, setCUm] = useState(guardado?.cc?.um?.toString() ?? '')
  const [tcc, setTcc] = useState(guardado?.cc?.tcc?.toString() ?? '')
  const [tR, setTR] = useState(guardado?.cc?.tR?.toString() ?? '')
  const [rUV, setRUV] = useState(guardado?.cc?.rUV?.toString() ?? '')
  const [rVW, setRVW] = useState(guardado?.cc?.rVW?.toString() ?? '')
  const [rWU, setRWU] = useState(guardado?.cc?.rWU?.toString() ?? '')
  const [rUN, setRUN] = useState(guardado?.cc?.rUN?.toString() ?? '')
  const [rUn, setRUn] = useState(guardado?.cc?.rUn?.toString() ?? '')
  const [rVn, setRVn] = useState(guardado?.cc?.rVn?.toString() ?? '')
  const [rWn, setRWn] = useState(guardado?.cc?.rWn?.toString() ?? '')

  // Busca los parametros del modelo al montar (y si cambia el modelo).
  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    void (async () => {
      const r = await buscarDatosTecnicos(tarea.modelo)
      if (!vivo) return
      setFila(r.fila); setOrigen(r.origen); setError(r.error ?? '')
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [tarea.modelo])

  // Valores nominales normalizados a numero.
  const nominal = useMemo(() => {
    const out: Record<string, number | undefined> = {}
    for (const c of NOMINALES_FICHA) out[c.key] = campoNum(fila, ...c.alias)
    return out
  }, [fila])

  // Nominales en la forma que espera el motor de calculo (ojo con las unidades:
  // la tabla trae kV y kVA, las formulas piden V y VA — la conversion la hace
  // ensayoPerdidas.ts, aca solo se pasan tal cual salen de la tabla).
  const nom: Nominales = useMemo(() => ({
    snKVA: nominal.sn, u1nKV: nominal.un1, u2nKV: nominal.un2,
    i1n: nominal.i1n, i2n: nominal.i2n,
    p0n: nominal.po, ioPctN: nominal.io, pccN: nominal.pcc, uccPctN: nominal.ucc,
  }), [nominal])

  const cfg: ConfigEnsayo = useMemo(() => ({
    nf, material: material === 'aluminio' ? 'aluminio' : 'cobre',
    tRef: n(tRef) ?? T_REF_DEFECTO, pinsO: n(pinsO) ?? 0, pinsCC: n(pinsCC) ?? 0,
  }), [nf, material, tRef, pinsO, pinsCC])

  const resVacio = useMemo(
    () => calcularVacio(nom, cfg, { arrollamiento: vArr, conexion: vCon, p0m: n(p0m), i0m: n(i0m), um: n(vUm) }),
    [nom, cfg, vArr, vCon, p0m, i0m, vUm])

  const resCC = useMemo(
    () => calcularCortocircuito(nom, cfg, {
      arrollamiento: cArr, conexion: cCon, pccm: n(pccm), im: n(cIm), um: n(cUm),
      tcc: n(tcc), tR: n(tR),
      rUV: n(rUV), rVW: n(rVW), rWU: n(rWU), rUN: n(rUN),
      rUn: n(rUn), rVn: n(rVn), rWn: n(rWn),
    }),
    [nom, cfg, cArr, cCon, pccm, cIm, cUm, tcc, tR, rUV, rVW, rWU, rUN, rUn, rVn, rWn])

  const pTotal = perdidasTotales(resVacio, resCC)
  const pTotalN = nominal.po !== undefined && nominal.pcc !== undefined ? nominal.po + nominal.pcc : undefined

  // Zonas -> sugerencia de aprobado/rechazado para los 2 ensayos del documento.
  const zVacio = [
    zonaDe(porcentajeDeNominal(resVacio.p0, nominal.po), ESCALA_PERDIDAS),
    zonaDe(porcentajeDeNominal(resVacio.ioPct, nominal.io), ESCALA_IO),
  ]
  const zCC = [
    zonaDe(porcentajeDeNominal(resCC.pccRef, nominal.pcc), ESCALA_PERDIDAS),
    zonaDe(porcentajeDeNominal(resCC.uccPct, nominal.ucc), ESCALA_UCC),
  ]
  const zTotal = zonaDe(porcentajeDeNominal(pTotal, pTotalN), ESCALA_TOTALES)

  async function guardar() {
    const meds: MedicionesEnsayo = {
      nf, material, tRef: n(tRef), pinsO: n(pinsO), pinsCC: n(pinsCC),
      vacio: { arrollamiento: vArr, conexion: vCon, p0m: n(p0m), i0m: n(i0m), um: n(vUm) },
      cc: {
        arrollamiento: cArr, conexion: cCon, pccm: n(pccm), im: n(cIm), um: n(cUm),
        tcc: n(tcc), tR: n(tR),
        rUV: n(rUV), rVW: n(rVW), rWU: n(rWU), rUN: n(rUN),
        rUn: n(rUn), rVn: n(rVn), rWn: n(rWn),
      },
      // Resultados CONGELADOS: si mañana se corrige el catalogo, el protocolo ya
      // emitido no cambia solo.
      resultados: {
        p0: resVacio.p0, i0: resVacio.i0, ioPct: resVacio.ioPct,
        pcc: resCC.pcc, pj: resCC.pj, ps: resCC.ps, pccRef: resCC.pccRef,
        ucc: resCC.ucc, uccPct: resCC.uccPct, urccPct: resCC.urccPct, uxccPct: resCC.uxccPct,
        pTotal,
      },
      guardadoEn: new Date().toISOString(),
      guardadoPor: usuario?.usuario,
    }
    // Las constantes del banco quedan como default para el proximo ensayo.
    if (n(pinsO) !== undefined) localStorage.setItem(LS_PINS_O, String(n(pinsO)))
    if (n(pinsCC) !== undefined) localStorage.setItem(LS_PINS_CC, String(n(pinsCC)))

    // SUGERENCIA (no imposicion): se pre-marcan los dos ensayos del documento
    // segun las tolerancias, pero el laboratorista puede cambiarlos despues con
    // los toggles de la ficha. Solo se marca si hay resultado calculado.
    const ensayos = { ...(tarea.ensayos ?? {}) }
    if (resVacio.p0 !== undefined && !zVacio.includes('sin_dato')) {
      ensayos.perdidas_vacio = zVacio.every(apruebaZona) ? 'aprobado' : 'rechazado'
    }
    if (resCC.pccRef !== undefined && !zCC.includes('sin_dato')) {
      ensayos.perdida_cc = zCC.every(apruebaZona) ? 'aprobado' : 'rechazado'
    }
    await guardarLaboratorio({ ...tarea, mediciones: meds, ensayos })
    setMsg(`Ensayo guardado ${meds.guardadoEn ? new Date(meds.guardadoEn).toLocaleTimeString() : ''}. Revisá los toggles de arriba: se pre-marcaron según la tolerancia.`)
  }

  const celda = (c: CampoNominal) => (
    <div key={c.key} className="tot-card">
      <div className="l">{c.label} ({c.unidad})</div>
      <div className="n">{nominal[c.key] === undefined ? '—' : nominal[c.key]}</div>
    </div>
  )

  /** Campo numerico compacto. */
  const campoNumInput = (label: string, v: string, set: (s: string) => void, unidad: string, paso = 'any') => (
    <div className="field" key={label}>
      <label>{label} [{unidad}]</label>
      <input className="input" type="number" inputMode="decimal" step={paso}
        value={v} disabled={soloLectura} onChange={(e) => set(e.target.value)} />
    </div>
  )

  const selArr = (v: Arrollamiento, set: (a: Arrollamiento) => void) => (
    <div className="field">
      <label>Arrollamiento de ensayo</label>
      <select className="input" value={v} disabled={soloLectura} onChange={(e) => set(e.target.value as Arrollamiento)}>
        <option value="alta">Alta (U1n / I1n)</option>
        <option value="baja">Baja (U2n / I2n)</option>
      </select>
    </div>
  )
  const selCon = (v: Conexion, set: (c: Conexion) => void) => nf === 3 ? (
    <div className="field">
      <label>Grupo de conexión</label>
      <select className="input" value={v} disabled={soloLectura} onChange={(e) => set(e.target.value as Conexion)}>
        <option value="Y">Y (estrella)</option>
        <option value="D">Δ (triángulo)</option>
      </select>
    </div>
  ) : null

  return (
    <div>
      {/* --- Cabecera --- */}
      <div className="card" style={{ borderLeft: '5px solid var(--azul-claro)' }}>
        <div className="meta">Modelo en ensayo</div>
        <h3 style={{ margin: '2px 0 6px' }}>{tarea.modelo || '—'}</h3>
        <div className="meta">
          N° de serie <strong style={{ color: 'var(--azul-claro)', fontSize: '1.05rem' }}>{tarea.nroSerie || '— sin asignar —'}</strong>
          {tarea.ot ? <> · OT {tarea.ot}</> : null}
          {tarea.cliente ? <> · {tarea.cliente}</> : <> · Stock</>}
        </div>
        {fila && (
          <div className="meta" style={{ marginTop: 6 }}>
            Código técnico <strong>{codigoCorto(tarea.modelo)}</strong>
            {nominal.sn !== undefined ? <> · {nominal.sn} kVA</> : null}
            {campo(fila, 'iram', 'IRAM') ? <> · IRAM {String(campo(fila, 'iram', 'IRAM'))}</> : null}
          </div>
        )}
      </div>

      {/* --- Nominales garantizados --- */}
      <div className="section-title" style={{ margin: '14px 0 8px' }}>
        Valores nominales garantizados
        {origen === 'local' && <span className="rol-badge" style={{ marginLeft: 8 }}>base local</span>}
        {origen === 'nube' && <span className="rol-badge" style={{ marginLeft: 8 }}>desde la nube</span>}
      </div>

      {cargando ? (
        <div className="meta">Buscando parámetros de {codigoCorto(tarea.modelo)}…</div>
      ) : error ? (
        <div className="card" style={{ borderLeft: '4px solid var(--rojo)' }}>
          <div className="meta" style={{ color: 'var(--rojo)', fontWeight: 700 }}>⚠ {error}</div>
          <div className="meta" style={{ marginTop: 4 }}>
            Podés cargar igual los valores medidos: los cálculos que no dependen del garantizado
            (P0, I0, Pcc, Ucc) se resuelven lo mismo. Lo que no va a poder mostrarse son las agujas
            ni el resultado de la tolerancia.
          </div>
        </div>
      ) : (
        <>
          <div className="meta" style={{ marginBottom: 6 }}>Tensiones y corrientes</div>
          <div className="tot-cards">{NOMINALES_TENSION.map(celda)}</div>
          <div className="meta" style={{ margin: '10px 0 6px' }}>Pérdidas y porcentajes</div>
          <div className="tot-cards">{NOMINALES_PERDIDAS.map(celda)}</div>
          <div className="meta" style={{ margin: '10px 0 6px' }}>Otros valores de referencia</div>
          <div className="tot-cards">{NOMINALES_CONTEXTO.filter((c) => c.key !== 'sn').map(celda)}</div>
          {fila && NOMINALES_TODOS.some((c) => nominal[c.key] === undefined) && (
            <details style={{ marginTop: 10 }}>
              <summary className="meta" style={{ cursor: 'pointer', color: 'var(--naranja)' }}>
                ⚠ Hay parámetros sin valor — ver columnas disponibles
              </summary>
              <div className="meta" style={{ marginTop: 6 }}>
                Columnas de <code>datos_tecnicos</code>: {Object.keys(fila).join(' · ')}
              </div>
            </details>
          )}
        </>
      )}

      {/* --- Configuracion del ensayo --- */}
      <div className="section-title" style={{ margin: '18px 0 8px' }}>Configuración del ensayo</div>
      <div className="meta" style={{ marginBottom: 8 }}>
        Fases y material se deducen del código del modelo; corregilos si este transformador es una excepción.
        La potencia de los instrumentos es del banco: se recuerda para el próximo ensayo.
      </div>
      <div className="form-grid">
        <div className="field">
          <label>Fases</label>
          <select className="input" value={nf} disabled={soloLectura} onChange={(e) => setNf(Number(e.target.value) as Nf)}>
            <option value={3}>Trifásico (nf = 3)</option>
            <option value={1}>Monofásico / bifásico (nf = 1)</option>
          </select>
        </div>
        <div className="field">
          <label>Material del arrollamiento</label>
          <select className="input" value={material} disabled={soloLectura} onChange={(e) => setMaterial(e.target.value as MaterialBobina)}>
            {MATERIALES.map((m) => <option key={m.id} value={m.id}>{m.label} (k = {m.id === 'aluminio' ? 225 : 235})</option>)}
          </select>
        </div>
        {campoNumInput('Temperatura de referencia (T)', tRef, setTRef, '°C', '0.1')}
        {campoNumInput('Potencia instrumentos — vacío', pinsO, setPinsO, 'VA', '0.1')}
        {campoNumInput('Potencia instrumentos — cortocircuito', pinsCC, setPinsCC, 'VA', '0.1')}
      </div>

      {/* ============ ENSAYO DE VACIO ============ */}
      <div className="section-title" style={{ margin: '18px 0 8px' }}>Ensayo de pérdidas en vacío</div>
      <div className="form-grid">
        {selArr(vArr, setVArr)}
        {selCon(vCon, setVCon)}
        {campoNumInput('Potencia medida (P0m)', p0m, setP0m, 'W', '0.1')}
        {campoNumInput('Corriente medida (I0m)', i0m, setI0m, 'A', '0.01')}
        {campoNumInput('Tensión medida (Um, simple)', vUm, setVUm, 'V', '0.1')}
      </div>
      <div className="agujas">
        <Aguja titulo="Pérdidas en vacío (P0)" valor={resVacio.p0} nominal={nominal.po} unidad="W" escala={ESCALA_PERDIDAS} />
        <Aguja titulo="Corriente de vacío (io%)" valor={resVacio.ioPct} nominal={nominal.io} unidad="%" escala={ESCALA_IO} decimales={2} />
      </div>
      <div className="meta">
        I0 = <strong>{fmt(resVacio.i0)} A</strong> · Tolerancias de norma: P0 +15%, io% +30%.
      </div>

      {/* ============ ENSAYO DE CORTOCIRCUITO ============ */}
      <div className="section-title" style={{ margin: '18px 0 8px' }}>Ensayo de pérdidas en cortocircuito</div>
      <div className="form-grid">
        {selArr(cArr, setCArr)}
        {selCon(cCon, setCCon)}
        {campoNumInput('Potencia medida (Pccm)', pccm, setPccm, 'W', '0.1')}
        {campoNumInput('Corriente medida (Im)', cIm, setCIm, 'A', '0.01')}
        {campoNumInput('Tensión medida (Um)', cUm, setCUm, 'V', '0.1')}
        {campoNumInput('Temp. durante el ensayo (tcc)', tcc, setTcc, '°C', '0.1')}
        {campoNumInput('Temp. al medir resistencias (tR)', tR, setTR, '°C', '0.1')}
      </div>

      <div className="meta" style={{ margin: '10px 0 6px' }}>
        Resistencias de arrollamiento · <strong>AT en Ω</strong>, <strong>BT en mΩ</strong>
      </div>
      <div className="form-grid">
        {nf === 3 ? (
          <>
            {campoNumInput('R 1U-1V (AT)', rUV, setRUV, 'Ω', '0.001')}
            {campoNumInput('R 1V-1W (AT)', rVW, setRVW, 'Ω', '0.001')}
            {campoNumInput('R 1W-1U (AT)', rWU, setRWU, 'Ω', '0.001')}
            {campoNumInput('R 2u-2n (BT)', rUn, setRUn, 'mΩ', '0.01')}
            {campoNumInput('R 2v-2n (BT)', rVn, setRVn, 'mΩ', '0.01')}
            {campoNumInput('R 2w-2n (BT)', rWn, setRWn, 'mΩ', '0.01')}
          </>
        ) : (
          <>
            {campoNumInput('R 1U-1N (AT)', rUN, setRUN, 'Ω', '0.001')}
            {campoNumInput('R 2u-2n (BT)', rUn, setRUn, 'mΩ', '0.01')}
          </>
        )}
      </div>

      <div className="agujas">
        <Aguja titulo="Pérdidas en cortocircuito Pcc(T)" valor={resCC.pccRef} nominal={nominal.pcc} unidad="W" escala={ESCALA_PERDIDAS} />
        <Aguja titulo="Tensión de cortocircuito ucc%(T)" valor={resCC.uccPct} nominal={nominal.ucc} unidad="%" escala={ESCALA_UCC} decimales={2} />
      </div>

      {/* Desglose: sirve para entender de donde sale Pcc(T) si algo no cierra. */}
      <details style={{ marginTop: 8 }}>
        <summary className="meta" style={{ cursor: 'pointer' }}>Ver desglose del cálculo</summary>
        <div className="tot-cards" style={{ marginTop: 8 }}>
          <div className="tot-card"><div className="l">Pcc a temp. ensayo (W)</div><div className="n">{fmt(resCC.pcc, 1)}</div></div>
          <div className="tot-card"><div className="l">Joule AT (W)</div><div className="n">{fmt(resCC.pjAT, 1)}</div></div>
          <div className="tot-card"><div className="l">Joule BT (W)</div><div className="n">{fmt(resCC.pjBT, 1)}</div></div>
          <div className="tot-card"><div className="l">Skin PS (W)</div><div className="n">{fmt(resCC.ps, 1)}</div></div>
          <div className="tot-card"><div className="l">Ucc (V)</div><div className="n">{fmt(resCC.ucc, 1)}</div></div>
          <div className="tot-card"><div className="l">uR% (resistiva)</div><div className="n">{fmt(resCC.urccPct)}</div></div>
          <div className="tot-card"><div className="l">uX% (reactiva)</div><div className="n">{fmt(resCC.uxccPct)}</div></div>
        </div>
        <div className="meta" style={{ marginTop: 6 }}>
          Las pérdidas Joule suben con la temperatura y las Skin bajan: por eso se corrigen en sentidos opuestos.
        </div>
      </details>
      <div className="meta" style={{ marginTop: 6 }}>Tolerancias de norma: Pcc +15%, ucc% ±10%.</div>

      {/* ============ TOTALES ============ */}
      <div className="section-title" style={{ margin: '18px 0 8px' }}>Pérdidas totales</div>
      <div className="card" style={{
        borderLeft: `5px solid ${zTotal === 'fuera' ? 'var(--rojo)' : zTotal === 'tolerancia' ? 'var(--naranja)' : 'var(--estado-fin)'}`,
      }}>
        <div className="meta">PT = Pcc(T) + P0</div>
        <h3 style={{ margin: '4px 0' }}>{fmt(pTotal, 1)} W</h3>
        <div className="meta">
          Garantizado {pTotalN === undefined ? '—' : `${pTotalN} W`}
          {pTotal !== undefined && pTotalN
            ? <> · <strong style={{ color: zTotal === 'fuera' ? 'var(--rojo)' : 'var(--texto)' }}>
                {((pTotal / pTotalN) * 100).toFixed(1)}%
              </strong>{zTotal === 'fuera' ? ' · FUERA DE NORMA' : ''}</>
            : null}
          {' · '}Tolerancia +10%.
        </div>
      </div>

      {msg && <div className="meta" style={{ marginTop: 10, color: 'var(--estado-fin)', fontWeight: 700 }}>✓ {msg}</div>}
      {guardado?.guardadoEn && !msg && (
        <div className="meta" style={{ marginTop: 10 }}>
          Último guardado: {new Date(guardado.guardadoEn).toLocaleString()}
          {guardado.guardadoPor ? ` · ${guardado.guardadoPor}` : ''}
        </div>
      )}

      {!soloLectura && (
        <button className="btn btn-primary btn-bloque" style={{ marginTop: 12 }} onClick={() => void guardar()}>
          💾 Guardar ensayo
        </button>
      )}
    </div>
  )
}
