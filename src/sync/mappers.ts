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
  DespachoTrafo, EstadoDespacho, DemoraDespacho, ChecklistDespacho, FleteInterno, MovimientoDeposito,
  TareaLaboratorio, EstadoLab, EnsayoEstado, MedicionesEnsayo,
  PlantillaRecurrente,
} from '../types'
import type { AccionSGO, AuditoriaSGO, EventoSGO } from '../sgo/types'
// v1.47: remapea el área retirada 'logistica_administrativa' al leer de la base.
import { normalizarAreaSGO } from '../sgo/types'
import type { IndicadorSGO, MedicionIndicadorSGO } from '../sgo/indicadores'
import type { ControlProgramadoSGO, EjecucionControlSGO } from '../sgo/controles'
import type { ActividadAgendaISO, MarcaSemanaISO } from '../sgo/agendaISO'
import type { ComentarioTareaSGO, TareaSGO } from '../sgo/tareasSGO'

export interface ActividadAgendaISORow {
  id: string; titulo: string; categoria: string; normas: string[]; requisito: string | null; area: string | null
  responsable: string; frecuencia: string; fecha_objetivo: string | null; aviso_dias: number; estado: string
  // v1.84: matriz año x semana. La marca real de la planilla es el casillero pintado.
  semanas: MarcaSemanaISO[] | null; bloque: string | null; orden: number | null
  criticidad: string; evidencia_esperada: string | null; evidencia: string | null; resultado: string | null
  observaciones: string | null; fuente: string | null; completada_en: string | null; completada_por: string | null
  verificada_en: string | null; verificada_por: string | null; verificacion: string | null
  creado_en: string; creado_por: string; actualizado_en: string; actualizado_por: string
}

export interface TareaSGORow {
  id: string; titulo: string; objetivo: string; descripcion: string; asignado_a: string; importancia: string
  tiempo_estimado_min: number; fecha_limite: string | null; estado: string; plan_resolucion: string | null
  tomada_en: string | null; tomada_por: string | null; conclusion: string | null; finalizada_en: string | null
  finalizada_por: string | null; verificada_en: string | null; verificada_por: string | null
  creado_en: string; creado_por: string; actualizado_en: string; actualizado_por: string
}
export interface ComentarioTareaSGORow { id: string; tarea_id: string; autor: string; texto: string; tipo: string; creado_en: string }

export function actividadAgendaISOFromRow(r: ActividadAgendaISORow): ActividadAgendaISO {
  return { id: r.id, titulo: r.titulo, categoria: r.categoria as ActividadAgendaISO['categoria'], normas: r.normas as ActividadAgendaISO['normas'],
    requisito: u(r.requisito), area: u(r.area), responsable: r.responsable, frecuencia: r.frecuencia as ActividadAgendaISO['frecuencia'],
    semanas: r.semanas ?? undefined, bloque: (r.bloque as ActividadAgendaISO['bloque']) ?? undefined, orden: r.orden ?? undefined,
    fechaObjetivo: u(r.fecha_objetivo), avisoDias: r.aviso_dias, estado: r.estado as ActividadAgendaISO['estado'], criticidad: r.criticidad as ActividadAgendaISO['criticidad'],
    evidenciaEsperada: u(r.evidencia_esperada), evidencia: u(r.evidencia), resultado: u(r.resultado), observaciones: u(r.observaciones), fuente: u(r.fuente),
    completadaEn: u(r.completada_en), completadaPor: u(r.completada_por), verificadaEn: u(r.verificada_en), verificadaPor: u(r.verificada_por), verificacion: u(r.verificacion),
    creadoEn: r.creado_en, creadoPor: r.creado_por, actualizadoEn: r.actualizado_en, actualizadoPor: r.actualizado_por }
}

export function actividadAgendaISOToRow(a: ActividadAgendaISO): ActividadAgendaISORow {
  return { id: a.id, titulo: a.titulo, categoria: a.categoria, normas: a.normas, requisito: a.requisito ?? null, area: a.area ?? null,
    responsable: a.responsable, frecuencia: a.frecuencia, fecha_objetivo: a.fechaObjetivo ?? null, aviso_dias: a.avisoDias, estado: a.estado,
    semanas: a.semanas ?? null, bloque: a.bloque ?? null, orden: a.orden ?? null,
    criticidad: a.criticidad, evidencia_esperada: a.evidenciaEsperada ?? null, evidencia: a.evidencia ?? null, resultado: a.resultado ?? null,
    observaciones: a.observaciones ?? null, fuente: a.fuente ?? null, completada_en: a.completadaEn ?? null, completada_por: a.completadaPor ?? null,
    verificada_en: a.verificadaEn ?? null, verificada_por: a.verificadaPor ?? null, verificacion: a.verificacion ?? null,
    creado_en: a.creadoEn, creado_por: a.creadoPor, actualizado_en: a.actualizadoEn, actualizado_por: a.actualizadoPor }
}

export function tareaSGOFromRow(r: TareaSGORow): TareaSGO {
  return { id: r.id, titulo: r.titulo, objetivo: r.objetivo, descripcion: r.descripcion, asignadoA: r.asignado_a as TareaSGO['asignadoA'],
    importancia: r.importancia as TareaSGO['importancia'], tiempoEstimadoMin: r.tiempo_estimado_min, fechaLimite: u(r.fecha_limite), estado: r.estado as TareaSGO['estado'],
    planResolucion: u(r.plan_resolucion), tomadaEn: u(r.tomada_en), tomadaPor: u(r.tomada_por), conclusion: u(r.conclusion), finalizadaEn: u(r.finalizada_en),
    finalizadaPor: u(r.finalizada_por), verificadaEn: u(r.verificada_en), verificadaPor: u(r.verificada_por),
    creadoEn: r.creado_en, creadoPor: r.creado_por, actualizadoEn: r.actualizado_en, actualizadoPor: r.actualizado_por }
}

export function tareaSGOToRow(t: TareaSGO): TareaSGORow {
  return { id: t.id, titulo: t.titulo, objetivo: t.objetivo, descripcion: t.descripcion, asignado_a: t.asignadoA, importancia: t.importancia,
    tiempo_estimado_min: t.tiempoEstimadoMin, fecha_limite: t.fechaLimite ?? null, estado: t.estado, plan_resolucion: t.planResolucion ?? null,
    tomada_en: t.tomadaEn ?? null, tomada_por: t.tomadaPor ?? null, conclusion: t.conclusion ?? null, finalizada_en: t.finalizadaEn ?? null,
    finalizada_por: t.finalizadaPor ?? null, verificada_en: t.verificadaEn ?? null, verificada_por: t.verificadaPor ?? null,
    creado_en: t.creadoEn, creado_por: t.creadoPor, actualizado_en: t.actualizadoEn, actualizado_por: t.actualizadoPor }
}
export function comentarioTareaSGOFromRow(r: ComentarioTareaSGORow): ComentarioTareaSGO { return { id:r.id,tareaId:r.tarea_id,autor:r.autor,texto:r.texto,tipo:r.tipo as ComentarioTareaSGO['tipo'],creadoEn:r.creado_en } }
export function comentarioTareaSGOToRow(c: ComentarioTareaSGO): ComentarioTareaSGORow { return { id:c.id,tarea_id:c.tareaId,autor:c.autor,texto:c.texto,tipo:c.tipo,creado_en:c.creadoEn } }

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
  minutos_recuperacion: number | null
  duracion_efectiva_min: number | null
  inicio_planificado: string | null
  creada_en: string | null
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
  plantilla_id: string | null
  fecha_instancia: string | null
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

export interface EventoSGORow {
  id: string
  codigo: string
  tipo: string
  pilar: string
  titulo: string
  descripcion: string
  severidad: string
  estado: string
  area_id: string | null
  area_origen_id: string | null
  sector_id: string | null
  maquina_id: string | null
  orden_id: string | null
  tarea_id: string | null
  parada_id: string | null
  laboratorio_id: string | null
  despacho_id: string | null
  control_id: string | null
  nro_serie: string | null
  modelo: string | null
  defecto_codigo: string | null
  detectado_en: string
  detectado_por: string
  responsable: string | null
  contencion: string | null
  disposicion: string | null
  cantidad_afectada: number | null
  costo_estimado: number | null
  costo_detalle: EventoSGO['costoDetalle'] | null
  seguridad: EventoSGO['seguridad'] | null
  mejora: EventoSGO['mejora'] | null
  retrabajo: EventoSGO['retrabajo'] | null
  causa_raiz: string | null
  metodo_analisis: string | null
  evidencia_urls: string[] | null
  creado_en: string
  actualizado_en: string
  cerrado_en: string | null
  cerrado_por: string | null
}

export interface AccionSGORow {
  id: string
  evento_id: string
  tipo: string
  descripcion: string
  responsable: string
  fecha_compromiso: string
  estado: string
  evidencia: string | null
  completada_en: string | null
  completada_por: string | null
  verificada_en: string | null
  verificada_por: string | null
  eficaz: boolean | null
  comentario_verificacion: string | null
  creado_en: string
  creado_por: string
  actualizado_en: string
}

export interface IndicadorSGORow {
  id: string
  area_id: string
  pilar: string
  nombre: string
  unidad: string
  direccion: string
  meta: number
  umbral_amarillo: number
  valor_actual: number | null
  origen: string | null
  clave_calculo: string | null
  periodo: string
  frecuencia: string | null
  activo: boolean
  actualizado_en: string
  actualizado_por: string
}

export interface MedicionIndicadorSGORow {
  id: string
  indicador_id: string
  periodo: string
  valor: number
  explicacion: string | null
  evidencia: string | null
  cerrado: boolean
  registrado_en: string
  registrado_por: string
  actualizado_en: string
  actualizado_por: string
}

export interface AuditoriaSGORow {
  id: string
  entidad: string
  entidad_id: string
  operacion: string
  datos_anteriores: Record<string, unknown> | null
  datos_nuevos: Record<string, unknown> | null
  usuario: string
  creado_en: string
}

export function eventoSGOFromRow(r: EventoSGORow): EventoSGO {
  return {
    id: r.id, codigo: r.codigo, tipo: r.tipo as EventoSGO['tipo'], pilar: r.pilar as EventoSGO['pilar'],
    titulo: r.titulo, descripcion: r.descripcion, severidad: r.severidad as EventoSGO['severidad'],
    estado: r.estado as EventoSGO['estado'], areaId: normalizarAreaSGO(u(r.area_id)) as EventoSGO['areaId'], areaOrigenId: normalizarAreaSGO(u(r.area_origen_id)) as EventoSGO['areaOrigenId'], sectorId: u(r.sector_id), maquinaId: u(r.maquina_id),
    ordenId: u(r.orden_id), tareaId: u(r.tarea_id), paradaId: u(r.parada_id), laboratorioId: u(r.laboratorio_id),
    despachoId: u(r.despacho_id), controlId: u(r.control_id), nroSerie: u(r.nro_serie), modelo: u(r.modelo), defectoCodigo: u(r.defecto_codigo), detectadoEn: r.detectado_en,
    detectadoPor: r.detectado_por, responsable: u(r.responsable), contencion: u(r.contencion),
    disposicion: u(r.disposicion) as EventoSGO['disposicion'], cantidadAfectada: u(r.cantidad_afectada),
    costoEstimado: u(r.costo_estimado), costoDetalle: r.costo_detalle ?? undefined, seguridad: r.seguridad ?? undefined,
    mejora: r.mejora ?? undefined, retrabajo: r.retrabajo ?? undefined, causaRaiz: u(r.causa_raiz),
    metodoAnalisis: u(r.metodo_analisis) as EventoSGO['metodoAnalisis'],
    evidenciaUrls: r.evidencia_urls ?? undefined, creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en, cerradoEn: u(r.cerrado_en), cerradoPor: u(r.cerrado_por),
  }
}

export function eventoSGOToRow(e: EventoSGO): EventoSGORow {
  return {
    id: e.id, codigo: e.codigo, tipo: e.tipo, pilar: e.pilar, titulo: e.titulo,
    descripcion: e.descripcion, severidad: e.severidad, estado: e.estado, area_id: e.areaId ?? null, area_origen_id: e.areaOrigenId ?? null,
    sector_id: e.sectorId ?? null, maquina_id: e.maquinaId ?? null, orden_id: e.ordenId ?? null,
    tarea_id: e.tareaId ?? null, parada_id: e.paradaId ?? null, laboratorio_id: e.laboratorioId ?? null, despacho_id: e.despachoId ?? null, control_id: e.controlId ?? null,
    nro_serie: e.nroSerie ?? null, modelo: e.modelo ?? null, defecto_codigo: e.defectoCodigo ?? null, detectado_en: e.detectadoEn, detectado_por: e.detectadoPor,
    responsable: e.responsable ?? null, contencion: e.contencion ?? null,
    disposicion: e.disposicion ?? null, cantidad_afectada: e.cantidadAfectada ?? null,
    costo_estimado: e.costoEstimado ?? null, costo_detalle: e.costoDetalle ?? null, seguridad: e.seguridad ?? null,
    mejora: e.mejora ?? null, retrabajo: e.retrabajo ?? null, causa_raiz: e.causaRaiz ?? null,
    metodo_analisis: e.metodoAnalisis ?? null, evidencia_urls: e.evidenciaUrls ?? null,
    creado_en: e.creadoEn, actualizado_en: e.actualizadoEn, cerrado_en: e.cerradoEn ?? null,
    cerrado_por: e.cerradoPor ?? null,
  }
}

export function accionSGOFromRow(r: AccionSGORow): AccionSGO {
  return {
    id: r.id, eventoId: r.evento_id, tipo: r.tipo as AccionSGO['tipo'], descripcion: r.descripcion,
    responsable: r.responsable, fechaCompromiso: r.fecha_compromiso, estado: r.estado as AccionSGO['estado'],
    evidencia: u(r.evidencia), completadaEn: u(r.completada_en), completadaPor: u(r.completada_por),
    verificadaEn: u(r.verificada_en), verificadaPor: u(r.verificada_por), eficaz: u(r.eficaz),
    comentarioVerificacion: u(r.comentario_verificacion), creadoEn: r.creado_en,
    creadoPor: r.creado_por, actualizadoEn: r.actualizado_en,
  }
}

export function accionSGOToRow(a: AccionSGO): AccionSGORow {
  return {
    id: a.id, evento_id: a.eventoId, tipo: a.tipo, descripcion: a.descripcion,
    responsable: a.responsable, fecha_compromiso: a.fechaCompromiso, estado: a.estado,
    evidencia: a.evidencia ?? null, completada_en: a.completadaEn ?? null,
    completada_por: a.completadaPor ?? null, verificada_en: a.verificadaEn ?? null,
    verificada_por: a.verificadaPor ?? null, eficaz: a.eficaz ?? null,
    comentario_verificacion: a.comentarioVerificacion ?? null, creado_en: a.creadoEn,
    creado_por: a.creadoPor, actualizado_en: a.actualizadoEn,
  }
}

export function indicadorSGOFromRow(r: IndicadorSGORow): IndicadorSGO {
  return {
    id: r.id, areaId: normalizarAreaSGO(r.area_id) as IndicadorSGO['areaId'], pilar: r.pilar as IndicadorSGO['pilar'],
    nombre: r.nombre, unidad: r.unidad, direccion: r.direccion as IndicadorSGO['direccion'],
    meta: r.meta, umbralAmarillo: r.umbral_amarillo, valorActual: u(r.valor_actual),
    origen: (r.origen as IndicadorSGO['origen']) ?? 'manual', claveCalculo: u(r.clave_calculo) as IndicadorSGO['claveCalculo'],
    periodo: r.periodo, frecuencia: (r.frecuencia as IndicadorSGO['frecuencia']) ?? 'mensual', activo: r.activo, actualizadoEn: r.actualizado_en,
    actualizadoPor: r.actualizado_por,
  }
}

export function indicadorSGOToRow(i: IndicadorSGO): IndicadorSGORow {
  return {
    id: i.id, area_id: i.areaId, pilar: i.pilar, nombre: i.nombre, unidad: i.unidad,
    direccion: i.direccion, meta: i.meta, umbral_amarillo: i.umbralAmarillo,
    valor_actual: i.origen === 'automatico' ? null : i.valorActual ?? null,
    origen: i.origen ?? 'manual', clave_calculo: i.claveCalculo ?? null, periodo: i.periodo, frecuencia: i.frecuencia ?? 'mensual', activo: i.activo,
    actualizado_en: i.actualizadoEn, actualizado_por: i.actualizadoPor,
  }
}

export function medicionIndicadorSGOFromRow(r: MedicionIndicadorSGORow): MedicionIndicadorSGO {
  return {
    id: r.id, indicadorId: r.indicador_id, periodo: r.periodo, valor: r.valor,
    explicacion: u(r.explicacion), evidencia: u(r.evidencia), cerrado: r.cerrado,
    registradoEn: r.registrado_en, registradoPor: r.registrado_por,
    actualizadoEn: r.actualizado_en, actualizadoPor: r.actualizado_por,
  }
}

export function medicionIndicadorSGOToRow(m: MedicionIndicadorSGO): MedicionIndicadorSGORow {
  return {
    id: m.id, indicador_id: m.indicadorId, periodo: m.periodo, valor: m.valor,
    explicacion: m.explicacion ?? null, evidencia: m.evidencia ?? null, cerrado: m.cerrado,
    registrado_en: m.registradoEn, registrado_por: m.registradoPor,
    actualizado_en: m.actualizadoEn, actualizado_por: m.actualizadoPor,
  }
}

export function auditoriaSGOFromRow(r: AuditoriaSGORow): AuditoriaSGO {
  return {
    id: r.id, entidad: r.entidad as AuditoriaSGO['entidad'], entidadId: r.entidad_id,
    operacion: r.operacion as AuditoriaSGO['operacion'],
    datosAnteriores: r.datos_anteriores ?? undefined, datosNuevos: r.datos_nuevos ?? undefined,
    usuario: r.usuario, creadoEn: r.creado_en,
  }
}

export interface ControlProgramadoSGORow {
  id: string
  titulo: string
  tipo: string
  area_id: string
  pilar: string
  norma: string | null
  requisito: string | null
  instrucciones: string
  responsable: string
  frecuencia: string
  proxima_fecha: string
  tolerancia_dias: number
  activo: boolean
  creado_en: string
  creado_por: string
  actualizado_en: string
  actualizado_por: string
  plantilla_campo_id: string | null
}

export interface EjecucionControlSGORow {
  id: string
  control_id: string
  fecha_programada: string
  ejecutado_en: string
  ejecutado_por: string
  resultado: string
  detalle: string
  evidencia: string | null
  orden_id: string | null
  nro_serie: string | null
  semielaborado_codigo: string | null
  valor_esperado: string | null
  valor_encontrado: string | null
  unidad: string | null
  evento_id: string | null
  auditoria_logistica: EjecucionControlSGO['auditoriaLogistica'] | null
  auditoria_campo: EjecucionControlSGO['auditoriaCampo'] | null
}

export function controlProgramadoSGOFromRow(r: ControlProgramadoSGORow): ControlProgramadoSGO {
  return {
    id: r.id, titulo: r.titulo, tipo: r.tipo as ControlProgramadoSGO['tipo'],
    areaId: r.area_id as ControlProgramadoSGO['areaId'], pilar: r.pilar as ControlProgramadoSGO['pilar'],
    norma: u(r.norma) as ControlProgramadoSGO['norma'], requisito: u(r.requisito), instrucciones: r.instrucciones,
    responsable: r.responsable, frecuencia: r.frecuencia as ControlProgramadoSGO['frecuencia'],
    proximaFecha: r.proxima_fecha, toleranciaDias: r.tolerancia_dias, activo: r.activo,
    creadoEn: r.creado_en, creadoPor: r.creado_por, actualizadoEn: r.actualizado_en, actualizadoPor: r.actualizado_por,
    plantillaCampoId: u(r.plantilla_campo_id),
  }
}

export function controlProgramadoSGOToRow(c: ControlProgramadoSGO): ControlProgramadoSGORow {
  return {
    id: c.id, titulo: c.titulo, tipo: c.tipo, area_id: c.areaId, pilar: c.pilar,
    norma: c.norma ?? null, requisito: c.requisito ?? null, instrucciones: c.instrucciones,
    responsable: c.responsable, frecuencia: c.frecuencia, proxima_fecha: c.proximaFecha,
    tolerancia_dias: c.toleranciaDias, activo: c.activo, creado_en: c.creadoEn,
    creado_por: c.creadoPor, actualizado_en: c.actualizadoEn, actualizado_por: c.actualizadoPor,
    plantilla_campo_id: c.plantillaCampoId ?? null,
  }
}

export function ejecucionControlSGOFromRow(r: EjecucionControlSGORow): EjecucionControlSGO {
  return {
    id: r.id, controlId: r.control_id, fechaProgramada: r.fecha_programada, ejecutadoEn: r.ejecutado_en,
    ejecutadoPor: r.ejecutado_por, resultado: r.resultado as EjecucionControlSGO['resultado'], detalle: r.detalle,
    evidencia: u(r.evidencia), ordenId: u(r.orden_id), nroSerie: u(r.nro_serie), semielaboradoCodigo: u(r.semielaborado_codigo),
    valorEsperado: u(r.valor_esperado), valorEncontrado: u(r.valor_encontrado), unidad: u(r.unidad), eventoId: u(r.evento_id),
    auditoriaLogistica: u(r.auditoria_logistica), auditoriaCampo: u(r.auditoria_campo),
  }
}

export function ejecucionControlSGOToRow(e: EjecucionControlSGO): EjecucionControlSGORow {
  return {
    id: e.id, control_id: e.controlId, fecha_programada: e.fechaProgramada, ejecutado_en: e.ejecutadoEn,
    ejecutado_por: e.ejecutadoPor, resultado: e.resultado, detalle: e.detalle, evidencia: e.evidencia ?? null,
    orden_id: e.ordenId ?? null, nro_serie: e.nroSerie ?? null, semielaborado_codigo: e.semielaboradoCodigo ?? null,
    valor_esperado: e.valorEsperado ?? null, valor_encontrado: e.valorEncontrado ?? null, unidad: e.unidad ?? null,
    evento_id: e.eventoId ?? null, auditoria_logistica: e.auditoriaLogistica ?? null, auditoria_campo: e.auditoriaCampo ?? null,
  }
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
    minutosRecuperacion: r.minutos_recuperacion ?? undefined,
    duracionEfectivaMin: u(r.duracion_efectiva_min),
    inicioPlanificado: u(r.inicio_planificado),
    creada: u(r.creada_en),
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
  nro_interno?: string | null      // v1.72: stock histórico sin serie oficial
  cargados: string[] | null
  cut: string | null
  modelo?: string | null           // v1.43: descripción completa heredada de Laboratorio
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
  laboratorio_id: string | null
  protocolo_path: string | null
  protocolo_nombre: string | null
  checklist: ChecklistDespacho | null
  deposito?: string | null                       // v1.44
  fecha_deposito?: string | null                 // v1.44
  movimientos?: MovimientoDeposito[] | null      // v1.44
  fecha_despacho: string | null
  transportista: string | null
  patente: string | null
  remito: string | null
  destino: string | null
  redespacho: boolean | null
  transportista2: string | null
  patente2: string | null
  fotos: string[] | null
  fotos_purgadas?: { fecha: string; cantidad: number } | null   // v1.46
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
    nroInterno: u(r.nro_interno ?? null),
    cargados: r.cargados ?? undefined,
    cut: u(r.cut),
    modelo: u(r.modelo ?? null),
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
    laboratorioId: u(r.laboratorio_id),
    protocoloPath: u(r.protocolo_path),
    protocoloNombre: u(r.protocolo_nombre),
    checklist: r.checklist ?? undefined,
    deposito: u(r.deposito ?? null),
    fechaDeposito: u(r.fecha_deposito ?? null),
    movimientos: r.movimientos?.length ? r.movimientos : undefined,
    fechaDespacho: u(r.fecha_despacho),
    transportista: u(r.transportista),
    patente: u(r.patente),
    remito: u(r.remito),
    destino: u(r.destino),
    redespacho: r.redespacho ?? undefined,
    transportista2: u(r.transportista2),
    patente2: u(r.patente2),
    fotos: r.fotos ?? undefined,
    fotosPurgadas: r.fotos_purgadas ?? undefined,
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
    nro_interno: d.nroInterno ?? null,
    cargados: d.cargados ?? null,
    cut: d.cut ?? null,
    modelo: d.modelo ?? null,
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
    laboratorio_id: d.laboratorioId ?? null,
    protocolo_path: d.protocoloPath ?? null,
    protocolo_nombre: d.protocoloNombre ?? null,
    checklist: d.checklist ?? null,
    deposito: d.deposito ?? null,
    fecha_deposito: d.fechaDeposito ?? null,
    movimientos: d.movimientos?.length ? d.movimientos : null,
    fecha_despacho: d.fechaDespacho ?? null,
    transportista: d.transportista ?? null,
    patente: d.patente ?? null,
    remito: d.remito ?? null,
    destino: d.destino ?? null,
    redespacho: d.redespacho ?? null,
    transportista2: d.transportista2 ?? null,
    patente2: d.patente2 ?? null,
    fotos: d.fotos ?? null,
    fotos_purgadas: d.fotosPurgadas ?? null,
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
  cliente?: string | null          // v1.42
  series?: string[] | null         // v1.42
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
    cliente: u(r.cliente ?? null),
    series: r.series?.length ? r.series : undefined,
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
    cliente: f.cliente ?? null,
    series: f.series?.length ? f.series : null,
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
  protocolo_path: string | null
  protocolo_nombre: string | null
  protocolo_subido_en: string | null
  reaperturas: { en: string; por?: string }[] | null
  // v1.82/83: protocolo de ensayo completo (jsonb).
  mediciones: MedicionesEnsayo | null
  // v1.80: anulacion de ficha (super admin). Ver EstadoLab en types.
  anulada_en: string | null
  anulada_por: string | null
  motivo_anulacion: string | null
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
    protocoloPath: u(r.protocolo_path),
    protocoloNombre: u(r.protocolo_nombre),
    protocoloSubido: u(r.protocolo_subido_en),
    reaperturas: r.reaperturas ?? undefined,
    mediciones: r.mediciones ?? undefined,
    anuladaEn: u(r.anulada_en),
    anuladaPor: u(r.anulada_por),
    motivoAnulacion: u(r.motivo_anulacion),
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
    protocolo_path: t.protocoloPath ?? null,
    protocolo_nombre: t.protocoloNombre ?? null,
    protocolo_subido_en: t.protocoloSubido ?? null,
    reaperturas: t.reaperturas ?? null,
    mediciones: t.mediciones ?? null,
    anulada_en: t.anuladaEn ?? null,
    anulada_por: t.anuladaPor ?? null,
    motivo_anulacion: t.motivoAnulacion ?? null,
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
    plantillaId: u(r.plantilla_id),
    fechaInstancia: u(r.fecha_instancia),
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
    plantilla_id: t.plantillaId ?? null,
    fecha_instancia: t.fechaInstancia ?? null,
  }
}

// ---- Plantillas recurrentes (v1.39) ----
export interface PlantillaRecurrenteRow {
  id: string
  origen: string | null
  titulo: string
  detalle: string | null
  responsables: string[] | null
  prioridad: string
  estimado_min: number | null
  dias: number[]
  hora: string | null
  activa: boolean
  salteos: string[] | null
  ultima_generacion?: string | null   // v1.42: candado anti-respawn
  creada_en: string
  creada_por: string | null
}
export function plantillaFromRow(r: PlantillaRecurrenteRow): PlantillaRecurrente {
  return {
    id: r.id,
    origen: (r.origen as PlantillaRecurrente['origen']) ?? undefined,
    titulo: r.titulo,
    detalle: u(r.detalle),
    responsables: r.responsables ?? undefined,
    prioridad: r.prioridad as PrioridadLog,
    estimadoMin: r.estimado_min ?? undefined,
    dias: r.dias ?? [],
    hora: u(r.hora),
    activa: r.activa,
    salteos: r.salteos ?? undefined,
    ultimaGeneracion: u(r.ultima_generacion ?? null),
    creada: r.creada_en,
    creadaPor: u(r.creada_por),
  }
}
export function plantillaToRow(p: PlantillaRecurrente): PlantillaRecurrenteRow {
  return {
    id: p.id,
    origen: p.origen ?? 'logistica',
    titulo: p.titulo,
    detalle: p.detalle ?? null,
    responsables: p.responsables ?? null,
    prioridad: p.prioridad,
    estimado_min: p.estimadoMin ?? null,
    dias: p.dias ?? [],
    hora: p.hora ?? null,
    activa: p.activa,
    salteos: p.salteos ?? null,
    // v1.74: NO se manda `ultima_generacion`. Si la columna no existe en
    // Supabase, PostgREST rechaza el upsert entero, el sync lo marca FATAL y lo
    // parkea — la plantilla nunca sube. Como `fetchInicial` limpia Dexie y la
    // repuebla desde Supabase, la recurrencia recién creada DESAPARECÍA sola.
    // El candado anti-respawn no la necesita (ver lib/recurrencia.ts).
    creada_en: p.creada,
    creada_por: p.creadaPor ?? null,
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
    minutos_recuperacion: t.minutosRecuperacion ?? null,
    duracion_efectiva_min: t.duracionEfectivaMin ?? null,
    inicio_planificado: t.inicioPlanificado ?? null,
    creada_en: t.creada ?? null,
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
