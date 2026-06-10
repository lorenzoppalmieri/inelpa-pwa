// Utilidades de tiempo (sin dependencias pesadas).

// Semana ISO en formato "YYYY-Www" (ej "2026-W24").
export function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function hhmm(iso?: string): string {
  if (!iso) return '--:--'
  const d = new Date(iso)
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export function fechaCorta(iso?: string): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// Diferencia en minutos entre dos timestamps ISO.
export function minutosEntre(aIso?: string, bIso?: string): number {
  if (!aIso || !bIso) return 0
  return Math.max(0, Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000))
}

// Duracion legible a partir de minutos.
export function fmtDur(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

// Cronometro vivo desde un inicio ISO hasta ahora (mm:ss / hh:mm:ss).
export function cronometro(inicioIso: string, ahora: number): string {
  const s = Math.max(0, Math.floor((ahora - new Date(inicioIso).getTime()) / 1000))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return hh > 0 ? `${p(hh)}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`
}
