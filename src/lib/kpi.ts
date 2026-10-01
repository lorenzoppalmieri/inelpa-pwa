import type { Tarea, Parada, CausaParada } from '../types'
import { minutosEntre } from './time'
import { calcularTiempoNetoProductivo } from './calendario'
import { minutosHuecoPorTarea } from './huecos'
import { paradasDeCorte } from './cortesLuz'
// periodos.ts solo importa TIPOS de ../types, asi que no hay import circular.
import { fechaDeReferencia } from './periodos'
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
  // v2.12: a las paradas que cargó el operario se le suman las VIRTUALES de
  // corte de luz. Se inyectan acá —y no en cada consumidor— porque este es el
  // desglose único que leen el Gantt, los KPIs, el Pareto y la tarjeta del
  // operario: enganchándolo en un solo lugar, aparece en todos.
  //
  // Si el corte se pisa con una parada que el operario SÍ llegó a cargar (por
  // ejemplo "falta de material" desde antes), la fusión de intervalos evita el
  // doble conteo. Ese problema ya está resuelto desde v1.89.
  const propias = t.paradas ?? []
  const virtuales = paradasDeCorte(t, ahoraISO)
  return [...propias, ...virtuales].map((p) => {
    const fin = finEfectivoParada(t, p, ahoraISO)
    return {
      id: p.id,
      causa: p.causa,
      label: causaLabel(p.causa),
      inicio: p.inicio,
      fin,
      // v2.04: `operarioId` hace que los días que el colaborador faltó no sumen.
      // Sin esto, una pausa abierta que cruza una ausencia se infla con las horas
      // de un día en que esa persona no estuvo en la planta.
      minutos: calcularTiempoNetoProductivo(new Date(p.inicio), new Date(fin), { recupMin, sinAlmuerzo: true, operarioId: t.operarioId }),
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
 * Instante en milisegundos.
 *
 * v2.12 — BUG CORREGIDO, y grave. Estas funciones comparaban los ISO como
 * TEXTO. Eso solo funciona si todos los timestamps vienen con el mismo formato
 * de zona, y no es el caso:
 *   - los que genera la tablet salen en UTC  -> '...T13:00:00.000Z'
 *   - los que llegan de Supabase salen así   -> '...T13:00:00+00:00'
 *   - los de las pruebas y algunos importados -> '...T10:00:00.000-03:00'
 * El MISMO instante escrito de tres formas distintas ordena distinto como
 * texto, así que dos pausas superpuestas podían no reconocerse como tales y
 * contarse dos veces. Es el mismo doble conteo que v1.89 vino a arreglar, por
 * una puerta que quedó abierta.
 *
 * Lo destapó el test de cortes de luz: la parada del operario (con offset) y la
 * del corte (en UTC) se pisaban y daban 240' en vez de 180'.
 */
const msIso = (iso: string): number => new Date(iso).getTime()

/**
 * Une los intervalos que se superponen o se tocan. Función PURA.
 * [11:30-13:00] + [12:30-13:00]  ->  [11:30-13:00]
 * [09:00-10:00] + [11:00-12:00]  ->  los dos, separados (no se tocan)
 */
export function fusionarIntervalos(xs: Intervalo[]): Intervalo[] {
  const vals = xs.filter((x) => x.inicio && x.fin && msIso(x.fin) > msIso(x.inicio))
    .sort((a, b) => msIso(a.inicio) - msIso(b.inicio))
  const out: Intervalo[] = []
  for (const x of vals) {
    const ult = out[out.length - 1]
    // `<=` y no `<`: dos pausas pegadas (una termina justo cuando arranca la
    // otra) son un solo tramo de planta parada, no dos.
    if (ult && msIso(x.inicio) <= msIso(ult.fin)) {
      if (msIso(x.fin) > msIso(ult.fin)) ult.fin = x.fin
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
      // v2.12: comparación por INSTANTE, no por texto. Ver `msIso`.
      if (msIso(q.fin) <= msIso(b.inicio) || msIso(q.inicio) >= msIso(b.fin)) { sig.push(b); continue } // no se tocan
      if (msIso(q.inicio) > msIso(b.inicio)) sig.push({ inicio: b.inicio, fin: q.inicio }) // sobra por izquierda
      if (msIso(q.fin) < msIso(b.fin)) sig.push({ inicio: q.fin, fin: b.fin })             // sobra por derecha
    }
    actual = sig
  }
  return actual
}

/** Mide una lista de intervalos en minutos de PLANTA ABIERTA (no reloj). */
function medirIntervalos(xs: Intervalo[], recupMin: number, operarioId?: string): number {
  return xs.reduce((acc, x) => acc + calcularTiempoNetoProductivo(
    new Date(x.inicio), new Date(x.fin), { recupMin, sinAlmuerzo: true, operarioId }), 0)
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
  return medirIntervalos(restarIntervalos(prod, noProd), minutosRecupTarea(t), t.operarioId)
}

// PAUSAS NO PRODUCTIVAS (almuerzo, reapertura). NO son demora: se descuentan del
// Tiempo Real como si esa franja no existiera, pero se muestran en el detalle
// (el operario las marca todos los días y tiene que poder verlas).
export function minutosNoProductivos(t: Tarea, ahoraISO?: string): number {
  const { noProd } = cubosDePausas(t, ahoraISO)
  return medirIntervalos(fusionarIntervalos(noProd), minutosRecupTarea(t), t.operarioId)
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
    operarioId: t.operarioId, // v2.04: los días que faltó no cuentan
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
    operarioId: t.operarioId, // v2.04: los días que faltó no cuentan
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

  /**
   * v2.03 — Minutos de TIEMPO MUERTO previos a esta tarea (Bobinado).
   * v2.27 — INFORMATIVO: ya NO está incluido en `real` (ni por lo tanto en
   * Neto ni en Demora sin justificar). El Neto es solo tiempo trabajado; esto
   * es tiempo en que el colaborador no tenía tarea abierta. Ver `lib/huecos.ts`.
   */
  hueco: number
}

/**
 * @param hastaISO corte para tareas EN CURSO (normalmente "ahora").
 *                 Si se omite, se usa el fin real de la tarea.
 * @param huecoMin minutos de tiempo muerto previos (solo Bobinado). Desde v2.27
 *                 solo se REPORTA en el campo `hueco`; no se suma a ningún
 *                 tiempo. Por default 0.
 */
export function metricasTarea(t: Tarea, hastaISO?: string, huecoMin = 0): MetricasTarea {
  const estimado = tiempoEstimadoMin(t)
  const vacio: MetricasTarea = {
    estimado, real: 0, demorado: 0, justificada: 0, sinJustificar: 0, noProductivo: 0,
    adelanto: Math.max(0, estimado), justificadaAplicada: 0, justificadaExcedente: 0,
    hueco: 0,
  }
  const fin = hastaISO ?? t.finReal
  if (!t.inicioReal || !fin) return vacio

  // v2.01: se REDONDEA PRIMERO y todo lo demas se deriva de los enteros. Antes
  // cada campo se redondeaba por separado y las identidades se iban 1 minuto
  // por tarea; con 200 tareas en pantalla eso son 3 horas de descuadre.
  //
  // ============================================================
  // v2.27 — EL TIEMPO MUERTO YA NO ENTRA EN EL REAL NI EN EL NETO.
  //
  // Regla de Lorenzo (23/9/2026), para TODOS los indicadores:
  //   "el tiempo neto calculado es el tiempo de producción: no cuenta los
  //    almuerzos, ni paradas, ni tiempo que la empresa está cerrada — solo
  //    calcula el tiempo que el colaborador trabajó".
  // Y la comparación es siempre ESTIMADO vs NETO.
  //
  // En v2.03 el hueco entre tareas se sumaba acá, dentro de `real`, para que
  // cayera en Demora sin justificar. Pero el hueco es justamente tiempo en que
  // el colaborador NO estaba trabajando en ninguna tarea: meterlo en el Real
  // contradice la definición. Y como se medía desde el fin de la tarea anterior
  // SIN límite de días, un bobinador que volvía después de dos semanas sin
  // tareas cargadas (vacaciones sin ausencia registrada, días sin planificar)
  // recibía 12 jornadas enteras en UNA tarea: el caso reportado de una bobina
  // con 102 h de Neto hecha en menos de dos días.
  //
  // `hueco` se sigue midiendo y exponiendo (columna "Tiempo muerto" del
  // Detalle), pero ahora es un dato INFORMATIVO aparte: no toca `real`, así que
  // tampoco toca Neto, Demorado ni Demora sin justificar. Las tres identidades
  // del auditor siguen cerrando porque todo se sigue derivando de `real`.
  //
  // No hace falta migrar nada: ningún tiempo se guarda calculado. Todo el
  // histórico se recalcula solo la próxima vez que se abre la pantalla.
  // ============================================================
  const hueco = Math.max(0, Math.round(huecoMin))
  const real = Math.round(tiempoRealHasta(t, fin))
  const justificada = Math.round(minutosParada(t, fin))
  const noProductivo = Math.round(minutosNoProductivos(t, fin))
  return derivarMetricas(estimado, real, justificada, noProductivo, hueco, esReparacion(t))
}

/**
 * Las métricas DERIVADAS a partir de las cuatro medidas (ya redondeadas).
 *
 * v2.35: se extrajo de `metricasTarea` para que la versión recortada por período
 * (`metricasTareaEnVentana`) use EXACTAMENTE la misma cuenta. Dos copias de estas
 * fórmulas es lo que ya causó descuadres entre pantallas (ver v1.67 y v2.01).
 */
function derivarMetricas(
  estimado: number, real: number, justificada: number, noProductivo: number,
  hueco: number, reparacion: boolean,
): MetricasTarea {
  const demorado = Math.max(0, real - estimado)
  const adelanto = Math.max(0, estimado - real)
  // Las reparaciones no penalizan: son trabajo no productivo por definición.
  const sinJustificar = reparacion ? 0 : Math.max(0, demorado - justificada)
  // Se despeja de sinJustificar (en vez de MIN(justificada, demorado)) para que
  // `aplicada + sinJustificar === demorado` valga TAMBIEN en las reparaciones,
  // donde sinJustificar se fuerza a 0. Contrapartida: en una reparacion
  // `aplicada + excedente` puede no dar `justificada`. No afecta a la tabla de
  // detalle, que excluye las reparaciones.
  const justificadaAplicada = Math.max(0, demorado - sinJustificar)
  const justificadaExcedente = Math.max(0, justificada - justificadaAplicada)

  return {
    estimado, real, demorado, justificada, sinJustificar, noProductivo,
    adelanto, justificadaAplicada, justificadaExcedente, hueco,
  }
}

/**
 * v2.03 — MÉTRICAS DE UNA LISTA, con los huecos de tiempo muerto ya aplicados.
 *
 * `metricasTarea` es pura y por tarea: no conoce a las vecinas. El hueco necesita
 * la tarea ANTERIOR del mismo operario, así que la única forma de calcularlo es
 * mirando el conjunto. Esta capa lo hace una vez y devuelve todo indexado.
 *
 * IMPORTANTE: pasarle TODAS las tareas del período, de TODOS los sectores. Si se
 * filtra por sector antes, un bobinador que se fue a ayudar a herrería en el
 * medio aparece como si hubiera estado sin hacer nada. El filtro de Bobinado ya
 * está adentro de `huecosPorTarea`, y decide quién RECIBE el hueco.
 */
export function metricasDeLista(tareas: Tarea[], hastaISO?: string): Map<string, MetricasTarea> {
  const huecos = minutosHuecoPorTarea(tareas)
  const out = new Map<string, MetricasTarea>()
  for (const t of tareas) out.set(t.id, metricasTarea(t, hastaISO, huecos.get(t.id) ?? 0))
  return out
}

// ============================================================
// v2.35 — RECORTE POR PERÍODO + ESTÁNDAR PRORRATEADO.
//
// Pedido de Lorenzo (1/10/2026): si una tarea o una demora cruza de una semana
// (o un mes) a otra, cada período tiene que hacerse cargo SOLO de los minutos
// que transcurrieron dentro de él. Antes la tarea entera —con todas sus
// demoras— caía en un único período y lo inflaba.
//
// DOS CLASES DE INDICADOR, y se tratan distinto:
//
//  - De FLUJO DE TIEMPO (Pareto de demoras, activo vs parada, disponibilidad):
//    se RECORTA. Una demora del viernes 14:00 al lunes 08:00 reparte sus
//    minutos hábiles entre las dos semanas.
//
//  - De COMPARACIÓN POR PIEZA (estimado vs neto, desvíos, demora sin
//    justificar): el estándar es de la pieza ENTERA, así que recortar solo el
//    neto inventaría eficiencia. Ejemplo que se usó para decidir: bobina de
//    300', 120' el viernes y 180' + 60' de demora el lunes. Recortando a secas,
//    el lunes mostraba 180' contra 300' = "40% más rápido", y en realidad hizo
//    exacto el estándar.
//    Decisión de Lorenzo: PRORRATEAR. Cada período recibe una parte del
//    estándar proporcional al neto que se trabajó en él: viernes 120' vs 120',
//    lunes 180' vs 180'. La eficiencia de la pieza se conserva y cada semana
//    carga con sus horas.
//
// CONSECUENCIA A SABER: el prorrateo necesita el neto TOTAL de la pieza, que se
// conoce recién cuando termina. Mientras una tarea sigue abierta, su porción no
// tiene estándar (fracción 0) y no entra en las comparaciones — sí en los
// indicadores de flujo. Cuando termina, los períodos anteriores que tocó se
// recalculan solos. O sea: el número de una semana pasada puede moverse hasta
// que se cierran todas las tareas que trabajaron en ella.
//
// Si la tarea cae ENTERA dentro del período, el resultado es idéntico al de
// `metricasTarea` (se la llama directamente): en el caso común no cambia nada.
// ============================================================

/** Período de los KPIs: [desde, hasta). */
export interface VentanaKPI { desde: string; hasta: string }

/** Recorta intervalos a la ventana. Los que quedan vacíos se descartan. */
export function recortarIntervalos(xs: Intervalo[], v: VentanaKPI): Intervalo[] {
  const d = msIso(v.desde), h = msIso(v.hasta)
  const out: Intervalo[] = []
  for (const x of xs) {
    const ini = Math.max(msIso(x.inicio), d)
    const fin = Math.min(msIso(x.fin), h)
    if (fin > ini) out.push({ inicio: new Date(ini).toISOString(), fin: new Date(fin).toISOString() })
  }
  return out
}

/** Lo que la tarea estuvo abierta: [inicioReal, finReal ?? ahora]. */
function tramoTarea(t: Tarea, ahoraISO?: string): Intervalo | null {
  if (!t.inicioReal) return null
  const fin = t.finReal ?? ahoraISO ?? new Date().toISOString()
  return msIso(fin) > msIso(t.inicioReal) ? { inicio: t.inicioReal, fin } : null
}

/** ¿La tarea estuvo trabajándose en algún momento de la ventana? */
export function trabajoEnVentana(t: Tarea, v: VentanaKPI, ahoraISO?: string): boolean {
  const tr = tramoTarea(t, ahoraISO)
  return !!tr && msIso(tr.inicio) < msIso(v.hasta) && msIso(tr.fin) > msIso(v.desde)
}

/**
 * Tareas que TRABAJARON dentro del período (se solapan con él), terminadas o no.
 * Es la selección que corresponde a indicadores recortados: una tarea que empezó
 * la semana pasada y sigue abierta también le aporta minutos a esta semana.
 */
export function tareasEnVentana(tareas: Tarea[], v: VentanaKPI, ahoraISO?: string): Tarea[] {
  return tareas.filter((t) => trabajoEnVentana(t, v, ahoraISO))
}

export interface MetricasVentana extends MetricasTarea {
  /** true = la tarea cruzó un borde del período: son los números de su porción. */
  parcial: boolean
  /** Parte del estándar imputada al período (1 = entera, 0 = abierta o fuera). */
  fraccion: number
}

/**
 * Métricas de UNA tarea restringidas a la ventana, con el estándar prorrateado.
 * Todo se mide en minutos HÁBILES (noches, fines de semana, feriados y ausencias
 * fuera), igual que `metricasTarea`.
 */
export function metricasTareaEnVentana(t: Tarea, v: VentanaKPI, ahoraISO?: string, huecoMin = 0): MetricasVentana {
  const ahora = ahoraISO ?? new Date().toISOString()
  const corte = t.finReal ? undefined : ahora
  const tr = tramoTarea(t, ahora)

  // Caso común: la tarea cae ENTERA dentro del período -> idéntico a lo de siempre.
  if (tr && msIso(tr.inicio) >= msIso(v.desde) && msIso(tr.fin) <= msIso(v.hasta)) {
    return { ...metricasTarea(t, corte, huecoMin), parcial: false, fraccion: t.finReal ? 1 : 0 }
  }
  const est = tiempoEstimadoMin(t)
  const nada = { ...derivarMetricas(0, 0, 0, 0, 0, esReparacion(t)), parcial: true, fraccion: 0 }
  if (!tr) return { ...derivarMetricas(est, 0, 0, 0, 0, esReparacion(t)), parcial: false, fraccion: 0 }

  // Porción de la tarea que cae en la ventana.
  const [porcion] = recortarIntervalos([tr], v)
  if (!porcion) return nada
  const vp: VentanaKPI = { desde: porcion.inicio, hasta: porcion.fin }

  const recup = minutosRecupTarea(t)
  const { prod, noProd } = cubosDePausas(t, ahora)
  const wall = calcularTiempoNetoProductivo(new Date(porcion.inicio), new Date(porcion.fin), {
    recupMin: recup, sinAlmuerzo: true, operarioId: t.operarioId,
  })
  // Mismas reglas que la tarea entera: pausas fusionadas, y donde un almuerzo
  // pisa una demora gana el almuerzo. Solo que todo recortado a la porción.
  const noProdW = medirIntervalos(fusionarIntervalos(recortarIntervalos(noProd, vp)), recup, t.operarioId)
  const justW = medirIntervalos(restarIntervalos(recortarIntervalos(prod, vp), noProd), recup, t.operarioId)

  const real = Math.round(Math.max(0, wall - noProdW))
  const justificada = Math.round(justW)
  const noProductivo = Math.round(noProdW)

  // Prorrateo del estándar: solo para tareas TERMINADAS (hace falta el total).
  let fraccion = 0
  if (t.finReal) {
    const tot = metricasTarea(t)
    const netoTot = tot.real - tot.justificada
    if (netoTot > 0) fraccion = Math.max(0, real - justificada) / netoTot
    else if (tot.real > 0) fraccion = real / tot.real
    fraccion = Math.min(1, Math.max(0, fraccion))
  }
  const estimado = Math.round(est * fraccion)

  // El tiempo muerto (informativo) se imputa al período en que arrancó la tarea.
  const arrancoAca = msIso(t.inicioReal!) >= msIso(v.desde) && msIso(t.inicioReal!) < msIso(v.hasta)
  const hueco = arrancoAca ? Math.max(0, Math.round(huecoMin)) : 0

  return { ...derivarMetricas(estimado, real, justificada, noProductivo, hueco, esReparacion(t)), parcial: true, fraccion }
}

// ============================================================
// Filtra tareas dentro de [desdeISO, hastaISO). Base del filtro de periodo del
// Dashboard (v1.4).
//
// v2.22 — DOS CORRECCIONES, las mismas que en `tareaEnPeriodo`:
//
// 1) LAS FINALIZADAS SE UBICAN POR SU FIN, no por su arranque. Una bobina que
//    empezo el 28/8 y se termino el 3/9 se contaba en AGOSTO y no aparecia al
//    filtrar septiembre. La produccion de un mes es lo que se TERMINO ese mes.
//
// 2) SE COMPARA POR INSTANTE, no como texto. `rangoPeriodo` devuelve `...Z` y
//    las tareas vienen de Supabase con `...+00:00`: como string el mismo
//    instante compara distinto y las tareas del borde entraban o quedaban
//    afuera sin motivo. Cuarta vez que aparece este error en el proyecto.
//
// La regla vive en `fechaDeReferencia` (lib/periodos) y la usan ESTA funcion y
// el filtro de "Asignar tareas". Tener dos criterios era lo que hacia que las
// dos pantallas mostraran conjuntos distintos para el mismo periodo.
// ============================================================
export function filtrarPorRango(tareas: Tarea[], desdeISO: string, hastaISO: string): Tarea[] {
  const desde = new Date(desdeISO).getTime()
  const hasta = new Date(hastaISO).getTime()
  return tareas.filter((t) => {
    const ref = new Date(fechaDeReferencia(t) ?? '').getTime()
    return Number.isFinite(ref) && ref >= desde && ref < hasta
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
export function calcularOEE(tareas: Tarea[], v?: VentanaKPI): OEE {
  // v1.8: las reparaciones son tiempo no productivo -> NO entran al OEE.
  // v2.35: con período, entran las terminadas que TRABAJARON en él, con su
  // porción de tiempo y su parte prorrateada del estándar.
  const fin = tareas.filter((t) => t.estado === 'finalizada' && t.inicioReal && t.finReal && !esReparacion(t)
    && (!v || trabajoEnVentana(t, v)))
  if (fin.length === 0) return { disponibilidad: 0, rendimiento: 0, calidad: 0, oee: 0 }

  let bruto = 0, paradas = 0, estandar = 0, neto = 0, ok = 0
  for (const t of fin) {
    if (t.calidadOk !== false) ok++
    if (v) {
      const m = metricasTareaEnVentana(t, v)
      if (m.real <= 0) continue
      bruto += m.real
      paradas += m.justificada
      neto += Math.max(1, m.real - m.justificada)
      estandar += m.estimado
      continue
    }
    // Base = tiempo disponible (sin almuerzo); las paradas son solo productivas.
    const base = Math.max(1, tiempoDisponible(t))
    const par = minutosParada(t)
    bruto += base
    paradas += par
    neto += Math.max(1, base - par)
    estandar += t.tiempoEstandarMin
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
export function desviosPorModelo(tareas: Tarea[], huecos?: Map<string, number>, v?: VentanaKPI): DesvioModelo[] {
  const fin = tareas.filter((t) => t.estado === 'finalizada' && t.inicioReal && t.finReal && !esReparacion(t)
    && (!v || trabajoEnVentana(t, v)))
  const map = new Map<string, { est: number; real: number; just: number; n: number }>()
  for (const t of fin) {
    const k = t.modelo
    // v2.03: `huecos` viene calculado sobre TODAS las tareas (ver metricasDeLista).
    // Si no se pasa, se comporta igual que antes: sin tiempo muerto.
    // v2.35: con período, la porción recortada con el estándar prorrateado.
    const m = v
      ? metricasTareaEnVentana(t, v, undefined, huecos?.get(t.id) ?? 0)
      : metricasTarea(t, undefined, huecos?.get(t.id) ?? 0) // fuente unica de la cuenta
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
export function paretoDemoras(tareas: Tarea[], v?: VentanaKPI): ParetoItem[] {
  const map = new Map<CausaParada, { min: number; ev: number }>()
  // Se itera por tarea (no flatMap) para conservar su flag de hora de recuperacion:
  // una parada en la franja 16-17h / vie 15-16h solo cuenta si la tarea la recupera.
  for (const t of tareas.filter((t) => !esReparacion(t))) {
    // v2.12: se recorre `desglosePausas` en vez de `t.paradas` en crudo. Dos
    // motivos: incluye las paradas virtuales de CORTE DE LUZ (que no viven
    // dentro de la tarea), y usa la misma medición que el resto de la app en
    // lugar de repetir el cálculo acá.
    for (const x of desglosePausas(t)) {
      if (!x.productiva) continue   // el almuerzo no es una demora
      if (x.abierta) continue       // parada en curso sin cierre: no se computa
      // v2.35: con período, solo los minutos de la demora que caen DENTRO de él.
      // Una demora del viernes 14:00 al lunes 08:00 reparte sus minutos hábiles
      // entre las dos semanas en vez de cargarse entera en una.
      let minutos = x.minutos
      if (v) {
        const [dentro] = recortarIntervalos([{ inicio: x.inicio, fin: x.fin }], v)
        minutos = dentro
          ? calcularTiempoNetoProductivo(new Date(dentro.inicio), new Date(dentro.fin),
            { recupMin: minutosRecupTarea(t), sinAlmuerzo: true, operarioId: t.operarioId })
          : 0
      }
      if (minutos <= 0) continue
      const cur = map.get(x.causa) ?? { min: 0, ev: 0 }
      cur.min += minutos
      cur.ev++
      map.set(x.causa, cur)
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

export function eficienciaPorOperario(tareas: Tarea[], v?: VentanaKPI): Map<string, EficienciaOperario> {
  const map = new Map<string, EficienciaOperario>()
  for (const t of tareas) {
    if (!t.inicioReal) continue
    if (esReparacion(t)) continue // v1.8: reparacion = no productivo, fuera del KPI
    // v1.2: operarioId es opcional (se estampa al iniciar). Sin operario no hay
    // a quien atribuir la eficiencia: se omite de este KPI.
    if (!t.operarioId) continue
    let par: number, activos: number
    if (v) {
      // v2.35: es un indicador de FLUJO de tiempo -> se recorta al período, y
      // las tareas todavía abiertas aportan sus minutos hasta ahora.
      if (!trabajoEnVentana(t, v)) continue
      const m = metricasTareaEnVentana(t, v)
      par = m.justificada
      activos = Math.max(0, m.real - m.justificada)
    } else {
      par = minutosParada(t)
      const bruto = t.finReal ? tiempoDisponible(t) : 0
      activos = Math.max(0, bruto - par)
    }
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
