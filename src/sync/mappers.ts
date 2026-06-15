// ============================================================
// Mappers Supabase (snake_case)  <->  App / Dexie (camelCase).
// Supabase es la fuente de verdad; Dexie es el espejo reactivo local.
// Las PARADAS viven en su propia tabla en Supabase, pero en el modelo de la app
// van anidadas dentro de Tarea (tarea.paradas[]). Por eso:
//   - al LEER: se arma la tarea juntando su fila + sus paradas.
//   - al ESCRIBIR: se separa la tarea (sin paradas) y cada parada por su lado.
// ============================================================
import type {
  Tarea, Parada, OrdenProduccion, Semielaborado, Maquina, Usuario,
  SectorId, Rol, EstadoTarea, MaterialBobina, LineaProduccion,
  EstadoSemielaborado, TipoEstacion, GrupoNomina, DatosBobinado,
} from '../types'

// null -> undefined (Supabase devuelve null; la app usa undefined en opcionales).
function u<T>(v: T | null | undefined): T | undefined {
  return v === null || v === undefined ? undefined : v
}

// ---------- Tipos crudos de fila (solo los campos que usamos) ----------
export interface TareaRow {
  id: string
  orden_id: string
  sector_id: string
  maquina_id: string
  operario_id: string | null
  modelo: string
  fase: string | null
  nro_transformador: string | null
  semana: string
  prioridad: number
  estado: string
  tiempo_estandar_min: number
  componente_codigo: string | null
  inicio_planificado: string | null
  inicio_real: string | null
  fin_real: string | null
  calidad_ok: boolean | null
  defecto: string | null
  bob_diametro_interno_mm: number | null
  bob_diametro_externo_mm: number | null
  bob_codigo: string | null
  notas: string | null
}

export interface ParadaRow {
  id: string
  tarea_id: string
  causa: string
  inicio: string
  fin: string | null
  observacion: string | null
}

export interface OrdenRow {
  id: string
  nro_orden: string
  nro_contrato: string | null
  modelo: string
  material: string
  linea: string
  cantidad: number
  fecha_entrega: string | null
}

export interface SemiRow {
  id: string
  codigo: string
  descripcion: string
  sector_origen: string
  modelo: string
  fase: string | null
  tarea_origen_id: string | null
  orden_destino_id: string | null
  estado: string
  tiempo_estimado_min: number | null
  sap_item_code: string | null
  actualizado_en: string | null
}

export interface MaquinaRow {
  id: string
  nombre: string
  sector_id: string
  tipo: string
  activo: boolean | null
}

export interface UsuarioRow {
  id: string
  nombre: string
  usuario: string
  rol: string
  grupo_nomina: string | null
  activo: boolean | null
}

// ============================================================
// LEER: fila -> tipo de la app
// ============================================================
export function paradaFromRow(r: ParadaRow): Parada {
  return {
    id: r.id,
    tareaId: r.tarea_id,
    causa: r.causa,
    inicio: r.inicio,
    fin: u(r.fin),
    observacion: u(r.observacion),
  }
}

export function tareaFromRow(r: TareaRow, paradas: Parada[] = []): Tarea {
  const datos: DatosBobinado = {
    diametroInternoMm: u(r.bob_diametro_interno_mm),
    diametroExternoMm: u(r.bob_diametro_externo_mm),
    codigoBobina: u(r.bob_codigo),
  }
  const tieneDatos = datos.diametroInternoMm !== undefined ||
    datos.diametroExternoMm !== undefined || datos.codigoBobina !== undefined
  return {
    id: r.id,
    ordenId: r.orden_id,
    sectorId: r.sector_id as SectorId,
    maquinaId: r.maquina_id,
    operarioId: u(r.operario_id),
    modelo: r.modelo,
    fase: u(r.fase),
    nroTransformador: u(r.nro_transformador),
    semana: r.semana,
    prioridad: r.prioridad,
    estado: r.estado as EstadoTarea,
    tiempoEstandarMin: r.tiempo_estandar_min,
    componenteCodigo: u(r.componente_codigo),
    inicioPlanificado: u(r.inicio_planificado),
    inicioReal: u(r.inicio_real),
    finReal: u(r.fin_real),
    calidadOk: u(r.calidad_ok),
    defecto: u(r.defecto),
    paradas,
    datosBobinado: tieneDatos ? datos : undefined,
    notas: u(r.notas),
  }
}

export function ordenFromRow(r: OrdenRow): OrdenProduccion {
  return {
    id: r.id,
    nroOrden: r.nro_orden,
    nroContrato: u(r.nro_contrato),
    modelo: r.modelo,
    material: r.material as MaterialBobina,
    linea: r.linea as LineaProduccion,
    cantidad: r.cantidad,
    fechaEntrega: r.fecha_entrega ?? '',
  }
}

export function semiFromRow(r: SemiRow): Semielaborado {
  return {
    id: r.id,
    codigo: r.codigo,
    descripcion: r.descripcion,
    sectorOrigen: r.sector_origen as SectorId,
    modelo: r.modelo,
    fase: u(r.fase),
    tareaOrigenId: u(r.tarea_origen_id),
    ordenDestinoId: u(r.orden_destino_id),
    estado: r.estado as EstadoSemielaborado,
    tiempoEstimadoMin: u(r.tiempo_estimado_min),
    sapItemCode: u(r.sap_item_code),
    actualizado: r.actualizado_en ?? new Date().toISOString(),
  }
}

export function maquinaFromRow(r: MaquinaRow): Maquina {
  return {
    id: r.id,
    nombre: r.nombre,
    sectorId: r.sector_id as SectorId,
    tipo: r.tipo as TipoEstacion,
    activo: r.activo ?? true,
  }
}

export function usuarioFromRow(r: UsuarioRow, sectores: SectorId[]): Usuario {
  return {
    id: r.id,
    nombre: r.nombre,
    usuario: r.usuario,
    passwordHash: '', // la verificacion la hace Supabase Auth
    rol: r.rol as Rol,
    sectores,
    grupoNomina: u(r.grupo_nomina) as GrupoNomina | undefined,
    activo: r.activo ?? true,
  }
}

// ============================================================
// ESCRIBIR: tipo de la app -> fila (snake_case) para upsert
// ============================================================
// Tarea SIN paradas (las paradas se upsertan aparte con paradaToRow).
export function tareaToRow(t: Tarea): TareaRow {
  return {
    id: t.id,
    orden_id: t.ordenId,
    sector_id: t.sectorId,
    maquina_id: t.maquinaId,
    operario_id: t.operarioId ?? null,
    modelo: t.modelo,
    fase: t.fase ?? null,
    nro_transformador: t.nroTransformador ?? null,
    semana: t.semana,
    prioridad: t.prioridad,
    estado: t.estado,
    tiempo_estandar_min: t.tiempoEstandarMin,
    componente_codigo: t.componenteCodigo ?? null,
    inicio_planificado: t.inicioPlanificado ?? null,
    inicio_real: t.inicioReal ?? null,
    fin_real: t.finReal ?? null,
    calidad_ok: t.calidadOk ?? null,
    defecto: t.defecto ?? null,
    bob_diametro_interno_mm: t.datosBobinado?.diametroInternoMm ?? null,
    bob_diametro_externo_mm: t.datosBobinado?.diametroExternoMm ?? null,
    bob_codigo: t.datosBobinado?.codigoBobina ?? null,
    notas: t.notas ?? null,
  }
}

export function paradaToRow(p: Parada): ParadaRow {
  return {
    id: p.id,
    tarea_id: p.tareaId,
    causa: p.causa,
    inicio: p.inicio,
    fin: p.fin ?? null,
    observacion: p.observacion ?? null,
  }
}

export function ordenToRow(o: OrdenProduccion): OrdenRow {
  return {
    id: o.id,
    nro_orden: o.nroOrden,
    nro_contrato: o.nroContrato ?? null,
    modelo: o.modelo,
    material: o.material,
    linea: o.linea,
    cantidad: o.cantidad,
    fecha_entrega: o.fechaEntrega || null,
  }
}

export function semiToRow(s: Semielaborado): SemiRow {
  return {
    id: s.id,
    codigo: s.codigo,
    descripcion: s.descripcion,
    sector_origen: s.sectorOrigen,
    modelo: s.modelo,
    fase: s.fase ?? null,
    tarea_origen_id: s.tareaOrigenId ?? null,
    orden_destino_id: s.ordenDestinoId ?? null,
    estado: s.estado,
    tiempo_estimado_min: s.tiempoEstimadoMin ?? null,
    sap_item_code: s.sapItemCode ?? null,
    actualizado_en: s.actualizado,
  }
}
