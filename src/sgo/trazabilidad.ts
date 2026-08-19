import { SECTORES, type Maquina, type Tarea, type Usuario } from '../types'
import { areaSGOLabel, type EventoSGO } from './types'

export interface TrazabilidadProductivaSGO {
  aplica: boolean
  sector: string
  maquina: string
  operario: string
  ocurridoEn: string
  registradoPor: string
}

export function resolverTrazabilidadProductiva(
  evento: EventoSGO,
  tareas: Tarea[],
  maquinas: Maquina[],
  usuarios: Usuario[],
): TrazabilidadProductivaSGO {
  const tarea = evento.tareaId ? tareas.find((item) => item.id === evento.tareaId) : undefined
  const sectorId = evento.sectorId ?? tarea?.sectorId
  const maquinaId = evento.maquinaId ?? tarea?.maquinaId
  const operarioId = evento.retrabajo?.operarioId ?? tarea?.operarioId
  const sectorCatalogo = sectorId ? SECTORES.find((item) => item.id === sectorId) : undefined
  const maquinaCatalogo = maquinaId ? maquinas.find((item) => item.id === maquinaId) : undefined
  const operarioCatalogo = operarioId ? usuarios.find((item) => item.id === operarioId) : undefined
  const aplica = Boolean(
    tarea || sectorId || maquinaId || evento.retrabajo?.origen === 'parada_calidad' || evento.retrabajo?.origen === 'defecto_final',
  )

  return {
    aplica,
    sector: evento.retrabajo?.sectorNombre ?? sectorCatalogo?.nombre ?? areaSGOLabel(evento.areaOrigenId ?? evento.areaId),
    maquina: evento.retrabajo?.maquinaNombre ?? maquinaCatalogo?.nombre ?? maquinaId ?? 'No identificada',
    operario: evento.retrabajo?.operarioNombre ?? operarioCatalogo?.nombre ?? (operarioId ? `ID ${operarioId}` : 'No identificado'),
    ocurridoEn: evento.detectadoEn,
    registradoPor: evento.detectadoPor,
  }
}
