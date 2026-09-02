import type { Tarea, Parada, CausaParada } from '../types'
import { minutosEntre } from './time'
import { calcularTiempoNetoProductivo } from './calendario'
import { causaLabel, esParadaNoProductiva, esReparacion, minutosRecupTarea } from '../types'

// ============================================================
// Calculo de KPIs de planta (OEE simplificado, desvios, Pareto).
// ============================================================

// ============================================================
// PAUSAS: fin efectivo y desglose UNIFICADO (v1.66)
//
// BUG CORREGIDO: antes las paradas SIN cerrar se descartaban (`filter(p => p.fin)`).
// Si el operario marcaba "rotura de herramienta" y nunca apretaba Reanudar, esa
// justificación DESAPARECÍA de los totales y la demora sin justificar se
// inflaba. Ahora una parada abierta se cierra en el fin de la tarea (si ya
// terminó) o en "ahora" (si sigue en curso), que es lo que realmente pasó.
// ============================================================

/** Fin efectivo de una parada: el registrado, o el cierre de la tarea, o ahora. */
export function finEfectivoParada(t: Tarea, p: Parada, ahoraISO?: string): string {
  return p.fin ?? t.finReal ?? ahoraISO ?? new Date().toISOString()
}

/** Un tramo de pausa ya medido. Es lo que consumen el Gantt y el dashboard. */
export interface TramoPausa {
  id: string
  causa: CausaParada
  label: string
  inicio: string
  fin: string
  /** Minutos en horario de planta (nunca cuenta noches ni fines de semana). */
  minutos: number
  /** true = demora justificada (cuenta como justificación). false = almuerzo/pausa programada. */
  productiva: boolean
  /** true = el operario no la cerró; se midió hasta el cierre de la tarea o hasta ahora. */
  abierta: boolean
}

/**
 * DESGLOSE ÚNICO de las pausas de una tarea. Fuente de verdad compartida: el
 * tooltip del Gantt y la tabla de totales leen de acá, así no pueden
 * contradecirse (era uno de los síntomas reportados).
 */
export function desglosePausas(t: Tarea, ahoraISO?: string): TramoPausa[] {
  const recupMin = minutosRecupTarea(t)
  return (t.paradas ?? []).map((p) => {
    const fin = finEfectivoParada(t, p, ahoraISO)
    return {
      id: p.id,
      causa: p.causa,
      label: causaLabel(p.causa),
      inicio: p.inicio,
      fin,
      minutos: calcularTiempoNetoProductivo(new Date(p.inicio), new Date(fin), { recupMin, sinAlmuerzo: true }),
      productiva: !esParadaNoProductiva(p.causa),
      abierta: !p.fin,
    }
  })
}

// ============================================================
// v1.89 — FUSIÓN DE INTERVALOS SUPERPUESTOS
//
// BUG REPORTADO (Montaje Rural): Lautaro sale a comprar comida y marca su
// "Almuerzo" 45' antes; después el equipo activa el "Almuerzo" general de la
// línea. La tarea queda con DOS pausas que se pisan en el tiempo, y la suma
// simple descontaba las dos: 11:30-13:00 + 12:30-13:00 daba 120' cuando la
// planta estuvo parada 90'.
//
// La solución NO es sumar y restar: es unir los intervalos ANTES de medirlos.
//
// Ojo con la tentación de resolver esto con date-fns: fusionar es comparar
// strings ISO y no necesita librería, pero MEDIR cada tramo tiene que pasar
// por `calcularTiempoNetoProductivo` (motor de horas hábiles). Con una resta
// de fechas, una pausa de 11:16 a 07:45 del día siguiente da 20h en vez de 5h
// — es el bug que ya se arregló en v1.45. No volver atrás.
// ============================================================

export interface Intervalo { inicio: string; fin: string }

/**
 * Une los intervalos que se superponen o se tocan. Función PURA.
 * [11:30-13:00] + [12:30-13:00]  ->  [11:30-13:00]
 * [09:00-10:00] + [11:00-12:00]  ->  los dos, separados (no se tocan)
 */
export function fusionarIntervalos(xs: Intervalo[]): Intervalo[] {
  const vals = xs.filter((x) => x.inicio && x.fin && x.fin > x.inicio)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))
  const out: Intervalo[] = []
  for (const x of vals) {
    const ult = out[out.length - 1]
    // `<=` y no `<`: dos pausas pegadas (una termina justo cuando arranca la
    // otra) son un solo tramo de planta parada, no dos.
    if (ult && x.inicio <= ult.fin) {
      if (x.fin > ult.fin) ult.fin = x.fin
    } else {
      out.push({ inicio: x.inicio, fin: x.fin })
    }
  }
  return out
}

/**
 * Quita de `base` los tramos cubiertos por `quitar`. Función PURA.
 * Se usa para la precedencia acordada con Lorenzo: si un ALMUERZO se superpone
 * con una demora justificada, ese tramo es almuerzo — el operario no estaba
 * esperando el material, estaba comiendo. Sin esto se descontaría dos veces.
 */
export function restarIntervalos(base: Intervalo[], quitar: Intervalo[]): Intervalo[] {
  const cortes = fusionarIntervalos(quitar)
  let actual = fusionarIntervalos(base)
  for (const q of cortes) {
    const sig: Intervalo[] = []
    for (const b of actual) {
      if (q.fin <= b.inicio || q.inicio >= b.fin) { sig.push(b); continue }  // no se tocan
      if (q.inicio > b.inicio) sig.push({ inicio: b.inicio, fin: q.inicio }) // sobra por izquierda
      if (q.fin < b.fin) sig.push({ inicio: q.fin, fin: b.fin })             // sobra por derecha
    }
    actual = sig
  }
  return actual
}

/** Mide una lista de intervalos en minutos de PLANTA ABIERTA (no reloj). */
function medirIntervalos(xs: Intervalo[], recupMin: number): number {
  return xs.reduce((acc, x) => acc + calcularTiempoNetoProductivo(
    new Date(x.inicio), new Date(x.fin), { recupMin, sinAlmuerzo: true }), 0)
}

/** Los tramos de pausa de una tarea, separados en los dos cubos. */
function cubosDePausas(t: Tarea, ahoraISO?: string): { prod: Intervalo[]; noProd: Intervalo[] } {
  const tramos = desglosePausas(t, ahoraISO)
  return {
    prod: tramos.filter((x) => x.productiva).map((x) => ({ inicio: x.inicio, fin: x.fin })),
    noProd: tramos.filter((x) => !x.productiva).map((x) => ({ inicio: x.inicio, fin: x.fin })),
  }
}

// DEMORA JUSTIFICADA = pausas PRODUCTIVAS (rotura, falta de material, espera de
// máquina...), FUSIONADAS y sin los tramos que pisa el almuerzo.
export function minutosParada(t: Tarea, ahoraISO?: string): number {
  const { prod, noProd } = cubosDePausas(t, ahoraISO)
  return medirIntervalos(restarIntervalos(prod, noProd), minutosRecupTarea(t))
}

// PAUSAS NO PRODUCTIVAS (almuerzo, reapertura). NO son demora: se descuentan del
// Tiempo Real como si esa franja no existiera, pero se muestran en el detalle
// (el operario las marca todos los días y tiene que poder verlas).
export function minutosNoProductivos(t: Tarea, ahoraISO?: string): number {
  const { noProd } = cubosDePausas(t, ahoraISO)
  return medirIntervalos(fusionarIntervalos(noProd), minutosRecupTarea(t))
}

// Tiempo real de ejecucion BRUTO (resta cruda de timestamps). Solo informativo
// (incluye noches/finde si la tarea cruzo el cierre); NO usar para OEE.
export function tiempoRealBruto(t: Tarea): number {
  return minutosEntre(t.inicioReal, t.finReal)
}

// TIEMPO REAL (v1.16): tiempo laborable entre inicio y fin (descuenta noches,
// fines de semana, limpieza), SIN la franja fija de almuerzo; el almuerzo se
// descuenta por la PARADA real que marca el operario (minutosNoProductivos).
// Asi una parada de almuerzo NO suma ni a Real ni a Neto, y se respeta el
// horario real de cada operario. Se recalcula siempre desde los timestamps
// (no usa duracionEfectivaMin guardado, que seguia el criterio viejo).
export function tiempoDisponible(t: Tarea): number {
  if (!t.inicioReal || !t.finReal) return 0
  const wall = calcularTiempoNetoProductivo(new Date(t.inicioReal), new Date(t.finReal), {
    recupMin: minutosRecupTarea(t),
    sinAlmuerzo: true,
  })
  return Math.max(0, wall - minutosNoProductivos(t))
}

// Tiempo real neto (descontando paradas productivas) = trabajo efectivo.
export function tiempoRealNeto(t: Tarea): number {
  return Math.max(0, tiempoDisponible(t) - minutosParada(t))
}

// ============================================================
// METRICAS CANONICAS (v1.16) — definiciones EXACTAS acordadas con direccion.
// Son la unica fuente de verdad para Gantt, graficos y la tabla de detalle.
//   Tiempo Estimado     = matriz Maquina+Modelo+Material (hoy: tiempoEstandarMin).
//   Tiempo Real         = (Fin - Inicio) sin horarios de planta cerrada (ni almuerzo).
//   Total Demorado      = suma de paradas justificadas (productivas).
//   Tiempo Neto         = Tiempo Real - Total Demorado.
//   Demora Sin Justificar = Tiempo NETO - Tiempo Estimado  (0 si es <= 0).
//     (v1.18) Se usa Neto —trabajo efectivo, ya descontadas las demoras
//     justificadas— para NO penalizar por paradas justificadas (material, maquina).
// ============================================================
export function tiempoEstimadoMin(t: Tarea): number { return Math.max(0, t.tiempoEstandarMin) }
export function tiempoRealMin(t: Tarea): number { return tiempoDisponible(t) }
export function totalDemoradoMin(t: Tarea): number { return minutosParada(t) }
export function tiempoNetoMin(t: Tarea): number { return Math.max(0, tiempoRealMin(t) - totalDemoradoMin(t)) }
/**
 * Tiempo Real hasta un instante de corte. Para tareas EN CURSO el corte es
 * "ahora"; para finalizadas, su fin real. Antes el Gantt tenia su PROPIA copia
 * de esta cuenta (y podia contradecir al dashboard); ahora los dos llaman aca.
 */
export function tiempoRealHasta(t: Tarea, hastaISO?: string): number {
  const fin = hastaISO ?? t.finReal
  if (!t.inicioReal || !fin) return 0
  const wall = calcularTiempoNetoProductivo(new Date(t.inicioReal), new Date(fin), {
    recupMin: minutosRecupTarea(t), sinAlmuerzo: true,
  })
  return Math.max(0, wall - minutosNoProductivos(t, fin))
}

/**
 * DEMORA SIN JUSTIFICAR hasta un instante de corte. FUENTE DE VERDAD UNICA:
 * la usan el Gantt (para tareas en curso, con corte = ahora) y el dashboard.
 */
export function demoraSinJustificarHasta(t: Tarea, hastaISO?: string): number {
  // v1.89: delega en metricasTarea para que no queden dos versiones de la cuenta.
  return metricasTarea(t, hastaISO).sinJustificar
}

/**
 * DEMORA SIN JUSTIFICAR = (Tiempo Real Neto - Tiempo Estimado) - Demora Justificada
 *
 * Escrita tal cual la definió dirección. Nota: es la MISMA cuenta que
 * (Neto - Estimado), porque Neto ya tiene la justificada descontada
 * — se deja en la forma explícita para que se lea igual que la regla de negocio.
 *
 * Si el operario justificó TODO su exceso con pausas válidas, da 0.
 */
export function demoraSinJustificarMin(t: Tarea): number {
  return metricasTarea(t).sinJustificar
}

// ============================================================
// v1.89 — HELPER ÚNICO DE MÉTRICAS DE UNA TAREA
//
// Devuelve los cinco números de una sola pasada. Existe para que el tooltip del
// Gantt, la tabla de detalle (filtrada o no) y el dashboard consuman EXACTAMENTE
// la misma cuenta: cada vez que alguno hizo su propia versión, terminó
// contradiciendo a los otros en pantalla.
//
// OJO CON EL NOMBRE `demorado`: acá significa lo que definió dirección, el
// EXCESO sobre el estimado. NO confundir con `totalDemoradoMin()`, que devuelve
// la demora JUSTIFICADA (suma de paradas). Son cosas distintas y ese choque de
// nombres ya generó confusión en las columnas de los reportes.
// ============================================================
export interface MetricasTarea {
  /** Tiempo estándar de la matriz Máquina+Modelo+Material. */
  estimado: number
  /** Laborable entre inicio y fin, menos las pausas no productivas fusionadas. */
  real: number
  /** MAX(0, real − estimado). Lo que tardó de más respecto del ideal. */
  demorado: number
  /** Pausas de demora fusionadas, sin los tramos que pisa el almuerzo. */
  justificada: number
  /** MAX(0, demorado − justificada). Si justificó todo el exceso, da 0. */
  sinJustificar: number
  /** Almuerzo y pausas programadas, fusionadas. Informativo. */
  noProductivo: number

  // ----------------------------------------------------------------
  // v2.01 — DESCOMPOSICION PARA QUE LOS TOTALES CIERREN.
  //
  // El problema que resuelven: sumar las 5 metricas de arriba NO balancea, y
  // no por un error de codigo sino por dos decisiones de definicion:
  //   (a) `demorado` esta clampeado en 0, asi que una tarea terminada ANTES del
  //       estandar aporta 0 al demorado pero negativo a (Real - Estimado);
  //   (b) `justificada` NO es una parte de `demorado`: es la suma real de
  //       paradas, medida aparte. Si el operario se paso 1 h pero cargo 3 h de
  //       paradas legitimas, justificada + sinJustificar = 3 != demorado = 1.
  //
  // Estos tres campos parten esos dos numeros en sus componentes. NO cambian
  // ningun valor: solo los hacen sumables. Con ellos valen SIEMPRE:
  //   demorado  - adelanto  === real - estimado
  //   aplicada  + sinJustificar === demorado
  //   aplicada  + excedente === justificada
  // ----------------------------------------------------------------
  /** MAX(0, estimado − real). Lo que se ganó cuando la tarea salió antes. */
  adelanto: number
  /** MIN(justificada, demorado). La parte de lo justificado que tapa el exceso. */
  justificadaAplicada: number
  /** MAX(0, justificada − demorado). Justificó MÁS de lo que se pasó. */
  justificadaExcedente: number
}

/**
 * @param hastaISO corte para tareas EN CURSO (normalmente "ahora").
 *                 Si se omite, se usa el fin real de la tarea.
 */
export function metricasTarea(t: Tarea, hastaISO?: string): MetricasTarea {
  const estimado = tiempoEstimadoMin(t)
  const vacio: MetricasTarea = {
    estimado, real: 0, demorado: 0, justificada: 0, sinJustificar: 0, noProductivo: 0,
    adelanto: Math.max(0, estimado), justificadaAplicada: 0, justificadaExcedente: 0,
  }
  const fin = hastaISO ?? t.finReal
  if (!t.inicioReal || !fin) return vacio

  // v2.01: se REDONDEA PRIMERO y todo lo demas se deriva de los enteros. Antes
  // cada campo se redondeaba por separado y las identidades se iban 1 minuto
  // por tarea; con 200 tareas en pantalla eso son 3 horas de descuadre.
  const real = Math.round(tiempoRealHasta(t, fin))
  const justificada = Math.round(minutosParada(t, fin))
  const noProductivo = Math.round(minutosNoProductivos(t, fin))
  const demorado = Math.max(0, real - estimado)
  const adelanto = Math.max(0, estimado - real)
  // Las reparaciones no penalizan: son trabajo no productivo por definición.
  const sinJustificar = esReparacion(t) ? 0 : Math.max(0, demorado - justificada)
  // Se despeja de sinJustificar (en vez de MIN(justificada, demorado)) para que
  // `aplicada + sinJustificar === demorado` valga TAMBIEN en las reparaciones,
  // donde sinJustificar se fuerza a 0. Contrapartida: en una reparacion
  // `aplicada + excedente` puede no dar `justificada`. No afecta a la tabla de
  // detalle, que excluye las reparaciones.
  const justificadaAplicada = Math.max(0, demorado - sinJustificar)
  const justificadaExcedente = Math.max(0, justificada - justificadaAplicada)

  return {
    estimado, real, demorado, justificada, sinJustificar, noProductivo,
    adelanto, justificadaAplicada, justificadaExcedente,
  }
}

// Filtra tareas cuyo trabajo cae dentro de [desdeISO, hastaISO) segun su
// inicio real (o planificado). Base del filtro de periodo del Dashboard (v1.4).
export function filtrarPorRango(tareas: Tarea[], desdeISO: string, hastaISO: string): Tarea[] {
  return tareas.filter((t) => {
    const ref = t.inicioReal ?? t.inicioPlanificado
    return ref != null && ref >= desdeISO && ref < hastaISO
  })
}

export interface OEE {
  disponibilidad: number // 0..1
  rendimiento: number    // 0..1
  calidad: number        // 0..1
  oee: number            // 0..1
}

// OEE simplificado para planta sobre un conjunto de tareas finalizadas.
//  Disponibilidad = tiempo operativo / tiempo bruto (bruto - paradas) / bruto
//  Rendimiento    = tiempo estandar / tiempo neto (ideal vs real efectivo)
//  Calidad        = piezas OK / piezas totales
export function calcularOEE(tareas: Tarea[]): OEE {
  // v1.8: las reparaciones son tiempo no productivo -> NO entran al OEE.
  const fin = tareas.filter((t) => t.estado === 'finalizada' && t.inicioReal && t.finReal && !esReparacion(t))
  if (fin.length === 0) return { disponibilidad: 0, rendimiento: 0, calidad: 0, oee: 0 }

  let bruto = 0, paradas = 0, estandar = 0, neto = 0, ok = 0
  for (const t of fin) {
    // Base = tiempo disponible (sin almuerzo); las paradas son solo productivas.
    const base = Math.max(1, tiempoDisponible(t))
    const par = minutosParada(t)
    bruto += base
    paradas += par
    neto += Math.max(1, base - par)
    estandar += t.tiempoEstandarMin
    if (t.calidadOk !== false) ok++
  }
  const disponibilidad = bruto > 0 ? (bruto - paradas) / bruto : 0
  const rendimiento = neto > 0 ? Math.min(1, estandar / neto) : 0
  const calidad = ok / fin.length
  return { disponibilidad, rendimiento, calidad, oee: disponibilidad * rendimiento * calidad }
}

// v2.00 — Tolerancia unica de desvio para TODOS los graficos de estimado vs neto.
// Sin ella, un desvio de 3 minutos sobre un estandar de 8 horas pintaba una
// maquina de rojo. Vive aca (y no en cada componente) para que los dos graficos
// no puedan volver a usar umbrales distintos, como pasaba antes.
export const TOLERANCIA_DESVIO = 0.10

/** true = el neto se paso del estandar MAS ALLA de la tolerancia -> rojo. */
export function excedeTolerancia(neto: number, estimado: number): boolean {
  return estimado > 0 ? neto > estimado * (1 + TOLERANCIA_DESVIO) : neto > 0
}

export interface DesvioModelo {
  modelo: string
  estandar: number
  /** Tiempo Real crudo (laborable, sin almuerzo). Informativo / tooltip. */
  real: number
  /** Suma de paradas justificadas (fusionadas, sin los tramos del almuerzo). */
  justificada: number
  /** Tiempo Neto = real - justificada. Es contra esto que se mide el desvio. */
  neto: number
  /** (neto - estandar) / estandar. v2.00: antes usaba el Real crudo. */
  desvioPct: number
  n: number
}

// Neto vs estandar agrupado por modelo de transformador.
//
// v2.00 — ANTES esto comparaba el Tiempo Real CRUDO contra el estandar, y por
// eso mostraba desvios de +495%: el Real incluye las horas que el operario ya
// justifico (falta de insumos, corte de luz, espera de puente grua). El grafico
// terminaba castigando al operario por esperas que no dependian de el.
// Ahora se mide contra el NETO (real - justificada), que es el trabajo efectivo.
// La justificada sale de minutosParada(), que fusiona intervalos superpuestos y
// le da prioridad al almuerzo: los numeros coinciden por construccion con la
// tabla "Detalle por tarea" y con el Gantt.
export function desviosPorModelo(tareas: Tarea[]): DesvioModelo[] {
  const fin = tareas.filter((t) => t.estado === 'finalizada' && t.inicioReal && t.finReal && !esReparacion(t))
  const map = new Map<string, { est: number; real: number; just: number; n: number }>()
  for (const t of fin) {
    const k = t.modelo
    const m = metricasTarea(t) // fuente unica de la cuenta
    const cur = map.get(k) ?? { est: 0, real: 0, just: 0, n: 0 }
    cur.est += m.estimado
    cur.real += m.real
    cur.just += m.justificada
    cur.n++
    map.set(k, cur)
  }
  return [...map.entries()].map(([modelo, v]) => {
    const neto = Math.max(0, v.real - v.just)
    return {
      modelo,
      estandar: v.est,
      real: v.real,
      justificada: v.just,
      neto,
      desvioPct: v.est > 0 ? (neto - v.est) / v.est : 0,
      n: v.n,
    }
  }).sort((a, b) => b.desvioPct - a.desvioPct)
}

export interface ParetoItem {
  causa: CausaParada
  label: string
  minutos: number
  eventos: number
  pct: number
  acum: number
}

// Pareto de demoras: causas ordenadas por minutos perdidos + % acumulado.
export function paretoDemoras(tareas: Tarea[]): ParetoItem[] {
  const map = new Map<CausaParada, { min: number; ev: number }>()
  // Se itera por tarea (no flatMap) para conservar su flag de hora de recuperacion:
  // una parada en la franja 16-17h / vie 15-16h solo cuenta si la tarea la recupera.
  for (const t of tareas.filter((t) => !esReparacion(t))) {
    for (const p of t.paradas) {
      if (esParadaNoProductiva(p.causa)) continue // el almuerzo no es una demora
      // v1.17: minutos LABORABLES (no crudos): no cuenta noches/finde/planta cerrada.
      const min = p.fin ? calcularTiempoNetoProductivo(new Date(p.inicio), new Date(p.fin), { recupMin: minutosRecupTarea(t), sinAlmuerzo: true }) : 0
      if (min <= 0) continue // ignora paradas en curso sin cierre
      const cur = map.get(p.causa) ?? { min: 0, ev: 0 }
      cur.min += min
      cur.ev++
      map.set(p.causa, cur)
    }
  }
  const total = [...map.values()].reduce((a, b) => a + b.min, 0) || 1
  let acum = 0
  return [...map.entries()]
    .map(([causa, v]) => ({ causa, label: causaLabel(causa), minutos: v.min, eventos: v.ev, pct: v.min / total }))
    .sort((a, b) => b.minutos - a.minutos)
    .map((it) => { acum += it.pct; return { ...it, acum } })
}

export interface EficienciaOperario {
  operarioId: string
  activos: number  // minutos efectivos
  parada: number   // minutos de parada
  eficiencia: number // activos / (activos+parada)
}

export function eficienciaPorOperario(tareas: Tarea[]): Map<string, EficienciaOperario> {
  const map = new Map<string, EficienciaOperario>()
  for (const t of tareas) {
    if (!t.inicioReal) continue
    if (esReparacion(t)) continue // v1.8: reparacion = no productivo, fuera del KPI
    // v1.2: operarioId es opcional (se estampa al iniciar). Sin operario no hay
    // a quien atribuir la eficiencia: se omite de este KPI.
    if (!t.operarioId) continue
    const par = minutosParada(t)
    const bruto = t.finReal ? tiempoDisponible(t) : 0
    const activos = Math.max(0, bruto - par)
    const cur = map.get(t.operarioId) ?? { operarioId: t.operarioId, activos: 0, parada: 0, eficiencia: 0 }
    cur.activos += activos
    cur.parada += par
    cur.eficiencia = cur.activos + cur.parada > 0 ? cur.activos / (cur.activos + cur.parada) : 0
    map.set(t.operarioId, cur)
  }
  return map
}

export function pct(n: number): string {
  return (n * 100).toFixed(0) + '%'
}
