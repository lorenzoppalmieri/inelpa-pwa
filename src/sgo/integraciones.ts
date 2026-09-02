import { db } from '../db/dexie'
import { CAUSAS_PARADA, ENSAYOS_LAB, SECTORES, causaLabel, esCausaRetrabajo, estadoEnsayo, type Parada, type SectorId, type Tarea, type TareaLaboratorio } from '../types'
import { guardarEventoSGO } from '../sync/syncEngine'
import { ENSAYO_A_DEFECTO } from './defectos'
import { crearDatosRetrabajo, INICIO_CIRCUITO_RETRABAJOS, minutosDeParada, RESPONSABLE_INVESTIGACION_RETRABAJO } from './retrabajos'
import { areaSGOLabel, codigoEventoSGO, type AreaSGOId, type EventoSGO } from './types'

async function ubicacionDesdeTarea(tarea: Tarea) {
  const [maquina, operario] = await Promise.all([
    db.maquinas.get(tarea.maquinaId),
    tarea.operarioId ? db.usuarios.get(tarea.operarioId) : Promise.resolve(undefined),
  ])
  return {
    operarioId: tarea.operarioId,
    operarioNombre: operario?.nombre,
    sectorNombre: SECTORES.find((sector) => sector.id === tarea.sectorId)?.nombre,
    maquinaNombre: maquina?.nombre,
  }
}

export async function noConformidadDesdeLaboratorio(t: TareaLaboratorio, usuario: string): Promise<{ evento: EventoSGO; creado: boolean }> {
  const existente = await db.eventosSGO.where('laboratorioId').equals(t.id).first()
  if (existente) {
    if (!existente.retrabajo) {
      const actualizado: EventoSGO = {
        ...existente, responsable: RESPONSABLE_INVESTIGACION_RETRABAJO,
        retrabajo: crearDatosRetrabajo('laboratorio', t.finalizada ?? existente.detectadoEn, {
          causaRegistrada: 'Ensayo rechazado', observacionOrigen: t.comentario,
          procesoDeteccion: 'LABORATORIO',
        }),
        actualizadoEn: new Date().toISOString(),
      }
      await guardarEventoSGO(actualizado)
      return { evento: actualizado, creado: false }
    }
    return { evento: existente, creado: false }
  }

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
    responsable: RESPONSABLE_INVESTIGACION_RETRABAJO,
    disposicion: 'pendiente',
    retrabajo: crearDatosRetrabajo('laboratorio', t.finalizada ?? now, {
      causaRegistrada: `Ensayo rechazado: ${rechazados.map((e) => e.label).join(', ') || 'sin clasificar'}`,
      observacionOrigen: t.comentario, procesoDeteccion: 'LABORATORIO',
    }),
    creadoEn: now, actualizadoEn: now,
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

export function areaSGODesdeSector(sectorId: SectorId): AreaSGOId | undefined {
  return SECTOR_A_AREA[sectorId]
}

const CAUSA_A_DEFECTO: Record<string, string> = {
  taco_defectuoso: 'MON_COMPONENTE', calidad_alambre: 'BOB_CONDUCTOR',
  bobina_bt_defectuosa: 'BOB_DEFORMACION', mon_retrabajo_bobina: 'BOB_DEFORMACION',
  mon_no_da_relacion: 'LAB_RELACION', mon_insumos_defectuosos: 'MON_COMPONENTE',
  // v1.99: reemplazan a la generica 'mon_insumos_defectuosos'. Mismo codigo de
  // defecto; sin esto la no conformidad se abriria con 'OTRO'.
  mon_chapa_nucleo_defectuosa: 'MON_COMPONENTE',
  mon_prensayugo_defectuoso: 'MON_COMPONENTE',
  mon_conmutador_defectuoso: 'MON_COMPONENTE',
  her_perdidas_hermetizado: 'MON_PERDIDA', pin_retrabajo: 'PIN_ACABADO',
}

export function paradasCalidad(t: Tarea): Parada[] {
  return t.paradas.filter((p) => CAUSAS_PARADA.find((c) => c.id === p.causa)?.categoria === 'calidad')
}

export async function noConformidadDesdeParada(t: Tarea, p: Parada, usuario: string): Promise<{ evento: EventoSGO; creado: boolean }> {
  const ubicacion = await ubicacionDesdeTarea(t)
  const decisionCalidad = esCausaRetrabajo(p.causa) ? 'investigar' as const : 'pendiente' as const
  const existente = await db.eventosSGO.where('paradaId').equals(p.id).first()
  if (existente) {
    const minutos = minutosDeParada(p.inicio, p.fin)
    const faltaUbicacion = Boolean(existente.retrabajo && (
      (!existente.retrabajo.sectorNombre && ubicacion.sectorNombre)
      || (!existente.retrabajo.maquinaNombre && ubicacion.maquinaNombre)
      || (!existente.retrabajo.operarioNombre && ubicacion.operarioNombre)
    ))
    if (!existente.retrabajo || faltaUbicacion || (minutos !== undefined && existente.retrabajo.minutosRetrabajo !== minutos)) {
      const actualizado: EventoSGO = {
        ...existente, responsable: RESPONSABLE_INVESTIGACION_RETRABAJO,
        retrabajo: crearDatosRetrabajo('parada_calidad', p.inicio, {
          ...existente.retrabajo, ...ubicacion, causaId: p.causa, causaRegistrada: causaLabel(p.causa),
          decisionCalidad: existente.retrabajo?.decisionCalidad ?? decisionCalidad,
          observacionOrigen: p.observacion, minutosRetrabajo: minutos,
          procesoOrigen: areaSGOLabel(existente.areaOrigenId ?? existente.areaId),
          procesoDeteccion: areaSGOLabel(existente.areaId),
        }),
        actualizadoEn: new Date().toISOString(),
      }
      await guardarEventoSGO(actualizado)
      return { evento: actualizado, creado: false }
    }
    return { evento: existente, creado: false }
  }
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
    responsable: RESPONSABLE_INVESTIGACION_RETRABAJO, disposicion: 'pendiente',
    retrabajo: crearDatosRetrabajo('parada_calidad', p.inicio, {
      ...ubicacion, causaId: p.causa, causaRegistrada: causaLabel(p.causa), decisionCalidad,
      observacionOrigen: p.observacion,
      minutosRetrabajo: minutosDeParada(p.inicio, p.fin), procesoOrigen: areaSGOLabel(area), procesoDeteccion: areaSGOLabel(area),
    }),
    creadoEn: now, actualizadoEn: now,
  }
  await guardarEventoSGO(evento)
  return { evento, creado: true }
}

export async function noConformidadDesdeDefectoTarea(t: Tarea, usuario: string): Promise<{ evento: EventoSGO; creado: boolean }> {
  const ubicacion = await ubicacionDesdeTarea(t)
  const vinculados = await db.eventosSGO.where('tareaId').equals(t.id).toArray()
  const existente = vinculados.find((evento) => evento.retrabajo?.origen === 'defecto_final')
  if (existente) {
    const faltaUbicacion = Boolean(existente.retrabajo && (
      (!existente.retrabajo.sectorNombre && ubicacion.sectorNombre)
      || (!existente.retrabajo.maquinaNombre && ubicacion.maquinaNombre)
      || (!existente.retrabajo.operarioNombre && ubicacion.operarioNombre)
    ))
    if (faltaUbicacion) {
      const actualizado: EventoSGO = {
        ...existente, retrabajo: { ...existente.retrabajo!, ...ubicacion }, actualizadoEn: new Date().toISOString(),
      }
      await guardarEventoSGO(actualizado)
      return { evento: actualizado, creado: false }
    }
    return { evento: existente, creado: false }
  }
  // Si la tarea ya originó una o más paradas de calidad, el defecto final forma
  // parte de esos expedientes. Evita abrir un duplicado por el mismo retrabajo.
  const investigacionDeParada = vinculados.find((evento) => evento.retrabajo?.origen === 'parada_calidad' && evento.estado !== 'cerrado')
  if (investigacionDeParada) return { evento: investigacionDeParada, creado: false }
  const id = crypto.randomUUID(), now = new Date().toISOString()
  const detectadoEn = t.finReal ?? now
  const area = SECTOR_A_AREA[t.sectorId]
  const evento: EventoSGO = {
    id, codigo: codigoEventoSGO(new Date(detectadoEn), id), tipo: 'no_conformidad', pilar: 'calidad',
    titulo: `Defecto al finalizar · ${t.modelo}`,
    descripcion: `La tarea fue finalizada con defecto en ${areaSGOLabel(area)}. Defecto informado: ${t.defecto || 'sin especificar'}.`,
    severidad: 'media', estado: 'abierto', areaId: area, areaOrigenId: area,
    sectorId: t.sectorId, maquinaId: t.maquinaId, ordenId: t.ordenId, tareaId: t.id,
    nroSerie: t.nroTransformador, modelo: t.modelo, defectoCodigo: 'OTRO', cantidadAfectada: 1,
    costoDetalle: { material: 0, manoObra: 0, maquina: 0, ensayos: 0, logistica: 0, terceros: 0 }, costoEstimado: 0,
    detectadoEn, detectadoPor: usuario, responsable: RESPONSABLE_INVESTIGACION_RETRABAJO, disposicion: 'pendiente',
    retrabajo: crearDatosRetrabajo('defecto_final', detectadoEn, {
      ...ubicacion, causaRegistrada: t.defecto || 'Defecto no especificado',
      observacionOrigen: t.notas, procesoOrigen: areaSGOLabel(area), procesoDeteccion: areaSGOLabel(area),
    }),
    creadoEn: now, actualizadoEn: now,
  }
  await guardarEventoSGO(evento)
  return { evento, creado: true }
}

export async function conciliarInvestigacionesRetrabajo(usuario: string): Promise<{ creados: number; actualizados: number }> {
  let creados = 0, actualizados = 0
  const tareas = await db.tareas.toArray()
  for (const tarea of tareas) {
    for (const parada of paradasCalidad(tarea).filter((item) => item.inicio >= INICIO_CIRCUITO_RETRABAJOS && esCausaRetrabajo(item.causa) && !item.ncDescartada)) {
      const resultado = await noConformidadDesdeParada(tarea, parada, usuario)
      if (resultado.creado) creados += 1
      else if (resultado.evento.retrabajo) actualizados += 1
    }
    if (tarea.calidadOk === false && (tarea.finReal ?? '') >= INICIO_CIRCUITO_RETRABAJOS) {
      const resultado = await noConformidadDesdeDefectoTarea(tarea, usuario)
      if (resultado.creado) creados += 1
    }
  }
  const laboratorio = await db.laboratorio.toArray()
  for (const ensayo of laboratorio.filter((item) => item.resultado === 'retrabajo' && (item.finalizada ?? '') >= INICIO_CIRCUITO_RETRABAJOS)) {
    const resultado = await noConformidadDesdeLaboratorio(ensayo, usuario)
    if (resultado.creado) creados += 1
    else if (resultado.evento.retrabajo) actualizados += 1
  }
  return { creados, actualizados }
}
