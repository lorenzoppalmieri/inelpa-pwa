import type { IndicadorSGO } from './indicadores'
import type { EventoSGO } from './types'

export const ID_DIAS_SIN_ACCIDENTES = 'sgo-global-dias-sin-accidentes'
export const ID_DIAS_SIN_INCIDENTES = 'sgo-global-dias-sin-incidentes'
export const IDS_CONTADORES_SEGURIDAD: ReadonlySet<string> = new Set([
  ID_DIAS_SIN_ACCIDENTES,
  ID_DIAS_SIN_INCIDENTES,
])

export type TipoContadorSeguridad = 'accidentes' | 'incidentes'

function inicioDia(valor: string | Date): Date {
  const d = valor instanceof Date ? new Date(valor) : new Date(valor)
  d.setHours(0, 0, 0, 0)
  return d
}

function diferenciaDias(desde: Date, hasta = inicioDia(new Date())): number {
  return Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 86_400_000))
}

export function reiniciaContadorSeguridad(evento: EventoSGO, tipo: TipoContadorSeguridad): boolean {
  if (tipo === 'incidentes') {
    // Criterio ISO 45001: un accidente también es un incidente y los cuasi
    // accidentes integran el indicador preventivo de incidentes.
    return evento.tipo === 'incidente_seguridad' || evento.tipo === 'cuasi_accidente'
  }
  if (evento.tipo !== 'incidente_seguridad') return false

  // Conserva la compatibilidad del contador existente: los registros históricos
  // sin resultado cargado continúan considerándose accidentes.
  return evento.seguridad?.resultadoPersona !== 'sin_lesion'
}

export function estadoContadorSeguridad(
  eventos: EventoSGO[],
  ajuste: IndicadorSGO | undefined,
  tipo: TipoContadorSeguridad,
  hoy = new Date(),
) {
  const ultimoEvento = eventos
    .filter((evento) => reiniciaContadorSeguridad(evento, tipo))
    .sort((a, b) => (b.seguridad?.fechaHoraHecho ?? b.detectadoEn).localeCompare(a.seguridad?.fechaHoraHecho ?? a.detectadoEn))[0]
  const fechaEvento = ultimoEvento ? (ultimoEvento.seguridad?.fechaHoraHecho ?? ultimoEvento.detectadoEn) : undefined
  const eventoPosteriorAlAjuste = ultimoEvento && fechaEvento && (!ajuste || new Date(fechaEvento).getTime() > new Date(ajuste.actualizadoEn).getTime())

  if (eventoPosteriorAlAjuste) {
    return { dias: diferenciaDias(inicioDia(fechaEvento), inicioDia(hoy)), referencia: fechaEvento, motivo: `Reiniciado por ${ultimoEvento.codigo}` }
  }
  if (ajuste) {
    return {
      dias: Math.max(0, Math.trunc(ajuste.valorActual ?? 0)) + diferenciaDias(inicioDia(ajuste.actualizadoEn), inicioDia(hoy)),
      referencia: ajuste.actualizadoEn,
      motivo: `Ajustado por ${ajuste.actualizadoPor}`,
    }
  }
  if (ultimoEvento) {
    return { dias: diferenciaDias(inicioDia(fechaEvento!), inicioDia(hoy)), referencia: fechaEvento, motivo: `Reiniciado por ${ultimoEvento.codigo}` }
  }
  return { dias: 0, referencia: undefined, motivo: 'Valor inicial pendiente de configurar' }
}
