import type { EventoSGO, GestorMejoraSGO } from './types'

export const GESTORES_MEJORA_SGO: { id: GestorMejoraSGO; label: string; alcance: string }[] = [
  { id: 'lorenzo', label: 'Lorenzo', alcance: 'Gerencia de Operaciones y seguimiento integral' },
  { id: 'lara', label: 'Lara', alcance: 'Producción, semielaborados y retrabajos' },
  { id: 'nicolas.sgo', label: 'Nicolás', alcance: 'Abastecimiento, stock, embalaje y despacho' },
  { id: 'azul', label: 'Azul', alcance: 'ISO, administración y sistema de gestión' },
]

const AREAS_NICOLAS = new Set<string>(['logistica_operativa', 'logistica_despacho', 'logistica_administrativa'])
const AREAS_AZUL = new Set<string>(['administracion', 'it', 'gerencia_directorio', 'rrhh'])

export function normalizarGestorMejora(usuario: string): GestorMejoraSGO | undefined {
  const normalizado = usuario.trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (normalizado === 'nicolas') return 'nicolas.sgo'
  return GESTORES_MEJORA_SGO.some((gestor) => gestor.id === normalizado) ? normalizado as GestorMejoraSGO : undefined
}

export function gestorSugeridoMejora(evento: Pick<EventoSGO, 'areaId' | 'mejora' | 'retrabajo'>): GestorMejoraSGO {
  const fuente = evento.mejora?.fuente
  if (evento.retrabajo || fuente === 'retrabajo_produccion') return 'lara'
  if (fuente === 'auditoria_logistica' || fuente === 'reunion_logistica') return 'nicolas.sgo'
  if (fuente === 'auditoria_iso_interna' || fuente === 'auditoria_iso_externa' || fuente === 'revision_direccion') return 'azul'
  if (evento.areaId && AREAS_NICOLAS.has(evento.areaId)) return 'nicolas.sgo'
  if (evento.areaId && AREAS_AZUL.has(evento.areaId)) return 'azul'
  return 'lara'
}

export function gestorMejora(evento: Pick<EventoSGO, 'areaId' | 'mejora' | 'retrabajo'>): GestorMejoraSGO {
  return evento.mejora?.gestorSGO ?? gestorSugeridoMejora(evento)
}

export function gestorMejoraLabel(gestor: GestorMejoraSGO): string {
  return GESTORES_MEJORA_SGO.find((item) => item.id === gestor)?.label ?? gestor
}

export function usuarioEsGestorMejora(usuario: string): boolean {
  return Boolean(normalizarGestorMejora(usuario))
}

export function usuarioPuedeGestionarMejora(usuario: string, evento: Pick<EventoSGO, 'areaId' | 'mejora' | 'retrabajo'>): boolean {
  return normalizarGestorMejora(usuario) === gestorMejora(evento)
}

export function mejoraRequiereSegundoControl(evento: Pick<EventoSGO, 'mejora' | 'pilar' | 'severidad'>): boolean {
  const mejora = evento.mejora
  return mejora?.prioridad === 'critica' || evento.severidad === 'critica' || evento.pilar === 'seguridad' || evento.pilar === 'ambiente' ||
    Boolean(mejora?.pilaresBeneficiados?.some((pilar) => pilar === 'seguridad' || pilar === 'ambiente')) ||
    Math.max(0, Number(mejora?.presupuestoEstimado) || 0) > 500000
}

export function usuarioPuedeCerrarMejora(usuario: string, evento: Pick<EventoSGO, 'areaId' | 'mejora' | 'retrabajo' | 'pilar' | 'severidad'>): boolean {
  const actor = normalizarGestorMejora(usuario)
  if (!actor) return false
  if (!mejoraRequiereSegundoControl(evento)) return actor === gestorMejora(evento)
  const aprobador = normalizarGestorMejora(evento.mejora?.decisionPor ?? '') ?? gestorMejora(evento)
  return actor !== aprobador
}
