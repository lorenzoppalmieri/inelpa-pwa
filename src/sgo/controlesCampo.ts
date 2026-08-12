import type { AreaSGOId, PilarSGO } from './types'

export type Seccion5S = 'seiri' | 'seiton' | 'seiso' | 'seiketsu' | 'shitsuke'
export type PuntajeControlCampo = 0 | 1 | 2 | 'na' | 'pendiente'
export type RiesgoHallazgoCampo = 'bajo' | 'medio' | 'alto' | 'critico'

export interface DocumentoControlCampo {
  nombre: string
  codigo: string
  version: string
  fechaEmision: string
  emitidoPor: string
  aprobadoPor: string
}

export interface ItemPlantillaCampo {
  id: string
  seccion: Seccion5S
  numero: number
  punto: string
  pregunta: string
  pilar: PilarSGO
  critico?: boolean
}

export interface PlantillaControlCampo {
  id: string
  nombre: string
  version: string
  documento: DocumentoControlCampo
  items: ItemPlantillaCampo[]
}

export interface RespuestaControlCampo {
  itemId: string
  puntaje: PuntajeControlCampo
  observacion?: string
  justificacionNoAplica?: string
  riesgo?: RiesgoHallazgoCampo
  accion?: string
  responsable?: string
  fechaCompromiso?: string
  evidenciaReferencia?: string
  evidenciaPaths?: string[]
}

export interface AuditoriaCampoSGO {
  tipo: '5s'
  plantillaId: string
  plantillaVersion: string
  documento: DocumentoControlCampo
  areaId: AreaSGOId
  auditor: string
  usuarioAcceso: string
  encargadoArea: string
  ubicacion?: string
  turno?: string
  iniciadaEn: string
  finalizadaEn: string
  respuestas: RespuestaControlCampo[]
  porcentajeCumplimiento: number
  porcentajePorSeccion: Partial<Record<Seccion5S, number>>
  calificacionAnterior?: number
  eventoIds?: string[]
}

export interface AuditorCampo {
  id: 'lara' | 'nicolas' | 'azul'
  nombre: string
  alcance: string
}

export const AUDITORES_CAMPO: AuditorCampo[] = [
  { id: 'lara', nombre: 'Lara', alcance: 'Producción y semielaborados' },
  { id: 'nicolas', nombre: 'Nicolás', alcance: 'Logística' },
  { id: 'azul', nombre: 'Azul', alcance: 'ISO y procesos administrativos' },
]

export const SECCIONES_5S: { id: Seccion5S; codigo: string; nombre: string; descripcion: string }[] = [
  { id: 'seiri', codigo: '1S', nombre: 'SEIRI · Clasificar', descripcion: 'Separar lo necesario de lo innecesario.' },
  { id: 'seiton', codigo: '2S', nombre: 'SEITON · Ordenar', descripcion: 'Un lugar definido para cada cosa.' },
  { id: 'seiso', codigo: '3S', nombre: 'SEISO · Limpiar', descripcion: 'Limpiar e identificar fuentes de suciedad.' },
  { id: 'seiketsu', codigo: '4S', nombre: 'SEIKETSU · Estandarizar', descripcion: 'Hacer visibles y repetibles las condiciones correctas.' },
  { id: 'shitsuke', codigo: '5S', nombre: 'SHITSUKE · Sostener', descripcion: 'Mantener la disciplina y evitar reincidencias.' },
]

const item = (
  id: string, seccion: Seccion5S, numero: number, punto: string, pregunta: string,
  pilar: PilarSGO = 'mejora', critico = false,
): ItemPlantillaCampo => ({ id, seccion, numero, punto, pregunta, pilar, critico })

export const PLANTILLA_5S_RIT_9_2_12: PlantillaControlCampo = {
  id: 'rit-9-2-12-5s',
  nombre: 'Control semanal de 5S',
  version: '01-digital',
  documento: {
    nombre: 'CONTROL SEMANAL DE 5S',
    codigo: 'R.I.T. 9.2/12',
    version: '01',
    fechaEmision: '07/04/2026',
    emitidoPor: 'Acosta Jazmín',
    aprobadoPor: 'Palmieri Mario',
  },
  items: [
    item('5s-seiri-01a', 'seiri', 1, 'Materiales o partes', '¿El área está libre de materiales o partes innecesarias?'),
    item('5s-seiri-01b', 'seiri', 1, 'Materiales o partes', '¿El área está libre de materiales en desuso o rotos?', 'costos'),
    item('5s-seiri-01c', 'seiri', 1, 'Materiales o partes', '¿Los elementos necesarios están disponibles en el puesto?'),
    item('5s-seiri-02', 'seiri', 2, 'Máquinas u otros equipos', '¿El área está libre de máquinas o equipos innecesarios?', 'costos'),
    item('5s-seiri-03', 'seiri', 3, 'Herramientas, partes o suministros', '¿Las herramientas, partes y suministros están correctamente almacenados?', 'seguridad'),
    item('5s-seiri-04', 'seiri', 4, 'Frecuencia', '¿Los artículos están clasificados según su frecuencia de uso?'),
    item('5s-seiri-05', 'seiri', 5, 'Estándares escritos', '¿Se siguen los estándares escritos aplicables en el área?', 'calidad'),

    item('5s-seiton-01', 'seiton', 1, 'Etiquetas de ubicación', '¿Los estantes y áreas de almacenamiento están identificados?'),
    item('5s-seiton-02', 'seiton', 2, 'Etiquetas de artículos', '¿Cada artículo tiene un lugar definido y se encuentra en ese lugar?', 'calidad'),
    item('5s-seiton-03', 'seiton', 3, 'Búsqueda de materiales y herramientas', '¿Los elementos de uso frecuente se encuentran en menos de 30 segundos?', 'entrega'),
    item('5s-seiton-04a', 'seiton', 4, 'Señalización de pasillos y áreas', '¿Los pasos peatonales y las delimitaciones están claramente identificados?', 'seguridad', true),
    item('5s-seiton-04b', 'seiton', 4, 'Señalización de pasillos y áreas', '¿Los pasillos y salidas se encuentran despejados?', 'seguridad', true),
    item('5s-seiton-05', 'seiton', 5, 'Herramientas', '¿Las herramientas están dispuestas para su recogida, uso y devolución segura?', 'seguridad'),

    item('5s-seiso-01', 'seiso', 1, 'Pisos', '¿Los pisos están libres de basura, agua, polvo, aceite u otros derrames?', 'seguridad', true),
    item('5s-seiso-02a', 'seiso', 2, 'Máquinas u otros equipos', '¿Las máquinas y los equipos se limpian con la frecuencia definida?', 'seguridad'),
    item('5s-seiso-02b', 'seiso', 2, 'Máquinas u otros equipos', '¿Las superficies y equipos están libres de residuos, polvo, derrames y aceite?', 'ambiente'),
    item('5s-seiso-03a', 'seiso', 3, 'Limpieza y control', '¿Existe un control de limpieza y se cumple la frecuencia establecida?'),
    item('5s-seiso-03b', 'seiso', 3, 'Limpieza y control', '¿La limpieza realizada es efectiva?'),
    item('5s-seiso-03c', 'seiso', 3, 'Limpieza y control', '¿El área está libre de condiciones anormales que generen suciedad?', 'ambiente'),
    item('5s-seiso-04', 'seiso', 4, 'Responsables de limpieza', '¿Los responsables de limpieza están definidos y comunicados?'),
    item('5s-seiso-05', 'seiso', 5, 'Limpiezas habituales', '¿Las estaciones se limpian como parte de la rutina, sin necesidad de advertencias?'),

    item('5s-seiketsu-01', 'seiketsu', 1, 'Estándares visuales', '¿Existen estándares visuales vigentes para la condición correcta del sector?', 'calidad'),
    item('5s-seiketsu-02', 'seiketsu', 2, 'Identificación uniforme', '¿La identificación de materiales, ubicaciones y equipos utiliza un criterio uniforme?', 'calidad'),
    item('5s-seiketsu-03', 'seiketsu', 3, 'Frecuencia y responsables', '¿Las tareas de orden y limpieza tienen frecuencia y responsable definidos?'),
    item('5s-seiketsu-04', 'seiketsu', 4, 'Condiciones anormales', '¿Las condiciones anormales pueden detectarse rápidamente mediante gestión visual?', 'seguridad'),
    item('5s-seiketsu-05', 'seiketsu', 5, 'Estándar versus realidad', '¿Los estándares documentados coinciden con la práctica real del sector?', 'calidad'),

    item('5s-shitsuke-01', 'shitsuke', 1, 'Conocimiento', '¿El personal conoce los estándares 5S aplicables a su puesto?'),
    item('5s-shitsuke-02', 'shitsuke', 2, 'Cumplimiento autónomo', '¿Las condiciones se mantienen sin depender de recordatorios del encargado?'),
    item('5s-shitsuke-03', 'shitsuke', 3, 'Acciones anteriores', '¿Las acciones del control anterior fueron cerradas y verificadas?'),
    item('5s-shitsuke-04', 'shitsuke', 4, 'Reincidencias', '¿El sector está libre de hallazgos repetidos de controles anteriores?'),
    item('5s-shitsuke-05', 'shitsuke', 5, 'Seguimiento del encargado', '¿El encargado realiza y evidencia el seguimiento periódico de 5S?'),
    item('5s-shitsuke-06', 'shitsuke', 6, 'Cumplimiento del programa', '¿Los controles programados del sector se ejecutan dentro del plazo?'),
  ],
}

export function auditorDesdeUsuario(usuario: string): string | undefined {
  const normalizado = usuario.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return AUDITORES_CAMPO.find((a) => normalizado === a.id || normalizado.includes(a.id))?.nombre
}

export function respuestaVacia(itemId: string): RespuestaControlCampo {
  return { itemId, puntaje: 'pendiente' }
}

export function calcularPorcentajeCampo(respuestas: RespuestaControlCampo[], items = PLANTILLA_5S_RIT_9_2_12.items): number {
  const ids = new Set(items.map((i) => i.id))
  const aplicables = respuestas.filter((r) => ids.has(r.itemId) && r.puntaje !== 'na' && r.puntaje !== 'pendiente')
  if (!aplicables.length) return 0
  const obtenidos = aplicables.reduce((total, r) => total + Number(r.puntaje), 0)
  return Math.round((obtenidos / (aplicables.length * 2)) * 1000) / 10
}

export function calcularPorSeccionCampo(respuestas: RespuestaControlCampo[]): Partial<Record<Seccion5S, number>> {
  return Object.fromEntries(SECCIONES_5S.map((seccion) => [
    seccion.id,
    calcularPorcentajeCampo(respuestas, PLANTILLA_5S_RIT_9_2_12.items.filter((i) => i.seccion === seccion.id)),
  ])) as Partial<Record<Seccion5S, number>>
}

export function respuestaEsHallazgo(r: RespuestaControlCampo): boolean {
  return r.puntaje === 0 || r.puntaje === 1
}

export function controlCampoCompleto(respuestas: RespuestaControlCampo[]): boolean {
  if (respuestas.length !== PLANTILLA_5S_RIT_9_2_12.items.length) return false
  return respuestas.every((r) => {
    if (r.puntaje === 'pendiente') return false
    if (r.puntaje === 'na') return Boolean(r.justificacionNoAplica?.trim())
    if (!respuestaEsHallazgo(r)) return true
    return Boolean(r.observacion?.trim() && r.accion?.trim() && r.responsable?.trim() && r.fechaCompromiso &&
      (r.evidenciaReferencia?.trim() || r.evidenciaPaths?.length))
  })
}

export function semaforoCampo(porcentaje: number): 'verde' | 'amarillo' | 'rojo' {
  if (porcentaje >= 90) return 'verde'
  if (porcentaje >= 75) return 'amarillo'
  return 'rojo'
}

export function areaSugeridaParaAuditor(auditor: string): AreaSGOId {
  const norm = auditor.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return norm.includes('nicolas') ? 'logistica_operativa' : norm.includes('azul') ? 'administracion' : 'bobinado_distribucion'
}
