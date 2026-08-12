import { useEffect, useMemo, useState } from 'react'
import type { TareaLaboratorio, MedicionesEnsayo, MaterialBobina } from '../../types'
import { MATERIALES } from '../../types'
import { guardarLaboratorio } from '../../sync/syncEngine'
import { useAuth } from '../../auth/AuthContext'
import { buscarDatosTecnicos, campoNum, NOMINALES_FICHA, type DatoTecnico } from '../../lib/datosTecnicos'
import {
  calcularVacio, calcularCortocircuito, perdidasTotales,
  porcentajeDeNominal, zonaDe, apruebaZona,
  ESCALA_PERDIDAS, ESCALA_IO, ESCALA_UCC,
  nfDesdeModelo, materialDesdeModelo,
  type Nominales, type ConfigEnsayo, type Nf, type Arrollamiento, type Conexion,
} from '../../lib/ensayoPerdidas'
import Aguja from './Aguja'

// ============================================================
// PROTOCOLO DE ENSAYO DE TRANSFORMADOR (v1.83) — RPH 8.6/03 V03
//
// Replica en pantalla la planilla que usa el laboratorio, con las 9 secciones y
// el mismo orden, para que el laboratorista no tenga que traducir nada. Los
// casilleros calculados (secciones 4 y 5) se completan solos con el motor de
// lib/ensayoPerdidas.ts; el resto se carga a mano.
//
// EXPORTACION: se imprime a PDF con el bloque `@media print` de index.css. No
// hace falta ninguna libreria (en este proyecto no hay ninguna de xlsx, y no se
// pueden agregar dependencias). El PDF resultante es el que despues se adjunta
// para liberar el trafo a Despacho (ver v1.47).
// ============================================================

const T_REF = 75
const LS_PINS_O = 'inelpa_lab_pins_o'
const LS_PINS_CC = 'inelpa_lab_pins_cc'

function n(v: string): number | undefined {
  const s = (v ?? '').trim().replace(',', '.')
  if (!s) return undefined
  const x = Number(s)
  return Number.isFinite(x) ? x : undefined
}
function f(v?: number, d = 2): string {
  return v === undefined || !Number.isFinite(v) ? '' : v.toFixed(d)
}
function leerLS(clave: string, def: number): number {
  const v = Number(localStorage.getItem(clave))
  return Number.isFinite(v) && v !== 0 ? v : def
}

/** Celda de entrada del protocolo. Al imprimir se ve como texto plano. */
function Ent({ v, set, ancho = 70, dis, ph }: {
  v: string; set: (s: string) => void; ancho?: number; dis?: boolean; ph?: string
}) {
  return (
    <input
      className="proto-in" style={{ width: ancho }} value={v} disabled={dis}
      placeholder={ph} onChange={(e) => set(e.target.value)}
    />
  )
}
/** Celda calculada (no editable). */
function Calc({ v, u }: { v?: number | string; u?: string }) {
  const txt = typeof v === 'number' ? f(v, 2) : (v ?? '')
  return <span className="proto-calc">{txt || '—'}{txt && u ? ` ${u}` : ''}</span>
}

export default function ProtocoloEnsayo({ tarea, soloLectura = false, onCerrar }: {
  tarea: TareaLaboratorio
  soloLectura?: boolean
  onCerrar?: () => void
}) {
  const { usuario } = useAuth()
  const g = tarea.mediciones
  const [fila, setFila] = useState<DatoTecnico | undefined>()
  const [msg, setMsg] = useState('')
  // v1.83: la planilla es ancha por naturaleza. Ampliada ocupa toda la pantalla
  // (sale del modal de la ficha, que aunque se ensancho sigue teniendo margenes).
  const [ampliado, setAmpliado] = useState(false)
  const dis = soloLectura

  // Con Escape se sale de pantalla completa sin tener que buscar el boton.
  useEffect(() => {
    if (!ampliado) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setAmpliado(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [ampliado])

  // ---------- configuracion ----------
  const [nf, setNf] = useState<Nf>(g?.nf ?? nfDesdeModelo(tarea.modelo) ?? 3)
  const [material, setMaterial] = useState<MaterialBobina>(g?.material ?? materialDesdeModelo(tarea.modelo) ?? 'cobre')
  const [tRef, setTRef] = useState(String(g?.tRef ?? T_REF))
  const [pinsO, setPinsO] = useState(String(g?.pinsO ?? leerLS(LS_PINS_O, 3)))
  const [pinsCC, setPinsCC] = useState(String(g?.pinsCC ?? leerLS(LS_PINS_CC, 3)))

  // ---------- cabecera ----------
  const c0 = g?.cabecera
  const [nroFab, setNroFab] = useState(c0?.nroFabricacion ?? '')
  const [oc, setOc] = useState(c0?.oc ?? '')
  const [anio, setAnio] = useState(String(c0?.anio ?? new Date().getFullYear()))
  const [norma, setNorma] = useState(c0?.norma ?? 'IRAM 2250')
  const [refrig, setRefrig] = useState(c0?.refrigeracion ?? 'ONAN')
  const [liquido, setLiquido] = useState(c0?.liquido ?? 'ACEITE MINERAL YPF 64')
  const [lote, setLote] = useState(c0?.lote ?? '')
  const [masa, setMasa] = useState(String(c0?.masaKg ?? ''))
  const [frec, setFrec] = useState(String(c0?.frecuencia ?? 50))
  const [conmut, setConmut] = useState(c0?.conmutacion ?? '')
  const [grupo, setGrupo] = useState(c0?.grupoConexion ?? 'Dyn11')
  const [arroll, setArroll] = useState(c0?.arrollamientos ?? 'DOS')

  // ---------- 1. relacion ----------
  const [relDiv, setRelDiv] = useState(String(g?.relacion?.relDivisor ?? 231))
  const [relUn, setRelUn] = useState(String(g?.relacion?.tensionNominal ?? ''))
  const relIni: string[][] = g?.relacion?.medidas?.map((f2) => f2.map((x) => (x == null ? '' : String(x))))
    ?? [['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', '']]
  const [rel, setRel] = useState<string[][]>(relIni)
  const setRelC = (i: number, j: number, v: string) =>
    setRel((m) => m.map((f2, a) => f2.map((x, b) => (a === i && b === j ? v : x))))

  // ---------- 2. resistencias (alimentan el calculo de la seccion 4) ----------
  const [rUV, setRUV] = useState(g?.cc?.rUV?.toString() ?? '')
  const [rVW, setRVW] = useState(g?.cc?.rVW?.toString() ?? '')
  const [rWU, setRWU] = useState(g?.cc?.rWU?.toString() ?? '')
  const [rUN, setRUN] = useState(g?.cc?.rUN?.toString() ?? '')
  const [rUn, setRUn] = useState(g?.cc?.rUn?.toString() ?? '')
  const [rVn, setRVn] = useState(g?.cc?.rVn?.toString() ?? '')
  const [rWn, setRWn] = useState(g?.cc?.rWn?.toString() ?? '')
  const [tR, setTR] = useState(g?.cc?.tR?.toString() ?? '')

  // ---------- 3. aislamiento ----------
  const ai = g?.aislamiento
  const [aisT, setAisT] = useState((ai?.tiempos ?? [30, 60, 600]).map(String))
  const [aisKV, setAisKV] = useState(String(ai?.tensionKV ?? 2.5))
  const [aisTemp, setAisTemp] = useState(String(ai?.temp ?? ''))
  const [atbt, setAtbt] = useState<string[]>((ai?.atbt ?? ['', '', '']).map((x) => x ?? ''))
  const [atMasa, setAtMasa] = useState<string[]>((ai?.atMasa ?? ['', '', '']).map((x) => x ?? ''))
  const [btMasa, setBtMasa] = useState<string[]>((ai?.btMasa ?? ['', '', '']).map((x) => x ?? ''))
  const setArr = (set: (f2: (p: string[]) => string[]) => void, i: number, v: string) =>
    set((p) => p.map((x, k) => (k === i ? v : x)))

  // ---------- 4. perdidas en carga ----------
  const [cArr, setCArr] = useState<Arrollamiento>(g?.cc?.arrollamiento ?? 'alta')
  const [cCon, setCCon] = useState<Conexion>(g?.cc?.conexion ?? 'D')
  const [ccU, setCcU] = useState(g?.cc?.um?.toString() ?? '')
  const [ccI, setCcI] = useState(g?.cc?.im?.toString() ?? '')
  const [ccP, setCcP] = useState(g?.cc?.pccm?.toString() ?? '')
  const [tcc, setTcc] = useState(g?.cc?.tcc?.toString() ?? '')

  // ---------- 5. perdidas en vacio ----------
  const [vArr, setVArr] = useState<Arrollamiento>(g?.vacio?.arrollamiento ?? 'baja')
  const [vCon, setVCon] = useState<Conexion>(g?.vacio?.conexion ?? 'Y')
  const [iU, setIU] = useState('')
  const [iV, setIV] = useState('')
  const [iW, setIW] = useState('')
  const [vUm, setVUm] = useState(g?.vacio?.um?.toString() ?? '')
  const [vP, setVP] = useState(g?.vacio?.p0m?.toString() ?? '')
  const [v105U, setV105U] = useState(g?.vacio105?.tension?.toString() ?? '')
  const [v105I, setV105I] = useState(g?.vacio105?.corriente?.toString() ?? '')

  // ---------- 6/7/8/9 ----------
  const [apAT, setApAT] = useState(String(g?.aplicada?.atKV ?? ''))
  const [apBT, setApBT] = useState(String(g?.aplicada?.btKV ?? ''))
  const [apT, setApT] = useState(String(g?.aplicada?.tiempoS ?? 60))
  const [inAT, setInAT] = useState(String(g?.inducida?.atKV ?? ''))
  const [inBT, setInBT] = useState(String(g?.inducida?.btKV ?? ''))
  const [inT, setInT] = useState(String(g?.inducida?.tiempoS ?? 60))
  const [estP, setEstP] = useState(String(g?.estanqueidad?.presionKPa ?? 50))
  const [estT, setEstT] = useState(String(g?.estanqueidad?.tiempoH ?? 1))
  const [pint, setPint] = useState(g?.pintura?.espesorUm ?? '>100')
  const [concl, setConcl] = useState(g?.conclusion ?? 'El espécimen cumple con las especificaciones según norma de fabricación.')

  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await buscarDatosTecnicos(tarea.modelo)
      if (vivo) setFila(r.fila)
    })()
    return () => { vivo = false }
  }, [tarea.modelo])

  const nominal = useMemo(() => {
    const out: Record<string, number | undefined> = {}
    for (const c of NOMINALES_FICHA) out[c.key] = campoNum(fila, ...c.alias)
    return out
  }, [fila])

  const nom: Nominales = useMemo(() => ({
    snKVA: nominal.sn, u1nKV: nominal.un1, u2nKV: nominal.un2,
    i1n: nominal.i1n, i2n: nominal.i2n,
    p0n: nominal.po, ioPctN: nominal.io, pccN: nominal.pcc, uccPctN: nominal.ucc,
  }), [nominal])

  const cfg: ConfigEnsayo = useMemo(() => ({
    nf, material: material === 'aluminio' ? 'aluminio' : 'cobre',
    tRef: n(tRef) ?? T_REF, pinsO: n(pinsO) ?? 0, pinsCC: n(pinsCC) ?? 0,
  }), [nf, material, tRef, pinsO, pinsCC])

  // Corriente de vacio: se promedian las 3 fases (asi lo hace la planilla).
  const i0Prom = useMemo(() => {
    const xs = [n(iU), n(iV), n(iW)].filter((x): x is number => x !== undefined)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined
  }, [iU, iV, iW])

  const resV = useMemo(() => calcularVacio(nom, cfg, {
    arrollamiento: vArr, conexion: vCon, p0m: n(vP), i0m: i0Prom, um: n(vUm),
  }), [nom, cfg, vArr, vCon, vP, i0Prom, vUm])

  const resCC = useMemo(() => calcularCortocircuito(nom, cfg, {
    arrollamiento: cArr, conexion: cCon, pccm: n(ccP), im: n(ccI), um: n(ccU),
    tcc: n(tcc), tR: n(tR),
    rUV: n(rUV), rVW: n(rVW), rWU: n(rWU), rUN: n(rUN),
    rUn: n(rUn), rVn: n(rVn), rWn: n(rWn),
  }), [nom, cfg, cArr, cCon, ccP, ccI, ccU, tcc, tR, rUV, rVW, rWU, rUN, rUn, rVn, rWn])

  const pT = perdidasTotales(resV, resCC)
  const pTn = nominal.po !== undefined && nominal.pcc !== undefined ? nominal.po + nominal.pcc : undefined
  // Relacion Io(1,05)/Io — control de saturacion del nucleo.
  const rel105 = useMemo(() => {
    const u = n(v105U), i = n(v105I), um = n(vUm)
    if (!u || !i || !um || !resV.i0) return undefined
    return (i * (um * 1.05) / u) / resV.i0
  }, [v105U, v105I, vUm, resV.i0])

  const zV = [zonaDe(porcentajeDeNominal(resV.p0, nominal.po), ESCALA_PERDIDAS),
              zonaDe(porcentajeDeNominal(resV.ioPct, nominal.io), ESCALA_IO)]
  const zC = [zonaDe(porcentajeDeNominal(resCC.pccRef, nominal.pcc), ESCALA_PERDIDAS),
              zonaDe(porcentajeDeNominal(resCC.uccPct, nominal.ucc), ESCALA_UCC)]

  async function guardar() {
    const meds: MedicionesEnsayo = {
      nf, material, tRef: n(tRef), pinsO: n(pinsO), pinsCC: n(pinsCC),
      vacio: { arrollamiento: vArr, conexion: vCon, p0m: n(vP), i0m: i0Prom, um: n(vUm) },
      cc: {
        arrollamiento: cArr, conexion: cCon, pccm: n(ccP), im: n(ccI), um: n(ccU),
        tcc: n(tcc), tR: n(tR),
        rUV: n(rUV), rVW: n(rVW), rWU: n(rWU), rUN: n(rUN),
        rUn: n(rUn), rVn: n(rVn), rWn: n(rWn),
      },
      resultados: {
        p0: resV.p0, i0: resV.i0, ioPct: resV.ioPct,
        pcc: resCC.pcc, pj: resCC.pj, ps: resCC.ps, pccRef: resCC.pccRef,
        ucc: resCC.ucc, uccPct: resCC.uccPct, urccPct: resCC.urccPct, uxccPct: resCC.uxccPct,
        pTotal: pT,
      },
      cabecera: {
        nroFabricacion: nroFab || undefined, oc: oc || undefined, anio: n(anio),
        norma, refrigeracion: refrig, liquido, lote: lote || undefined,
        masaKg: n(masa), frecuencia: n(frec), conmutacion: conmut || undefined,
        grupoConexion: grupo, arrollamientos: arroll,
        fases: nf === 3 ? 'TRIFÁSICO' : 'MONOFÁSICO / BIFÁSICO',
      },
      relacion: {
        tensionNominal: n(relUn), relDivisor: n(relDiv),
        medidas: rel.map((f2) => f2.map((x) => n(x) ?? null)),
      },
      aislamiento: {
        tiempos: aisT.map((x) => n(x) ?? 0), tensionKV: n(aisKV), temp: n(aisTemp),
        atbt, atMasa, btMasa,
      },
      vacio105: { tension: n(v105U), corriente: n(v105I) },
      aplicada: { atKV: n(apAT), btKV: n(apBT), tiempoS: n(apT), frecuencia: n(frec) },
      inducida: { atKV: n(inAT), btKV: n(inBT), tiempoS: n(inT), frecuencia: n(frec) },
      estanqueidad: { presionKPa: n(estP), tiempoH: n(estT) },
      pintura: { espesorUm: pint },
      conclusion: concl,
      guardadoEn: new Date().toISOString(),
      guardadoPor: usuario?.usuario,
    }
    if (n(pinsO) !== undefined) localStorage.setItem(LS_PINS_O, String(n(pinsO)))
    if (n(pinsCC) !== undefined) localStorage.setItem(LS_PINS_CC, String(n(pinsCC)))

    // Sugerencia de resultado para los 2 ensayos de perdidas (editable despues).
    const ensayos = { ...(tarea.ensayos ?? {}) }
    if (resV.p0 !== undefined && !zV.includes('sin_dato')) {
      ensayos.perdidas_vacio = zV.every(apruebaZona) ? 'aprobado' : 'rechazado'
    }
    if (resCC.pccRef !== undefined && !zC.includes('sin_dato')) {
      ensayos.perdida_cc = zC.every(apruebaZona) ? 'aprobado' : 'rechazado'
    }
    await guardarLaboratorio({ ...tarea, mediciones: meds, ensayos })
    setMsg('Protocolo guardado.')
  }

  const FASES = ['U', 'V', 'W']
  const POS = ['1', '2', '3*', '4', '5']

  return (
    <div className={'proto-wrap' + (ampliado ? ' proto-full' : '')}>
      {/* ---- barra de acciones: no sale impresa ---- */}
      <div className="proto-acciones no-print">
        {!dis && <button className="btn btn-primary" onClick={() => void guardar()}>💾 Guardar protocolo</button>}
        <button className="btn" onClick={() => window.print()}>🖨 Exportar PDF</button>
        <button className="btn" onClick={() => setAmpliado((v) => !v)}
          title={ampliado ? 'Volver a la ficha (Esc)' : 'Ver la planilla en toda la pantalla'}>
          {ampliado ? '🗕 Reducir' : '🗖 Pantalla completa'}
        </button>
        {onCerrar && !ampliado && <button className="btn" onClick={onCerrar}>Cerrar</button>}
        {msg && <span className="meta" style={{ color: 'var(--estado-fin)', fontWeight: 700 }}>✓ {msg}</span>}
      </div>

      <div className="proto-hoja">
        <div className="proto-sello">FECHA 01/26 &nbsp;-&nbsp; RPH 8.6/03 &nbsp;-&nbsp; V03 &nbsp;-&nbsp; HOJA 1/1</div>
        <h1 className="proto-titulo">PROTOCOLO DE ENSAYO DE TRANSFORMADOR</h1>

        {/* ================= CABECERA ================= */}
        <table className="proto-tabla">
          <tbody>
            <tr>
              <th>MARCA</th><td>INELPA</td>
              <th>N° DE FABRICACIÓN</th><td><Ent v={nroFab} set={setNroFab} dis={dis} ancho={90} /></td>
              <th>POTENCIA · Sn</th><td>{nominal.sn ?? '—'} kVA</td>
            </tr>
            <tr>
              <th>MODELO</th><td>{tarea.modelo}</td>
              <th>CLIENTE</th><td>{tarea.cliente || 'STOCK'}</td>
              <th>TENSIÓN · Un</th><td>{nominal.un1 ?? '—'} / {nominal.un2 ?? '—'} kV</td>
            </tr>
            <tr>
              <th>N° DE SERIE</th><td>{tarea.nroSerie || '—'}</td>
              <th>O.C.</th><td><Ent v={oc} set={setOc} dis={dis} ancho={90} /></td>
              <th>CORRIENTE · In</th><td>{f(nominal.i1n)} / {f(nominal.i2n)} A</td>
            </tr>
            <tr>
              <th>MATERIAL</th>
              <td>
                <select className="proto-in" value={material} disabled={dis}
                  onChange={(e) => setMaterial(e.target.value as MaterialBobina)}>
                  {MATERIALES.map((m) => <option key={m.id} value={m.id}>{m.label.toUpperCase()}</option>)}
                </select>
              </td>
              <th>AÑO DE FABRICACIÓN</th><td><Ent v={anio} set={setAnio} dis={dis} ancho={60} /></td>
              <th>CONMUTACIÓN</th><td><Ent v={conmut} set={setConmut} dis={dis} ancho={140} ph="13,2 kV +/- 2 x 2,5%" /></td>
            </tr>
            <tr>
              <th>NORMA</th><td><Ent v={norma} set={setNorma} dis={dis} ancho={90} /></td>
              <th>MASA TOTAL</th><td><Ent v={masa} set={setMasa} dis={dis} ancho={60} /> kg</td>
              <th>FRECUENCIA</th><td><Ent v={frec} set={setFrec} dis={dis} ancho={45} /> Hz</td>
            </tr>
            <tr>
              <th>REFRIGERACIÓN</th><td><Ent v={refrig} set={setRefrig} dis={dis} ancho={70} /></td>
              <th>CANTIDAD DE FASES</th>
              <td>
                <select className="proto-in" value={nf} disabled={dis} onChange={(e) => setNf(Number(e.target.value) as Nf)}>
                  <option value={3}>TRIFÁSICO</option><option value={1}>MONOFÁSICO / BIFÁSICO</option>
                </select>
              </td>
              <th>ARROLLAMIENTOS</th><td><Ent v={arroll} set={setArroll} dis={dis} ancho={70} /></td>
            </tr>
            <tr>
              <th>LÍQUIDO AISLANTE</th><td colSpan={2}><Ent v={liquido} set={setLiquido} dis={dis} ancho={200} /> · LOTE <Ent v={lote} set={setLote} dis={dis} ancho={80} /></td>
              <th>GRUPO DE CONEXIÓN</th><td colSpan={2}><Ent v={grupo} set={setGrupo} dis={dis} ancho={80} /></td>
            </tr>
          </tbody>
        </table>

        {/* ---- datos garantizados (referencia) ---- */}
        <div className="proto-sec">DATOS TÉCNICOS GARANTIZADOS</div>
        <table className="proto-tabla">
          <tbody>
            <tr>
              <th>P. VACÍO · PO</th><td>{nominal.po ?? '—'} W</td>
              <th>P. CARGA · PCC(75)</th><td>{nominal.pcc ?? '—'} W</td>
              <th>CORRIENTE · IO</th><td>{nominal.io ?? '—'} %</td>
              <th>TENSIÓN · uCC(75)</th><td>{nominal.ucc ?? '—'} %</td>
            </tr>
          </tbody>
        </table>

        {/* ================= 1. RELACION ================= */}
        <div className="proto-sec">1. MEDICIÓN DE RELACIÓN DE TRANSFORMACIÓN</div>
        <table className="proto-tabla proto-grid">
          <thead>
            <tr>
              <th>CONMUTADOR</th>{POS.map((p) => <th key={p}>{p}</th>)}<th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>TENSIÓN [V]</th>
              {[1.05, 1.025, 1, 0.975, 0.95].map((k, i) => (
                <td key={i}>{n(relUn) ? f(n(relUn)! * k, 0) : (i === 2 ? <Ent v={relUn} set={setRelUn} dis={dis} ancho={60} ph="Un" /> : '—')}</td>
              ))}
              <td></td>
            </tr>
            <tr>
              <th>REL. TEÓRICA</th>
              {[1.05, 1.025, 1, 0.975, 0.95].map((k, i) => (
                <td key={i}><Calc v={n(relUn) && n(relDiv) ? (n(relUn)! * k) / n(relDiv)! : undefined} /></td>
              ))}
              <td className="meta">÷ <Ent v={relDiv} set={setRelDiv} dis={dis} ancho={50} /></td>
            </tr>
            {FASES.map((fa, i) => (
              <tr key={fa}>
                <th>FASE {fa}</th>
                {POS.map((_, j) => (
                  <td key={j}><Ent v={rel[i]?.[j] ?? ''} set={(v) => setRelC(i, j, v)} dis={dis} ancho={58} /></td>
                ))}
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ================= 2. RESISTENCIA DE ARROLLAMIENTO ================= */}
        <div className="proto-sec">2. MEDICIÓN DE RESISTENCIA DE ARROLLAMIENTO</div>
        <table className="proto-tabla proto-grid">
          <tbody>
            {nf === 3 ? (
              <>
                <tr>
                  <th>ARROLL. AT [Ω]</th>
                  <th>1U-1V</th><td><Ent v={rUV} set={setRUV} dis={dis} /></td>
                  <th>1V-1W</th><td><Ent v={rVW} set={setRVW} dis={dis} /></td>
                  <th>1W-1U</th><td><Ent v={rWU} set={setRWU} dis={dis} /></td>
                  <th>TEMP.</th><td><Ent v={tR} set={setTR} dis={dis} ancho={50} /> °C</td>
                </tr>
                <tr>
                  <th>ARROLL. BT [mΩ]</th>
                  <th>2u-2n</th><td><Ent v={rUn} set={setRUn} dis={dis} /></td>
                  <th>2v-2n</th><td><Ent v={rVn} set={setRVn} dis={dis} /></td>
                  <th>2w-2n</th><td><Ent v={rWn} set={setRWn} dis={dis} /></td>
                  <th></th><td></td>
                </tr>
              </>
            ) : (
              <tr>
                <th>AT [Ω] 1U-1N</th><td><Ent v={rUN} set={setRUN} dis={dis} /></td>
                <th>BT [mΩ] 2u-2n</th><td><Ent v={rUn} set={setRUn} dis={dis} /></td>
                <th>TEMP.</th><td><Ent v={tR} set={setTR} dis={dis} ancho={50} /> °C</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* ================= 3. AISLAMIENTO ================= */}
        <div className="proto-sec">3. MEDICIÓN DE RESISTENCIA DE AISLAMIENTO</div>
        <table className="proto-tabla proto-grid">
          <thead>
            <tr>
              <th>TIEMPO LECTURA [s]</th>
              {aisT.map((t, i) => <th key={i}><Ent v={t} set={(v) => setArr(setAisT, i, v)} dis={dis} ancho={50} /></th>)}
              <th>TENSIÓN (CC)</th><th>TEMP.</th>
            </tr>
          </thead>
          <tbody>
            {([['AT / BT', atbt, setAtbt], ['AT / MASA', atMasa, setAtMasa], ['BT / MASA', btMasa, setBtMasa]] as const).map(([lbl, arr, set], k) => (
              <tr key={lbl}>
                <th>{lbl} [MΩ]</th>
                {arr.map((v, i) => <td key={i}><Ent v={v} set={(x) => setArr(set as never, i, x)} dis={dis} /></td>)}
                {k === 0 ? <td rowSpan={3}><Ent v={aisKV} set={setAisKV} dis={dis} ancho={50} /> kV</td> : null}
                {k === 0 ? <td rowSpan={3}><Ent v={aisTemp} set={setAisTemp} dis={dis} ancho={50} /> °C</td> : null}
              </tr>
            ))}
          </tbody>
        </table>

        {/* ================= 4. PERDIDAS EN CARGA ================= */}
        <div className="proto-sec">4. ENSAYO DE PÉRDIDAS EN CARGA</div>
        <table className="proto-tabla proto-grid">
          <tbody>
            <tr>
              <th>ARROLLAMIENTO</th>
              <td>
                <select className="proto-in" value={cArr} disabled={dis} onChange={(e) => setCArr(e.target.value as Arrollamiento)}>
                  <option value="alta">ALTA</option><option value="baja">BAJA</option>
                </select>
              </td>
              {nf === 3 && <>
                <th>CONEXIÓN</th>
                <td>
                  <select className="proto-in" value={cCon} disabled={dis} onChange={(e) => setCCon(e.target.value as Conexion)}>
                    <option value="D">Δ</option><option value="Y">Y</option>
                  </select>
                </td>
              </>}
              <th>TEMP. [°C]</th><td><Ent v={tcc} set={setTcc} dis={dis} ancho={50} /></td>
              <th>P. INST. [W]</th><td><Ent v={pinsCC} set={setPinsCC} dis={dis} ancho={50} /></td>
            </tr>
            <tr>
              <th>MEDIDO · TENSIÓN [V]</th><td><Ent v={ccU} set={setCcU} dis={dis} /></td>
              <th>CORRIENTE [A]</th><td><Ent v={ccI} set={setCcI} dis={dis} /></td>
              <th>POTENCIA [W]</th><td colSpan={3}><Ent v={ccP} set={setCcP} dis={dis} /></td>
            </tr>
            <tr>
              <th>CORREGIDO A In</th><td><Calc v={resCC.ucc} u="V" /></td>
              <th>Pcc</th><td><Calc v={resCC.pcc} u="W" /></td>
              <th>PJ AT / PJ BT</th><td colSpan={3}><Calc v={resCC.pjAT} u="W" /> / <Calc v={resCC.pjBT} u="W" /></td>
            </tr>
            <tr>
              <th>P. ADICIONALES</th><td><Calc v={resCC.ps} u="W" /></td>
              <th>PJ(75)</th><td><Calc v={(resCC.pjATRef ?? 0) + (resCC.pjBTRef ?? 0)} u="W" /></td>
              <th>Pad(75)</th><td colSpan={3}><Calc v={resCC.psRef} u="W" /></td>
            </tr>
            <tr className="proto-final">
              <th>PCC(75)</th><td><Calc v={resCC.pccRef} u="W" /></td>
              <th>uCC(75)</th><td><Calc v={resCC.uccPct} u="%" /></td>
              <th>uR% / uX%</th><td colSpan={3}><Calc v={resCC.urccPct} /> / <Calc v={resCC.uxccPct} /></td>
            </tr>
          </tbody>
        </table>

        {/* ================= 5. PERDIDAS EN VACIO ================= */}
        <div className="proto-sec">5. ENSAYO DE PÉRDIDAS EN VACÍO</div>
        <table className="proto-tabla proto-grid">
          <tbody>
            <tr>
              <th>ARROLLAMIENTO</th>
              <td>
                <select className="proto-in" value={vArr} disabled={dis} onChange={(e) => setVArr(e.target.value as Arrollamiento)}>
                  <option value="baja">BAJA</option><option value="alta">ALTA</option>
                </select>
              </td>
              {nf === 3 && <>
                <th>CONEXIÓN</th>
                <td>
                  <select className="proto-in" value={vCon} disabled={dis} onChange={(e) => setVCon(e.target.value as Conexion)}>
                    <option value="Y">Y</option><option value="D">Δ</option>
                  </select>
                </td>
              </>}
              <th>P. INST. [W]</th><td colSpan={3}><Ent v={pinsO} set={setPinsO} dis={dis} ancho={50} /></td>
            </tr>
            <tr>
              <th>CORRIENTE POR FASE [A]</th>
              <td>U <Ent v={iU} set={setIU} dis={dis} ancho={58} /></td>
              <td>V <Ent v={iV} set={setIV} dis={dis} ancho={58} /></td>
              <td>W <Ent v={iW} set={setIW} dis={dis} ancho={58} /></td>
              <th>PROM.</th><td colSpan={3}><Calc v={i0Prom} u="A" /></td>
            </tr>
            <tr>
              <th>TENSIÓN MEDIDA [V]</th><td><Ent v={vUm} set={setVUm} dis={dis} /></td>
              <th>POTENCIA MEDIDA [W]</th><td><Ent v={vP} set={setVP} dis={dis} /></td>
              <th>I0 CORREGIDA</th><td colSpan={3}><Calc v={resV.i0} u="A" /></td>
            </tr>
            <tr className="proto-final">
              <th>PO</th><td><Calc v={resV.p0} u="W" /></td>
              <th>IO(%)</th><td><Calc v={resV.ioPct} u="%" /></td>
              <th>A 1,05 Un · I0(1,05)/I0</th>
              <td colSpan={3}>
                <Ent v={v105U} set={setV105U} dis={dis} ancho={58} ph="U" />{' '}
                <Ent v={v105I} set={setV105I} dis={dis} ancho={58} ph="I" />{' '}
                <Calc v={rel105} />
              </td>
            </tr>
          </tbody>
        </table>

        {/* ================= 6/7/8/9 ================= */}
        <div className="proto-sec">6. TENSIÓN APLICADA &nbsp;·&nbsp; 7. TENSIÓN INDUCIDA &nbsp;·&nbsp; 8. ESTANQUEIDAD EN FRÍO &nbsp;·&nbsp; 9. ESPESOR DE PINTURA</div>
        <table className="proto-tabla proto-grid">
          <tbody>
            <tr>
              <th>APLICADA [kV]</th>
              <td>AT <Ent v={apAT} set={setApAT} dis={dis} ancho={50} /></td>
              <td>BT <Ent v={apBT} set={setApBT} dis={dis} ancho={50} /></td>
              <td>{apT} s · {frec} Hz</td>
              <th>ESTANQUEIDAD</th>
              <td><Ent v={estP} set={setEstP} dis={dis} ancho={50} /> kPa</td>
              <td><Ent v={estT} set={setEstT} dis={dis} ancho={40} /> h</td>
            </tr>
            <tr>
              <th>INDUCIDA [kV]</th>
              <td>AT <Ent v={inAT} set={setInAT} dis={dis} ancho={50} /></td>
              <td>BT <Ent v={inBT} set={setInBT} dis={dis} ancho={50} /></td>
              <td>{inT} s · {frec} Hz</td>
              <th>ESPESOR PINTURA</th>
              <td colSpan={2}><Ent v={pint} set={setPint} dis={dis} ancho={70} /> µm</td>
            </tr>
          </tbody>
        </table>

        {/* ================= PERDIDAS TOTALES + CONCLUSION ================= */}
        <table className="proto-tabla">
          <tbody>
            <tr className="proto-final">
              <th>PÉRDIDAS TOTALES (VACÍO + CARGA) · PT</th>
              <td><Calc v={pT} u="W" /></td>
              <th>GARANTIZADO</th>
              <td>{pTn ?? '—'} W {pT !== undefined && pTn ? `· ${((pT / pTn) * 100).toFixed(1)}%` : ''}</td>
            </tr>
            <tr>
              <th>CONCLUSIÓN</th>
              <td colSpan={3}><Ent v={concl} set={setConcl} dis={dis} ancho={560} /></td>
            </tr>
          </tbody>
        </table>

        <div className="proto-pie">
          Ensayos realizados en el laboratorio de pruebas y ensayos eléctricos de INELPA TRANSFORMADORES SA.
        </div>
        <div className="proto-firmas">
          <div>LABORATORISTA</div><div>CLIENTE / INSPECTOR</div>
          <div>FECHA DE EMISIÓN<br />{new Date().toLocaleDateString()}</div>
        </div>
      </div>

      {/* ---- agujas: ayuda visual en pantalla, no van al PDF ---- */}
      <div className="no-print">
        <div className="section-title" style={{ margin: '16px 0 8px' }}>Control contra el valor garantizado</div>
        <div className="agujas">
          <Aguja titulo="Pérdidas en vacío (P0)" valor={resV.p0} nominal={nominal.po} unidad="W" escala={ESCALA_PERDIDAS} />
          <Aguja titulo="Corriente de vacío (io%)" valor={resV.ioPct} nominal={nominal.io} unidad="%" escala={ESCALA_IO} decimales={2} />
          <Aguja titulo="Pérdidas en carga Pcc(75)" valor={resCC.pccRef} nominal={nominal.pcc} unidad="W" escala={ESCALA_PERDIDAS} />
          <Aguja titulo="Tensión de cortocircuito ucc%" valor={resCC.uccPct} nominal={nominal.ucc} unidad="%" escala={ESCALA_UCC} decimales={2} />
        </div>
      </div>
    </div>
  )
}
