import type { AreaSGOId } from './types'

export interface DefectoSGO {
  codigo: string
  label: string
  categoria: string
  areas?: AreaSGOId[]
}

export const DEFECTOS_SGO: DefectoSGO[] = [
  { codigo: 'BOB_ESPIRAS', label: 'Cantidad de espiras incorrecta', categoria: 'Bobinado', areas: ['bobinado_rural', 'bobinado_distribucion'] },
  { codigo: 'BOB_DIAMETRO', label: 'Diámetro fuera de tolerancia', categoria: 'Bobinado', areas: ['bobinado_rural', 'bobinado_distribucion'] },
  { codigo: 'BOB_AISLACION', label: 'Aislación incorrecta o dañada', categoria: 'Bobinado', areas: ['bobinado_rural', 'bobinado_distribucion'] },
  { codigo: 'BOB_CONDUCTOR', label: 'Conductor incorrecto o defectuoso', categoria: 'Bobinado', areas: ['bobinado_rural', 'bobinado_distribucion'] },
  { codigo: 'BOB_SALIDAS', label: 'Salidas mal posicionadas', categoria: 'Bobinado', areas: ['bobinado_rural', 'bobinado_distribucion'] },
  { codigo: 'BOB_DEFORMACION', label: 'Bobina deformada', categoria: 'Bobinado', areas: ['bobinado_rural', 'bobinado_distribucion'] },
  { codigo: 'MON_CONEXION', label: 'Conexión incorrecta', categoria: 'Montaje', areas: ['montaje_rural', 'montaje_distribucion'] },
  { codigo: 'MON_PERDIDA', label: 'Pérdida o falta de hermeticidad', categoria: 'Montaje', areas: ['montaje_rural', 'montaje_distribucion'] },
  { codigo: 'MON_COMPONENTE', label: 'Componente incorrecto, faltante o dañado', categoria: 'Montaje', areas: ['montaje_rural', 'montaje_distribucion'] },
  { codigo: 'HER_DIMENSION', label: 'Dimensión de cuba/tapa fuera de tolerancia', categoria: 'Herrería', areas: ['herreria_pintura'] },
  { codigo: 'HER_SOLDADURA', label: 'Defecto de soldadura', categoria: 'Herrería', areas: ['herreria_pintura'] },
  { codigo: 'PIN_ACABADO', label: 'Defecto de pintura o acabado', categoria: 'Pintura', areas: ['herreria_pintura'] },
  { codigo: 'LAM_DIMENSION', label: 'Dimensión o corte de laminado incorrecto', categoria: 'Laminado', areas: ['laminado'] },
  { codigo: 'LAB_VACIO', label: 'Pérdidas en vacío fuera de especificación', categoria: 'Laboratorio', areas: ['laboratorio'] },
  { codigo: 'LAB_CC', label: 'Pérdidas en cortocircuito fuera de especificación', categoria: 'Laboratorio', areas: ['laboratorio'] },
  { codigo: 'LAB_RELACION', label: 'Relación de transformación fuera de especificación', categoria: 'Laboratorio', areas: ['laboratorio'] },
  { codigo: 'LAB_RES_ARROLLAMIENTO', label: 'Resistencia de arrollamiento fuera de especificación', categoria: 'Laboratorio', areas: ['laboratorio'] },
  { codigo: 'LAB_RES_AISLAMIENTO', label: 'Resistencia de aislamiento fuera de especificación', categoria: 'Laboratorio', areas: ['laboratorio'] },
  { codigo: 'LAB_TENSION_APLICADA', label: 'Falla en tensión aplicada', categoria: 'Laboratorio', areas: ['laboratorio'] },
  { codigo: 'LAB_TENSION_INDUCIDA', label: 'Falla en tensión inducida', categoria: 'Laboratorio', areas: ['laboratorio'] },
  { codigo: 'LAB_CALENTAMIENTO', label: 'Falla en ensayo de calentamiento', categoria: 'Laboratorio', areas: ['laboratorio'] },
  { codigo: 'LOG_MATERIAL', label: 'Material incorrecto, faltante o entregado tarde', categoria: 'Logística', areas: ['logistica_operativa'] },
  { codigo: 'DOC_ERROR', label: 'Error de documentación o información', categoria: 'Gestión', areas: ['administracion', 'planificacion_produccion', 'diseno', 'it'] },
  { codigo: 'PLAN_ERROR', label: 'Error de planificación o programación', categoria: 'Planificación', areas: ['planificacion_produccion'] },
  { codigo: 'MANT_FALLA', label: 'Falla o intervención de mantenimiento', categoria: 'Mantenimiento', areas: ['mantenimiento', 'automatismo'] },
  { codigo: 'OTRO', label: 'Otro defecto / desvío', categoria: 'General' },
]

export function defectosParaArea(area?: AreaSGOId): DefectoSGO[] {
  if (!area) return DEFECTOS_SGO
  return DEFECTOS_SGO.filter((d) => !d.areas || d.areas.includes(area))
}

export function defectoSGOLabel(codigo?: string): string {
  return DEFECTOS_SGO.find((d) => d.codigo === codigo)?.label ?? codigo ?? 'Sin clasificar'
}

export const ENSAYO_A_DEFECTO: Record<string, string> = {
  perdidas_vacio: 'LAB_VACIO', perdida_cc: 'LAB_CC', relacion: 'LAB_RELACION',
  res_arrollamiento: 'LAB_RES_ARROLLAMIENTO', res_aislamiento: 'LAB_RES_AISLAMIENTO',
  tension_aplicada: 'LAB_TENSION_APLICADA', tension_inducida: 'LAB_TENSION_INDUCIDA',
  calentamiento: 'LAB_CALENTAMIENTO',
}
