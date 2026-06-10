// ============================================================
// Modelo de dominio - INELPA PWA
// Disenado para mapear 1:1 con SAP Business One via Service Layer.
// (ver src/sap/sapMapping.ts)
// ============================================================

export type Rol = 'operario' | 'encargado' | 'planificador'

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

export const CAPACIDAD_SECTOR: CapacidadSectorDef[] = [
  { sectorId: 'bob_dist_at', tipo: 'maquina', cantidad: 20, prefijo: 'Maquina' },
  { sectorId: 'bob_dist_bt', tipo: 'maquina', cantidad: 10, prefijo: 'Maquina' },
  { sectorId: 'bob_rural_at', tipo: 'maquina', cantidad: 20, prefijo: 'Maquina' },
  { sectorId: 'bob_rural_bt', tipo: 'maquina', cantidad: 10, prefijo: 'Maquina' },
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

export type CategoriaParada = 'material' | 'logistica' | 'maquina' | 'personal' | 'calidad' | 'otra'

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
export interface Tarea {
  id: string
  ordenId: string
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

// Cola de sincronizacion: cada cambio offline se encola y se empuja al backend.
export interface SyncOp {
  id: string
  entidad: 'tarea' | 'parada' | 'orden' | 'semielaborado'
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
export interface CausaParadaDef {
  id: CausaParada
  label: string
  categoria: CategoriaParada
  codigo?: number          // numero en la planilla maestra de planta
}

export const CAUSAS_PARADA: CausaParadaDef[] = [
  // --- Materiales / produccion ---
  { id: 'espera_prod_bt', label: 'Espera produccion de BT', categoria: 'material', codigo: 1 },
  { id: 'espera_prod_aislacion', label: 'Espera produccion de aislacion', categoria: 'material', codigo: 2 },
  { id: 'espera_alambre', label: 'Espera de alambre (cobre o aluminio)', categoria: 'material', codigo: 30 },
  { id: 'espera_especificaciones', label: 'Espera especificaciones tecnicas / diseno', categoria: 'material', codigo: 28 },
  // --- Logistica ---
  { id: 'espera_canales', label: 'Espera de canales (logistica)', categoria: 'logistica', codigo: 31 },
  { id: 'espera_consumibles', label: 'Espera de consumibles (logistica)', categoria: 'logistica', codigo: 32 },
  { id: 'espera_gas_oxigeno', label: 'Espera gas y oxigeno (logistica)', categoria: 'logistica', codigo: 36 },
  { id: 'pasillos_obstruidos', label: 'Pasillos obstruidos', categoria: 'logistica', codigo: 17 },
  { id: 'subir_bajar_bobina', label: 'Espera para subir / bajar bobina', categoria: 'logistica', codigo: 21 },
  // --- Maquina / equipo ---
  { id: 'mant_correctivo', label: 'Mantenimiento correctivo', categoria: 'maquina', codigo: 5 },
  { id: 'mant_preventivo', label: 'Mantenimiento preventivo', categoria: 'maquina', codigo: 6 },
  { id: 'replanif_cambio', label: 'Replanificacion cambio potencia / modelo', categoria: 'maquina', codigo: 16 },
  { id: 'falta_herramienta', label: 'Faltante / rotura de herramienta', categoria: 'maquina', codigo: 27 },
  { id: 'espera_soldadora', label: 'Espera soldadora', categoria: 'maquina', codigo: 35 },
  { id: 'corte_luz', label: 'Corte de luz', categoria: 'maquina', codigo: 37 },
  // --- Personal ---
  { id: 'capacitacion', label: 'Capacitacion laboral', categoria: 'personal', codigo: 8 },
  { id: 'reunion_charla', label: 'Reunion / charla', categoria: 'personal', codigo: 9 },
  { id: 'ayuda_sector', label: 'Ayuda en sector', categoria: 'personal', codigo: 19 },
  { id: 'ayuda_otro_sector', label: 'Ayuda en otro sector', categoria: 'personal', codigo: 39 },
  { id: 'retiro', label: 'Retiro', categoria: 'personal', codigo: 23 },
  { id: 'accidente_laboral', label: 'Accidente laboral', categoria: 'personal', codigo: 29 },
  { id: 'espera_encargado', label: 'Espera a encargado', categoria: 'personal', codigo: 4 },
  // --- Calidad ---
  { id: 'taco_defectuoso', label: 'Taco defectuoso', categoria: 'calidad', codigo: 38 },
  { id: 'retrabajo', label: 'Retrabajo', categoria: 'calidad', codigo: 10 },
  { id: 'calidad_alambre', label: 'Problemas calidad del alambre o planchuela', categoria: 'calidad', codigo: 18 },
  { id: 'bobina_bt_defectuosa', label: 'Bobina de BT defectuosa', categoria: 'calidad', codigo: 40 },
  // --- Otras ---
  { id: 'otra', label: 'Otra', categoria: 'otra' },
]

export const CATEGORIA_LABEL: Record<CategoriaParada, string> = {
  material: 'Materiales / produccion', logistica: 'Logistica', maquina: 'Maquina / equipo',
  personal: 'Personal', calidad: 'Calidad', otra: 'Otras',
}

export function sectorById(id: SectorId): Sector {
  return SECTORES.find((s) => s.id === id)!
}
export function causaLabel(c: CausaParada): string {
  return CAUSAS_PARADA.find((x) => x.id === c)?.label ?? c
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
