export type NormaAgendaISO = 'iso_9001' | 'iso_45001' | 'iso_14001' | 'sgi'
export type CategoriaAgendaISO = 'auditoria_externa' | 'auditoria_interna' | 'informe' | 'legal_hys' | 'medicion' | 'reunion' | 'otro'
export type EstadoAgendaISO = 'sin_programar' | 'planificada' | 'en_curso' | 'esperando_tercero' | 'esperando_evidencia' | 'completada' | 'verificada' | 'reprogramada' | 'no_aplica'
export type FrecuenciaAgendaISO = 'unica' | 'mensual' | 'trimestral' | 'semestral' | 'anual'
export type CriticidadAgendaISO = 'baja' | 'media' | 'alta' | 'critica'

/** Bloques de la planilla R.I.T 6.2/05, en el orden en que estan en papel. */
export type BloqueAgendaISO = 'generales' | 'legal_hys' | 'mediciones'
export const BLOQUES_AGENDA_ISO: { id: BloqueAgendaISO; label: string }[] = [
  { id: 'generales', label: 'GENERALES' },
  { id: 'legal_hys', label: 'ACTUALIZACIÓN DE DOCUMENTACIÓN LEGAL HYS' },
  { id: 'mediciones', label: 'MEDICIONES' },
]

/**
 * v1.84 — UNA SEMANA MARCADA DE LA AGENDA.
 *
 * En la planilla real la marca es el CASILLERO PINTADO (el texto de la celda no
 * significa nada; se verifico con Lorenzo). Una misma actividad ocupa VARIAS
 * semanas —una auditoria se hace en dias distintos— y ademas se reprograma
 * seguido, sobre todo Azul. Por eso no alcanza con `fechaObjetivo` (una sola
 * fecha): hace falta una lista de semanas por año.
 *
 * `semana` es la semana DEL MES (1 a 5), como en el papel, no la semana ISO del
 * año: la planilla se lee por mes y el equipo razona asi.
 */
export interface MarcaSemanaISO {
  anio: number
  mes: number      // 1-12
  semana: number   // 1-5 (semana dentro del mes)
  hecha?: boolean  // true cuando ya se ejecuto esa instancia
}

export interface ActividadAgendaISO {
  id: string
  titulo: string
  categoria: CategoriaAgendaISO
  /** Bloque de la planilla. Si falta, se deduce de la categoria. */
  bloque?: BloqueAgendaISO
  /** Orden de la fila dentro de su bloque (para respetar el papel). */
  orden?: number
  normas: NormaAgendaISO[]
  requisito?: string
  area?: string
  responsable: string
  frecuencia: FrecuenciaAgendaISO
  /** v1.84: semanas programadas. Reemplaza a fechaObjetivo como fuente. */
  semanas?: MarcaSemanaISO[]
  /** Legacy: fecha unica. Se conserva para no romper lo ya cargado. */
  fechaObjetivo?: string
  avisoDias: number
  estado: EstadoAgendaISO
  criticidad: CriticidadAgendaISO
  evidenciaEsperada?: string
  evidencia?: string
  resultado?: string
  observaciones?: string
  fuente?: string
  completadaEn?: string
  completadaPor?: string
  verificadaEn?: string
  verificadaPor?: string
  verificacion?: string
  creadoEn: string
  creadoPor: string
  actualizadoEn: string
  actualizadoPor: string
}

export const NORMAS_AGENDA_ISO: { id: NormaAgendaISO; label: string; color: string }[] = [
  { id: 'iso_9001', label: 'ISO 9001', color: '#2563eb' },
  { id: 'iso_45001', label: 'ISO 45001', color: '#dc2626' },
  { id: 'iso_14001', label: 'ISO 14001', color: '#16a34a' },
  { id: 'sgi', label: 'SGI', color: '#7c3aed' },
]

export const CATEGORIAS_AGENDA_ISO: { id: CategoriaAgendaISO; label: string }[] = [
  { id: 'auditoria_externa', label: 'Auditoría externa' }, { id: 'auditoria_interna', label: 'Auditoría interna' },
  { id: 'informe', label: 'Informe' }, { id: 'legal_hys', label: 'Documentación legal HyS' },
  { id: 'medicion', label: 'Medición' }, { id: 'reunion', label: 'Reunión' }, { id: 'otro', label: 'Otra' },
]

export const ESTADOS_AGENDA_ISO: { id: EstadoAgendaISO; label: string }[] = [
  { id: 'sin_programar', label: 'Sin programar' }, { id: 'planificada', label: 'Planificada' },
  { id: 'en_curso', label: 'En curso' }, { id: 'esperando_tercero', label: 'Esperando tercero' },
  { id: 'esperando_evidencia', label: 'Esperando evidencia' }, { id: 'completada', label: 'Completada' },
  { id: 'verificada', label: 'Verificada' }, { id: 'reprogramada', label: 'Reprogramada' }, { id: 'no_aplica', label: 'No aplica' },
]

export function agendaISOEsCerrada(a: ActividadAgendaISO): boolean {
  return ['verificada', 'no_aplica'].includes(a.estado)
}

export function agendaISOEstaVencida(a: ActividadAgendaISO, hoy: string): boolean {
  return !!a.fechaObjetivo && !agendaISOEsCerrada(a) && a.fechaObjetivo < hoy
}

export function agendaISOProxima(a: ActividadAgendaISO, hoy: string, hasta: string): boolean {
  return !!a.fechaObjetivo && !agendaISOEsCerrada(a) && a.fechaObjetivo >= hoy && a.fechaObjetivo <= hasta
}

export function puedeGestionarAgendaISO(usuario: string): boolean {
  return ['lorenzo', 'azul'].includes(usuario.trim().toLowerCase())
}

// ============================================================
// v1.84 — SEMANAS DE LA AGENDA (matriz año x mes x semana)
// ============================================================

/** Bloque de una actividad: el explicito, o deducido de la categoria. */
export function bloqueDe(a: ActividadAgendaISO): BloqueAgendaISO {
  if (a.bloque) return a.bloque
  if (a.categoria === 'legal_hys') return 'legal_hys'
  if (a.categoria === 'medicion') return 'mediciones'
  return 'generales'
}

/** Clave estable de una celda de la matriz. */
export function claveSemana(m: { anio: number; mes: number; semana: number }): string {
  return `${m.anio}-${String(m.mes).padStart(2, '0')}-${m.semana}`
}

export function marcaDe(a: ActividadAgendaISO, anio: number, mes: number, semana: number): MarcaSemanaISO | undefined {
  return (a.semanas ?? []).find((s) => s.anio === anio && s.mes === mes && s.semana === semana)
}

/**
 * Un click cicla la celda:  vacia -> programada -> hecha -> vacia.
 * Es el gesto principal de la pantalla: Azul reprograma y marca sin abrir nada.
 * Devuelve el arreglo nuevo (funcion pura, no muta).
 */
export function ciclarSemana(
  semanas: MarcaSemanaISO[] | undefined, anio: number, mes: number, semana: number,
): MarcaSemanaISO[] {
  const base = semanas ?? []
  const i = base.findIndex((s) => s.anio === anio && s.mes === mes && s.semana === semana)
  if (i === -1) return [...base, { anio, mes, semana, hecha: false }]
  if (!base[i].hecha) return base.map((s, k) => (k === i ? { ...s, hecha: true } : s))
  return base.filter((_, k) => k !== i)
}

/** Semanas de un año, ordenadas cronologicamente. */
export function semanasDelAnio(a: ActividadAgendaISO, anio: number): MarcaSemanaISO[] {
  return (a.semanas ?? []).filter((s) => s.anio === anio)
    .sort((x, y) => (x.mes - y.mes) || (x.semana - y.semana))
}

/**
 * Fecha aproximada del LUNES de una semana del mes. La planilla razona por
 * "1ª/2ª semana de marzo", no por fecha exacta; para calcular proximidad hace
 * falta bajarlo a un dia y este es el criterio: dia 1 + (semana-1)*7.
 */
export function fechaDeSemana(m: { anio: number; mes: number; semana: number }): string {
  const dia = Math.min(28, 1 + (m.semana - 1) * 7)
  return `${m.anio}-${String(m.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/**
 * Dias de aviso segun criticidad (decision de Lorenzo: el umbral sale de la
 * criticidad, no se carga a mano). `avisoDias` sigue mandando si viene cargado.
 */
export const AVISO_POR_CRITICIDAD: Record<CriticidadAgendaISO, number> = {
  critica: 45, alta: 30, media: 15, baja: 7,
}
export function diasDeAviso(a: ActividadAgendaISO): number {
  return a.avisoDias && a.avisoDias > 0 ? a.avisoDias : AVISO_POR_CRITICIDAD[a.criticidad]
}

export interface ProximaAgendaISO {
  actividad: ActividadAgendaISO
  marca: MarcaSemanaISO
  fecha: string
  dias: number        // dias hasta la fecha (negativo = ya paso)
}

/**
 * Instancias que entran en zona de aviso o que ya pasaron sin marcarse hechas.
 * Solo mira semanas NO hechas: una vez marcada, deja de reclamar.
 */
export function proximasAgendaISO(
  actividades: ActividadAgendaISO[], hoyISO: string,
): ProximaAgendaISO[] {
  const hoy = new Date(hoyISO + 'T00:00:00')
  const out: ProximaAgendaISO[] = []
  for (const a of actividades) {
    if (agendaISOEsCerrada(a)) continue
    for (const m of a.semanas ?? []) {
      if (m.hecha) continue
      const fecha = fechaDeSemana(m)
      const dias = Math.round((new Date(fecha + 'T00:00:00').getTime() - hoy.getTime()) / 86400000)
      if (dias <= diasDeAviso(a)) out.push({ actividad: a, marca: m, fecha, dias })
    }
  }
  return out.sort((x, y) => x.dias - y.dias)
}

/** Cuantas actividades caen en cada mes de un año. Alimenta el grafico de carga. */
export function cargaPorMes(actividades: ActividadAgendaISO[], anio: number): number[] {
  const out = new Array(12).fill(0) as number[]
  for (const a of actividades) {
    for (const m of a.semanas ?? []) {
      if (m.anio === anio && m.mes >= 1 && m.mes <= 12) out[m.mes - 1] += 1
    }
  }
  return out
}

/** Años presentes en la agenda (para el selector). Siempre incluye el actual. */
export function aniosDeAgenda(actividades: ActividadAgendaISO[], anioActual: number): number[] {
  const s = new Set<number>([anioActual])
  for (const a of actividades) for (const m of a.semanas ?? []) s.add(m.anio)
  return [...s].sort((x, y) => y - x)
}
