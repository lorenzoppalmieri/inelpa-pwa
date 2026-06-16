// Modelo de horario laboral de planta INELPA (todas las areas productivas).
//
// Turno productivo (la recuperacion de horas cuenta como tiempo estandar):
//   Lunes a Jueves: 07:00 - 16:00 normal, 16:00 - 17:00 recuperacion
//   Viernes:        07:00 - 15:00 normal, 15:00 - 16:00 recuperacion
//   Sabado/Domingo: no laborable
// Limpieza = ultimos 15 min del cierre NORMAL: Lun-Jue 15:45-16:00, Vie 14:45-15:00.
// La recuperacion va DESPUES de la limpieza (16-17 Lun-Jue, 15-16 Vie).
//
// Tiempo NO productivo (no cuenta como disponible ni se grafica como ocupado):
//   - Limpieza del area: ultimos 15 min del cierre normal (antes de recuperacion).
//   - Almuerzo: SOLO 30 min dentro de la franja 12:00-13:00, segun el grupo de
//     turno rotativo (cambia cada 15 dias). Los otros 30 min SON productivos.
//       Grupo A: almuerza 12:00-12:30  (12:30-13:00 produce)
//       Grupo B: almuerza 12:30-13:00  (12:00-12:30 produce)
//
// Todas las funciones trabajan en hora LOCAL del navegador (la tablet de planta).

export interface Tramo { iniMin: number; finMin: number } // minutos desde 00:00 del dia

// Grupo de turno de almuerzo (rotativo por sector/linea, lo elige el planificador).
export type GrupoAlmuerzo = 'A' | 'B'
export const GRUPO_ALMUERZO_DEFAULT: GrupoAlmuerzo = 'A'

const APERTURA_MIN = 7 * 60       // 07:00
const LIMPIEZA_MIN = 15           // ultimos 15 min sin produccion

// Franja de 30 min de almuerzo segun el grupo (dentro de 12:00-13:00).
export function tramoAlmuerzo(grupo: GrupoAlmuerzo): Tramo {
  return grupo === 'B'
    ? { iniMin: 12 * 60 + 30, finMin: 13 * 60 } // 12:30 - 13:00
    : { iniMin: 12 * 60, finMin: 12 * 60 + 30 } // 12:00 - 12:30
}

// Cierre del turno NORMAL (donde cae la limpieza de fin de jornada).
// dow: 0=Dom .. 6=Sab. null = no laborable.
function cierreNormalMin(dow: number): number | null {
  if (dow >= 1 && dow <= 4) return 16 * 60 // Lun-Jue
  if (dow === 5) return 15 * 60            // Vie
  return null                              // Sab/Dom
}
// Cierre con recuperacion de horas (limite del tiempo productivo del dia).
function cierreRecupMin(dow: number): number | null {
  if (dow >= 1 && dow <= 4) return 17 * 60 // Lun-Jue
  if (dow === 5) return 16 * 60            // Vie
  return null                              // Sab/Dom
}

// Minutos transcurridos desde las 00:00 del dia para una fecha dada.
function minDelDia(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

// Nueva fecha en el mismo dia que `base` pero a `min` minutos desde 00:00.
function conMinutos(base: Date, min: number): Date {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  d.setMinutes(min)
  return d
}

// Tramos productivos de un dia concreto (vacio si no es laborable):
//   1) Manana:       apertura -> inicio del almuerzo del grupo
//   2) Tarde:        fin del almuerzo -> inicio limpieza (cierre normal - 15 min)
//   3) Recuperacion: cierre normal -> cierre con recuperacion (productivo estandar)
// La limpieza queda como hueco entre 2 y 3. El almuerzo (30 min del grupo) queda
// como hueco entre 1 y 2; los otros 30 min de 12-13 son productivos (van en 1 o 2).
// `conRecuperacion` (default true): incluye la franja 16-17 (Lun-Jue) / 15-16
// (Vie) como tiempo productivo. En false, el dia cierra estricto en la hora
// normal (16:00 / 15:00) — usado por el calculo de tiempo neto cuando la tarea
// NO tiene habilitada la hora de recuperacion.
export function tramosLaborables(
  fecha: Date,
  grupo: GrupoAlmuerzo = GRUPO_ALMUERZO_DEFAULT,
  conRecuperacion = true,
): Tramo[] {
  const normal = cierreNormalMin(fecha.getDay())
  const recup = cierreRecupMin(fecha.getDay())
  if (normal == null || recup == null) return []
  const alm = tramoAlmuerzo(grupo)
  const iniLimpieza = normal - LIMPIEZA_MIN
  const tramos: Tramo[] = []
  if (APERTURA_MIN < alm.iniMin) tramos.push({ iniMin: APERTURA_MIN, finMin: alm.iniMin })
  if (alm.finMin < iniLimpieza) tramos.push({ iniMin: alm.finMin, finMin: iniLimpieza })
  if (conRecuperacion && normal < recup) tramos.push({ iniMin: normal, finMin: recup })
  return tramos.filter((t) => t.finMin > t.iniMin)
}

// Minutos productivos totales de un dia (para grilla / capacidad).
export function minutosProductivosDia(fecha: Date, grupo: GrupoAlmuerzo = GRUPO_ALMUERZO_DEFAULT): number {
  return tramosLaborables(fecha, grupo).reduce((s, t) => s + (t.finMin - t.iniMin), 0)
}

// Primer instante productivo del proximo dia laborable posterior a `d`.
function siguienteApertura(d: Date, grupo: GrupoAlmuerzo, conRecuperacion = true): Date {
  const n = new Date(d)
  n.setDate(n.getDate() + 1)
  n.setHours(0, 0, 0, 0)
  for (let i = 0; i < 14; i++) {
    if (tramosLaborables(n, grupo, conRecuperacion).length > 0) return conMinutos(n, APERTURA_MIN)
    n.setDate(n.getDate() + 1)
  }
  return conMinutos(n, APERTURA_MIN)
}

// Lleva un instante cualquiera al proximo instante productivo (>= al dado).
// Si ya esta dentro de un tramo, lo devuelve tal cual.
export function proximoInstanteLaborable(iso: string, grupo: GrupoAlmuerzo = GRUPO_ALMUERZO_DEFAULT): string {
  let cursor = new Date(iso)
  let guard = 0
  while (guard++ < 4000) {
    const curMin = minDelDia(cursor)
    const tr = tramosLaborables(cursor, grupo).find((t) => curMin < t.finMin)
    if (tr) {
      if (curMin < tr.iniMin) return conMinutos(cursor, tr.iniMin).toISOString()
      return cursor.toISOString()
    }
    cursor = siguienteApertura(cursor, grupo)
  }
  return cursor.toISOString()
}

// Avanza `minutos` de tiempo PRODUCTIVO desde `inicioISO`, saltando el almuerzo
// del grupo, limpieza, fines de turno y fines de semana. Devuelve el ISO final.
export function sumarMinutosLaborables(inicioISO: string, minutos: number, grupo: GrupoAlmuerzo = GRUPO_ALMUERZO_DEFAULT): string {
  let cursor = new Date(proximoInstanteLaborable(inicioISO, grupo))
  let restante = Math.max(0, minutos)
  let guard = 0
  while (restante > 0 && guard++ < 4000) {
    const curMin = minDelDia(cursor)
    const tramos = tramosLaborables(cursor, grupo)
    const tr = tramos.find((t) => curMin < t.finMin)
    if (!tr) { cursor = siguienteApertura(cursor, grupo); continue }
    if (curMin < tr.iniMin) cursor = conMinutos(cursor, tr.iniMin)
    const ini = minDelDia(cursor)
    const disponible = tr.finMin - ini
    if (disponible >= restante) {
      cursor = conMinutos(cursor, ini + restante)
      restante = 0
    } else {
      restante -= disponible
      const sig = tramos.find((t) => t.iniMin >= tr.finMin)
      cursor = sig ? conMinutos(cursor, sig.iniMin) : siguienteApertura(cursor, grupo)
    }
  }
  return cursor.toISOString()
}

// Minutos de tiempo PRODUCTIVO entre dos instantes (descuenta almuerzo, limpieza,
// fuera de turno y fines de semana). Base para Disponibilidad real del OEE.
// Algoritmo: avanza tramo-por-tramo (no minuto a minuto), saltando de tramo
// productivo al siguiente y de dia laborable al siguiente -> liviano aunque la
// tarea dure varios dias (cota de iteraciones por guarda).
export function minutosLaborablesEntre(
  aIso?: string,
  bIso?: string,
  grupo: GrupoAlmuerzo = GRUPO_ALMUERZO_DEFAULT,
  conRecuperacion = true,
): number {
  if (!aIso || !bIso) return 0
  const a = new Date(aIso)
  const b = new Date(bIso)
  if (b <= a) return 0
  let cursor = new Date(a)
  let total = 0
  let guard = 0
  while (cursor < b && guard++ < 8000) {
    const curMin = minDelDia(cursor)
    const tramos = tramosLaborables(cursor, grupo, conRecuperacion)
    const tr = tramos.find((t) => curMin < t.finMin)
    if (!tr) { cursor = siguienteApertura(cursor, grupo, conRecuperacion); continue }
    const inicioTramo = curMin < tr.iniMin ? conMinutos(cursor, tr.iniMin) : new Date(cursor)
    const finTramo = conMinutos(cursor, tr.finMin)
    const hasta = finTramo < b ? finTramo : b
    if (hasta > inicioTramo) total += (hasta.getTime() - inicioTramo.getTime()) / 60000
    const sig = tramos.find((t) => t.iniMin >= tr.finMin)
    cursor = sig ? conMinutos(cursor, sig.iniMin) : siguienteApertura(cursor, grupo, conRecuperacion)
  }
  return Math.round(total)
}

// ============================================================
// TIEMPO NETO PRODUCTIVO de una tarea (corrige el bug de restar timestamps
// crudos). Descuenta: fines de semana, franja nocturna (cierre -> 07:00), y los
// 30 min del almuerzo del grupo. La franja de recuperacion (16-17 / 15-16) se
// cuenta SOLO si la tarea la tiene habilitada (horaRecuperacion = true).
// ============================================================
export interface ConfigTiempoNeto {
  grupo?: GrupoAlmuerzo          // turno de almuerzo del sector (default A)
  horaRecuperacion?: boolean     // tarea habilitada para trabajar 16-17 / 15-16
}

export function calcularTiempoNetoProductivo(
  inicio: Date,
  fin: Date,
  config: ConfigTiempoNeto = {},
): number {
  const grupo = config.grupo ?? GRUPO_ALMUERZO_DEFAULT
  const conRecup = config.horaRecuperacion ?? false // por defecto, cierre estricto
  return minutosLaborablesEntre(inicio.toISOString(), fin.toISOString(), grupo, conRecup)
}
