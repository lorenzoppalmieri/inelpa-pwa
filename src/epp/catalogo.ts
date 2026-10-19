// ============================================================
// EPP — ELEMENTOS DE PROTECCIÓN PERSONAL (v1.83)
//
// Reemplaza la planilla "R.I.T 7.1.2 06 Tickets de EPP.xlsx": una hoja por
// persona y por año, con un casillero por cada unidad que le corresponde. El de
// pañol tilda el casillero cuando entrega.
//
// Cómo funciona el cupo: cada puesto tiene su lista de EPP y cada EPP un tope
// ANUAL. Al agotarse, la entrega queda BLOQUEADA hasta que HyS autorice una
// reposición extraordinaria con su justificación (igual que la firma del
// controlador de HyS al pie de la planilla de papel).
//
// El catálogo vive en código, no en una tabla: lo define Higiene y Seguridad,
// cambia una o dos veces por año y así no depende de una migración.
// ============================================================

/** Un EPP dentro del catálogo de un puesto. */
export interface EppDefinicion {
  key: string            // id estable dentro del puesto
  nombre: string
  frecuencia: string     // texto de la planilla ("4 al año", "1 al mes"…)
  limite: number | null  // tope anual. null = sin tope ("Según uso")
}

/** Un puesto de trabajo con los EPP que le corresponden. */
export interface PuestoEpp {
  id: string
  nombre: string
  epps: EppDefinicion[]
}

// ARCHIVO GENERADO desde 'R.I.T 7.1.2 06 Tickets de EPP.xlsx' (v1.83).
// El cupo anual sale de la CANTIDAD DE CASILLEROS de cada fila de la planilla,
// que es como se controla en papel. Dos excepciones que la planilla no podia
// dibujar: 'Segun uso' no tiene tope (limite null) y '1 por semana' son 52.
export const PUESTOS_EPP: PuestoEpp[] = [
  {
    id: 'soldadura',
    nombre: 'SOLDADURA',
    epps: [
      { key: 'guante_vaqueta', nombre: 'Guante Vaqueta', frecuencia: '4 al año', limite: 4 },
      { key: 'guante_soldador', nombre: 'Guante soldador', frecuencia: '4 al año', limite: 4 },
      { key: 'delantal', nombre: 'Delantal', frecuencia: '2 al año', limite: 2 },
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
      { key: 'gafas_transparentes', nombre: 'Gafas transparentes', frecuencia: '2 al año', limite: 2 },
      { key: 'careta_amolar', nombre: 'Careta amolar', frecuencia: '1 al año', limite: 1 },
      { key: 'careta_soldador', nombre: 'Careta soldador', frecuencia: 'Cada 1 a 3 años', limite: 1 },
      { key: 'arnes_careta_soldador', nombre: 'Arnés careta soldador', frecuencia: '1 al año', limite: 1 },
    ],
  },
  {
    id: 'laser',
    nombre: 'LÁSER',
    epps: [
      { key: 'guante_vaqueta', nombre: 'Guante vaqueta', frecuencia: '4 al año', limite: 4 },
      { key: 'guante_multiflex', nombre: 'Guante multiflex', frecuencia: '4 al año', limite: 4 },
      { key: 'gafa_verde', nombre: 'Gafa verde', frecuencia: '2 al año', limite: 2 },
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
      { key: 'media_mascara', nombre: 'Media máscara', frecuencia: '1 al año', limite: 1 },
      { key: 'cartucho_media_mascara', nombre: 'Cartucho media máscara', frecuencia: '1 al mes', limite: 12 },
    ],
  },
  {
    id: 'corte_plegado',
    nombre: 'CORTE-PLEGADO',
    epps: [
      { key: 'guante_vaqueta', nombre: 'Guante vaqueta', frecuencia: '4 al año', limite: 4 },
      { key: 'guante_moteado', nombre: 'Guante moteado', frecuencia: '4 al año', limite: 4 },
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
      { key: 'gafas_transparentes', nombre: 'Gafas transparentes', frecuencia: '2 al año', limite: 2 },
    ],
  },
  {
    id: 'pintura',
    nombre: 'PINTURA',
    epps: [
      { key: 'media_mascara', nombre: 'Media máscara', frecuencia: '1 al año', limite: 1 },
      { key: 'prefiltro_media_mascara', nombre: 'Prefiltro media máscara', frecuencia: '1 al mes', limite: 12 },
      { key: 'cartucho_media_mascara', nombre: 'Cartucho media máscara', frecuencia: '1 al mes', limite: 12 },
      { key: 'retenedor_de_cartucho', nombre: 'Retenedor de cartucho', frecuencia: '1 al año', limite: 1 },
      { key: 'mameluco_descartable', nombre: 'Mameluco descartable', frecuencia: '1 por semana', limite: 52 },
      { key: 'guante_multiflex', nombre: 'Guante multiflex', frecuencia: '1 al mes', limite: 12 },
      { key: 'guante_latex', nombre: 'Guante látex', frecuencia: 'Según uso', limite: null },
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
      { key: 'gafas_transparentes', nombre: 'Gafas transparentes', frecuencia: 'Cada 3 meses', limite: 4 },
    ],
  },
  {
    id: 'lavado',
    nombre: 'LAVADO',
    epps: [
      { key: 'guante_lavado', nombre: 'Guante lavado', frecuencia: 'Cada 2 meses', limite: 6 },
      { key: 'guante_latex', nombre: 'Guante látex', frecuencia: 'Según uso', limite: null },
      { key: 'media_mascara', nombre: 'Media máscara', frecuencia: '1 al año', limite: 1 },
      { key: 'prefiltro_media_mascara', nombre: 'Prefiltro media máscara', frecuencia: '1 al mes', limite: 12 },
      { key: 'cartucho_media_mascara', nombre: 'Cartucho media máscara', frecuencia: '1 al mes', limite: 12 },
      { key: 'retenedor_de_cartucho', nombre: 'Retenedor de cartucho', frecuencia: '1 al año', limite: 1 },
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
      { key: 'mameluco_impermeable', nombre: 'Mameluco impermeable', frecuencia: '2 al año', limite: 2 },
      { key: 'antiparra', nombre: 'Antiparra', frecuencia: '2 al año', limite: 2 },
      { key: 'bota_lavado', nombre: 'Bota lavado', frecuencia: '1 al año', limite: 1 },
    ],
  },
  {
    id: 'abastecimiento',
    nombre: 'ABASTECIMIENTO',
    epps: [
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
      { key: 'guante_multiflex', nombre: 'Guante multiflex', frecuencia: '2 al año', limite: 2 },
      { key: 'guante_moteado', nombre: 'Guante moteado', frecuencia: '4 al año', limite: 4 },
      { key: 'gafas_transparentes', nombre: 'Gafas transparentes', frecuencia: '1 al año', limite: 1 },
      { key: 'guante_latex', nombre: 'Guante látex', frecuencia: 'Según uso', limite: null },
    ],
  },
  {
    id: 'laboratorio',
    nombre: 'LABORATORIO',
    epps: [
      { key: 'guante_multiflex', nombre: 'Guante multiflex', frecuencia: '2 al año', limite: 2 },
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
    ],
  },
  {
    id: 'mantenimiento',
    nombre: 'MANTENIMIENTO',
    epps: [
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
      { key: 'guante_moteado', nombre: 'Guante moteado', frecuencia: '4 al año', limite: 4 },
      { key: 'guante_multiflex', nombre: 'Guante multiflex', frecuencia: '4 al año', limite: 4 },
      { key: 'guante_lavado', nombre: 'Guante lavado', frecuencia: '4 al año', limite: 4 },
      { key: 'gafas_transparentes', nombre: 'Gafas transparentes', frecuencia: '2 al año', limite: 2 },
      { key: 'guante_soldador', nombre: 'Guante soldador', frecuencia: '4 al año', limite: 4 },
      { key: 'delantal', nombre: 'Delantal', frecuencia: '2 al año', limite: 2 },
      { key: 'careta_amolar', nombre: 'Careta amolar', frecuencia: '1 al año', limite: 1 },
    ],
  },
  {
    id: 'bobinado',
    nombre: 'BOBINADO',
    epps: [
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
      { key: 'guante_multiflex', nombre: 'Guante multiflex', frecuencia: '3 al año', limite: 3 },
      { key: 'gafas_verdes_para_soldar_infrarrojas', nombre: 'Gafas verdes para soldar infrarrojas', frecuencia: '1 al año', limite: 1 },
      { key: 'gafas_transparentes_resina', nombre: 'Gafas transparentes (resina)', frecuencia: '1 al año', limite: 1 },
    ],
  },
  {
    id: 'montaje_parte_actva',
    nombre: 'MONTAJE PARTE ACTVA',
    epps: [
      { key: 'guante_moteado', nombre: 'Guante moteado', frecuencia: '4 al año', limite: 4 },
      { key: 'guante_multiflex', nombre: 'Guante multiflex', frecuencia: '4 al año', limite: 4 },
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
      { key: 'gafas_transparentes', nombre: 'Gafas transparentes', frecuencia: '1 al año', limite: 1 },
    ],
  },
  {
    id: 'montaje_encubado',
    nombre: 'MONTAJE ENCUBADO',
    epps: [
      { key: 'guante_lavado', nombre: 'Guante lavado', frecuencia: '6 al año', limite: 6 },
      { key: 'guante_multiflex', nombre: 'Guante multiflex', frecuencia: '4 al año', limite: 4 },
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
      { key: 'gafas_transparentes', nombre: 'Gafas transparentes', frecuencia: '1 al año', limite: 1 },
    ],
  },
  {
    id: 'montaje_baja',
    nombre: 'MONTAJE BAJA',
    epps: [
      { key: 'guante_moteado', nombre: 'Guante moteado', frecuencia: '4 al año', limite: 4 },
      { key: 'guante_multiflex', nombre: 'Guante multiflex', frecuencia: '4 al año', limite: 4 },
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
      { key: 'gafas_verdes_para_autogena', nombre: 'Gafas verdes para autógena', frecuencia: '1 al año', limite: 1 },
      { key: 'guante_soldador', nombre: 'Guante soldador', frecuencia: '4 al año', limite: 4 },
      { key: 'delantal', nombre: 'Delantal', frecuencia: '2 al año', limite: 2 },
    ],
  },
  {
    id: 'despacho',
    nombre: 'DESPACHO',
    epps: [
      { key: 'guante_multiflex', nombre: 'Guante multiflex', frecuencia: '4 al año', limite: 4 },
      { key: 'proteccion_auditiva_tapones_internos', nombre: 'Protección auditiva – tapones internos', frecuencia: '1 al mes', limite: 12 },
    ],
  },
  {
    id: 'carpinteria_corte_aislacion',
    nombre: 'CARPINTERÍA-CORTE AISLACIÓN',
    epps: [
      { key: 'proteccion_auditiva_copa', nombre: 'Protección auditiva – copa', frecuencia: '1 al año', limite: 1 },
      { key: 'guante_moteado', nombre: 'Guante moteado', frecuencia: '4 al año', limite: 4 },
      { key: 'guante_multiflex', nombre: 'Guante multiflex', frecuencia: '4 al año', limite: 4 },
      { key: 'gafas_transparentes', nombre: 'Gafas transparentes', frecuencia: '1 al año', limite: 1 },
    ],
  },
]

export function puestoEppPorId(id: string | undefined): PuestoEpp | undefined {
  return PUESTOS_EPP.find((p) => p.id === id)
}

export function eppDeDefinicion(puestoId: string | undefined, key: string): EppDefinicion | undefined {
  return puestoEppPorId(puestoId)?.epps.find((e) => e.key === key)
}

/** Etiqueta "3 de 4" o "3 (sin tope)" para mostrar el consumo del año. */
export function etiquetaConsumo(entregadas: number, limite: number | null): string {
  return limite === null ? `${entregadas} (sin tope)` : `${entregadas} de ${limite}`
}
