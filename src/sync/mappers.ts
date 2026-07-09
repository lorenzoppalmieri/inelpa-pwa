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
  EstadoSemielaborado, TipoEstacion, GrupoNomina, DatosBobinado, TipoTarea,
  Objetivo, AndonAreaId, TareaLogistica, PrioridadLog,
  SolicitudLogistica, EstadoSolicitudLog, Feriado,
  Mensaje, MensajeDestinoTipo, MensajeLectura,
} from '../types'

// null -> undefined (Supabase devuelve null; la app usa undefined en opcionales).
function u<T>(v: T | null | undefined): T | undefined {
  return v === null || v === undefined ? undefined : v
}

// ---------- Tipos crudos de fila (solo los campos que usamos) ----------
export interface TareaRow {
  id: string
  tipo: string | null
  orden_id: string | null
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
  activa_hora_recuperacion: boolean | null
  duracion_efectiva_min: number | null
  inicio_planificado: string | null
  inicio_real: string | null
  fin_real: string | null
  calidad_ok: boolean | null
  defecto: string | null
  bob_diametro_interno_mm: number | null
  bob_diametro_externo_mm: number | null
  bob_codigo: string | null
  notas: string | null
  es_prototipo: boolean | null
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

export interface ObjetivoRow {
  id: string
  periodo: string
  area: string
  cantidad: number
  actualizado_en: string | null
}

export interface TareaLogisticaRow {
  id: string
  titulo: string
  detalle: string | null
  responsable: string
  responsables: string[] | null
  prioridad: string
  estado: string
  creada_en: string
  creada_por: string | null
  iniciada_en: string | null
  iniciada_por: string | null
  finalizada_en: string | null
  finalizada_por: string | null
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
    tipo: (r.tipo as TipoTarea) ?? 'fabricacion',
    ordenId: u(r.orden_id),
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
    activaHoraRecuperacion: u(r.activa_hora_recuperacion),
    duracionEfectivaMin: u(r.duracion_efectiva_min),
    inicioPlanificado: u(r.inicio_planificado),
    inicioReal: u(r.inicio_real),
    finReal: u(r.fin_real),
    calidadOk: u(r.calidad_ok),
    defecto: u(r.defecto),
    paradas,
    datosBobinado: tieneDatos ? datos : undefined,
    notas: u(r.notas),
    esPrototipo: r.es_prototipo ?? false,
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

export function objetivoFromRow(r: ObjetivoRow): Objetivo {
  return {
    id: r.id,
    periodo: r.periodo,
    area: r.area as AndonAreaId,
    cantidad: r.cantidad,
    actualizado: r.actualizado_en ?? new Date().toISOString(),
  }
}
export function objetivoToRow(o: Objetivo): ObjetivoRow {
  return {
    id: o.id,
    periodo: o.periodo,
    area: o.area,
    cantidad: o.cantidad,
    actualizado_en: o.actualizado,
  }
}

// ---------- Feriados (v1.17) ----------
export interface FeriadoRow {
  id: string
  fecha: string
  descripcion: string | null
  actualizado_en: string | null
}
export function feriadoFromRow(r: FeriadoRow): Feriado {
  return {
    id: r.id,
    fecha: r.fecha,
    descripcion: u(r.descripcion),
    actualizado: r.actualizado_en ?? new Date().toISOString(),
  }
}
export function feriadoToRow(f: Feriado): FeriadoRow {
  return {
    id: f.id,
    fecha: f.fecha,
    descripcion: f.descripcion ?? null,
    actualizado_en: f.actualizado,
  }
}

// ---------- Mensajes (v1.18) ----------
export interface MensajeRow {
  id: string
  autor_id: string
  autor_nombre: string
  texto: string
  destino_tipo: string
  destino_id: string | null
  creado_en: string | null
}
export function mensajeFromRow(r: MensajeRow): Mensaje {
  return {
    id: r.id,
    autorId: r.autor_id,
    autorNombre: r.autor_nombre,
    texto: r.texto,
    destinoTipo: r.destino_tipo as MensajeDestinoTipo,
    destinoId: u(r.destino_id),
    creado: r.creado_en ?? new Date().toISOString(),
  }
}
export function mensajeToRow(m: Mensaje): MensajeRow {
  return {
    id: m.id,
    autor_id: m.autorId,
    autor_nombre: m.autorNombre,
    texto: m.texto,
    destino_tipo: m.destinoTipo,
    destino_id: m.destinoId ?? null,
    creado_en: m.creado,
  }
}

export interface MensajeLecturaRow {
  id: string
  mensaje_id: string
  usuario_id: string
  leido_en: string | null
}
export function lecturaFromRow(r: MensajeLecturaRow): MensajeLectura {
  return { id: r.id, mensajeId: r.mensaje_id, usuarioId: r.usuario_id, leidoEn: r.leido_en ?? new Date().toISOString() }
}
export function lecturaToRow(l: MensajeLectura): MensajeLecturaRow {
  return { id: l.id, mensaje_id: l.mensajeId, usuario_id: l.usuarioId, leido_en: l.leidoEn }
}

export function tareaLogFromRow(r: TareaLogisticaRow): TareaLogistica {
  return {
    id: r.id,
    titulo: r.titulo,
    detalle: u(r.detalle),
    responsable: r.responsable,
    responsables: r.responsables ?? undefined,
    prioridad: r.prioridad as PrioridadLog,
    estado: r.estado as TareaLogistica['estado'],
    creada: r.creada_en,
    creadaPor: u(r.creada_por),
    iniciada: u(r.iniciada_en),
    iniciadaPor: u(r.iniciada_por),
    finalizada: u(r.finalizada_en),
    finalizadaPor: u(r.finalizada_por),
  }
}
export function tareaLogToRow(t: TareaLogistica): TareaLogisticaRow {
  return {
    id: t.id,
    titulo: t.titulo,
    detalle: t.detalle ?? null,
    responsable: t.responsable,
    responsables: t.responsables ?? null,
    prioridad: t.prioridad,
    estado: t.estado,
    creada_en: t.creada,
    creada_por: t.creadaPor ?? null,
    iniciada_en: t.iniciada ?? null,
    iniciada_por: t.iniciadaPor ?? null,
    finalizada_en: t.finalizada ?? null,
    finalizada_por: t.finalizadaPor ?? null,
  }
}

export interface SolicitudLogisticaRow {
  id: string
  parada_id: string
  tarea_id: string
  asignado: string | null
  estado: string
  creada_en: string
  tomada_en: string | null
  entregada_en: string | null
  actualizado_en: string | null
}
export function solicitudLogFromRow(r: SolicitudLogisticaRow): SolicitudLogistica {
  return {
    id: r.id,
    paradaId: r.parada_id,
    tareaId: r.tarea_id,
    asignado: u(r.asignado),
    estado: r.estado as EstadoSolicitudLog,
    creada: r.creada_en,
    tomadaEn: u(r.tomada_en),
    entregadaEn: u(r.entregada_en),
    actualizado: r.actualizado_en ?? new Date().toISOString(),
  }
}
export function solicitudLogToRow(s: SolicitudLogistica): SolicitudLogisticaRow {
  return {
    id: s.id,
    parada_id: s.paradaId,
    tarea_id: s.tareaId,
    asignado: s.asignado ?? null,
    estado: s.estado,
    creada_en: s.creada,
    tomada_en: s.tomadaEn ?? null,
    entregada_en: s.entregadaEn ?? null,
    actualizado_en: s.actualizado,
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
    tipo: t.tipo ?? 'fabricacion',
    orden_id: t.ordenId ?? null,
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
    activa_hora_recuperacion: t.activaHoraRecuperacion ?? false,
    duracion_efectiva_min: t.duracionEfectivaMin ?? null,
    inicio_planificado: t.inicioPlanificado ?? null,
    inicio_real: t.inicioReal ?? null,
    fin_real: t.finReal ?? null,
    calidad_ok: t.calidadOk ?? null,
    defecto: t.defecto ?? null,
    bob_diametro_interno_mm: t.datosBobinado?.diametroInternoMm ?? null,
    bob_diametro_externo_mm: t.datosBobinado?.diametroExternoMm ?? null,
    bob_codigo: t.datosBobinado?.codigoBobina ?? null,
    notas: t.notas ?? null,
    es_prototipo: t.esPrototipo ?? false,
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
