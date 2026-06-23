import type { Tarea, AndonAreaId, SectorId } from '../types'
import { esReparacion, periodoMensual } from '../types'
import { componentePorCodigo } from '../data/catalogo'

// ============================================================
// ANDON — calculo de cumplimiento mensual por area + escala de premios.
//  Premio POR EQUIPO POR AREA (no individual). Se compara lo terminado en el
//  mes contra el objetivo que carga el planificador.
// ============================================================
export interface AndonAreaDef { id: AndonAreaId; label: string }

export const ANDON_AREAS: AndonAreaDef[] = [
  { id: 'montaje_dist', label: 'Montaje Distribución (PO)' },
  { id: 'montaje_rural', label: 'Montaje Rural (PO)' },
  { id: 'bob_dist_at', label: 'Bobinado Dist. A.T.' },
  { id: 'bob_dist_bt', label: 'Bobinado Dist. B.T.' },
  { id: 'bob_rural_at', label: 'Bobinado Rural A.T.' },
  { id: 'bob_rural_bt', label: 'Bobinado Rural B.T.' },
  { id: 'herreria_dist', label: 'Herrería Distribución (cubas)' },
  { id: 'herreria_rural', label: 'Herrería Rural (cubas)' },
]

function esCuba(t: Tarea, linea: 'distribucion' | 'rural'): boolean {
  const c = componentePorCodigo(t.componenteCodigo)
  return !!c && c.categoria === 'herreria_cuba' && c.linea === linea
}

// Una tarea FINALIZADA cuenta como unidad terminada del area?
export function cuentaParaArea(t: Tarea, area: AndonAreaId): boolean {
  switch (area) {
    case 'montaje_dist': return t.sectorId === 'montaje_po_dist'   // transformador PO
    case 'montaje_rural': return t.sectorId === 'montaje_po_rural'  // transformador PO
    case 'bob_dist_at': return t.sectorId === 'bob_dist_at'
    case 'bob_dist_bt': return t.sectorId === 'bob_dist_bt'
    case 'bob_rural_at': return t.sectorId === 'bob_rural_at'
    case 'bob_rural_bt': return t.sectorId === 'bob_rural_bt'
    case 'herreria_dist': return esCuba(t, 'distribucion')          // cubas, NO tapas
    case 'herreria_rural': return esCuba(t, 'rural')
  }
}

// Sectores considerados del area (para contar retrabajos = reparaciones).
const SECTORES_AREA: Record<AndonAreaId, string[]> = {
  montaje_dist: ['montaje_pa_dist', 'montaje_po_dist'],
  montaje_rural: ['montaje_pa_rural', 'montaje_po_rural'],
  bob_dist_at: ['bob_dist_at'],
  bob_dist_bt: ['bob_dist_bt'],
  bob_rural_at: ['bob_rural_at'],
  bob_rural_bt: ['bob_rural_bt'],
  herreria_dist: ['soldadura_dist', 'corte_conformado'],
  herreria_rural: ['soldadura_rural', 'corte_conformado'],
}
export function esRetrabajoArea(t: Tarea, area: AndonAreaId): boolean {
  return esReparacion(t) && SECTORES_AREA[area].includes(t.sectorId)
}

// Areas ANDON que le corresponden a un conjunto de sectores (para el operario,
// que solo ve sus sectores: se le muestran las areas de su equipo).
const SECTOR_A_AREA: Partial<Record<SectorId, AndonAreaId[]>> = {
  montaje_pa_dist: ['montaje_dist'], montaje_po_dist: ['montaje_dist'],
  montaje_pa_rural: ['montaje_rural'], montaje_po_rural: ['montaje_rural'],
  bob_dist_at: ['bob_dist_at'], bob_dist_bt: ['bob_dist_bt'],
  bob_rural_at: ['bob_rural_at'], bob_rural_bt: ['bob_rural_bt'],
  soldadura_dist: ['herreria_dist'], soldadura_rural: ['herreria_rural'],
  corte_conformado: ['herreria_dist', 'herreria_rural'],
}
export function areasDeSectores(sectores: SectorId[]): AndonAreaId[] {
  const set = new Set<AndonAreaId>()
  for (const s of sectores) for (const a of SECTOR_A_AREA[s] ?? []) set.add(a)
  return [...set]
}

// Escala de premios por % de cumplimiento (terminado / objetivo).
//  <80%       -> rojo        : sin premio
//  81% a 90%  -> verde       : premio parcial
//  91% a 99%  -> verde fuerte: premio parcial
//  100%       -> violeta     : premio completo de produccion
export interface Tier { id: string; label: string; clase: string }
export function tierDe(pct: number): Tier {
  if (pct >= 1.00) return { id: 'violeta', label: '100% · premio completo', clase: 'andon-violeta' }
  if (pct >= 0.91) return { id: 'verde_fuerte', label: '91–99% · premio parcial', clase: 'andon-verde3' }
  if (pct >= 0.80) return { id: 'verde', label: '81–90% · premio parcial', clase: 'andon-verde1' }
  return { id: 'rojo', label: '<80% · sin premio', clase: 'andon-rojo' }
}

export interface FilaAndon {
  area: AndonAreaDef
  terminados: number
  objetivo: number
  pct: number
  tier: Tier
  retrabajos: number
}

const mesDe = (iso?: string): string => (iso ? periodoMensual(new Date(iso)) : '')

export function calcularAndon(
  tareas: Tarea[],
  objetivos: Map<AndonAreaId, number>,
  periodo: string,
): FilaAndon[] {
  const finMes = tareas.filter((t) => t.estado === 'finalizada' && !esReparacion(t) && mesDe(t.finReal) === periodo)
  const repMes = tareas.filter((t) => esReparacion(t) && (mesDe(t.finReal) === periodo || mesDe(t.inicioPlanificado) === periodo))
  return ANDON_AREAS.map((area) => {
    const terminados = finMes.filter((t) => cuentaParaArea(t, area.id)).length
    const retrabajos = repMes.filter((t) => esRetrabajoArea(t, area.id)).length
    const objetivo = objetivos.get(area.id) ?? 0
    const pct = objetivo > 0 ? terminados / objetivo : 0
    return { area, terminados, objetivo, pct, tier: tierDe(pct), retrabajos }
  })
}
