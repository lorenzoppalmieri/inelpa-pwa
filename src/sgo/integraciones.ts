import { db } from '../db/dexie'
import { CAUSAS_PARADA, ENSAYOS_LAB, causaLabel, estadoEnsayo, type Parada, type SectorId, type Tarea, type TareaLaboratorio } from '../types'
import { guardarEventoSGO } from '../sync/syncEngine'
import { ENSAYO_A_DEFECTO } from './defectos'
import { codigoEventoSGO, type AreaSGOId, type EventoSGO } from './types'

export async function noConformidadDesdeLaboratorio(t: TareaLaboratorio, usuario: string): Promise<{ evento: EventoSGO; creado: boolean }> {
  const existente = await db.eventosSGO.where('laboratorioId').equals(t.id).first()
  if (existente) return { evento: existente, creado: false }

  const rechazados = ENSAYOS_LAB.filter((e) => estadoEnsayo(t, e.key) === 'rechazado')
  const id = crypto.randomUUID(), now = new Date().toISOString()
  const evento: EventoSGO = {
    id, codigo: codigoEventoSGO(new Date(), id), tipo: 'no_conformidad', pilar: 'calidad',
    titulo: `Rechazo de Laboratorio${t.nroSerie ? ` · Serie ${t.nroSerie}` : ''}`,
    descripcion: `Ensayos rechazados: ${rechazados.map((e) => e.label).join(', ') || 'sin clasificar'}.${t.comentario ? ` Observación: ${t.comentario}` : ''}`,
    severidad: 'alta', estado: 'abierto', areaId: 'laboratorio',
    laboratorioId: t.id, ordenId: t.ordenId, nroSerie: t.nroSerie, modelo: t.modelo,
    defectoCodigo: ENSAYO_A_DEFECTO[rechazados[0]?.key] ?? 'OTRO', cantidadAfectada: 1,
    costoDetalle: { material: 0, manoObra: 0, maquina: 0, ensayos: 0, logistica: 0, terceros: 0 },
    costoEstimado: 0, detectadoEn: t.finalizada ?? now, detectadoPor: usuario,
    responsable: 'Gestión SGO', creadoEn: now, actualizadoEn: now,
  }
  await guardarEventoSGO(evento)
  return { evento, creado: true }
}

const SECTOR_A_AREA: Record<SectorId, AreaSGOId> = {
  bob_dist_at: 'bobinado_distribucion', bob_dist_bt: 'bobinado_distribucion',
  bob_rural_at: 'bobinado_rural', bob_rural_bt: 'bobinado_rural',
  montaje_pa_dist: 'montaje_distribucion', montaje_po_dist: 'montaje_distribucion',
  montaje_pa_rural: 'montaje_rural', montaje_po_rural: 'montaje_rural',
  corte_conformado: 'herreria_pintura', soldadura_dist: 'herreria_pintura',
  soldadura_rural: 'herreria_pintura', lavado_pintura: 'herreria_pintura',
  laboratorio: 'laboratorio',
}

const CAUSA_A_DEFECTO: Record<string, string> = {
  taco_defectuoso: 'MON_COMPONENTE', calidad_alambre: 'BOB_CONDUCTOR',
  bobina_bt_defectuosa: 'BOB_DEFORMACION', mon_retrabajo_bobina: 'BOB_DEFORMACION',
  mon_no_da_relacion: 'LAB_RELACION', mon_insumos_defectuosos: 'MON_COMPONENTE',
  her_perdidas_hermetizado: 'MON_PERDIDA', pin_retrabajo: 'PIN_ACABADO',
}

export function paradasCalidad(t: Tarea): Parada[] {
  return t.paradas.filter((p) => CAUSAS_PARADA.find((c) => c.id === p.causa)?.categoria === 'calidad')
}

export async function noConformidadDesdeParada(t: Tarea, p: Parada, usuario: string): Promise<{ evento: EventoSGO; creado: boolean }> {
  const existente = await db.eventosSGO.where('paradaId').equals(p.id).first()
  if (existente) return { evento: existente, creado: false }
  const id = crypto.randomUUID(), now = new Date().toISOString()
  const area = SECTOR_A_AREA[t.sectorId]
  const evento: EventoSGO = {
    id, codigo: codigoEventoSGO(new Date(), id), tipo: 'no_conformidad', pilar: 'calidad',
    titulo: `${causaLabel(p.causa)} · ${t.modelo}`,
    descripcion: `Parada de calidad registrada en Producción: ${causaLabel(p.causa)}.${p.observacion ? ` Observación: ${p.observacion}` : ''}`,
    severidad: 'media', estado: 'abierto', areaId: area, areaOrigenId: area,
    sectorId: t.sectorId, maquinaId: t.maquinaId, ordenId: t.ordenId, tareaId: t.id,
    paradaId: p.id, nroSerie: t.nroTransformador, modelo: t.modelo,
    defectoCodigo: CAUSA_A_DEFECTO[p.causa] ?? 'OTRO', cantidadAfectada: 1,
    costoDetalle: { material: 0, manoObra: 0, maquina: 0, ensayos: 0, logistica: 0, terceros: 0 },
    costoEstimado: 0, detectadoEn: p.inicio, detectadoPor: usuario,
    responsable: 'Gestión SGO', creadoEn: now, actualizadoEn: now,
  }
  await guardarEventoSGO(evento)
  return { evento, creado: true }
}
