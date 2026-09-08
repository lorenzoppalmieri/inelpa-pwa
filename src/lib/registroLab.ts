import { supabase } from './supabaseClient'
import { traerTodoDe, type ConsultaPaginable } from './supabaseFetch'
import type { TareaLaboratorio, MedicionesEnsayo, OrigenResistencia } from '../types'

// ============================================================
// REGISTRO GENERAL DE LABORATORIO (v1.99)
//
// QUÉ ES: la fuente única de VALORES REALES de todos los ensayos. Es lo que pidió
// Laboratorio en el criterio general del documento: el protocolo es un papel para
// el cliente, y los valores medidos viven acá, siempre reales, nunca acomodados.
//
// POR QUÉ UNA TABLA APARTE Y NO EL jsonb DE `laboratorio`:
//
// 1. FILTRAR. Diseño necesita cruzar modelo + versión de diseño y mirar cómo
//    evolucionan ucc, P0 y Pcc, y listar lo que quedó fuera de norma. Eso son
//    columnas planas con índice, no un jsonb.
//
// 2. EL ESPEJO DE LAS TABLETS. `laboratorio` se sincroniza ENTERA al Dexie de
//    cada tablet de planta (syncEngine). Fabricamos +2000 transformadores por
//    año: si el histórico de mediciones creciera dentro de esa tabla, cada
//    tablet de bobinado se bajaría decenas de MB de ensayos que no va a abrir
//    nunca. `lab_registro` NO se espeja: se consulta on-demand desde la nube,
//    igual que `datos_tecnicos`, y sólo la usan Laboratorio y Diseño.
//
// 3. INMUTABILIDAD. La fila del registro se escribe con los valores medidos y
//    los resultados ya calculados (congelados). Si mañana se corrige el catálogo
//    de datos técnicos, el histórico no se mueve solo.
//
// LÍMITE DE 1000 FILAS: toda lectura de esta tabla pasa por `traerTodoDe`. Con
// 2000 ensayos al año, al segundo año una consulta sin paginar ya devolvería
// datos incompletos EN SILENCIO — que es exactamente el bug que dejó todas las
// demoras justificadas en cero cuando `paradas` pasó las 1000 filas.
// ============================================================

export const TABLA_REGISTRO = 'lab_registro'

/** Una fila del registro, tal cual viaja a/desde Supabase (snake_case). */
export interface RegistroLabRow {
  id: string
  laboratorio_id: string
  fecha: string
  modelo: string
  version_diseno: string
  nro_fabricacion: string | null
  nro_serie: string | null
  cliente: string | null
  ot: string | null
  // --- identidad eléctrica: define qué máquinas son "equivalentes" ---
  sn_kva: number | null
  un1_kv: number | null
  un2_kv: number | null
  material: string | null
  nf: number | null
  // --- resultados congelados ---
  po_w: number | null
  io_pct: number | null
  pcc_w: number | null
  ucc_pct: number | null
  urcc_pct: number | null
  uxcc_pct: number | null
  p_total_w: number | null
  rendimiento_pct: number | null
  // --- resistencias de arrollamiento (las que alimentan el buscador) ---
  res_origen: OrigenResistencia | null
  res_temp: number | null
  r_uv: number | null
  r_vw: number | null
  r_wu: number | null
  r_un_at: number | null
  r_u_n: number | null
  r_v_n: number | null
  r_w_n: number | null
  // --- veredicto ---
  fuera_de_norma: boolean
  ensayos_rechazados: string | null
  obs_bobinado: string | null
  guardado_por: string | null
  guardado_en: string
}

/** La misma fila en la forma que usa la app. */
export interface RegistroLab {
  id: string
  laboratorioId: string
  fecha: string
  modelo: string
  versionDiseno: string
  nroFabricacion?: string
  nroSerie?: string
  cliente?: string
  ot?: string
  snKVA?: number
  un1KV?: number
  un2KV?: number
  material?: string
  nf?: number
  po?: number
  ioPct?: number
  pcc?: number
  uccPct?: number
  urccPct?: number
  uxccPct?: number
  pTotal?: number
  rendimientoPct?: number
  resOrigen?: OrigenResistencia
  resTemp?: number
  rUV?: number; rVW?: number; rWU?: number; rUN?: number
  rUn?: number; rVn?: number; rWn?: number
  fueraDeNorma: boolean
  ensayosRechazados?: string
  obsBobinado?: string
  guardadoPor?: string
  guardadoEn: string
}

const u = <T>(v: T | null): T | undefined => (v === null ? undefined : v)
const nn = (v?: number): number | null => (v === undefined || !Number.isFinite(v) ? null : v)

export function registroFromRow(r: RegistroLabRow): RegistroLab {
  return {
    id: r.id,
    laboratorioId: r.laboratorio_id,
    fecha: r.fecha,
    modelo: r.modelo,
    versionDiseno: r.version_diseno,
    nroFabricacion: u(r.nro_fabricacion),
    nroSerie: u(r.nro_serie),
    cliente: u(r.cliente),
    ot: u(r.ot),
    snKVA: u(r.sn_kva),
    un1KV: u(r.un1_kv),
    un2KV: u(r.un2_kv),
    material: u(r.material),
    nf: u(r.nf),
    po: u(r.po_w),
    ioPct: u(r.io_pct),
    pcc: u(r.pcc_w),
    uccPct: u(r.ucc_pct),
    urccPct: u(r.urcc_pct),
    uxccPct: u(r.uxcc_pct),
    pTotal: u(r.p_total_w),
    rendimientoPct: u(r.rendimiento_pct),
    resOrigen: u(r.res_origen),
    resTemp: u(r.res_temp),
    rUV: u(r.r_uv), rVW: u(r.r_vw), rWU: u(r.r_wu), rUN: u(r.r_un_at),
    rUn: u(r.r_u_n), rVn: u(r.r_v_n), rWn: u(r.r_w_n),
    fueraDeNorma: r.fuera_de_norma,
    ensayosRechazados: u(r.ensayos_rechazados),
    obsBobinado: u(r.obs_bobinado),
    guardadoPor: u(r.guardado_por),
    guardadoEn: r.guardado_en,
  }
}

/** Nominales que hacen falta para poder decir que dos máquinas son equivalentes. */
export interface NominalesRegistro {
  snKVA?: number
  un1KV?: number
  un2KV?: number
}

/**
 * Arma la fila del registro a partir de la ficha de laboratorio.
 *
 * El `id` es DETERMINÍSTICO (el mismo id de la ficha) a propósito: guardar el
 * ensayo dos veces reescribe la misma fila en vez de duplicar el histórico. Es
 * el mismo patrón anti-duplicado que usan las tareas recurrentes y el despacho.
 */
export function registroDesdeFicha(
  t: TareaLaboratorio, nom: NominalesRegistro, fueraDeNorma: boolean,
): RegistroLabRow | null {
  const m: MedicionesEnsayo | undefined = t.mediciones
  // Sin versión de diseño la fila no le sirve a nadie: no se puede filtrar ni
  // comparar. Se prefiere no escribirla antes que ensuciar el registro.
  if (!m?.versionDiseno?.trim()) return null

  const res = m.resultados ?? {}
  const rechazados = Object.entries(t.ensayos ?? {})
    .filter(([, v]) => v === 'rechazado')
    .map(([k]) => k)

  return {
    id: t.id,
    laboratorio_id: t.id,
    fecha: (t.finalizada ?? m.guardadoEn ?? t.creada).slice(0, 10),
    modelo: t.modelo,
    version_diseno: m.versionDiseno.trim(),
    nro_fabricacion: m.cabecera?.nroFabricacion ?? null,
    nro_serie: t.nroSerie ?? null,
    cliente: t.cliente ?? null,
    ot: t.ot ?? null,
    sn_kva: nn(nom.snKVA),
    un1_kv: nn(nom.un1KV),
    un2_kv: nn(nom.un2KV),
    material: m.material ?? null,
    nf: m.nf ?? null,
    po_w: nn(res.p0),
    io_pct: nn(res.ioPct),
    pcc_w: nn(res.pccRef),
    ucc_pct: nn(res.uccPct),
    urcc_pct: nn(res.urccPct),
    uxcc_pct: nn(res.uxccPct),
    p_total_w: nn(res.pTotal),
    rendimiento_pct: nn(m.eficiencia?.rendimientoPct),
    res_origen: m.cc?.origenResistencias ?? null,
    res_temp: nn(m.cc?.tR),
    r_uv: nn(m.cc?.rUV),
    r_vw: nn(m.cc?.rVW),
    r_wu: nn(m.cc?.rWU),
    r_un_at: nn(m.cc?.rUN),
    r_u_n: nn(m.cc?.rUn),
    r_v_n: nn(m.cc?.rVn),
    r_w_n: nn(m.cc?.rWn),
    fuera_de_norma: fueraDeNorma,
    ensayos_rechazados: rechazados.length ? rechazados.join(', ') : null,
    obs_bobinado: m.obsBobinado ?? null,
    guardado_por: m.guardadoPor ?? null,
    guardado_en: m.guardadoEn ?? new Date().toISOString(),
  }
}

export interface ResultadoRegistro { ok: boolean; error?: string; omitida?: boolean }

/**
 * Escribe (o reescribe) la fila del registro.
 *
 * ONLINE-ONLY A PROPÓSITO: el laboratorio trabaja en una PC con red, no en una
 * tablet de planta. Si igual falla, no se rompe nada — el ensayo ya quedó
 * guardado en `laboratorio.mediciones`, y `reconstruirRegistro()` puede
 * regenerar todo lo que falte. Nunca se bloquea el guardado del ensayo por esto.
 */
export async function guardarRegistro(fila: RegistroLabRow | null): Promise<ResultadoRegistro> {
  if (!fila) return { ok: false, omitida: true, error: 'Falta la versión de diseño.' }
  if (!supabase) return { ok: false, error: 'Sin conexión a la nube.' }
  if (!navigator.onLine) return { ok: false, error: 'Sin internet: el registro se va a completar al reconectar.' }
  const { error } = await supabase.from(TABLA_REGISTRO).upsert(fila, { onConflict: 'id' })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Trae el registro completo, paginado. Para la vista de Diseño. */
export async function traerRegistro(): Promise<RegistroLab[]> {
  const sb = supabase
  if (!sb) return []
  const filas = await traerTodoDe<RegistroLabRow>(TABLA_REGISTRO, () =>
    sb.from(TABLA_REGISTRO).select('*').order('id', { ascending: true }) as unknown as ConsultaPaginable<RegistroLabRow>)
  return filas.map(registroFromRow)
}

/**
 * BUSCADOR DE RESISTENCIAS (documento, sección "medición de resistencia de
 * arrollamiento"). Devuelve las máquinas equivalentes a la que se está
 * ensayando, MÁS RECIENTES PRIMERO, para que el laboratorista elija de cuál
 * copiar — o decida que son demasiado viejas y las mida.
 *
 * "Equivalente" = igual modelo, igual versión de diseño, igual material e
 * iguales tensiones y potencia nominales.
 *
 * Sólo devuelve filas con `res_origen = 'medido'`: copiar de una copia
 * propagaría un valor que nadie midió nunca.
 */
export async function buscarResistencias(criterio: {
  modelo: string
  versionDiseno: string
  material?: string
  nom?: NominalesRegistro
  excluirId?: string
}): Promise<RegistroLab[]> {
  const sb = supabase
  if (!sb || !criterio.modelo || !criterio.versionDiseno) return []
  const filas = await traerTodoDe<RegistroLabRow>(`${TABLA_REGISTRO}:resistencias`, () => {
    let q = sb.from(TABLA_REGISTRO).select('*')
      .eq('modelo', criterio.modelo)
      .eq('version_diseno', criterio.versionDiseno)
      .eq('res_origen', 'medido')
    if (criterio.material) q = q.eq('material', criterio.material)
    if (criterio.nom?.snKVA !== undefined) q = q.eq('sn_kva', criterio.nom.snKVA)
    if (criterio.nom?.un1KV !== undefined) q = q.eq('un1_kv', criterio.nom.un1KV)
    if (criterio.nom?.un2KV !== undefined) q = q.eq('un2_kv', criterio.nom.un2KV)
    // El orden tiene que ser estable para que el paginado no repita ni saltee.
    return q.order('fecha', { ascending: false }).order('id', { ascending: true }) as unknown as ConsultaPaginable<RegistroLabRow>
  })
  return filas
    .map(registroFromRow)
    .filter((r) => r.laboratorioId !== criterio.excluirId)
    // Una fila sin ninguna resistencia cargada no le sirve al que busca copiar.
    .filter((r) => [r.rUV, r.rVW, r.rWU, r.rUN, r.rUn, r.rVn, r.rWn].some((x) => x !== undefined))
}

/** Versiones de diseño ya usadas para un modelo. Sirve para sugerir y no ensuciar. */
export async function versionesDeModelo(modelo: string): Promise<string[]> {
  const sb = supabase
  if (!sb || !modelo) return []
  const filas = await traerTodoDe<{ id: string; version_diseno: string }>(
    `${TABLA_REGISTRO}:versiones`, () =>
      sb.from(TABLA_REGISTRO).select('id, version_diseno')
        .eq('modelo', modelo).order('id', { ascending: true }) as unknown as ConsultaPaginable<{ id: string; version_diseno: string }>)
  return [...new Set(filas.map((f) => f.version_diseno).filter(Boolean))].sort()
}
