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
  TiempoEstandar, AreaDemora, BloqueoLog,
  DespachoTrafo, EstadoDespacho, DemoraDespacho, ChecklistDespacho, FleteInterno,
  TareaLaboratorio, EstadoLab, EnsayoEstado,
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
  cliente: string | null
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
  creada_en: string | null
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

export interface TiempoEstandarRow {
  id: string
  area: string
  modelo: string
  maquina_id: string | null
  minutos: number
  actualizado_en: string | null
}

export interface TareaLogisticaRow {
  id: string
  origen: string | null
  titulo: string
  detalle: string | null
  responsable: string
  responsables: string[] | null
  prioridad: string
  fecha_programada: string | null
  estimado_min: number | null
  estado: string
  creada_en: string
  creada_por: string | null
  iniciada_en: string | null
  iniciada_por: string | null
  pausada_en: string | null
  minutos_pausada: number | null
  bloqueo_motivo: string | null
  bloqueos: BloqueoLog[] | null
  finalizada_en: string | null
  finalizada_por: string | null
  nota_cierre: string | null
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
    cliente: u(r.cliente),
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
    creada: u(r.creada_en),
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

export function estandarFromRow(r: TiempoEstandarRow): TiempoEstandar {
  return {
    id: r.id,
    area: r.area as AreaDemora,
    modelo: r.modelo,
    maquinaId: u(r.maquina_id),
    minutos: r.minutos,
    actualizado: r.actualizado_en ?? new Date().toISOString(),
  }
}
export function estandarToRow(e: TiempoEstandar): TiempoEstandarRow {
  return {
    id: e.id,
    area: e.area,
    modelo: e.modelo,
    maquina_id: e.maquinaId ?? null,
    minutos: e.minutos,
    actualizado_en: e.actualizado,
  }
}

// ---------- Despacho y embalaje (v1.27) ----------
export interface DespachoRow {
  id: string
  ot: string
  cliente: string
  nro_serie: string
  numeros_serie: string[] | null
  cargados: string[] | null
  cut: string | null
  potencia: string | null
  tipo: string | null
  linea: string
  fecha_ingreso: string
  estado: string
  operario: string | null
  ubicacion_deposito: string | null
  embalaje_inicio: string | null
  embalaje_fin: string | null
  tipo_embalaje: string | null
  observaciones: string | null
  demora_en_curso: string | null
  minutos_demora: number | null
  demoras: DemoraDespacho[] | null
  checklist: ChecklistDespacho | null
  fecha_despacho: string | null
  transportista: string | null
  patente: string | null
  remito: string | null
  destino: string | null
  redespacho: boolean | null
  transportista2: string | null
  patente2: string | null
  fotos: string[] | null
  creada_en: string
  creada_por: string | null
  entregada_en: string | null
}

export function despachoFromRow(r: DespachoRow): DespachoTrafo {
  return {
    id: r.id,
    ot: r.ot,
    cliente: r.cliente,
    nroSerie: r.nro_serie,
    numerosSerie: r.numeros_serie ?? undefined,
    cargados: r.cargados ?? undefined,
    cut: u(r.cut),
    potencia: u(r.potencia),
    tipo: u(r.tipo),
    linea: r.linea as LineaProduccion,
    fechaIngreso: r.fecha_ingreso,
    estado: r.estado as EstadoDespacho,
    operario: u(r.operario),
    ubicacionDeposito: u(r.ubicacion_deposito),
    embalajeInicio: u(r.embalaje_inicio),
    embalajeFin: u(r.embalaje_fin),
    tipoEmbalaje: u(r.tipo_embalaje),
    observaciones: u(r.observaciones),
    demoraEnCurso: u(r.demora_en_curso),
    minutosDemora: r.minutos_demora ?? undefined,
    demoras: r.demoras ?? undefined,
    checklist: r.checklist ?? undefined,
    fechaDespacho: u(r.fecha_despacho),
    transportista: u(r.transportista),
    patente: u(r.patente),
    remito: u(r.remito),
    destino: u(r.destino),
    redespacho: r.redespacho ?? undefined,
    transportista2: u(r.transportista2),
    patente2: u(r.patente2),
    fotos: r.fotos ?? undefined,
    creada: r.creada_en,
    creadaPor: u(r.creada_por),
    entregadaEn: u(r.entregada_en),
  }
}
export function despachoToRow(d: DespachoTrafo): DespachoRow {
  return {
    id: d.id,
    ot: d.ot,
    cliente: d.cliente,
    nro_serie: d.nroSerie,
    numeros_serie: d.numerosSerie ?? null,
    cargados: d.cargados ?? null,
    cut: d.cut ?? null,
    potencia: d.potencia ?? null,
    tipo: d.tipo ?? null,
    linea: d.linea,
    fecha_ingreso: d.fechaIngreso,
    estado: d.estado,
    operario: d.operario ?? null,
    ubicacion_deposito: d.ubicacionDeposito ?? null,
    embalaje_inicio: d.embalajeInicio ?? null,
    embalaje_fin: d.embalajeFin ?? null,
    tipo_embalaje: d.tipoEmbalaje ?? null,
    observaciones: d.observaciones ?? null,
    demora_en_curso: d.demoraEnCurso ?? null,
    minutos_demora: d.minutosDemora ?? null,
    demoras: d.demoras ?? null,
    checklist: d.checklist ?? null,
    fecha_despacho: d.fechaDespacho ?? null,
    transportista: d.transportista ?? null,
    patente: d.patente ?? null,
    remito: d.remito ?? null,
    destino: d.destino ?? null,
    redespacho: d.redespacho ?? null,
    transportista2: d.transportista2 ?? null,
    patente2: d.patente2 ?? null,
    fotos: d.fotos ?? null,
    creada_en: d.creada,
    creada_por: d.creadaPor ?? null,
    entregada_en: d.entregadaEn ?? null,
  }
}

// ---------- Fletes / viajes internos (v1.28) ----------
export interface FleteRow {
  id: string
  fecha: string
  concepto: string
  costo: number
  transportista: string | null
  observaciones: string | null
  creada_en: string
  creada_por: string | null
}
export function fleteFromRow(r: FleteRow): FleteInterno {
  return {
    id: r.id,
    fecha: r.fecha,
    concepto: r.concepto,
    costo: r.costo,
    transportista: u(r.transportista),
    observaciones: u(r.observaciones),
    creada: r.creada_en,
    creadaPor: u(r.creada_por),
  }
}
export function fleteToRow(f: FleteInterno): FleteRow {
  return {
    id: f.id,
    fecha: f.fecha,
    concepto: f.concepto,
    costo: f.costo,
    transportista: f.transportista ?? null,
    observaciones: f.observaciones ?? null,
    creada_en: f.creada,
    creada_por: f.creadaPor ?? null,
  }
}

// ---------- Laboratorio (v1.37) ----------
export interface LaboratorioRow {
  id: string
  modelo: string
  cliente: string | null
  nro_serie: string | null
  ot: string | null
  linea: string | null
  orden_id: string | null
  tarea_origen_id: string | null
  estado: string
  ensayos: Record<string, EnsayoEstado> | null
  comentario: string | null
  resultado: string | null
  retrabajo_resuelto: boolean | null
  creada_en: string
  creada_por: string | null
  finalizada_en: string | null
  finalizada_por: string | null
}
export function laboratorioFromRow(r: LaboratorioRow): TareaLaboratorio {
  return {
    id: r.id,
    modelo: r.modelo,
    cliente: u(r.cliente),
    nroSerie: u(r.nro_serie),
    ot: u(r.ot),
    linea: (r.linea as LineaProduccion | null) ?? undefined,
    ordenId: u(r.orden_id),
    tareaOrigenId: u(r.tarea_origen_id),
    estado: r.estado as EstadoLab,
    ensayos: r.ensayos ?? undefined,
    comentario: u(r.comentario),
    resultado: (r.resultado as TareaLaboratorio['resultado']) ?? undefined,
    retrabajoResuelto: r.retrabajo_resuelto ?? undefined,
    creada: r.creada_en,
    creadaPor: u(r.creada_por),
    finalizada: u(r.finalizada_en),
    finalizadaPor: u(r.finalizada_por),
  }
}
export function laboratorioToRow(t: TareaLaboratorio): LaboratorioRow {
  return {
    id: t.id,
    modelo: t.modelo,
    cliente: t.cliente ?? null,
    nro_serie: t.nroSerie ?? null,
    ot: t.ot ?? null,
    linea: t.linea ?? null,
    orden_id: t.ordenId ?? null,
    tarea_origen_id: t.tareaOrigenId ?? null,
    estado: t.estado,
    ensayos: t.ensayos ?? null,
    comentario: t.comentario ?? null,
    resultado: t.resultado ?? null,
    retrabajo_resuelto: t.retrabajoResuelto ?? null,
    creada_en: t.creada,
    creada_por: t.creadaPor ?? null,
    finalizada_en: t.finalizada ?? null,
    finalizada_por: t.finalizadaPor ?? null,
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
    origen: (r.origen as TareaLogistica['origen']) ?? undefined,
    titulo: r.titulo,
    detalle: u(r.detalle),
    responsable: r.responsable,
    responsables: r.responsables ?? undefined,
    prioridad: r.prioridad as PrioridadLog,
    fechaProgramada: u(r.fecha_programada),
    estimadoMin: r.estimado_min ?? undefined,
    estado: r.estado as TareaLogistica['estado'],
    creada: r.creada_en,
    creadaPor: u(r.creada_por),
    iniciada: u(r.iniciada_en),
    iniciadaPor: u(r.iniciada_por),
    pausadaEn: u(r.pausada_en),
    minutosPausada: r.minutos_pausada ?? undefined,
    bloqueoMotivo: u(r.bloqueo_motivo),
    bloqueos: r.bloqueos ?? undefined,
    finalizada: u(r.finalizada_en),
    finalizadaPor: u(r.finalizada_por),
    notaCierre: u(r.nota_cierre),
  }
}
export function tareaLogToRow(t: TareaLogistica): TareaLogisticaRow {
  return {
    id: t.id,
    origen: t.origen ?? 'logistica',
    titulo: t.titulo,
    detalle: t.detalle ?? null,
    responsable: t.responsable,
    responsables: t.responsables ?? null,
    prioridad: t.prioridad,
    fecha_programada: t.fechaProgramada ?? null,
    estimado_min: t.estimadoMin ?? null,
    estado: t.estado,
    creada_en: t.creada,
    creada_por: t.creadaPor ?? null,
    iniciada_en: t.iniciada ?? null,
    iniciada_por: t.iniciadaPor ?? null,
    pausada_en: t.pausadaEn ?? null,
    minutos_pausada: t.minutosPausada ?? null,
    bloqueo_motivo: t.bloqueoMotivo ?? null,
    bloqueos: t.bloqueos ?? null,
    finalizada_en: t.finalizada ?? null,
    finalizada_por: t.finalizadaPor ?? null,
    nota_cierre: t.notaCierre ?? null,
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
    cliente: t.cliente ?? null,
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
    creada_en: o.creada ?? null,
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
