export type AsignadoTareaSGO = 'azul' | 'nicolas.sgo' | 'lara'
export type ImportanciaTareaSGO = 'baja' | 'media' | 'alta' | 'critica'
export type EstadoTareaSGO = 'asignada' | 'tomada' | 'en_proceso' | 'finalizada' | 'verificada' | 'cancelada'
export type TipoComentarioTareaSGO = 'comentario' | 'plan' | 'conclusion' | 'verificacion'
export type EscalaTiempoTareaSGO = 'horas' | 'dias' | 'semanas'

export const MINUTOS_POR_ESCALA_TAREA_SGO: Record<EscalaTiempoTareaSGO, number> = {
  horas: 60,
  dias: 9 * 60,
  semanas: 5 * 9 * 60,
}

export interface ComentarioTareaSGO {
  id: string
  tareaId: string
  autor: string
  texto: string
  tipo: TipoComentarioTareaSGO
  creadoEn: string
}

export interface TareaSGO {
  id: string
  titulo: string
  objetivo: string
  descripcion: string
  asignadoA: AsignadoTareaSGO
  importancia: ImportanciaTareaSGO
  tiempoEstimadoMin: number
  fechaLimite?: string
  estado: EstadoTareaSGO
  planResolucion?: string
  tomadaEn?: string
  tomadaPor?: string
  conclusion?: string
  finalizadaEn?: string
  finalizadaPor?: string
  verificadaEn?: string
  verificadaPor?: string
  creadoEn: string
  creadoPor: string
  actualizadoEn: string
  actualizadoPor: string
}

export const RESPONSABLES_TAREA_SGO: { id: AsignadoTareaSGO; label: string }[] = [
  { id: 'azul', label: 'Azul' }, { id: 'nicolas.sgo', label: 'Nicolás' }, { id: 'lara', label: 'Lara' },
]

export const ESTADOS_TAREA_SGO: { id: EstadoTareaSGO; label: string }[] = [
  { id: 'asignada', label: 'Asignada' }, { id: 'tomada', label: 'Tomada' }, { id: 'en_proceso', label: 'En proceso' },
  { id: 'finalizada', label: 'Finalizada' }, { id: 'verificada', label: 'Verificada' }, { id: 'cancelada', label: 'Cancelada' },
]

export function etiquetaResponsableTareaSGO(id: string): string {
  return RESPONSABLES_TAREA_SGO.find((r) => r.id === id)?.label ?? id
}

export function usuarioPuedeTrabajarTareaSGO(usuario: string, tarea: TareaSGO): boolean {
  const u = usuario.trim().toLowerCase()
  return u === 'lorenzo' || u === tarea.asignadoA
}

export function tareaSGOVencida(tarea: TareaSGO, hoy: string): boolean {
  return !!tarea.fechaLimite && !['finalizada', 'verificada', 'cancelada'].includes(tarea.estado) && tarea.fechaLimite < hoy
}

export function tiempoTareaSGOEnMinutos(cantidad: number, escala: EscalaTiempoTareaSGO): number {
  return Math.max(1, Math.round(cantidad * MINUTOS_POR_ESCALA_TAREA_SGO[escala]))
}

export function tiempoTareaSGOLabel(minutos: number): string {
  const escalas: { id: EscalaTiempoTareaSGO; singular: string; plural: string }[] = [
    { id: 'semanas', singular: 'semana', plural: 'semanas' },
    { id: 'dias', singular: 'día', plural: 'días' },
    { id: 'horas', singular: 'hora', plural: 'horas' },
  ]
  const elegida = escalas.find((e) => minutos >= MINUTOS_POR_ESCALA_TAREA_SGO[e.id]) ?? escalas[2]
  const valor = Math.round(minutos / MINUTOS_POR_ESCALA_TAREA_SGO[elegida.id] * 10) / 10
  return `${valor.toLocaleString('es-AR')} ${valor === 1 ? elegida.singular : elegida.plural}`
}
