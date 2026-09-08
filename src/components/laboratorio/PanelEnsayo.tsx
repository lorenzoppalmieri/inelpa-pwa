import { useEffect, useMemo, useRef, useState } from 'react'
import type { TareaLaboratorio, MedicionesEnsayo, MaterialBobina, OrigenResistencia } from '../../types'
import { MATERIALES, ENSAYOS_LAB } from '../../types'
import { guardarLaboratorio } from '../../sync/syncEngine'
import { useAuth } from '../../auth/AuthContext'
import {
  guardarRegistro, registroDesdeFicha, versionesDeModelo, type RegistroLab,
} from '../../lib/registroLab'
import BuscadorResistencias from './BuscadorResistencias'
import {
  FACTORES_CONMUTACION, relacionTeorica, desvioPct, relacionEnNorma,
  relacionSobreexcitacion, sobreexcitacionEnNorma, US_UN_DEFECTO, IS_IO_DEFECTO,
} from '../../lib/ensayosNorma'
import {
  buscarDatosTecnicos, campoNum, codigoCorto, toleranciasDe, instrumentosDe, sobreexcitacionDe,
  NOMINALES_TENSION, NOMINALES_PERDIDAS, NOMINALES_CONTEXTO, NOMINALES_TODOS, NOMINALES_FICHA, campo,
  type DatoTecnico, type CampoNominal,
} from '../../lib/datosTecnicos'
import {
  calcularVacio, calcularCortocircuito, perdidasTotales,
  pccATemperatura, calcularEficiencia, escalasDeModelo,
  porcentajeDeNominal, zonaDe, apruebaZona,
  nfDesdeModelo, materialDesdeModelo,
  type Nominales, type ConfigEnsayo, type Nf, type Arrollamiento, type Conexion,
} from '../../lib/ensayoPerdidas'
import Aguja from './Aguja'
import SeccionAislamiento, {
  aisInicial, aisAMediciones, aisIncompleto, aisIniciado, type AisState,
} from './SeccionAislamiento'
import SeccionRelacion, { relInicial, relAMediciones, type RelState } from './SeccionRelacion'
import SeccionDielectricos, {
  dielInicial, dielAplicada, dielInducida, dielRechazado, type DielState,
} from './SeccionDielectricos'

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

/**
 * v1.103: la tolerancia que se muestra sale de la escala que se esta usando.
 *
 * Antes los textos decian "+15%" y "+30%" escritos a mano. Si el catalogo trae
 * otra tolerancia para un modelo, la aguja se pintaria con el corte nuevo y el
 * texto de abajo seguiria diciendo el viejo: la pantalla se contradiria a si
 * misma y le daria la razon al numero equivocado.
 */
function tolTxt(esc: { amarilloHasta: number; verdeHasta: number; bilateral?: boolean }): string {
  const t = (esc.bilateral ? esc.verdeHasta : esc.amarilloHasta) - 100
  return `${Number.isInteger(t) ? t : t.toFixed(1)}%`
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
  // v1.99: identidad del especimen dentro del REGISTRO GENERAL. Obligatoria.
  const [versionDiseno, setVersionDiseno] = useState(guardado?.versionDiseno ?? '')
  const [obsBobinado, setObsBobinado] = useState(guardado?.obsBobinado ?? '')
  // v1.100: el N° de fabricación se cargaba SOLO en la cabecera del protocolo.
  // Al separar protocolo y registro (v1.99) dejó de llegar al Registro General,
  // y es justo el dato con el que el buscador de resistencias identifica de qué
  // máquina se están copiando los valores. Ahora se carga acá.
  const [nroFab, setNroFab] = useState(guardado?.cabecera?.nroFabricacion ?? '')
  const [versiones, setVersiones] = useState<string[]>([])
  const [pinsO, setPinsO] = useState(String(guardado?.pinsO ?? leerLS(LS_PINS_O, 0)))
  const [pinsCC, setPinsCC] = useState(String(guardado?.pinsCC ?? leerLS(LS_PINS_CC, 0)))
  // v1.103: de donde salio la potencia de instrumentos que se esta usando.
  const [pinsOrigen, setPinsOrigen] = useState<'ensayo' | 'catalogo' | 'equipo'>(
    guardado?.pinsO !== undefined || guardado?.pinsCC !== undefined ? 'ensayo' : 'equipo')
  // Si el laboratorista ya toco el campo, el catalogo NO lo pisa cuando termine
  // de cargar. La tabla llega despues del primer render, asi que sin esta marca
  // podria borrarle un numero recien tipeado.
  const pinsTocado = useRef(false)

  // ---------- Ensayo de vacio (por defecto Baja / Y) ----------
  const [vArr, setVArr] = useState<Arrollamiento>(guardado?.vacio?.arrollamiento ?? 'baja')
  const [vCon, setVCon] = useState<Conexion>(guardado?.vacio?.conexion ?? 'Y')
  const [p0m, setP0m] = useState(guardado?.vacio?.p0m?.toString() ?? '')
  const [i0m, setI0m] = useState(guardado?.vacio?.i0m?.toString() ?? '')
  const [vUm, setVUm] = useState(guardado?.vacio?.um?.toString() ?? '')
  // v1.101: corriente de vacio por fase (solo trifasico). Si se cargan las tres,
  // el promedio manda sobre lo tipeado en I0m.
  const [porFase, setPorFase] = useState(guardado?.vacio?.iU !== undefined)
  const [iU, setIU] = useState(guardado?.vacio?.iU?.toString() ?? '')
  const [iV, setIV] = useState(guardado?.vacio?.iV?.toString() ?? '')
  const [iW, setIW] = useState(guardado?.vacio?.iW?.toString() ?? '')
  // v1.103: ensayo de vacio a sobretension. Hasta ahora SOLO se podia cargar
  // desde el protocolo, y desde la v1.99 el protocolo escribe en su propio campo
  // — o sea que esta medicion nunca llegaba al Registro General.
  const [v105U, setV105U] = useState(guardado?.vacio105?.tension?.toString() ?? '')
  const [v105I, setV105I] = useState(guardado?.vacio105?.corriente?.toString() ?? '')

  // ---------- Ensayo de cortocircuito (por defecto Alta / Δ) ----------
  const [cArr, setCArr] = useState<Arrollamiento>(guardado?.cc?.arrollamiento ?? 'alta')
  const [cCon, setCCon] = useState<Conexion>(guardado?.cc?.conexion ?? 'D')
  const [pccm, setPccm] = useState(guardado?.cc?.pccm?.toString() ?? '')
  const [cIm, setCIm] = useState(guardado?.cc?.im?.toString() ?? '')
  const [cUm, setCUm] = useState(guardado?.cc?.um?.toString() ?? '')
  const [tcc, setTcc] = useState(guardado?.cc?.tcc?.toString() ?? '')
  const [tR, setTR] = useState(guardado?.cc?.tR?.toString() ?? '')
  // v1.99: la resistencia de arrollamiento no siempre se mide sobre la maquina
  // bajo ensayo. Hay que declararlo, porque el buscador de resistencias solo
  // puede ofrecer valores efectivamente MEDIDOS.
  const [origenRes, setOrigenRes] = useState<OrigenResistencia>(
    guardado?.cc?.origenResistencias ?? 'medido')
  // v1.101: buscador de resistencias en maquinas equivalentes.
  const [buscando, setBuscando] = useState(false)
  const [copiadaDe, setCopiadaDe] = useState<RegistroLab | undefined>()

  // ---------- v1.100: los otros tres ensayos del documento ----------
  const [ais, setAis] = useState<AisState>(() => aisInicial(guardado))
  const [rel, setRel] = useState<RelState>(() => relInicial(guardado))
  const [diel, setDiel] = useState<DielState>(() => dielInicial(guardado))
  // Observación / defecto / falla por ensayo (clave = key de ENSAYOS_LAB).
  const [obs, setObs] = useState<Record<string, string>>(guardado?.observaciones ?? {})
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

  // v1.99: versiones de diseño ya usadas para este modelo. Es solo una AYUDA
  // para no terminar con '2', 'v2' y 'V 2' como si fueran tres versiones
  // distintas — el campo sigue siendo libre, porque una versión nueva tiene que
  // poder cargarse la primera vez que aparece.
  useEffect(() => {
    let vivo = true
    void (async () => {
      const vs = await versionesDeModelo(tarea.modelo)
      if (vivo) setVersiones(vs)
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

  // v1.101: corriente de vacio efectiva. Con carga por fase se promedian las
  // que esten cargadas (no las 3 a la fuerza: si una fase no se midio, promediar
  // sobre 3 la contaria como 0 y hundiria el io%).
  const i0Fases = useMemo(() => {
    const xs = [n(iU), n(iV), n(iW)].filter((x): x is number => x !== undefined)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined
  }, [iU, iV, iW])
  const i0Efectiva = porFase && nf === 3 ? i0Fases : n(i0m)

  const resVacio = useMemo(
    () => calcularVacio(nom, cfg, { arrollamiento: vArr, conexion: vCon, p0m: n(p0m), i0m: i0Efectiva, um: n(vUm) }),
    [nom, cfg, vArr, vCon, p0m, i0Efectiva, vUm])

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

  // ---------- v1.101: eficiencia ----------
  const [fCarga, setFCarga] = useState(String(guardado?.eficiencia?.factorCarga ?? 1))
  const [tEfic, setTEfic] = useState(String(guardado?.eficiencia?.temp ?? T_REF_DEFECTO))
  const efic = useMemo(() => {
    const pccT = pccATemperatura(resCC, cfg.material, n(tcc), n(tEfic))
    return calcularEficiencia(nom, resVacio.p0, pccT, n(fCarga) ?? 1)
  }, [resCC, cfg.material, tcc, tEfic, nom, resVacio.p0, fCarga])

  // ============================================================
  // v1.103 — POTENCIA DE INSTRUMENTOS DESDE EL CATALOGO.
  //
  // Hasta ahora `pinsO`/`pinsCC` eran una constante del BANCO guardada en el
  // localStorage de cada navegador, igual para todos los modelos. La planilla
  // de datos tecnicos las trae POR MODELO y varian (0, 1, 2, 3, 7, 8, 11, 15).
  //
  // Precedencia, de mayor a menor:
  //   1. El ensayo ya guardado. Un protocolo emitido no puede cambiar de valores
  //      porque despues se corrigio la planilla.
  //   2. El catalogo del modelo.
  //   3. El ultimo valor usado en este equipo (localStorage), que es el
  //      comportamiento viejo y sigue sirviendo si el catalogo no trae la columna.
  //
  // OJO CON EL CERO: aca 0 SI es un valor real (instrumentos que no consumen o
  // ya compensados) y la mayoria de los modelos lo tienen. Al reves que con las
  // tolerancias, no se puede leer como "sin dato".
  // ============================================================
  useEffect(() => {
    if (!fila) return
    if (guardado?.pinsO !== undefined || guardado?.pinsCC !== undefined) return
    if (pinsTocado.current) return
    const ins = instrumentosDe(fila)
    if (ins.pinsO === undefined && ins.pinsCC === undefined) return
    if (ins.pinsO !== undefined) setPinsO(String(ins.pinsO))
    if (ins.pinsCC !== undefined) setPinsCC(String(ins.pinsCC))
    setPinsOrigen('catalogo')
  }, [fila, guardado?.pinsO, guardado?.pinsCC])

  /** Setter de los Pins que deja marcado que el valor lo puso una persona. */
  const editarPins = (set: (s: string) => void) => (s: string) => {
    pinsTocado.current = true
    setPinsOrigen('equipo')
    set(s)
  }

  // v1.103: las tolerancias salen del catalogo del modelo. Si la tabla todavia
  // es la vieja (sin las columnas tol_*), caen a las del documento de calculo.
  const tol = useMemo(() => toleranciasDe(fila), [fila])
  const esc = useMemo(() => escalasDeModelo(tol), [tol])

  // v1.103: criterio del ensayo a sobretension, tambien del catalogo.
  const sob = useMemo(() => sobreexcitacionDe(fila), [fila])
  const usUn = sob.usUn ?? US_UN_DEFECTO
  const isIo = sob.isIo ?? IS_IO_DEFECTO
  const rel105 = useMemo(
    () => relacionSobreexcitacion(n(v105I), n(v105U), n(vUm), resVacio.i0, usUn),
    [v105I, v105U, vUm, resVacio.i0, usUn])
  const ok105 = sobreexcitacionEnNorma(rel105, isIo)
  // Se aclara de donde salieron los cortes. Sin esto, el laboratorista no tiene
  // como distinguir una tolerancia que vino del catalogo de una que es el valor
  // por defecto del documento porque la columna estaba vacia.
  const hayTolCatalogo = [tol.po, tol.pcc, tol.io, tol.ucc, tol.pt]
    .some((x) => x !== undefined && Number.isFinite(x) && x > 0)
  const origenTol = hayTolCatalogo
    ? ' (del catálogo)'
    : ' (por norma: el catálogo no las trae)'

  // Zonas -> sugerencia de aprobado/rechazado para los 2 ensayos del documento.
  const zVacio = [
    zonaDe(porcentajeDeNominal(resVacio.p0, nominal.po), esc.po),
    zonaDe(porcentajeDeNominal(resVacio.ioPct, nominal.io), esc.io),
  ]
  const zCC = [
    zonaDe(porcentajeDeNominal(resCC.pccRef, nominal.pcc), esc.pcc),
    zonaDe(porcentajeDeNominal(resCC.uccPct, nominal.ucc), esc.ucc),
  ]
  const zTotal = zonaDe(porcentajeDeNominal(pTotal, pTotalN), esc.totales)

  // v1.99: sin versión de diseño la fila no entra al Registro General — no se
  // podría filtrar ni comparar con otras máquinas del mismo modelo.
  const faltaVersion = !versionDiseno.trim()
  // Se exige temperatura y mínimos SOLO si se empezó a cargar el aislamiento.
  const faltaAislamiento = aisIniciado(ais) && aisIncompleto(ais)
  const noPuedeGuardar = faltaVersion || faltaAislamiento

  async function guardar() {
    if (noPuedeGuardar) { setMsg(''); return }
    const meds: MedicionesEnsayo = {
      nf, material, tRef: n(tRef), pinsO: n(pinsO), pinsCC: n(pinsCC),
      versionDiseno: versionDiseno.trim(),
      obsBobinado: obsBobinado.trim() || undefined,
      // v1.100: los otros tres ensayos del documento.
      aislamiento: aisAMediciones(ais),
      relacion: relAMediciones(rel, nf),
      aplicada: dielAplicada(diel, guardado?.cabecera?.frecuencia),
      inducida: dielInducida(diel, guardado?.inducida, guardado?.cabecera?.frecuencia),
      // Sólo las observaciones con texto: un mapa lleno de strings vacíos
      // engorda el jsonb que se espeja en cada tablet sin decir nada.
      observaciones: Object.fromEntries(
        Object.entries(obs).map(([k, t]) => [k, t.trim()]).filter(([, t]) => t),
      ),
      // Se conserva lo que ya venía cargado desde la planilla del protocolo y
      // que esta pantalla todavía no edita. ANTES DE LA v1.100 NO SE CONSERVABA:
      // guardar desde acá reconstruía `mediciones` de cero y borraba cabecera,
      // relación, aislamiento y dieléctricos que se hubieran cargado en la
      // planilla. Con el protocolo escribiendo en su propio campo eso ya no se
      // notaría, pero el dato viejo se seguiría perdiendo igual.
      cabecera: { ...guardado?.cabecera, nroFabricacion: nroFab.trim() || undefined },
      // v1.103: ahora se carga acá, así que la medición entra al Registro General.
      vacio105: { tension: n(v105U), corriente: n(v105I) },
      estanqueidad: guardado?.estanqueidad,
      pintura: guardado?.pintura,
      conclusion: guardado?.conclusion,
      vacio: {
        arrollamiento: vArr, conexion: vCon, p0m: n(p0m), um: n(vUm),
        // i0m guarda SIEMPRE el valor que se usó para calcular, venga del
        // promedio de las fases o de la carga directa. Así el protocolo y el
        // registro leen un solo campo y no tienen que rehacer la decisión.
        i0m: i0Efectiva,
        iU: porFase ? n(iU) : undefined,
        iV: porFase ? n(iV) : undefined,
        iW: porFase ? n(iW) : undefined,
      },
      cc: {
        arrollamiento: cArr, conexion: cCon, pccm: n(pccm), im: n(cIm), um: n(cUm),
        tcc: n(tcc), tR: n(tR),
        rUV: n(rUV), rVW: n(rVW), rWU: n(rWU), rUN: n(rUN),
        rUn: n(rUn), rVn: n(rVn), rWn: n(rWn),
        origenResistencias: origenRes,
        // Sólo tiene sentido si son copiadas. Si el laboratorista vuelve a
        // 'medido' después de haber copiado, la trazabilidad vieja mentiría.
        // Si en esta sesión no se usó el buscador, se CONSERVA la trazabilidad
        // que ya venía guardada: si no, reabrir la ficha y volver a guardar
        // borraría el rastro de dónde salieron los números.
        copiadaDe: origenRes !== 'copiado'
          ? undefined
          : copiadaDe
            ? {
              registroId: copiadaDe.laboratorioId,
              nroFabricacion: copiadaDe.nroFabricacion ?? copiadaDe.nroSerie,
              fecha: copiadaDe.fecha,
            }
            : guardado?.cc?.copiadaDe,
      },
      // Resultados CONGELADOS: si mañana se corrige el catalogo, el protocolo ya
      // emitido no cambia solo.
      resultados: {
        p0: resVacio.p0, i0: resVacio.i0, ioPct: resVacio.ioPct,
        pcc: resCC.pcc, pj: resCC.pj, ps: resCC.ps, pccRef: resCC.pccRef,
        ucc: resCC.ucc, uccPct: resCC.uccPct, urccPct: resCC.urccPct, uxccPct: resCC.uxccPct,
        pTotal,
        // v1.101: desglose que el motor ya calculaba y se tiraba.
        pj1: resCC.pjATRef, pj2: resCC.pjBTRef, psRef: resCC.psRef,
        pinsO: n(pinsO), pinsCC: n(pinsCC),
      },
      eficiencia: {
        factorCarga: n(fCarga), temp: n(tEfic), rendimientoPct: efic.rendimientoPct,
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
    // v1.100: mismas reglas para los ensayos nuevos.
    // RELACIÓN: sólo se pre-marca si hay al menos un punto medido. Un punto
    // fuera de la tolerancia de ±0,5% alcanza para rechazar todo el ensayo.
    const puntos = meds.relacion?.medidas?.flat().filter((x): x is number => x !== null) ?? []
    if (puntos.length > 0) {
      const teo = FACTORES_CONMUTACION.map((_, j) =>
        relacionTeorica(meds.relacion?.tensionNominal, meds.relacion?.relDivisor, j))
      let evaluado = false, algunoMal = false
      meds.relacion?.medidas?.forEach((fila) => fila.forEach((x, j) => {
        const ok = relacionEnNorma(desvioPct(x ?? undefined, teo[j]))
        if (ok === undefined) return
        evaluado = true
        if (!ok) algunoMal = true
      }))
      if (evaluado) ensayos.relacion = algunoMal ? 'rechazado' : 'aprobado'
    }
    // DIELÉCTRICOS: acá no hay tolerancia que calcular, el veredicto lo puso la
    // persona en el selector. Sólo se traslada a la ficha.
    const rDiel = dielRechazado(diel)
    if (diel.apAtOk !== 'sin' || diel.apBtOk !== 'sin') {
      ensayos.tension_aplicada = rDiel.aplicada ? 'rechazado' : 'aprobado'
    }
    if (diel.inOk !== 'sin') {
      ensayos.tension_inducida = rDiel.inducida ? 'rechazado' : 'aprobado'
    }
    const actualizada = { ...tarea, mediciones: meds, ensayos }
    await guardarLaboratorio(actualizada)

    // ---- v1.99: espejo en el REGISTRO GENERAL DE LABORATORIO ----
    // Va DESPUÉS de guardar la ficha y nunca la bloquea: si esto falla (sin red,
    // por ejemplo) el ensayo ya está a salvo en `laboratorio.mediciones` y la
    // fila del registro se puede regenerar desde ahí. El registro es un índice
    // consultable, no la fuente de verdad.
    const fueraDeNorma = zVacio.some((z) => z === 'fuera') || zCC.some((z) => z === 'fuera') || zTotal === 'fuera'
    const r = await guardarRegistro(registroDesdeFicha(
      actualizada,
      { snKVA: nominal.sn, un1KV: nominal.un1, un2KV: nominal.un2 },
      fueraDeNorma,
    ))

    const hora = meds.guardadoEn ? new Date(meds.guardadoEn).toLocaleTimeString() : ''
    setMsg(
      `Ensayo guardado ${hora}. Revisá los toggles de arriba: se pre-marcaron según la tolerancia.` +
      (r.ok ? ' Registro General actualizado.' : ` No se pudo actualizar el Registro General (${r.error ?? 'error desconocido'}) — el ensayo sí quedó guardado.`)
    )
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

  // v1.100: "Agregar en forma de texto cualquier observación, defecto o falla
  // durante los ensayos." Va pegado a cada ensayo y no en un comentario único
  // al final: un defecto anotado bajo el ensayo que lo destapó se puede cruzar
  // después contra el histórico de ese ensayo; en un campo suelto, no.
  //
  // OJO: es una FUNCIÓN que devuelve JSX, no un componente declarado adentro del
  // render. Un componente definido acá sería un tipo nuevo en cada render, así
  // que React desmontaría y volvería a montar el textarea en cada tecla y se
  // perdería el foco a la primera letra.
  const obsEnsayo = (k: string) => {
    const label = ENSAYOS_LAB.find((e) => e.key === k)?.label ?? k
    return (
      <div className="field" style={{ marginTop: 8 }}>
        <label>Observaciones, defectos o fallas · {label}</label>
        <textarea
          className="input" rows={2} value={obs[k] ?? ''} disabled={soloLectura}
          placeholder="opcional — qué se vio durante este ensayo"
          style={{ width: '100%', resize: 'vertical' }}
          onChange={(e) => setObs((o) => ({ ...o, [k]: e.target.value }))}
        />
      </div>
    )
  }

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

      {/* --- v1.99: version de diseño y observaciones de bobinado --- */}
      <div className="section-title" style={{ margin: '18px 0 8px' }}>
        Versión de diseño y observaciones de bobinado
      </div>
      <div className="card" style={{ borderLeft: '4px solid ' + (faltaVersion ? 'var(--rojo)' : 'var(--estado-fin)') }}>
        <div className="meta" style={{ marginBottom: 8 }}>
          La versión de diseño es la clave con la que Diseño compara este transformador
          contra los demás del mismo modelo. Sin ella el ensayo se guarda igual, pero
          <strong> no entra al Registro General</strong> y nadie lo va a poder encontrar después.
        </div>
        <div className="form-grid">
          <div className="field">
            <label>
              Versión de diseño <span style={{ color: 'var(--rojo)' }}>*</span>
            </label>
            <input
              className="input" list="lab-versiones" value={versionDiseno} disabled={soloLectura}
              placeholder="ej. 2" onChange={(e) => setVersionDiseno(e.target.value)}
              style={faltaVersion ? { borderColor: 'var(--rojo)' } : undefined}
            />
            {/* Sugerencias de versiones ya usadas para este modelo: evita que
                '2', 'v2' y 'V 2' terminen como tres versiones distintas. */}
            <datalist id="lab-versiones">
              {versiones.map((v) => <option key={v} value={v} />)}
            </datalist>
            {versiones.length > 0 && (
              <div className="meta" style={{ marginTop: 4 }}>
                Ya usadas en {codigoCorto(tarea.modelo)}: {versiones.join(' · ')}
              </div>
            )}
          </div>
          <div className="field">
            <label>N° de fabricación</label>
            <input
              className="input" value={nroFab} disabled={soloLectura}
              placeholder="con el que se identifica esta unidad"
              onChange={(e) => setNroFab(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Observaciones de Bobinado (opcional)</label>
            <input
              className="input" value={obsBobinado} disabled={soloLectura}
              placeholder="ej. vueltas dudosas en la fase V"
              onChange={(e) => setObsBobinado(e.target.value)}
            />
          </div>
        </div>
      </div>

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
        {campoNumInput('Potencia instrumentos — vacío', pinsO, editarPins(setPinsO), 'VA', '0.1')}
        {campoNumInput('Potencia instrumentos — cortocircuito', pinsCC, editarPins(setPinsCC), 'VA', '0.1')}
      </div>

      {/* v1.103: de donde salio la potencia de instrumentos. Sin esto, un 0 del
          catalogo y un 0 que quedo de otro ensayo se ven exactamente igual. */}
      <div className="meta" style={{ marginTop: 6 }}>
        Potencia de instrumentos:{' '}
        {pinsOrigen === 'ensayo' ? (
          <strong>la que se usó en este ensayo</strong>
        ) : pinsOrigen === 'catalogo' ? (
          <><strong style={{ color: 'var(--estado-fin)' }}>del catálogo de {codigoCorto(tarea.modelo)}</strong>
            {' '}— corregila si el banco de ensayo cambió.</>
        ) : (
          <><strong style={{ color: 'var(--naranja)' }}>del último ensayo en este equipo</strong>
            {' '}— el catálogo no trae el dato para este modelo, o lo editaste a mano.</>
        )}
        {' '}El valor que uses queda guardado dentro del ensayo, así que el protocolo
        no cambia si mañana se corrige la planilla.
      </div>

      {/* ============ v1.100: RELACION DE TRANSFORMACION ============ */}
      <SeccionRelacion v={rel} set={setRel} nf={nf} soloLectura={soloLectura} />
      {obsEnsayo('relacion')}

      {/* ============ v1.100: RESISTENCIA DE AISLAMIENTO ============ */}
      <SeccionAislamiento v={ais} set={setAis} soloLectura={soloLectura} />
      {obsEnsayo('res_aislamiento')}

      {/* ============ ENSAYO DE VACIO ============ */}
      <div className="section-title" style={{ margin: '18px 0 8px' }}>Ensayo de pérdidas en vacío</div>
      <div className="form-grid">
        {selArr(vArr, setVArr)}
        {selCon(vCon, setVCon)}
        {campoNumInput('Potencia medida (P0m)', p0m, setP0m, 'W', '0.1')}
        {!porFase || nf !== 3 ? campoNumInput('Corriente medida (I0m)', i0m, setI0m, 'A', '0.01') : null}
        {campoNumInput('Tensión medida (Um, simple)', vUm, setVUm, 'V', '0.1')}
      </div>

      {/* v1.101: carga por fase. Solo tiene sentido en trifasico. */}
      {nf === 3 && (
        <>
          <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: '6px 0' }}>
            <input type="checkbox" checked={porFase} disabled={soloLectura}
              onChange={(e) => setPorFase(e.target.checked)} />
            Cargar la corriente de vacío por fase en vez de un promedio
          </label>
          {porFase && (
            <>
              <div className="form-grid">
                {campoNumInput('Corriente fase U', iU, setIU, 'A', '0.01')}
                {campoNumInput('Corriente fase V', iV, setIV, 'A', '0.01')}
                {campoNumInput('Corriente fase W', iW, setIW, 'A', '0.01')}
              </div>
              <div className="meta" style={{ marginBottom: 6 }}>
                Promedio usado en el cálculo: <strong>{fmt(i0Fases)} A</strong>
                {i0Fases !== undefined && [n(iU), n(iV), n(iW)].filter((x) => x !== undefined).length < 3
                  ? ' · se promedian sólo las fases cargadas'
                  : ''}
              </div>
            </>
          )}
        </>
      )}
      <div className="agujas">
        <Aguja titulo="Pérdidas en vacío (P0)" valor={resVacio.p0} nominal={nominal.po} unidad="W" escala={esc.po} />
        <Aguja titulo="Corriente de vacío (io%)" valor={resVacio.ioPct} nominal={nominal.io} unidad="%" escala={esc.io} decimales={2} />
      </div>
      <div className="meta">
        I0 = <strong>{fmt(resVacio.i0)} A</strong> · Tolerancias: P0 +{tolTxt(esc.po)}, io% +{tolTxt(esc.io)}.{origenTol}
      </div>
      {/* v1.103: vacío a sobretensión — control de saturación del núcleo. */}
      <div className="meta" style={{ margin: '12px 0 6px' }}>
        Verificación a <strong>{(usUn * 100).toFixed(0)}% de Un</strong> (opcional) · el núcleo
        no debe pedir más de <strong>{isIo}× la corriente de vacío</strong>
        {sob.usUn === undefined ? ' · valores por defecto: el catálogo no los trae' : ' · del catálogo'}
      </div>
      <div className="form-grid">
        {campoNumInput('Tensión aplicada en la verificación', v105U, setV105U, 'V', '0.1')}
        {campoNumInput('Corriente medida en la verificación', v105I, setV105I, 'A', '0.01')}
      </div>
      <div className="card" style={{
        borderLeft: '4px solid ' + (ok105 === false ? 'var(--rojo)' : ok105 ? 'var(--estado-fin)' : 'var(--borde)'),
      }}>
        <div className="meta">Relación I0({usUn.toString().replace('.', ',')}·Un) / I0</div>
        <h3 style={{ margin: '4px 0', color: ok105 === false ? 'var(--rojo)' : undefined }}>
          {fmt(rel105)}
          {ok105 === false ? ' ✗ fuera de norma' : ok105 ? ' ✓' : ''}
        </h3>
        <div className="meta">
          Máximo admitido {isIo}. Un salto grande de corriente ante un aumento chico de
          tensión delata un núcleo trabajando cerca de la saturación, aunque el ensayo
          de vacío normal haya dado bien.
        </div>
      </div>

      {obsEnsayo('perdidas_vacio')}

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
      {/* v1.99: medido vs copiado. Esta marca es la que hace confiable al
          buscador de resistencias: si no se distinguiera, se podría terminar
          copiando de una copia y propagando un valor que nadie midió nunca. */}
      <div className="form-grid">
        <div className="field">
          <label>Origen de las resistencias</label>
          <select className="input" value={origenRes} disabled={soloLectura}
            onChange={(e) => setOrigenRes(e.target.value as OrigenResistencia)}>
            <option value="medido">Medidas sobre esta máquina</option>
            <option value="copiado">Copiadas de otra unidad igual</option>
          </select>
        </div>
      </div>
      {origenRes === 'copiado' && (
        <>
          <div className="meta" style={{ marginBottom: 6, color: 'var(--naranja)' }}>
            ⚠ Estos valores no se midieron sobre el espécimen bajo ensayo. Quedan marcados
            como copiados y <strong>no se van a ofrecer</strong> a otros ensayos desde el buscador.
          </div>
          {!soloLectura && (
            <div className="row-actions" style={{ marginBottom: 8 }}>
              <button className="btn" disabled={faltaVersion}
                title={faltaVersion ? 'Primero cargá la versión de diseño' : 'Buscar máquinas equivalentes ya medidas'}
                onClick={() => setBuscando((v) => !v)}>
                {buscando ? '✕ Cerrar buscador' : '🔎 Buscar en máquinas equivalentes'}
              </button>
              {faltaVersion && (
                <span className="meta">La búsqueda cruza modelo + versión de diseño: cargá la versión primero.</span>
              )}
              {(copiadaDe || guardado?.cc?.copiadaDe) && (
                <span className="meta">
                  Copiadas de <strong>{copiadaDe
                    ? (copiadaDe.nroFabricacion ?? copiadaDe.nroSerie ?? copiadaDe.laboratorioId)
                    : (guardado?.cc?.copiadaDe?.nroFabricacion ?? guardado?.cc?.copiadaDe?.registroId)}</strong>
                  {' '}({copiadaDe ? copiadaDe.fecha : guardado?.cc?.copiadaDe?.fecha})
                </span>
              )}
            </div>
          )}
          {buscando && !soloLectura && (
            <BuscadorResistencias
              modelo={tarea.modelo} versionDiseno={versionDiseno.trim()}
              material={material} nf={nf} excluirId={tarea.id}
              nom={{ snKVA: nominal.sn, un1KV: nominal.un1, un2KV: nominal.un2 }}
              onCerrar={() => setBuscando(false)}
              onCopiar={(r, origen) => {
                const s = (x?: number) => (x === undefined ? '' : String(x))
                setRUV(s(r.rUV)); setRVW(s(r.rVW)); setRWU(s(r.rWU)); setRUN(s(r.rUN))
                setRUn(s(r.rUn)); setRVn(s(r.rVn)); setRWn(s(r.rWn))
                // La temperatura a la que se midieron viaja con los valores: sin
                // ella la corrección térmica usaría la de otra medición y las
                // pérdidas Joule saldrían mal.
                if (r.tR !== undefined) setTR(String(r.tR))
                setCopiadaDe(origen)
                setBuscando(false)
                setMsg(`Resistencias copiadas de ${origen.nroFabricacion ?? origen.nroSerie ?? 'otra unidad'} (${origen.fecha}). Acordate de guardar.`)
              }}
            />
          )}
        </>
      )}
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
        <Aguja titulo="Pérdidas en cortocircuito Pcc(T)" valor={resCC.pccRef} nominal={nominal.pcc} unidad="W" escala={esc.pcc} />
        <Aguja titulo="Tensión de cortocircuito ucc%(T)" valor={resCC.uccPct} nominal={nominal.ucc} unidad="%" escala={esc.ucc} decimales={2} />
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
      <div className="meta" style={{ marginTop: 6 }}>Tolerancias: Pcc +{tolTxt(esc.pcc)}, ucc% ±{tolTxt(esc.ucc)}.{origenTol}</div>
      {obsEnsayo('perdida_cc')}
      {obsEnsayo('res_arrollamiento')}

      {/* ============ v1.100: DIELECTRICOS (aplicada e inducida) ============ */}
      <SeccionDielectricos v={diel} set={setDiel} soloLectura={soloLectura} />
      {obsEnsayo('tension_aplicada')}
      {obsEnsayo('tension_inducida')}

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
          {' · '}Tolerancia +{tolTxt(esc.totales)}.
        </div>
      </div>

      {/* ============ v1.101: EFICIENCIA ============ */}
      <div className="section-title" style={{ margin: '18px 0 8px' }}>Eficiencia de la máquina</div>
      <div className="form-grid">
        {campoNumInput('Factor de carga', fCarga, setFCarga, '0 a 1', '0.05')}
        {campoNumInput('Temperatura para el cálculo', tEfic, setTEfic, '°C', '0.1')}
      </div>
      <div className="tot-cards">
        <div className="tot-card">
          <div className="l">Pcc a {fmt(n(tEfic), 0)} °C (W)</div>
          <div className="n">{fmt(efic.pccTemp, 1)}</div>
        </div>
        <div className="tot-card">
          <div className="l">Pérdidas a esa carga (W)</div>
          <div className="n">{fmt(efic.perdidas, 1)}</div>
        </div>
        <div className="tot-card" style={{ borderLeft: '4px solid var(--azul-claro)' }}>
          <div className="l">Rendimiento (%)</div>
          <div className="n">{fmt(efic.rendimientoPct, 3)}</div>
        </div>
      </div>
      <div className="meta" style={{ marginTop: 6 }}>
        η = S·fc / (S·fc + P0 + fc²·Pcc), a cosφ = 1. Las pérdidas en vacío no dependen de
        la carga, pero las de cortocircuito van con el <strong>cuadrado</strong> del factor de carga.
      </div>
      {efic.rendimientoPct === undefined && (
        <div className="meta" style={{ marginTop: 4, color: 'var(--naranja)' }}>
          Falta algún dato para el rendimiento: hacen falta P0, las pérdidas Joule y Skin
          (o sea las resistencias y la temperatura del ensayo) y la potencia nominal del catálogo.
        </div>
      )}

      {msg && <div className="meta" style={{ marginTop: 10, color: 'var(--estado-fin)', fontWeight: 700 }}>✓ {msg}</div>}
      {guardado?.guardadoEn && !msg && (
        <div className="meta" style={{ marginTop: 10 }}>
          Último guardado: {new Date(guardado.guardadoEn).toLocaleString()}
          {guardado.guardadoPor ? ` · ${guardado.guardadoPor}` : ''}
        </div>
      )}

      {!soloLectura && (
        <>
          {faltaVersion && (
            <div className="meta" style={{ marginTop: 10, color: 'var(--rojo)', fontWeight: 700 }}>
              ✗ Falta la versión de diseño — sin eso el ensayo no entra al Registro General.
            </div>
          )}
          {faltaAislamiento && (
            <div className="meta" style={{ marginTop: 10, color: 'var(--rojo)', fontWeight: 700 }}>
              ✗ Empezaste a cargar el aislamiento: faltan la temperatura de la máquina
              y/o algún valor mínimo. Completalos o borrá lo cargado.
            </div>
          )}
          <button className="btn btn-primary btn-bloque" style={{ marginTop: 12 }}
            disabled={noPuedeGuardar} onClick={() => void guardar()}>
            💾 Guardar ensayo
          </button>
        </>
      )}
    </div>
  )
}
