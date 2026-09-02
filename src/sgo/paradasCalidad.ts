import { CAUSAS_PARADA, esCausaRetrabajo, type Parada } from '../types'
import type { EventoSGO } from './types'
import { esEventoRetrabajo, minutosDeParada } from './retrabajos'

export type EstadoRevisionParadaCalidad = 'pendiente' | 'investigando' | 'descartada'

export function esParadaDeCalidad(parada: Pick<Parada, 'causa'>): boolean {
  return CAUSAS_PARADA.find((causa) => causa.id === parada.causa)?.categoria === 'calidad'
}

export function esRetrabajoExplicito(parada: Pick<Parada, 'causa'>): boolean {
  return esCausaRetrabajo(parada.causa)
}

export function estadoRevisionParadaCalidad(parada: Parada, evento?: EventoSGO): EstadoRevisionParadaCalidad {
  if (parada.ncDescartada || evento?.retrabajo?.decisionCalidad === 'descartada') return 'descartada'
  if (evento && esEventoRetrabajo(evento)) return 'investigando'
  return 'pendiente'
}

export function duracionParadaCalidad(parada: Parada, finTarea?: string, ahoraISO = new Date().toISOString()): number {
  return Math.round(minutosDeParada(parada.inicio, parada.fin ?? finTarea ?? ahoraISO) ?? 0)
}

export function mesAnteriorISO(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number)
  if (!anio || !mes) return periodo
  const fecha = new Date(Date.UTC(anio, mes - 2, 1))
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`
}

export function variacionPorcentual(actual: number, anterior: number): number | undefined {
  if (anterior === 0) return actual === 0 ? 0 : undefined
  return Math.round(((actual - anterior) / anterior) * 100)
}

export function nivelRecurrencia(ocurrencias: number, minutos: number): 'normal' | 'atencion' | 'prioritaria' {
  if (ocurrencias >= 3 || minutos >= 60) return 'prioritaria'
  if (ocurrencias >= 2 || minutos >= 30) return 'atencion'
  return 'normal'
}
