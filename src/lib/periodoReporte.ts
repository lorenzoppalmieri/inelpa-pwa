// ============================================================
// PERÍODO DE LOS REPORTES DE LOGÍSTICA / DESPACHO (v1.32).
// Filtro común: Mes actual · Mes anterior · Anual acumulado. Además devuelve el
// rango PREVIO equivalente (mes/año anterior) para las variaciones "vs anterior".
// ============================================================
export type PeriodoReporte = 'mes_actual' | 'mes_anterior' | 'anual' | 'todas'

// Opciones de los TABLEROS (comparan contra el período anterior, así que no
// incluyen 'todas': "el anterior a todo" no significa nada).
export const PERIODOS_REPORTE: { id: PeriodoReporte; label: string }[] = [
  { id: 'mes_actual', label: 'Mes actual' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'anual', label: 'Anual acumulado' },
]

// v1.43: opciones de los HISTORIALES (listas de finalizadas / despachadas), que
// sí admiten ver todo el archivo histórico.
export const PERIODOS_HISTORIAL: { id: PeriodoReporte; label: string }[] = [
  ...PERIODOS_REPORTE,
  { id: 'todas', label: 'Todas (histórico)' },
]

export interface RangoReporte { desde: string; hasta: string; desdePrev: string; hastaPrev: string; label: string }

const iso = (y: number, m: number, d: number) => new Date(y, m, d).toISOString()

export function rangoReporte(p: PeriodoReporte, now: Date = new Date()): RangoReporte {
  const y = now.getFullYear(), m = now.getMonth()
  if (p === 'todas') {
    // Rango abierto: cualquier fecha ISO cae dentro. Sin período previo con el
    // cual comparar, así que 'prev' queda vacío (los deltas dan 0).
    return { desde: '0000-01-01T00:00:00.000Z', hasta: '9999-12-31T23:59:59.999Z', desdePrev: '', hastaPrev: '', label: 'Histórico completo' }
  }
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
