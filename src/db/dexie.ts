import Dexie, { type Table } from 'dexie'
import type {
  Usuario, Tarea, OrdenProduccion, SyncOp, Semielaborado, Maquina,
  ModeloTransformador, ComponenteSemielaborado, Objetivo, TareaLogistica, SolicitudLogistica, Feriado,
  Mensaje, MensajeLectura, TiempoEstandar, DespachoTrafo, FleteInterno, TareaLaboratorio,
  PlantillaRecurrente,
} from '../types'
import type { EventoSGO, AccionSGO, AuditoriaSGO } from '../sgo/types'
import type { IndicadorSGO, MedicionIndicadorSGO } from '../sgo/indicadores'
import type { ControlProgramadoSGO, EjecucionControlSGO } from '../sgo/controles'
import type { ActividadAgendaISO } from '../sgo/agendaISO'
import type { ComentarioTareaSGO, TareaSGO } from '../sgo/tareasSGO'
import type { AvisoMantPendiente } from '../mantenimiento/types'

// ============================================================
// Capa offline-first con IndexedDB (via Dexie).
// Toda escritura ocurre primero aqui (la tablet siempre responde),
// y luego el motor de sync (src/sync/syncEngine.ts) la empuja al backend.
// ============================================================
export class InelpaDB extends Dexie {
  usuarios!: Table<Usuario, string>
  ordenes!: Table<OrdenProduccion, string>
  tareas!: Table<Tarea, string>
  syncQueue!: Table<SyncOp, string>
  semielaborados!: Table<Semielaborado, string>
  maquinas!: Table<Maquina, string>
  modelos!: Table<ModeloTransformador, string>
  componentes!: Table<ComponenteSemielaborado, string>
  objetivos!: Table<Objetivo, string>
  tareasLogistica!: Table<TareaLogistica, string>
  solicitudesLogistica!: Table<SolicitudLogistica, string>
  feriados!: Table<Feriado, string>
  mensajes!: Table<Mensaje, string>
  mensajesLectura!: Table<MensajeLectura, string>
  estandares!: Table<TiempoEstandar, string>
  despachos!: Table<DespachoTrafo, string>
  fletes!: Table<FleteInterno, string>
  laboratorio!: Table<TareaLaboratorio, string>
  plantillasRecurrentes!: Table<PlantillaRecurrente, string>
  // v1.49: maestro de parámetros normativos por modelo (espejo de datos_tecnicos).
  // Fila genérica: la tabla salió de un Excel y los encabezados son variables.
  datosTecnicos!: Table<Record<string, unknown>, string>
  eventosSGO!: Table<EventoSGO, string>
  accionesSGO!: Table<AccionSGO, string>
  indicadoresSGO!: Table<IndicadorSGO, string>
  medicionesIndicadoresSGO!: Table<MedicionIndicadorSGO, string>
  auditoriaSGO!: Table<AuditoriaSGO, string>
  controlesProgramadosSGO!: Table<ControlProgramadoSGO, string>
  ejecucionesControlesSGO!: Table<EjecucionControlSGO, string>
  agendaISO!: Table<ActividadAgendaISO, string>
  tareasSGO!: Table<TareaSGO, string>
  comentariosTareasSGO!: Table<ComentarioTareaSGO, string>
  // v1.66: cola offline de avisos de mantenimiento (paradas de produccion ->
  // mant_avisos). El flush lo hace src/mantenimiento/avisos.ts.
  avisosMant!: Table<AvisoMantPendiente, string>

  constructor() {
    super('inelpa_pwa')
    this.version(1).stores({
      usuarios: 'id, usuario, rol',
      ordenes: 'id, nroOrden, linea',
      tareas: 'id, ordenId, sectorId, operarioId, estado, semana',
      // Nota: Dexie no indexa booleanos de forma fiable; "sincronizado" se filtra en memoria.
      syncQueue: 'id, entidad',
    })
    // v1.1: cache local de semielaborados (espejo de articulos OITM de SAP B1).
    this.version(2).stores({
      semielaborados: 'id, codigo, sectorOrigen, estado, modelo',
    })
    // v1.2: catalogo de estaciones de trabajo (maquina/box/linea) + las tareas se
    // asignan a una maquina (maquinaId), no a un colaborador. Re-indexamos tareas
    // para poder consultar la cola por maquina.
    this.version(3).stores({
      maquinas: 'id, sectorId, tipo',
      tareas: 'id, ordenId, sectorId, operarioId, maquinaId, estado, semana',
    })
    // v1.5: catalogo maestro estatico (modelos de transformador + componentes/BOM),
    // sembrado desde SAP B1 (OITM). PK = codigo (ItemCode).
    this.version(4).stores({
      modelos: 'codigo, linea, fase, material',
      componentes: 'codigo, categoria, sectorId, linea, nivel',
    })
    // v1.10: objetivos mensuales de produccion por area (ANDON).
    this.version(5).stores({
      objetivos: 'id, periodo, area',
    })
    // v1.12: tareas logisticas (organizador de abastecimiento).
    this.version(6).stores({
      tareasLogistica: 'id, estado, responsable, prioridad, creada',
    })
    // v1.13: solicitudes logisticas (cola de pedidos de material). id = parada.id
    this.version(7).stores({
      solicitudesLogistica: 'id, paradaId, tareaId, estado, asignado',
    })
    // v1.17: feriados / dias no laborables de planta. id = fecha 'YYYY-MM-DD'.
    this.version(8).stores({
      feriados: 'id, fecha',
    })
    // v1.18: mensajes (planificador -> colaborador) + acuse de lectura.
    this.version(9).stores({
      mensajes: 'id, autorId, destinoTipo, destinoId, creado',
      mensajesLectura: 'id, mensajeId, usuarioId',
    })
    // v1.24: tiempos estandar dinamicos (repositorio de estimados afinables).
    this.version(10).stores({
      estandares: 'id, area, modelo, maquinaId',
    })
    // v1.27: despacho y embalaje (sector Melany).
    this.version(11).stores({
      despachos: 'id, estado, nroSerie, ot, linea, operario, creada',
    })
    // v1.28: fletes / viajes internos (costos de flete).
    this.version(12).stores({
      fletes: 'id, fecha, creada',
    })
    // v1.37: laboratorio (cola de ensayos).
    this.version(13).stores({
      laboratorio: 'id, estado, ordenId, tareaOrigenId, nroSerie, creada',
    })
    // v1.39: plantillas de tareas recurrentes + re-index de tareasLogistica con
    // plantillaId (para buscar las instancias de una plantilla rápido).
    this.version(14).stores({
      plantillasRecurrentes: 'id, origen, activa, creada',
      tareasLogistica: 'id, estado, responsable, prioridad, creada, plantillaId, fechaInstancia',
    })
    // v1.48: índice por laboratorioId. Es la clave anti-duplicado: antes de crear
    // un despacho se busca si ese ensayo ya generó uno. Sin el índice, el
    // .where('laboratorioId') de Dexie tira excepción.
    this.version(15).stores({
      despachos: 'id, estado, nroSerie, ot, linea, operario, creada, laboratorioId',
    })
    // v1.49: nucleo transversal del Sistema de Gestion Operacional.
    this.version(16).stores({
      eventosSGO: 'id, codigo, pilar, tipo, estado, severidad, sectorId, tareaId, laboratorioId, detectadoEn, responsable',
      accionesSGO: 'id, eventoId, estado, responsable, fechaCompromiso, tipo',
    })
    // v1.51: areas SGO de toda la empresa, independientes del catalogo de
    // sectores productivos utilizado por Planificacion.
    this.version(17).stores({
      eventosSGO: 'id, codigo, pilar, tipo, estado, severidad, areaId, sectorId, tareaId, laboratorioId, detectadoEn, responsable',
    })
    // v1.52: origen de la no conformidad separado del area de deteccion.
    this.version(18).stores({
      eventosSGO: 'id, codigo, pilar, tipo, estado, severidad, areaId, areaOrigenId, defectoCodigo, sectorId, tareaId, laboratorioId, detectadoEn, responsable',
    })
    // v1.52: vinculacion idempotente con paradas productivas de calidad.
    this.version(19).stores({
      eventosSGO: 'id, codigo, pilar, tipo, estado, severidad, areaId, areaOrigenId, defectoCodigo, sectorId, tareaId, paradaId, laboratorioId, detectadoEn, responsable',
    })
    // v1.53: metas y valores KPI por celda Area x Pilar.
    this.version(20).stores({
      indicadoresSGO: 'id, areaId, pilar, activo, periodo, [areaId+pilar]',
    })
    // v1.54: espejo local del maestro de datos técnicos, para que el laboratorio
    // consulte los valores garantizados aunque la tablet quede sin señal.
    this.version(21).stores({
      datosTecnicos: 'id',
    })
    // v1.60: registro ISO 9001 de transformadores en garantía.
    this.version(22).stores({
      garantiasISO: 'id, codigo, nroSerie, fechaDeteccion, cliente, cobertura, categoria, estado, responsable',
    })
    // v1.64: historial de mediciones KPI y bitácora de auditoría generada en Supabase.
    this.version(23).stores({
      medicionesIndicadoresSGO: 'id, indicadorId, periodo, cerrado, [indicadorId+periodo]',
      auditoriaSGO: 'id, entidad, entidadId, creadoEn, [entidad+entidadId]',
      garantiasISO: 'id, codigo, nroSerie, fechaDeteccion, cliente, cobertura, categoria, estado, responsable, areaResponsableId, eventoId',
    })
    // v1.65: agenda recurrente de controles y registro inmutable de ejecuciones.
    this.version(24).stores({
      controlesProgramadosSGO: 'id, tipo, areaId, pilar, responsable, proximaFecha, activo, [areaId+pilar]',
      ejecucionesControlesSGO: 'id, controlId, fechaProgramada, ejecutadoEn, resultado, eventoId, [controlId+fechaProgramada]',
      eventosSGO: 'id, codigo, pilar, tipo, estado, severidad, areaId, areaOrigenId, defectoCodigo, sectorId, tareaId, paradaId, laboratorioId, controlId, detectadoEn, responsable',
    })
    // v1.66: cola offline de avisos de mantenimiento. paradaId es la clave
    // anti-duplicado (un aviso por parada). "sincronizado" se filtra en memoria
    // (Dexie no indexa booleanos de forma fiable, igual que en syncQueue).
    this.version(25).stores({
      avisosMant: 'id, paradaId',
    })
    // v1.84: controles de campo estructurados (5S) y vínculo de plantilla.
    // El detalle de respuestas viaja en la ejecución para conservar exactamente
    // la versión auditada y mantener el flujo offline-first ya existente.
    this.version(26).stores({
      controlesProgramadosSGO: 'id, tipo, areaId, pilar, responsable, proximaFecha, activo, plantillaCampoId, [areaId+pilar]',
      ejecucionesControlesSGO: 'id, controlId, fechaProgramada, ejecutadoEn, resultado, eventoId, [controlId+fechaProgramada]',
    })
    // v1.87: agenda integrada ISO y asignación interna de tareas del equipo SGO.
    this.version(27).stores({
      garantiasISO: null,
      agendaISO: 'id, categoria, responsable, fechaObjetivo, estado, criticidad',
      tareasSGO: 'id, asignadoA, importancia, fechaLimite, estado, creadoEn',
      comentariosTareasSGO: 'id, tareaId, autor, creadoEn',
    })
  }
}

export const db = new InelpaDB()
