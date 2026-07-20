import Dexie, { type Table } from 'dexie'
import type {
  Usuario, Tarea, OrdenProduccion, SyncOp, Semielaborado, Maquina,
  ModeloTransformador, ComponenteSemielaborado, Objetivo, TareaLogistica, SolicitudLogistica, Feriado,
  Mensaje, MensajeLectura, TiempoEstandar, DespachoTrafo, FleteInterno,
} from '../types'

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
  }
}

export const db = new InelpaDB()
