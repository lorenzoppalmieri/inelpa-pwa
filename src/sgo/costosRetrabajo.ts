import { supabase } from '../lib/supabaseClient'
import type { CostoNoCalidad, DatosCosteoRetrabajoSGO, EventoSGO, TarifarioCostosRetrabajoSGO } from './types'

const CACHE_TARIFARIO = 'sgo_tarifario_costos_retrabajo_v1'

export const TARIFARIO_COSTOS_BASE: TarifarioCostosRetrabajoSGO = {
  id: 'base-2026-08-20',
  vigenteDesde: '2026-08-20',
  horaHombre: 14500,
  factorTiempoPerdido: 2,
  cobreKg: 22000,
  aluminioKg: 12000,
  creadoPor: 'Lorenzo',
}

interface TarifarioRow {
  id: string
  vigente_desde: string
  hora_hombre: number
  factor_tiempo_perdido: number
  cobre_kg: number
  aluminio_kg: number
  creado_en: string
  creado_por: string
}

const numero = (valor: unknown): number => Math.max(0, Number(valor) || 0)
const dinero = (valor: number): number => Math.round(valor * 100) / 100

function desdeRow(row: TarifarioRow): TarifarioCostosRetrabajoSGO {
  return {
    id: row.id,
    vigenteDesde: row.vigente_desde,
    horaHombre: numero(row.hora_hombre),
    factorTiempoPerdido: numero(row.factor_tiempo_perdido),
    cobreKg: numero(row.cobre_kg),
    aluminioKg: numero(row.aluminio_kg),
    creadoEn: row.creado_en,
    creadoPor: row.creado_por,
  }
}

function guardarCache(tarifario: TarifarioCostosRetrabajoSGO): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CACHE_TARIFARIO, JSON.stringify(tarifario))
}

function leerCache(): TarifarioCostosRetrabajoSGO | undefined {
  if (typeof localStorage === 'undefined') return undefined
  try {
    const dato = JSON.parse(localStorage.getItem(CACHE_TARIFARIO) ?? 'null') as TarifarioCostosRetrabajoSGO | null
    return dato?.id ? dato : undefined
  } catch { return undefined }
}

export async function obtenerTarifarioCostosVigente(fecha = new Date().toISOString().slice(0, 10)): Promise<TarifarioCostosRetrabajoSGO> {
  if (!supabase) return leerCache() ?? TARIFARIO_COSTOS_BASE
  const { data, error } = await supabase
    .from('sgo_tarifarios_costos')
    .select('id,vigente_desde,hora_hombre,factor_tiempo_perdido,cobre_kg,aluminio_kg,creado_en,creado_por')
    .lte('vigente_desde', fecha)
    .order('vigente_desde', { ascending: false })
    .order('creado_en', { ascending: false })
    .limit(1)
  if (error || !data?.length) {
    console.warn('[SGO] No se pudo leer el tarifario vigente; se usa la copia local.', error)
    return leerCache() ?? TARIFARIO_COSTOS_BASE
  }
  const tarifario = desdeRow(data[0] as TarifarioRow)
  guardarCache(tarifario)
  return tarifario
}

export async function guardarNuevaVersionTarifarioCostos(tarifario: Omit<TarifarioCostosRetrabajoSGO, 'id' | 'creadoEn' | 'creadoPor'>, usuario: string): Promise<TarifarioCostosRetrabajoSGO> {
  if (usuario.trim().toLowerCase() !== 'lorenzo') throw new Error('Solo Lorenzo puede modificar el tarifario de costos.')
  if (!supabase) throw new Error('Se necesita conexión para actualizar el tarifario compartido.')
  if (tarifario.horaHombre <= 0 || tarifario.factorTiempoPerdido < 1 || tarifario.cobreKg <= 0 || tarifario.aluminioKg <= 0) {
    throw new Error('Todos los valores deben ser mayores que cero y el factor no puede ser menor que 1.')
  }
  const fila = {
    vigente_desde: tarifario.vigenteDesde,
    hora_hombre: tarifario.horaHombre,
    factor_tiempo_perdido: tarifario.factorTiempoPerdido,
    cobre_kg: tarifario.cobreKg,
    aluminio_kg: tarifario.aluminioKg,
    creado_por: usuario,
  }
  const { data, error } = await supabase.from('sgo_tarifarios_costos').insert(fila).select('*').single()
  if (error) throw error
  const guardado = desdeRow(data as TarifarioRow)
  guardarCache(guardado)
  return guardado
}

export function crearCosteoRetrabajo(tarifario: TarifarioCostosRetrabajoSGO): DatosCosteoRetrabajoSGO {
  return {
    tarifario: { ...tarifario },
    horasCorreccion: 0,
    personasInvolucradas: 1,
    materialTipo: 'ninguno',
    maquinaEstado: 'no_aplica',
    estado: 'estimado',
  }
}

export function calcularCostosRetrabajo(costeo: DatosCosteoRetrabajoSGO): CostoNoCalidad {
  const horas = numero(costeo.horasCorreccion)
  const personas = Math.max(1, Math.floor(numero(costeo.personasInvolucradas) || 1))
  const manoObra = dinero(horas * personas * numero(costeo.tarifario.horaHombre) * Math.max(1, numero(costeo.tarifario.factorTiempoPerdido)))
  let material = 0
  if (costeo.materialTipo === 'cobre') material = numero(costeo.materialKg) * numero(costeo.tarifario.cobreKg)
  if (costeo.materialTipo === 'aluminio') material = numero(costeo.materialKg) * numero(costeo.tarifario.aluminioKg)
  if (costeo.materialTipo === 'otro') material = numero(costeo.materialCostoManual)
  return {
    manoObra,
    material: dinero(material),
    maquina: dinero(numero(costeo.maquinaCosto)),
    ensayos: dinero(numero(costeo.ensayosCosto)),
    logistica: dinero(numero(costeo.logisticaCosto)),
    terceros: dinero(numero(costeo.tercerosCosto)),
  }
}

export function aplicarCosteoRetrabajo(evento: EventoSGO, costeo: DatosCosteoRetrabajoSGO): EventoSGO {
  const costoDetalle = calcularCostosRetrabajo(costeo)
  const costoEstimado = Object.values(costoDetalle).reduce((total, costo) => total + costo, 0)
  return {
    ...evento,
    costoDetalle,
    costoEstimado: dinero(costoEstimado),
    retrabajo: { ...evento.retrabajo!, modalidadCosto: 'detallado', costosRevisados: costeo.estado === 'confirmado', costeo },
    actualizadoEn: new Date().toISOString(),
  }
}
