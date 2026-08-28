import type { EjecucionControlSGO } from './controles'
import {
  AREAS_5S_POR_AUDITOR, calcularPorcentajePremiableCampo, calcularPorPilarCampo, itemsDeAuditoriaCampo,
} from './controlesCampo'
import type { AreaSGOId } from './types'

export interface ResumenMensualArea5S {
  areaId: AreaSGOId
  auditorias: number
  promedioFisico: number
  promedioPremiable: number
  promedioSeguridad: number
  promedioAmbiente: number
}

export interface ComparativoMensualArea5S {
  areaId: AreaSGOId
  actual?: ResumenMensualArea5S
  anterior?: ResumenMensualArea5S
  variacionFisico?: number
  variacionPremiable?: number
}

export const AREAS_PROGRAMADAS_5S = [...new Set(Object.values(AREAS_5S_POR_AUDITOR).flat())] as AreaSGOId[]

const redondear1 = (valor: number) => Math.round(valor * 10) / 10
const promedio = (valores: number[]) => redondear1(valores.reduce((total, valor) => total + valor, 0) / valores.length)

export function periodoAnterior5S(periodo: string): string {
  const [anio, mes] = periodo.split('-').map(Number)
  const fecha = new Date(anio, mes - 2, 1, 12)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

export function resumirMes5S(ejecuciones: EjecucionControlSGO[], periodo: string): ResumenMensualArea5S[] {
  const porArea = new Map<AreaSGOId, Array<{
    fisico: number
    premiable: number
    seguridad: number
    ambiente: number
  }>>()

  for (const ejecucion of ejecuciones) {
    const auditoria = ejecucion.auditoriaCampo
    if (!auditoria || (auditoria.finalizadaEn || ejecucion.ejecutadoEn).slice(0, 7) !== periodo) continue
    const items = itemsDeAuditoriaCampo(auditoria)
    const valores = porArea.get(auditoria.areaId) ?? []
    valores.push({
      fisico: auditoria.porcentajeCumplimiento,
      premiable: calcularPorcentajePremiableCampo(auditoria, items),
      seguridad: auditoria.porcentajePorPilar?.seguridad ?? calcularPorPilarCampo(auditoria.respuestas, 'seguridad', items),
      ambiente: auditoria.porcentajePorPilar?.ambiente ?? calcularPorPilarCampo(auditoria.respuestas, 'ambiente', items),
    })
    porArea.set(auditoria.areaId, valores)
  }

  return [...porArea.entries()].map(([areaId, valores]) => ({
    areaId,
    auditorias: valores.length,
    promedioFisico: promedio(valores.map((valor) => valor.fisico)),
    promedioPremiable: promedio(valores.map((valor) => valor.premiable)),
    promedioSeguridad: promedio(valores.map((valor) => valor.seguridad)),
    promedioAmbiente: promedio(valores.map((valor) => valor.ambiente)),
  }))
}

export function compararMeses5S(
  ejecuciones: EjecucionControlSGO[], periodo: string, areas: AreaSGOId[] = AREAS_PROGRAMADAS_5S,
): ComparativoMensualArea5S[] {
  const actual = new Map(resumirMes5S(ejecuciones, periodo).map((resumen) => [resumen.areaId, resumen]))
  const anterior = new Map(resumirMes5S(ejecuciones, periodoAnterior5S(periodo)).map((resumen) => [resumen.areaId, resumen]))
  return areas.map((areaId) => {
    const mesActual = actual.get(areaId)
    const mesAnterior = anterior.get(areaId)
    return {
      areaId,
      actual: mesActual,
      anterior: mesAnterior,
      variacionFisico: mesActual && mesAnterior ? redondear1(mesActual.promedioFisico - mesAnterior.promedioFisico) : undefined,
      variacionPremiable: mesActual && mesAnterior ? redondear1(mesActual.promedioPremiable - mesAnterior.promedioPremiable) : undefined,
    }
  })
}

/** El resultado general da el mismo peso a cada área auditada, sin favorecer a las que tuvieron más controles. */
export function promedioGeneralAreas5S(
  resumenes: ResumenMensualArea5S[], campo: 'promedioFisico' | 'promedioPremiable',
): number | undefined {
  return resumenes.length ? promedio(resumenes.map((resumen) => resumen[campo])) : undefined
}
