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
//   - Almuerzo 12:00 - 13:00 (banda comun; los turnos escalonados de 30 min
//     caen dentro de esta franja).
//
// Todas las funciones trabajan en hora LOCAL del navegador (la tablet de planta).

export interface Tramo { iniMin: number; finMin: number } // minutos desde 00:00 del dia

const APERTURA_MIN = 7 * 60       // 07:00
const LIMPIEZA_MIN = 15           // ultimos 15 min sin produccion
const ALM_INI = 12 * 60           // 12:00
const ALM_FIN = 13 * 60           // 13:00

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
//   1) Manana:       apertura -> almuerzo (07:00-12:00)
//   2) Tarde:        fin almuerzo -> inicio limpieza (cierre normal - 15 min)
//   3) Recuperacion: cierre normal -> cierre con recuperacion (productivo estandar)
// La limpieza (cierre normal - 15 min .. cierre normal) queda como hueco entre 2 y 3.
export function tramosLaborables(fecha: Date): Tramo[] {
  const normal = cierreNormalMin(fecha.getDay())
  const recup = cierreRecupMin(fecha.getDay())
  if (normal == null || recup == null) return []
  const iniLimpieza = normal - LIMPIEZA_MIN
  const tramos: Tramo[] = []
  if (APERTURA_MIN < ALM_INI) tramos.push({ iniMin: APERTURA_MIN, finMin: ALM_INI })
  if (ALM_FIN < iniLimpieza) tramos.push({ iniMin: ALM_FIN, finMin: iniLimpieza })
  if (normal < recup) tramos.push({ iniMin: normal, finMin: recup })
  return tramos.filter((t) => t.finMin > t.iniMin)
}

// Minutos productivos totales de un dia (para grilla / capacidad).
export function minutosProductivosDia(fecha: Date): number {
  return tramosLaborables(fecha).reduce((s, t) => s + (t.finMin - t.iniMin), 0)
}

// Primer instante productivo del proximo dia laborable posterior a `d`.
function siguienteApertura(d: Date): Date {
  const n = new Date(d)
  n.setDate(n.getDate() + 1)
  n.setHours(0, 0, 0, 0)
  for (let i = 0; i < 14; i++) {
    if (tramosLaborables(n).length > 0) return conMinutos(n, APERTURA_MIN)
    n.setDate(n.getDate() + 1)
  }
  return conMinutos(n, APERTURA_MIN)
}

// Lleva un instante cualquiera al proximo instante productivo (>= al dado).
// Si ya esta dentro de un tramo, lo devuelve tal cual.
export function proximoInstanteLaborable(iso: string): string {
  let cursor = new Date(iso)
  let guard = 0
  while (guard++ < 4000) {
    const curMin = minDelDia(cursor)
    const tr = tramosLaborables(cursor).find((t) => curMin < t.finMin)
    if (tr) {
      if (curMin < tr.iniMin) return conMinutos(cursor, tr.iniMin).toISOString()
      return cursor.toISOString()
    }
    cursor = siguienteApertura(cursor)
  }
  return cursor.toISOString()
}

// Avanza `minutos` de tiempo PRODUCTIVO desde `inicioISO`, saltando almuerzo,
// limpieza, fines de turno y fines de semana. Devuelve el ISO del instante final.
export function sumarMinutosLaborables(inicioISO: string, minutos: number): string {
  let cursor = new Date(proximoInstanteLaborable(inicioISO))
  let restante = Math.max(0, minutos)
  let guard = 0
  while (restante > 0 && guard++ < 4000) {
    const curMin = minDelDia(cursor)
    const tramos = tramosLaborables(cursor)
    const tr = tramos.find((t) => curMin < t.finMin)
    if (!tr) { cursor = siguienteApertura(cursor); continue }
    if (curMin < tr.iniMin) cursor = conMinutos(cursor, tr.iniMin)
    const ini = minDelDia(cursor)
    const disponible = tr.finMin - ini
    if (disponible >= restante) {
      cursor = conMinutos(cursor, ini + restante)
      restante = 0
    } else {
      restante -= disponible
      const sig = tramos.find((t) => t.iniMin >= tr.finMin)
      cursor = sig ? conMinutos(cursor, sig.iniMin) : siguienteApertura(cursor)
    }
  }
  return cursor.toISOString()
}

// Minutos de tiempo PRODUCTIVO entre dos instantes (descuenta almuerzo, limpieza,
// fuera de turno y fines de semana). Base para Disponibilidad real del OEE.
export function minutosLaborablesEntre(aIso?: string, bIso?: string): number {
  if (!aIso || !bIso) return 0
  const a = new Date(aIso)
  const b = new Date(bIso)
  if (b <= a) return 0
  let cursor = new Date(a)
  let total = 0
  let guard = 0
  while (cursor < b && guard++ < 8000) {
    const curMin = minDelDia(cursor)
    const tramos = tramosLaborables(cursor)
    const tr = tramos.find((t) => curMin < t.finMin)
    if (!tr) { cursor = siguienteApertura(cursor); continue }
    const inicioTramo = curMin < tr.iniMin ? conMinutos(cursor, tr.iniMin) : new Date(cursor)
    const finTramo = conMinutos(cursor, tr.finMin)
    const hasta = finTramo < b ? finTramo : b
    if (hasta > inicioTramo) total += (hasta.getTime() - inicioTramo.getTime()) / 60000
    const sig = tramos.find((t) => t.iniMin >= tr.finMin)
    cursor = sig ? conMinutos(cursor, sig.iniMin) : siguienteApertura(cursor)
  }
  return Math.round(total)
}
