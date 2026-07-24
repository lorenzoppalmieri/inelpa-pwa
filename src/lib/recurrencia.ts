import type { PlantillaRecurrente, TareaLogistica } from '../types'

// ============================================================
// MOTOR DE TAREAS RECURRENTES (v1.39) — anti-spam.
//
// No hay cron de backend fiable en esta PWA offline-first, así que las instancias
// se generan de forma PEREZOSA en el cliente (al abrir la vista de tareas). La
// regla clave para NO amontonar tareas a futuro en la tablet del operario:
//
//   - Solo se crea la instancia del DÍA ACTUAL (nunca días futuros).
//   - Solo si NO hay ya una instancia ABIERTA de esa plantilla (si la de ayer
//     quedó sin finalizar, no se apila la de hoy). La siguiente recién aparece
//     cuando la anterior se finalizó Y llega un día que la plantilla incluye.
//
// Dedup entre tablets: el id de la instancia es determinístico
// (`${plantillaId}_${YYYY-MM-DD}`). Si dos clientes la crean a la vez, es el
// mismo id → el upsert es idempotente (no se duplica).
// ============================================================

// 'YYYY-MM-DD' local de hoy.
export function hoyLocalISO(d = new Date()): string { return d.toLocaleDateString('en-CA') }

// getDay() de una fecha 'YYYY-MM-DD' interpretada en hora local (mediodía para
// evitar corrimientos por zona horaria).
export function dowDeFecha(fecha: string): number { return new Date(`${fecha}T12:00:00`).getDay() }

export function idInstancia(plantillaId: string, fecha: string): string {
  return `${plantillaId}_${fecha}`
}

// Devuelve las instancias que faltan crear HOY (una por plantilla como mucho).
// `tareas` = todas las TareaLogistica locales (para ver qué instancias ya existen
// y si hay alguna abierta por plantilla).
export function instanciasAGenerar(
  plantillas: PlantillaRecurrente[],
  tareas: TareaLogistica[],
  hoy = hoyLocalISO(),
): TareaLogistica[] {
  const dow = dowDeFecha(hoy)
  const ahora = new Date().toISOString()
  const out: TareaLogistica[] = []

  for (const p of plantillas) {
    if (!p.activa) continue
    if (!p.dias.includes(dow)) continue
    if (p.salteos?.includes(hoy)) continue // feriado / excepción marcada por Giuliano

    const instancias = tareas.filter((t) => t.plantillaId === p.id)
    const hayAbierta = instancias.some((t) => t.estado !== 'finalizada')
    const id = idInstancia(p.id, hoy)
    const hoyYaCreada = instancias.some((t) => t.id === id)
    if (hayAbierta || hoyYaCreada) continue

    const responsables = p.responsables ?? []
    out.push({
      id,
      origen: p.origen ?? 'logistica',
      titulo: p.titulo,
      detalle: p.detalle,
      responsable: responsables.join(', '),
      responsables: responsables.length ? responsables : undefined,
      prioridad: p.prioridad,
      fechaProgramada: hoy,
      estimadoMin: p.estimadoMin,
      estado: 'pendiente',
      creada: ahora,
      creadaPor: 'recurrencia',
      plantillaId: p.id,
      fechaInstancia: hoy,
    })
  }
  return out
}
