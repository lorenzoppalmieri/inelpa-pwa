// ============================================================
// PERÍODO DE LOS REPORTES DE LOGÍSTICA / DESPACHO (v1.32).
// Filtro común: Mes actual · Mes anterior · Anual acumulado. Además devuelve el
// rango PREVIO equivalente (mes/año anterior) para las variaciones "vs anterior".
// ============================================================
export type PeriodoReporte = 'mes_actual' | 'mes_anterior' | 'anual'

export const PERIODOS_REPORTE: { id: PeriodoReporte; label: string }[] = [
  { id: 'mes_actual', label: 'Mes actual' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'anual', label: 'Anual acumulado' },
]

export interface RangoReporte { desde: string; hasta: string; desdePrev: string; hastaPrev: string; label: string }

const iso = (y: number, m: number, d: number) => new Date(y, m, d).toISOString()

export function rangoReporte(p: PeriodoReporte, now: Date = new Date()): RangoReporte {
  const y = now.getFullYear(), m = now.getMonth()
  if (p === 'anual') {
    return { desde: iso(y, 0, 1), hasta: iso(y + 1, 0, 1), desdePrev: iso(y - 1, 0, 1), hastaPrev: iso(y, 0, 1), label: `Año ${y}` }
  }
  const mm = p === 'mes_anterior' ? m - 1 : m
  const nombreMes = new Date(y, mm, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return { desde: iso(y, mm, 1), hasta: iso(y, mm + 1, 1), desdePrev: iso(y, mm - 1, 1), hastaPrev: iso(y, mm, 1), label: nombreMes }
}

// ¿La fecha de referencia (ISO) cae dentro de [desde, hasta)?
export function enRango(refISO: string | undefined, desde: string, hasta: string): boolean {
  return !!refISO && refISO >= desde && refISO < hasta
}
