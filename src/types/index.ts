// ============================================================
// Modelo de dominio - INELPA PWA
// Disenado para mapear 1:1 con SAP Business One via Service Layer.
// (ver src/sap/sapMapping.ts)
// ============================================================

export type Rol = 'operario' | 'encargado' | 'planificador' | 'logistica'

export type LineaProduccion = 'distribucion' | 'rural' | 'general'

// Material del bobinado (obligatorio al crear la orden de fabricacion).
export type MaterialBobina = 'cobre' | 'aluminio'
export const MATERIALES: { id: MaterialBobina; label: string }[] = [
  { id: 'cobre', label: 'Cobre' },
  { id: 'aluminio', label: 'Aluminio' },
]
export function materialLabel(m?: MaterialBobina): string {
  return MATERIALES.find((x) => x.id === m)?.label ?? '-'
}

// Catalogo de modelos de transformador (relevamiento de planta, doc 2026-06).
// En produccion este listado se alimenta del maestro de articulos (OITM) de SAP B1.
// Prefijos: TTD=trifasico distribucion, TMR=monofasico rural, TBR=bifasico rural,
// TTR=trifasico rural, TAM=autotransformador. Formato "POTENCIA/TENSION(kV)".
export const MODELOS_TRANSFORMADOR: string[] = [
  'TTD 16/13', 'TTD 25/13', 'TTD 40/13', 'TTD 63/13', 'TTD 100/13', 'TTD 125/13',
  'TTD 160/13', 'TTD 200/13', 'TTD 250/13', 'TTD 315/13', 'TTD 400/13', 'TTD 500/13',
  'TTD 630/13', 'TTD 800/13', 'TTD 1000/13', 'TTD 1500/13', 'TTD 1600/13', 'TTD 2000/13',
  'TTD 16/33', 'TTD 25/33', 'TTD 40/33', 'TTD 63/33', 'TTD 100/33', 'TTD 125/33',
  'TTD 160/33', 'TTD 200/33', 'TTD 250/33', 'TTD 315/33', 'TTD 400/33', 'TTD 500/33',
  'TTD 630/33', 'TTD 800/33', 'TTD 1000/33',
  'TMR 3/7', 'TMR 5/7', 'TMR 10/7', 'TMR 16/7', 'TMR 25/7', 'TMR 40/7', 'TMR 63/7',
  'TMR 5/19', 'TMR 10/19', 'TMR 16/19', 'TMR 25/19', 'TMR 40/19', 'TMR 63/19',
  'TBR 5/13', 'TBR 10/13', 'TBR 16/13', 'TBR 25/13', 'TBR 40/13', 'TBR 63/13', 'TBR 75/13', 'TBR 100/13',
  'TBR 5/33', 'TBR 10/33', 'TBR 16/33', 'TBR 25/33', 'TBR 40/33',
  'TTR 10/13', 'TTR 16/13', 'TTR 25/13', 'TTR 40/13', 'TTR 63/13',
  'TTR 5/33', 'TTR 10/33', 'TTR 25/33', 'TTR 16/33', 'TTR 40/33', 'TTR 63/33',
  'TAM 80/13', 'TAM 250/13',
]

// Linea inferida desde el prefijo del modelo (TMR/TBR/TTR = rural; TTD = distribucion).
export function lineaDesdeModelo(modelo: string): LineaProduccion {
  const p = modelo.trim().slice(0, 3).toUpperCase()
  if (p === 'TMR' || p === 'TBR' || p === 'TTR') return 'rural'
  if (p === 'TTD') return 'distribucion'
  return 'general'
}

// Los 13 sectores productivos relevados en planta.
export type SectorId =
  | 'corte_conformado'
  | 'soldadura_dist'
  | 'soldadura_rural'
  | 'lavado_pintura'
  | 'bob_dist_at'
  | 'bob_dist_bt'
  | 'bob_rural_at'
  | 'bob_rural_bt'
  | 'montaje_pa_dist'
  | 'montaje_po_dist'
  | 'montaje_pa_rural'
  | 'montaje_po_rural'
  | 'laboratorio'

export interface Sector {
  id: SectorId
  nombre: string
  linea: LineaProduccion
  supervisor: string
  operarios: number
}

// ============================================================
// MAQUINAS / BOX / LINEAS (capacidad instalada).
// v1.2: las tareas se asignan a una ESTACION DE TRABAJO (maquina, box, linea
// o estacion), no a un colaborador. El operario elige su estacion al ingresar
// y recibe la cola de tareas de esa estacion.
// ============================================================
export type TipoEstacion = 'maquina' | 'box' | 'linea' | 'estacion'

export interface Maquina {
  id: string
  nombre: string           // ej "Maquina 01", "Box 3", "Linea Montaje PA"
  sectorId: SectorId
  tipo: TipoEstacion
  activo: boolean
}

export const TIPO_ESTACION_LABEL: Record<TipoEstacion, string> = {
  maquina: 'Maquina', box: 'Box', linea: 'Linea', estacion: 'Estacion',
}

// Capacidad instalada por sector (relevamiento gerencia 2026-06).
// Si 'nombres' esta presente, se usan esos nombres fijos; si no, se numeran 1..cantidad.
interface CapacidadSectorDef {
  sectorId: SectorId
  tipo: TipoEstacion
  cantidad: number
  prefijo: string          // ej "Maquina", "Box", "Linea PA"
  nombres?: string[]       // nombres fijos (ej estaciones de corte y conformado)
}

// v1.14: BOBINADO = un solo POOL de 30 maquinas que sirven cualquier formato
// (rural/distribucion, AT/BT). Se generan aparte (ver generarMaquinas).
export const BOBINADO_SECTORES: SectorId[] = ['bob_dist_at', 'bob_dist_bt', 'bob_rural_at', 'bob_rural_bt']
export const BOBINADO_POOL_SECTOR: SectorId = 'bob_dist_at' // sector "hogar" nominal del pool
export const BOBINADO_POOL_CANTIDAD = 30

export function esSectorBobinado(s: SectorId): boolean { return BOBINADO_SECTORES.includes(s) }

// Una maquina sirve a un sector si es el suyo, o si AMBOS son de bobinado
// (las 30 bobinadoras son intercambiables para cualquier formato).
export function maquinaSirveSector(m: { sectorId: SectorId }, sectorId: SectorId): boolean {
  return m.sectorId === sectorId || (esSectorBobinado(m.sectorId) && esSectorBobinado(sectorId))
}

export const CAPACIDAD_SECTOR: CapacidadSectorDef[] = [
  // (bobinado ya no va aca: es un pool unico de 30, ver generarMaquinas)
  { sectorId: 'soldadura_dist', tipo: 'box', cantidad: 5, prefijo: 'Box' },
  { sectorId: 'soldadura_rural', tipo: 'box', cantidad: 1, prefijo: 'Box' },
  { sectorId: 'montaje_pa_dist', tipo: 'linea', cantidad: 1, prefijo: 'Linea Montaje PA' },
  { sectorId: 'montaje_po_dist', tipo: 'linea', cantidad: 1, prefijo: 'Linea Montaje PO' },
  { sectorId: 'montaje_pa_rural', tipo: 'linea', cantidad: 1, prefijo: 'Linea Montaje PA' },
  { sectorId: 'montaje_po_rural', tipo: 'linea', cantidad: 1, prefijo: 'Linea Montaje PO' },
  { sectorId: 'laboratorio', tipo: 'estacion', cantidad: 1, prefijo: 'Laboratorio' },
  { sectorId: 'corte_conformado', tipo: 'estacion', cantidad: 3, prefijo: 'Estacion',
    nombres: ['Plegadora', 'Corte Laser', 'Conf. Accesorios'] },
  { sectorId: 'lavado_pintura', tipo: 'estacion', cantidad: 1, prefijo: 'Pintura' },
]

// Genera el catalogo completo de estaciones de trabajo (para sembrar en IndexedDB).
export function generarMaquinas(): Maquina[] {
  const out: Maquina[] = []
  // Pool unico de bobinado: 30 bobinadoras intercambiables (cualquier formato).
  for (let i = 1; i <= BOBINADO_POOL_CANTIDAD; i++) {
    const nn = String(i).padStart(2, '0')
    out.push({ id: `m_bob_${nn}`, nombre: `Bobinadora ${nn}`, sectorId: BOBINADO_POOL_SECTOR, tipo: 'maquina', activo: true })
  }
  // Resto de sectores (capacidad fija por sector).
  for (const c of CAPACIDAD_SECTOR) {
    for (let i = 0; i < c.cantidad; i++) {
      const usaNombre = c.nombres?.[i]
      const slug = usaNombre
        ? usaNombre.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
        : String(i + 1).padStart(2, '0')
      const nombre = usaNombre ?? (c.cantidad === 1 ? c.prefijo : `${c.prefijo} ${String(i + 1).padStart(2, '0')}`)
      out.push({ id: `m_${c.sectorId}_${slug}`, nombre, sectorId: c.sectorId, tipo: c.tipo, activo: true })
    }
  }
  return out
}

export interface Usuario {
  id: string
  nombre: string
  usuario: string          // login
  // En produccion NO se guarda el password en claro: se almacena hash (bcrypt/argon2)
  // verificado contra el backend o Supabase Auth. Aqui hay un hash demo para modo offline.
  passwordHash: string
  rol: Rol
  // Sectores que el usuario ve/gestiona. Operario suele tener 1; encargado N; planificador todos.
  sectores: SectorId[]
  // v1.3: grupo de la nomina real de planta (ver doc "operarios"). Determina el filtrado
  // de colaboradores en la asignacion. Los grupos que alimentan las 4 sub-etapas de Herreria
  // llevan grupoNomina = 'herreria'. Ej: 'herreria' | 'bobinado_dist' | 'montaje_rural' | ...
  grupoNomina?: GrupoNomina
  activo: boolean
}

// v1.3: grupos de la nomina real de planta (documento "operarios" por sector matriz).
export type GrupoNomina =
  | 'herreria'
  | 'bobinado_dist'
  | 'bobinado_rural'
  | 'montaje_dist'
  | 'montaje_rural'
  | 'carpinteria'
  | 'corte_aislacion'
  | 'pintura'

export type EstadoTarea = 'pendiente' | 'en_proceso' | 'pausada' | 'finalizada'

// v1.2: la planta maneja ~40 causas de demora y la lista sigue creciendo, asi
// que CausaParada es un slug (string) cuyo catalogo vive en CAUSAS_PARADA mas
// abajo. Para sumar causas: agregar una linea en CAUSAS_PARADA (id, label,
// categoria, codigo). El UI (ModalParada) se arma solo: agrupa por categoria
// y trae buscador, sin tocar componentes.
export type CausaParada = string

export type CategoriaParada = 'material' | 'logistica' | 'maquina' | 'personal' | 'calidad' | 'no_productiva' | 'otra'

export interface Parada {
  id: string
  tareaId: string
  causa: CausaParada
  inicio: string           // ISO timestamp
  fin?: string             // ISO timestamp (undefined = parada en curso)
  observacion?: string
}

// Datos tecnicos capturados en los sectores de bobinado antes de finalizar.
//  - Bobinado BT (Distribucion/Rural): diametro interno + externo + codigo de bobina.
//  - Bobinado AT (Distribucion/Rural): diametro externo + codigo de bobina.
export interface DatosBobinado {
  diametroInternoMm?: number
  diametroExternoMm?: number
  codigoBobina?: string
}

// Una tarea = una operacion de un sector sobre una orden de produccion,
// asignada a una ESTACION DE TRABAJO (maquina/box/linea) para la semana corriente.
// v1.8: una tarea puede ser de fabricacion (orden estandar) o una reparacion
// (corregir errores no detectados a tiempo). La reparacion NO cuenta como tiempo
// productivo y queda EXCLUIDA del OEE (igual que el almuerzo: no penaliza).
export type TipoTarea = 'fabricacion' | 'reparacion'

export interface Tarea {
  id: string
  tipo?: TipoTarea         // v1.8: default 'fabricacion'
  ordenId?: string         // v1.8: opcional (una reparacion puede no tener orden)
  sectorId: SectorId
  maquinaId: string        // estacion de trabajo asignada (v1.2; reemplaza la asignacion por colaborador)
  operarioId?: string      // colaborador que EJECUTA (se estampa al iniciar; trazabilidad y KPIs)
  modelo: string           // modelo de transformador / bobina
  fase?: string            // mono / bifasico / trifasico (relevante en bobinado)
  nroTransformador?: string
  semana: string           // ISO week, ej "2026-W24"
  prioridad: number        // 1 = mas alta
  estado: EstadoTarea
  tiempoEstandarMin: number // tiempo estandar de la operacion (min)
  // v1.5: semielaborado (componente del catalogo maestro) que produce esta tarea,
  // segun el sector. Ej. en Bobinado Dist A.T. se designa la bobina AT del modelo.
  componenteCodigo?: string  // = ComponenteSemielaborado.codigo (ItemCode SAP)
  // v1.6: habilita la franja de recuperacion (16-17 Lun-Jue / 15-16 Vie) como
  // tiempo productivo PARA ESTA TAREA. Si false, el dia cierra estricto a las
  // 16:00 / 15:00 a efectos del tiempo neto.
  activaHoraRecuperacion?: boolean
  // v1.6: tiempo PRODUCTIVO NETO real (min), calculado al finalizar descontando
  // noches, fines de semana y almuerzo. Base de KPIs/OEE (no la resta cruda).
  duracionEfectivaMin?: number
  inicioPlanificado?: string // dia+hora planificado de arranque (ISO); base del Gantt (v1.4)
  inicioReal?: string      // timestamp al pasar a en_proceso
  finReal?: string         // timestamp al pasar a finalizada
  calidadOk?: boolean      // resultado del control de calidad
  defecto?: string         // defecto/rechazo encontrado
  paradas: Parada[]
  datosBobinado?: DatosBobinado // solo sectores de bobinado
  notas?: string
}

export interface OrdenProduccion {
  id: string               // mapea a Orden de Fabricacion SAP
  nroOrden: string
  nroContrato?: string     // Orden de venta SAP
  modelo: string           // valor de MODELOS_TRANSFORMADOR
  material: MaterialBobina // v1.2: cobre / aluminio (obligatorio)
  linea: LineaProduccion
  cantidad: number
  fechaEntrega: string
}

// Producto semielaborado (ej. bobina terminada antes del montaje).
// En SAP B1 vive como Articulo (OITM) con su lista de materiales/arbol (OITT/ITT1).
// La app mantiene una copia/cache local sincronizada desde SAP (ver sapMapping.ts).
export type EstadoSemielaborado = 'en_proceso' | 'disponible' | 'consumido'
export interface Semielaborado {
  id: string
  codigo: string           // = ItemCode (OITM) cuando viene de SAP
  descripcion: string      // = ItemName (OITM)
  sectorOrigen: SectorId   // sector que lo produce (ej. bobinado)
  modelo: string           // modelo de transformador al que pertenece
  fase?: string
  tareaOrigenId?: string   // tarea que lo genero (trazabilidad)
  ordenDestinoId?: string  // orden que lo consume
  estado: EstadoSemielaborado
  tiempoEstimadoMin?: number // v1.2: tiempo estimado de fabricacion (min)
  sapItemCode?: string     // codigo del articulo en SAP B1 (OITM)
  actualizado: string
}

// ============================================================
// CATALOGO MAESTRO (v1.5) — modelos de transformador + componentes.
// Origen: maestro de articulos SAP B1 (OITM) export 'SEMIELABORADOS.xlsx'.
// Es data ESTATICA/maestra: se siembra en Dexie y Supabase y no se muta en planta.
// (Distinto de 'Semielaborado', que es la instancia productiva con estado/trazabilidad.)
// ============================================================
export type CategoriaComponente =
  | 'bobina_at' | 'bobina_bt' | 'prensayugo' | 'parte_activa'
  | 'herreria_cuba' | 'herreria_tapa' | 'herreria_tanque' | 'accesorio' | 'otro'

export const CATEGORIA_COMPONENTE_LABEL: Record<CategoriaComponente, string> = {
  bobina_at: 'Bobina A.T.',
  bobina_bt: 'Bobina B.T.',
  prensayugo: 'Prensayugo / corte',
  parte_activa: 'Parte activa',
  herreria_cuba: 'Cuba (herreria)',
  herreria_tapa: 'Tapa (herreria)',
  herreria_tanque: 'Tanque (herreria)',
  accesorio: 'Accesorio',
  otro: 'Otro',
}

// Modelo de transformador (= Articulo OITM, grupo "MODELO DE TRANSFORMADOR").
export interface ModeloTransformador {
  codigo: string                 // = ItemCode (OITM)
  nombre: string                 // = ItemName (ej "TTD 16/13 - Tanque Expansion - Monoposte - Cobre")
  linea: LineaProduccion
  fase: 'monofasico' | 'bifasico' | 'trifasico'
  material: MaterialBobina | null
  potencia: number | null
  tension: number | null
  montaje: string | null
  tanque: string | null
  componentes: string[]          // BOM: codigos de ComponenteSemielaborado asociados
}

// Componente / semielaborado maestro (= Articulo OITM componente del arbol OITT).
export interface ComponenteSemielaborado {
  codigo: string                 // = ItemCode (OITM)
  descripcion: string            // = ItemName
  categoria: CategoriaComponente
  sectorId: SectorId | null      // sector productivo de la PWA que lo fabrica
  nivel: 'AT' | 'BT' | null
  linea: LineaProduccion | null
  fase: string | null
  material: MaterialBobina | null
  potencia: number | null
  tension: number | null
}

// ============================================================
// ANDON (v1.10) — objetivos mensuales de produccion por area + premios.
// El planificador configura la cantidad objetivo por area cada mes.
// ============================================================
export type AndonAreaId =
  | 'montaje_dist' | 'montaje_rural'
  | 'bob_dist_at' | 'bob_dist_bt' | 'bob_rural_at' | 'bob_rural_bt'
  | 'herreria_dist' | 'herreria_rural'

export interface Objetivo {
  id: string            // `${periodo}_${area}`  (ej "2026-06_montaje_dist")
  periodo: string       // 'YYYY-MM' (mes del objetivo; se resetea cada mes)
  area: AndonAreaId
  cantidad: number      // unidades objetivo de la empresa para ese mes/area
  actualizado: string
}

// Mes calendario local en formato 'YYYY-MM'.
export function periodoMensual(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ============================================================
// TAREAS LOGISTICAS (v1.12) — organizador de pedidos de abastecimiento.
// Giuliano crea la tarea y asigna un responsable; el equipo la marca finalizada.
// El tiempo de resolucion = finalizada - creada (cuando se dio la orden).
// Entidad propia, separada de las tareas de produccion.
// ============================================================
export type PrioridadLog = 'alta' | 'media' | 'baja'
export const PRIORIDADES_LOG: { id: PrioridadLog; label: string }[] = [
  { id: 'alta', label: 'Alta' },
  { id: 'media', label: 'Media' },
  { id: 'baja', label: 'Baja' },
]
// Equipo de logistica (responsables asignables). No son cuentas de login.
export const RESPONSABLES_LOGISTICA: string[] = [
  'Guillermo', 'Maximiliano', 'Santiago', 'Lucas', 'Enzo', 'Orlando',
]

export interface TareaLogistica {
  id: string
  titulo: string
  detalle?: string
  responsable: string            // nombre del equipo de logistica
  prioridad: PrioridadLog
  estado: 'pendiente' | 'finalizada'
  creada: string                 // ISO: cuando Giuliano dio la orden
  creadaPor?: string             // usuario que la creo
  finalizada?: string            // ISO al completar
  finalizadaPor?: string         // usuario que la completo
}

// ============================================================
// SOLICITUDES LOGISTICAS (v1.13) — cola de pedidos de material.
// Se enlaza 1:1 con la PARADA de material (id = parada.id). Es la "capa logistica"
// encima de la parada: a quien se asigno y en que estado de entrega esta.
// ============================================================
export type EstadoSolicitudLog = 'pendiente' | 'en_camino' | 'entregado'
export const ESTADOS_SOLICITUD_LOG: { id: EstadoSolicitudLog; label: string; clase: string }[] = [
  { id: 'pendiente', label: 'Pendiente', clase: 'sol-pendiente' },
  { id: 'en_camino', label: 'En camino', clase: 'sol-camino' },
  { id: 'entregado', label: 'Entregado', clase: 'sol-entregado' },
]

export interface SolicitudLogistica {
  id: string                 // = parada.id (1 solicitud por parada de material)
  paradaId: string
  tareaId: string
  asignado?: string          // responsable del equipo de logistica
  estado: EstadoSolicitudLog
  creada: string             // = parada.inicio (cuando el operario pidio material)
  tomadaEn?: string          // paso a 'en_camino'
  entregadaEn?: string       // paso a 'entregado'
  actualizado: string
}

// v1.17: feriado / dia no laborable de planta (lo carga el planificador).
// El motor de calendario trata estas fechas como dia cerrado (igual que domingo).
export interface Feriado {
  id: string            // = fecha 'YYYY-MM-DD' (un feriado por dia)
  fecha: string         // 'YYYY-MM-DD' (dia completo, toda la planta)
  descripcion?: string  // ej. "Dia del Trabajador"
  actualizado: string
}

// Cola de sincronizacion: cada cambio offline se encola y se empuja al backend.
export interface SyncOp {
  id: string
  entidad: 'tarea' | 'parada' | 'orden' | 'semielaborado' | 'objetivo' | 'tarea_logistica' | 'solicitud_logistica' | 'feriado'
  entidadId: string
  tipo: 'upsert' | 'delete'
  payload: unknown
  ts: string
  sincronizado: boolean
}

export const SECTORES: Sector[] = [
  { id: 'corte_conformado', nombre: 'Corte y conformado', linea: 'general', supervisor: 'Santiago Yori', operarios: 3 },
  { id: 'soldadura_dist', nombre: 'Soldadura Cuba y Tapa Distribucion', linea: 'distribucion', supervisor: 'Santiago Yori', operarios: 4 },
  { id: 'soldadura_rural', nombre: 'Soldadura Cuba y Tapa Rural', linea: 'rural', supervisor: 'Santiago Yori', operarios: 2 },
  { id: 'lavado_pintura', nombre: 'Lavado y Pintura', linea: 'general', supervisor: 'Santiago Yori', operarios: 2 },
  { id: 'bob_dist_at', nombre: 'Bobinado Distribucion A.T.', linea: 'distribucion', supervisor: 'Ulises Kaiser', operarios: 7 },
  { id: 'bob_dist_bt', nombre: 'Bobinado Distribucion B.T.', linea: 'distribucion', supervisor: 'Ulises Kaiser', operarios: 3 },
  { id: 'bob_rural_at', nombre: 'Bobinado Rural A.T.', linea: 'rural', supervisor: 'Ulises Kaiser', operarios: 5 },
  { id: 'bob_rural_bt', nombre: 'Bobinado Rural B.T.', linea: 'rural', supervisor: 'Ulises Kaiser', operarios: 1 },
  { id: 'montaje_pa_dist', nombre: 'Montaje PA Distribucion', linea: 'distribucion', supervisor: 'Omar Bender', operarios: 5 },
  { id: 'montaje_po_dist', nombre: 'Montaje PO Distribucion', linea: 'distribucion', supervisor: 'Omar Bender', operarios: 6 },
  { id: 'montaje_pa_rural', nombre: 'Montaje PA Rural', linea: 'rural', supervisor: 'Omar Bender', operarios: 5 },
  { id: 'montaje_po_rural', nombre: 'Montaje PO Rural', linea: 'rural', supervisor: 'Omar Bender', operarios: 3 },
  { id: 'laboratorio', nombre: 'Laboratorio', linea: 'general', supervisor: 'Rocio', operarios: 2 },
]

// ============================================================
// CAUSAS DE PARADA — catalogo de planta (relevamiento gerencia 2026-06).
// 'codigo' = numero de causa en la planilla maestra de planta (para SAP/reportes).
// Para sumar causas: agregar una linea aqui. El UI (ModalParada) las agrupa por
// categoria y trae buscador; no hay que tocar componentes.
// ============================================================
// Area de demoras: agrupa los sectores que comparten el MISMO listado de causas.
// El operario solo ve las causas de su area (+ las globales). v1.7.
export type AreaDemora = 'bobinado' | 'herreria' | 'montaje' | 'pintura' | 'general'

export const AREA_DEMORA_POR_SECTOR: Record<SectorId, AreaDemora> = {
  bob_dist_at: 'bobinado', bob_dist_bt: 'bobinado', bob_rural_at: 'bobinado', bob_rural_bt: 'bobinado',
  corte_conformado: 'herreria', soldadura_dist: 'herreria', soldadura_rural: 'herreria',
  montaje_pa_dist: 'montaje', montaje_po_dist: 'montaje', montaje_pa_rural: 'montaje', montaje_po_rural: 'montaje',
  lavado_pintura: 'pintura',
  laboratorio: 'general',
}
export function areaDemora(id: SectorId): AreaDemora {
  return AREA_DEMORA_POR_SECTOR[id] ?? 'general'
}

export interface CausaParadaDef {
  id: CausaParada
  label: string
  categoria: CategoriaParada
  codigo?: number          // numero en la planilla maestra de planta
  // Areas donde aplica la causa. Sin definir = GLOBAL (visible en todas las
  // secciones, ej. Almuerzo y Otra). El operario ve: su area + las globales.
  areas?: AreaDemora[]
}

export const CAUSAS_PARADA: CausaParadaDef[] = [
  // ===== BOBINADO (catalogo original; sin cambios). 'general' = tambien Laboratorio.
  { id: 'espera_prod_bt', label: 'Espera produccion de BT', categoria: 'material', codigo: 1, areas: ['bobinado', 'general'] },
  { id: 'espera_prod_aislacion', label: 'Espera produccion de aislacion', categoria: 'material', codigo: 2, areas: ['bobinado', 'general'] },
  { id: 'espera_alambre', label: 'Espera de alambre (cobre o aluminio)', categoria: 'material', codigo: 30, areas: ['bobinado', 'general'] },
  { id: 'espera_especificaciones', label: 'Espera especificaciones tecnicas / diseno', categoria: 'material', codigo: 28, areas: ['bobinado', 'general'] },
  { id: 'espera_canales', label: 'Espera de canales (logistica)', categoria: 'logistica', codigo: 31, areas: ['bobinado', 'general'] },
  { id: 'espera_consumibles', label: 'Espera de consumibles (logistica)', categoria: 'logistica', codigo: 32, areas: ['bobinado', 'general'] },
  { id: 'espera_gas_oxigeno', label: 'Espera gas y oxigeno (logistica)', categoria: 'logistica', codigo: 36, areas: ['bobinado', 'general'] },
  { id: 'pasillos_obstruidos', label: 'Pasillos obstruidos', categoria: 'logistica', codigo: 17, areas: ['bobinado', 'general'] },
  { id: 'subir_bajar_bobina', label: 'Espera para subir / bajar bobina', categoria: 'logistica', codigo: 21, areas: ['bobinado', 'general'] },
  { id: 'mant_correctivo', label: 'Mantenimiento correctivo', categoria: 'maquina', codigo: 5, areas: ['bobinado', 'general'] },
  { id: 'mant_preventivo', label: 'Mantenimiento preventivo', categoria: 'maquina', codigo: 6, areas: ['bobinado', 'general'] },
  { id: 'replanif_cambio', label: 'Replanificacion cambio potencia / modelo', categoria: 'maquina', codigo: 16, areas: ['bobinado', 'general'] },
  { id: 'falta_herramienta', label: 'Faltante / rotura de herramienta', categoria: 'maquina', codigo: 27, areas: ['bobinado', 'general'] },
  { id: 'espera_soldadora', label: 'Espera soldadora', categoria: 'maquina', codigo: 35, areas: ['bobinado', 'general'] },
  { id: 'corte_luz', label: 'Corte de luz', categoria: 'maquina', codigo: 37, areas: ['bobinado', 'general'] },
  { id: 'capacitacion', label: 'Capacitacion laboral', categoria: 'personal', codigo: 8, areas: ['bobinado', 'general'] },
  { id: 'reunion_charla', label: 'Reunion / charla', categoria: 'personal', codigo: 9, areas: ['bobinado', 'general'] },
  { id: 'ayuda_sector', label: 'Ayuda en sector', categoria: 'personal', codigo: 19, areas: ['bobinado', 'general'] },
  { id: 'ayuda_otro_sector', label: 'Ayuda en otro sector', categoria: 'personal', codigo: 39, areas: ['bobinado', 'general'] },
  { id: 'retiro', label: 'Retiro', categoria: 'personal', codigo: 23, areas: ['bobinado', 'general'] },
  { id: 'accidente_laboral', label: 'Accidente laboral', categoria: 'personal', codigo: 29, areas: ['bobinado', 'general'] },
  { id: 'espera_encargado', label: 'Espera a encargado', categoria: 'personal', codigo: 4, areas: ['bobinado', 'general'] },
  { id: 'taco_defectuoso', label: 'Taco defectuoso', categoria: 'calidad', codigo: 38, areas: ['bobinado', 'general'] },
  { id: 'retrabajo', label: 'Retrabajo', categoria: 'calidad', codigo: 10, areas: ['bobinado', 'general'] },
  { id: 'calidad_alambre', label: 'Problemas calidad del alambre o planchuela', categoria: 'calidad', codigo: 18, areas: ['bobinado', 'general'] },
  { id: 'bobina_bt_defectuosa', label: 'Bobina de BT defectuosa', categoria: 'calidad', codigo: 40, areas: ['bobinado', 'general'] },

  // ===== HERRERIA (Corte y conformado + Soldaduras) =====
  { id: 'her_espera_cuba', label: 'Espera cuba', categoria: 'material', areas: ['herreria'] },
  { id: 'her_espera_materiales', label: 'Espera materiales / herramientas / etc.', categoria: 'material', areas: ['herreria'] },
  { id: 'her_falta_tapa', label: 'Falta de tapa', categoria: 'material', areas: ['herreria'] },
  { id: 'her_retrabajo_tercero', label: 'Retrabajo de un 3° del sector', categoria: 'calidad', areas: ['herreria'] },
  { id: 'her_retrabajo_propio', label: 'Retrabajo propio', categoria: 'calidad', areas: ['herreria'] },
  { id: 'her_retrabajo_cuba_tapa_tanque', label: 'Retrabajo en su cuba / tapa / tanque', categoria: 'calidad', areas: ['herreria'] },
  { id: 'her_retrabajo', label: 'Retrabajo', categoria: 'calidad', areas: ['herreria'] },
  { id: 'her_retrabajo_otro_sector', label: 'Retrabajo (de otro sector)', categoria: 'calidad', areas: ['herreria'] },
  { id: 'her_retrabajo_proveedor', label: 'Retrabajo (problemas proveedor)', categoria: 'calidad', areas: ['herreria'] },
  { id: 'her_perdidas_hermetizado', label: 'Perdidas en hermetizado', categoria: 'calidad', areas: ['herreria'] },
  { id: 'her_hermetizado', label: 'Hermetizado', categoria: 'otra', areas: ['herreria'] },
  { id: 'her_capacitacion', label: 'Capacitacion', categoria: 'personal', areas: ['herreria'] },
  { id: 'her_reunion_charla', label: 'Reunion informativa / charla', categoria: 'personal', areas: ['herreria'] },
  { id: 'her_ayuda_sector', label: 'Ayuda en sector u otro sector', categoria: 'personal', areas: ['herreria'] },
  { id: 'her_finaliza_companero', label: 'Finaliza trabajo de companero', categoria: 'personal', areas: ['herreria'] },
  { id: 'her_trabajos_no_planificados', label: 'Realizacion de trabajos no planificados', categoria: 'personal', areas: ['herreria'] },
  { id: 'her_orden_limpieza', label: 'Orden y limpieza', categoria: 'personal', areas: ['herreria'] },
  { id: 'her_retiro', label: 'Retiro', categoria: 'personal', areas: ['herreria'] },
  { id: 'her_accidente_laboral', label: 'Accidente laboral', categoria: 'personal', areas: ['herreria'] },
  { id: 'her_suspension', label: 'Suspension', categoria: 'personal', areas: ['herreria'] },
  { id: 'her_licencia_ausencia', label: 'Licencia / ausencia no programada', categoria: 'personal', areas: ['herreria'] },

  // ===== MONTAJE (PA/PO Distribucion y Rural) =====
  { id: 'mon_espera_prensayugos', label: 'Espera / faltan prensayugos', categoria: 'material', areas: ['montaje'] },
  { id: 'mon_espera_nucleo', label: 'Espera / falta nucleo', categoria: 'material', areas: ['montaje'] },
  { id: 'mon_espera_bobina', label: 'Espera bobina', categoria: 'material', areas: ['montaje'] },
  { id: 'mon_espera_chapones', label: 'Espera / faltan chapones', categoria: 'material', areas: ['montaje'] },
  { id: 'mon_espera_tacos', label: 'Espera / faltan tacos', categoria: 'material', areas: ['montaje'] },
  { id: 'mon_espera_cartones', label: 'Espera cartones', categoria: 'material', areas: ['montaje'] },
  { id: 'mon_espera_patas', label: 'Espera patas', categoria: 'material', areas: ['montaje'] },
  { id: 'mon_espera_chapa', label: 'Espera chapa', categoria: 'material', areas: ['montaje'] },
  { id: 'mon_espera_aislador', label: 'Espera / falta aislador', categoria: 'material', areas: ['montaje'] },
  { id: 'mon_espera_tubo_oxigeno', label: 'Espera tubo oxigeno', categoria: 'logistica', areas: ['montaje'] },
  { id: 'mon_error_entrega_insumos', label: 'Error en entrega de insumos', categoria: 'logistica', areas: ['montaje'] },
  { id: 'mon_obstruccion_sector', label: 'Sin lugar / obstruccion en el sector', categoria: 'logistica', areas: ['montaje'] },
  { id: 'mon_espera_relaciometro', label: 'Espera relaciometro', categoria: 'maquina', areas: ['montaje'] },
  { id: 'mon_espera_secado_pintura', label: 'Espera secado pintura o barnizado', categoria: 'maquina', areas: ['montaje'] },
  { id: 'mon_sin_luz', label: 'Sin luz', categoria: 'maquina', areas: ['montaje'] },
  { id: 'mon_espera_soldador', label: 'Espera / falta soldador', categoria: 'personal', areas: ['montaje'] },
  { id: 'mon_capacitacion', label: 'Capacitacion', categoria: 'personal', areas: ['montaje'] },
  { id: 'mon_reunion_charla', label: 'Reunion informativa / charla', categoria: 'personal', areas: ['montaje'] },
  { id: 'mon_ayuda_sector', label: 'Ayuda en el sector', categoria: 'personal', areas: ['montaje'] },
  { id: 'mon_ayuda_otro_sector', label: 'Ayuda en otro sector', categoria: 'personal', areas: ['montaje'] },
  { id: 'mon_retiro', label: 'Retiro', categoria: 'personal', areas: ['montaje'] },
  { id: 'mon_retrabajo_bobina', label: 'Retrabajo bobina', categoria: 'calidad', areas: ['montaje'] },
  { id: 'mon_no_da_relacion', label: 'No da relacion la/s bobina/s', categoria: 'calidad', areas: ['montaje'] },
  { id: 'mon_insumos_defectuosos', label: 'Materiales o insumos defectuosos (chapa, prensayugos, llave, angulos)', categoria: 'calidad', areas: ['montaje'] },
  { id: 'mon_modif_materiales', label: 'Modificacion de materiales / insumos recibidos', categoria: 'calidad', areas: ['montaje'] },
  { id: 'mon_solucionando_retrabajo', label: 'Solucionando retrabajo', categoria: 'calidad', areas: ['montaje'] },
  { id: 'mon_pintaron_prensayugo', label: 'Pintaron prensayugo en el sector', categoria: 'otra', areas: ['montaje'] },

  // ===== PINTURA (Lavado y Pintura) =====
  { id: 'pin_falta_cubas', label: 'Falta de cubas', categoria: 'material', areas: ['pintura'] },
  { id: 'pin_falta_material_logistico', label: 'Falta de material logistico', categoria: 'logistica', areas: ['pintura'] },
  { id: 'pin_corte_luz', label: 'Corte de luz', categoria: 'maquina', areas: ['pintura'] },

  // ===== v1.11: nuevas esperas de ABASTECIMIENTO (disparan alerta a Logistica) =====
  { id: 'mon_espera_consumibles', label: 'Espera de consumibles', categoria: 'logistica', areas: ['montaje'] },
  { id: 'her_espera_consumibles', label: 'Espera de consumibles', categoria: 'logistica', areas: ['herreria'] },
  { id: 'her_espera_materia_prima', label: 'Espera de materia prima', categoria: 'material', areas: ['herreria'] },
  { id: 'her_espera_gas', label: 'Espera de gas', categoria: 'logistica', areas: ['herreria'] },
  { id: 'bob_espera_planchuela', label: 'Espera de planchuela (cobre o aluminio)', categoria: 'material', areas: ['bobinado'] },
  { id: 'bob_espera_folio', label: 'Espera de folio (cobre o aluminio)', categoria: 'material', areas: ['bobinado'] },
  { id: 'bob_espera_aislacion', label: 'Espera de aislacion (canales, pressphan, diamantado)', categoria: 'material', areas: ['bobinado'] },

  // ===== GLOBALES (visibles en TODAS las secciones) =====
  // No productiva (NO penaliza el OEE: pausa programada de planta).
  { id: 'almuerzo', label: 'Almuerzo', categoria: 'no_productiva', codigo: 50 },
  { id: 'otra', label: 'Otra', categoria: 'otra' },
]

// v1.11: causas de ABASTECIMIENTO que disparan la alerta de Logistica cuando una
// tarea queda 'pausada' por una de ellas. (Esperas de material / insumo / gas.)
export const CAUSAS_LOGISTICA = new Set<CausaParada>([
  // Bobinado
  'espera_alambre', 'espera_consumibles', 'espera_gas_oxigeno', 'espera_canales',
  'bob_espera_planchuela', 'bob_espera_folio', 'bob_espera_aislacion',
  // Montaje
  'mon_espera_prensayugos', 'mon_espera_nucleo', 'mon_espera_bobina', 'mon_espera_chapones',
  'mon_espera_tacos', 'mon_espera_cartones', 'mon_espera_patas', 'mon_espera_chapa',
  'mon_espera_aislador', 'mon_espera_tubo_oxigeno', 'mon_error_entrega_insumos',
  'mon_insumos_defectuosos', 'mon_modif_materiales', 'mon_espera_consumibles',
  // Herreria
  'her_espera_cuba', 'her_espera_materiales', 'her_falta_tapa',
  'her_espera_consumibles', 'her_espera_materia_prima', 'her_espera_gas',
])
export function esCausaLogistica(c: CausaParada): boolean {
  return CAUSAS_LOGISTICA.has(c)
}

// Causas visibles para un sector: las de su area + las globales (sin areas).
export function causasDeSector(id: SectorId): CausaParadaDef[] {
  const area = areaDemora(id)
  return CAUSAS_PARADA.filter((c) => !c.areas || c.areas.includes(area))
}

export const CATEGORIA_LABEL: Record<CategoriaParada, string> = {
  material: 'Materiales / produccion', logistica: 'Logistica', maquina: 'Maquina / equipo',
  personal: 'Personal', calidad: 'Calidad', no_productiva: 'Pausas programadas', otra: 'Otras',
}

export function sectorById(id: SectorId): Sector {
  return SECTORES.find((s) => s.id === id)!
}
export function causaLabel(c: CausaParada): string {
  return CAUSAS_PARADA.find((x) => x.id === c)?.label ?? c
}
// Paradas no productivas (almuerzo, pausas programadas): no penalizan el OEE.
export function esParadaNoProductiva(c: CausaParada): boolean {
  return CAUSAS_PARADA.find((x) => x.id === c)?.categoria === 'no_productiva'
}
// v1.8: una reparacion es tiempo NO productivo (se excluye del OEE, no penaliza).
export function esReparacion(t: { tipo?: TipoTarea }): boolean {
  return t.tipo === 'reparacion'
}

// ============================================================
// MATRIZ "HERRERIA" (v1.3)
// Estos 4 sectores de planificacion son sub-etapas operativas servidas por el
// pool unico de Herreria (sector matriz). Al asignar tareas en cualquiera de
// estos sectores, la lista de colaboradores debe mostrar EXCLUSIVAMENTE a los
// operarios cuya nomina pertenece a "Herreria" (grupoNomina = 'herreria').
// ============================================================
export const SECTORES_HERRERIA: SectorId[] = [
  'corte_conformado', 'soldadura_dist', 'soldadura_rural', 'lavado_pintura',
]
export function esSectorHerreria(id: SectorId): boolean {
  return SECTORES_HERRERIA.includes(id)
}

// Colaboradores elegibles para asignar una tarea en un sector dado.
// - Sub-etapa de Herreria  -> SOLO operarios del pool 'herreria'.
// - Cualquier otro sector  -> operarios cuyo array `sectores` incluye ese sector.
export function operariosParaSector(sectorId: SectorId, todos: Usuario[]): Usuario[] {
  const ops = todos.filter((u) => u.rol === 'operario' && u.activo)
  if (esSectorHerreria(sectorId)) {
    return ops.filter((u) => u.grupoNomina === 'herreria')
  }
  return ops.filter((u) => u.sectores.includes(sectorId))
}

// --- Helpers de sectores de bobinado ---
const BOB_AT: SectorId[] = ['bob_dist_at', 'bob_rural_at']
const BOB_BT: SectorId[] = ['bob_dist_bt', 'bob_rural_bt']
export function esBobinadoAT(id: SectorId): boolean { return BOB_AT.includes(id) }
export function esBobinadoBT(id: SectorId): boolean { return BOB_BT.includes(id) }
export function esBobinado(id: SectorId): boolean { return esBobinadoAT(id) || esBobinadoBT(id) }

// Que campos tecnicos de bobinado requiere un sector (null = ninguno).
export interface ReqBobinado { interno: boolean; externo: boolean; codigo: boolean }
export function requiereDatosBobinado(id: SectorId): ReqBobinado | null {
  if (esBobinadoBT(id)) return { interno: true, externo: true, codigo: true }
  if (esBobinadoAT(id)) return { interno: false, externo: true, codigo: true }
  return null
}
