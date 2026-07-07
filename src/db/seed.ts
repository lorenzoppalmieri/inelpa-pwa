import { db } from './dexie'
import type { Usuario, Tarea, OrdenProduccion, Parada, Semielaborado, Maquina, SectorId, GrupoNomina } from '../types'
import { generarMaquinas, SECTORES_HERRERIA } from '../types'
import { MODELOS_CATALOGO, COMPONENTES_CATALOGO } from '../data/catalogo'
import { isoWeek } from '../lib/time'

// ============================================================
// Datos semilla para modo demo / offline (sin backend).
// Password demo de todos los usuarios: "1234" (hash simple solo demo).
// En produccion la autenticacion es contra Supabase Auth o backend propio.
// ============================================================

// Hash demo deterministico (NO usar en produccion; produccion = bcrypt/argon2 server-side).
export function demoHash(pwd: string): string {
  let h = 0
  for (let i = 0; i < pwd.length; i++) h = (h * 31 + pwd.charCodeAt(i)) | 0
  return 'demo$' + h
}

const PWD = demoHash('1234')

// ============================================================
// NOMINA REAL DE PLANTA (v1.3) — documento "operarios" por sector matriz.
// Mapeo grupo -> sectores de planificacion que el operario puede EJECUTAR.
// Los 4 sub-sectores de Herreria (corte/soldaduras/pintura) se sirven del pool
// 'herreria'. Decision "literal del documento": Carpinteria, Corte de aislacion
// y Pintura se siembran con su grupo real pero SIN sector de planificacion 1:1
// (sectores: []) hasta definir su mapeo; por ahora no son asignables.
// ============================================================
const SECTORES_POR_GRUPO: Record<GrupoNomina, SectorId[]> = {
  herreria: SECTORES_HERRERIA,
  bobinado_dist: ['bob_dist_at', 'bob_dist_bt'],
  bobinado_rural: ['bob_rural_at', 'bob_rural_bt'],
  montaje_dist: ['montaje_pa_dist', 'montaje_po_dist'],
  montaje_rural: ['montaje_pa_rural', 'montaje_po_rural'],
  carpinteria: [],
  corte_aislacion: [],
  pintura: [],
}

// [nombre para mostrar, grupo de nomina]. Ulises Kaiser y Omar Bender figuran en
// la nomina pero ya estan cargados como ENCARGADOS, por eso no se duplican aqui.
const NOMINA: [string, GrupoNomina][] = [
  ['Alegre Hugo Emiliano', 'herreria'],
  ['Álvarez Nazareno Feliciano', 'herreria'],
  ['Chaves Emanuel Ezequiel', 'herreria'],
  ['Espíndola Eladio Marcelo', 'herreria'],
  ['Martínez Ignacio Javier', 'herreria'],
  ['Mendoza Roberto Luis', 'herreria'],
  ['Quintana Yoel', 'herreria'],
  ['Raballe Eduardo Ramón', 'herreria'],
  ['Spagnolo Dario Gabriel', 'herreria'],
  ['Trejo Ernesto Nicolás', 'herreria'],
  ['Zapata García Fabio Norberto', 'herreria'],
  ['Allegrini Vanesa Alicia', 'bobinado_dist'],
  ['Carruega Roberto Hector', 'bobinado_dist'],
  ['Fogolin Rocío', 'bobinado_dist'],
  ['García Ríos Lara Marisol', 'bobinado_dist'],
  ['Jalil Sabrina Inés', 'bobinado_dist'],
  ['Lescano Aldana Ayelen', 'bobinado_dist'],
  ['Toledo Rosario', 'bobinado_dist'],
  ['Verrelli Maria Florencia', 'bobinado_dist'],
  ['Belis Bianca Nair', 'bobinado_dist'],
  ['Lozano Sofía', 'bobinado_rural'],
  ['Mansilla Tomás', 'bobinado_rural'],
  ['Sanchez Nahir Florencia', 'bobinado_rural'],
  ['Sabelotti Norberto', 'carpinteria'],
  ['López Lautaro Gonzalo', 'corte_aislacion'],
  ['Vallejos Edgar', 'corte_aislacion'],
  ['Acosta Diego Mateo', 'pintura'],
  ['Licheri Guillermo German', 'pintura'],
  ['Villa Javier Osvaldo', 'pintura'],
  ['Aguilar Matías', 'montaje_dist'],
  ['Gomez Diego Alejandro', 'montaje_dist'],
  ['Nievas Gonzalo Martin', 'montaje_dist'],
  ['Pucheta Cristian Ricardo', 'montaje_dist'],
  ['Pussetto Diego', 'montaje_dist'],
  ['Ramallo Damián Ezequiel', 'montaje_dist'],
  ['Rodriguez Juan Alejandro', 'montaje_dist'],
  ['Sequeira Denis Gino', 'montaje_dist'],
  ['Suarez Leandro Daniel', 'montaje_dist'],
  ['Trindade Claudio', 'montaje_dist'],
  ['Zapata Alexis', 'montaje_dist'],
  ['Bender Lautaro Francisco', 'montaje_rural'],
  ['Bonetti Pablo Joaquin', 'montaje_rural'],
  ['Curbelo Leonardo Daniel', 'montaje_rural'],
  ['Duarte Facundo Tomas', 'montaje_rural'],
  ['García Maximiliano Ezequiel', 'montaje_rural'],
  ['Moreira Nestor Brian', 'montaje_rural'],
  ['Tamagna Patricio Ruben', 'montaje_rural'],
  ['Juan Alejandro Rodriguez', 'bobinado_dist'],
]

// usuario (login) + id deterministicos a partir del nombre: "apellido.nombre"
// (sin acentos). En produccion el login real es contra Supabase Auth.
function slugNombre(nombre: string): string {
  // NFD descompone los acentos en marca + letra; \p{M} (Unicode Mark) las elimina.
  return nombre.normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 2).join('.')
}

const operarios: Usuario[] = NOMINA.map(([nombre, grupo]): Usuario => {
  const s = slugNombre(nombre)
  return {
    id: 'op_' + s, nombre, usuario: s, passwordHash: PWD, rol: 'operario',
    sectores: SECTORES_POR_GRUPO[grupo], grupoNomina: grupo, activo: true,
  }
})

const usuarios: Usuario[] = [
  // Planificador / Gerencia (acceso total)
  { id: 'u_plan', nombre: 'Lorenzo Palmieri', usuario: 'lorenzo', passwordHash: PWD, rol: 'planificador', sectores: [], activo: true },
  { id: 'u_rocio', nombre: 'Rocio (Prog. y Control)', usuario: 'rocio', passwordHash: PWD, rol: 'planificador', sectores: [], activo: true },
  // Encargados / Supervisores (areas asignadas)
  { id: 'u_ulises', nombre: 'Ulises Kaiser', usuario: 'ulises', passwordHash: PWD, rol: 'encargado', sectores: ['bob_dist_at', 'bob_dist_bt', 'bob_rural_at', 'bob_rural_bt'], activo: true },
  { id: 'u_santiago', nombre: 'Santiago Yori', usuario: 'santiago', passwordHash: PWD, rol: 'encargado', sectores: ['corte_conformado', 'soldadura_dist', 'soldadura_rural', 'lavado_pintura'], activo: true },
  { id: 'u_omar', nombre: 'Omar Bender', usuario: 'omar', passwordHash: PWD, rol: 'encargado', sectores: ['montaje_pa_dist', 'montaje_po_dist', 'montaje_pa_rural', 'montaje_po_rural'], activo: true },
  // Operarios reales de planta (nomina 2026-06)
  ...operarios,
]

// Catalogo de estaciones de trabajo (v1.2). Generado desde CAPACIDAD_SECTOR.
const maquinas: Maquina[] = generarMaquinas()

const ordenes: OrdenProduccion[] = [
  { id: 'o1', nroOrden: 'OF-2601', nroContrato: 'CTR-8841', modelo: 'TTD 315/13', material: 'cobre', linea: 'distribucion', cantidad: 2, fechaEntrega: '2026-06-19' },
  { id: 'o2', nroOrden: 'OF-2602', nroContrato: 'CTR-8842', modelo: 'TTD 500/13', material: 'aluminio', linea: 'distribucion', cantidad: 1, fechaEntrega: '2026-06-20' },
  { id: 'o3', nroOrden: 'OF-2603', nroContrato: 'CTR-8850', modelo: 'TMR 25/7', material: 'cobre', linea: 'rural', cantidad: 4, fechaEntrega: '2026-06-22' },
  { id: 'o4', nroOrden: 'OF-2604', nroContrato: 'CTR-8855', modelo: 'TTR 63/13', material: 'aluminio', linea: 'rural', cantidad: 3, fechaEntrega: '2026-06-23' },
]

// Helper para construir timestamps relativos a hoy (hora local).
function at(dayOffset: number, h: number, m = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

let pid = 0
// parada: dia, hora de inicio, minuto de inicio, duracion en minutos.
function parada(tareaId: string, causa: Parada['causa'], day: number, h: number, m: number, durMin: number): Parada {
  const ini = new Date(); ini.setDate(ini.getDate() + day); ini.setHours(h, m, 0, 0)
  const fin = new Date(ini.getTime() + durMin * 60000)
  return { id: 'p' + ++pid, tareaId, causa, inicio: ini.toISOString(), fin: fin.toISOString(), observacion: undefined }
}

const SEM = isoWeek(new Date())

function mkTareas(): Tarea[] {
  const t: Tarea[] = []
  // --- Finalizadas (alimentan KPIs reales vs estandar y Pareto) ---
  t.push({
    id: 't1', ordenId: 'o1', sectorId: 'bob_dist_at', maquinaId: 'm_bob_dist_at_01', operarioId: 'op_carruega.roberto', modelo: 'TTD 315/13', fase: 'trifasico',
    nroTransformador: 'TR-10231', semana: SEM, prioridad: 1, estado: 'finalizada', tiempoEstandarMin: 240,
    inicioReal: at(-1, 8, 0), finReal: at(-1, 12, 50), calidadOk: true,
    paradas: [parada('t1', 'espera_alambre', -1, 9, 0, 35)],
    datosBobinado: { diametroExternoMm: 320, codigoBobina: 'BAT-315-001' }, notas: '',
  })
  t.push({
    id: 't2', ordenId: 'o1', sectorId: 'corte_conformado', maquinaId: 'm_corte_conformado_corte_laser', operarioId: 'op_alegre.hugo', modelo: 'TTD 315/13',
    nroTransformador: 'TR-10231', semana: SEM, prioridad: 2, estado: 'finalizada', tiempoEstandarMin: 120,
    inicioReal: at(-1, 8, 0), finReal: at(-1, 10, 30), calidadOk: true,
    paradas: [parada('t2', 'mant_correctivo', -1, 9, 10, 30)], notas: '',
  })
  t.push({
    id: 't3', ordenId: 'o3', sectorId: 'bob_rural_at', maquinaId: 'm_bob_rural_at_01', operarioId: 'op_belis.bianca', modelo: 'TMR 25/7', fase: 'monofasico',
    nroTransformador: 'TR-10250', semana: SEM, prioridad: 3, estado: 'finalizada', tiempoEstandarMin: 90,
    inicioReal: at(-1, 13, 0), finReal: at(-1, 15, 10), calidadOk: false, defecto: 'Capa irregular en AT',
    paradas: [parada('t3', 'retrabajo', -1, 14, 0, 50)],
    datosBobinado: { diametroExternoMm: 180, codigoBobina: 'BAT-25-007' }, notas: '',
  })
  // --- En proceso (hoy) ---
  t.push({
    id: 't4', ordenId: 'o2', sectorId: 'bob_dist_at', maquinaId: 'm_bob_dist_at_02', operarioId: 'op_allegrini.vanesa', modelo: 'TTD 500/13', fase: 'trifasico',
    nroTransformador: 'TR-10260', semana: SEM, prioridad: 1, estado: 'en_proceso', tiempoEstandarMin: 300,
    inicioReal: at(0, 8, 15), paradas: [], notas: '',
  })
  t.push({
    id: 't5', ordenId: 'o1', sectorId: 'soldadura_dist', maquinaId: 'm_soldadura_dist_01', operarioId: 'op_martinez.ignacio', modelo: 'TTD 315/13',
    nroTransformador: 'TR-10232', semana: SEM, prioridad: 2, estado: 'en_proceso', tiempoEstandarMin: 180,
    inicioReal: at(0, 9, 0), paradas: [], notas: '',
  })
  // --- Pausada (parada en curso) ---
  const pausa: Parada = { id: 'p_live', tareaId: 't6', causa: 'espera_canales', inicio: at(0, 10, 30) }
  t.push({
    id: 't6', ordenId: 'o4', sectorId: 'montaje_pa_dist', maquinaId: 'm_montaje_pa_dist_01', operarioId: 'op_aguilar.matias', modelo: 'TTR 63/13',
    nroTransformador: 'TR-10270', semana: SEM, prioridad: 1, estado: 'pausada', tiempoEstandarMin: 150,
    inicioReal: at(0, 9, 30), paradas: [pausa], notas: '',
  })
  // --- Pendientes (cola de la semana) ---
  // v1.3: el planificador asigna operario + estacion juntos (operarioId desde la creacion).
  t.push({ id: 't7', ordenId: 'o2', sectorId: 'bob_dist_at', maquinaId: 'm_bob_dist_at_03', operarioId: 'op_fogolin.rocio', modelo: 'TTD 500/13', fase: 'trifasico', semana: SEM, prioridad: 3, estado: 'pendiente', tiempoEstandarMin: 300, paradas: [] })
  t.push({ id: 't8', ordenId: 'o3', sectorId: 'bob_rural_at', maquinaId: 'm_bob_rural_at_02', operarioId: 'op_lozano.sofia', modelo: 'TMR 25/7', fase: 'monofasico', semana: SEM, prioridad: 4, estado: 'pendiente', tiempoEstandarMin: 90, paradas: [] })
  t.push({ id: 't9', ordenId: 'o4', sectorId: 'montaje_pa_dist', maquinaId: 'm_montaje_pa_dist_01', operarioId: 'op_aguilar.matias', modelo: 'TTR 63/13', semana: SEM, prioridad: 2, estado: 'pendiente', tiempoEstandarMin: 150, paradas: [] })
  t.push({ id: 't10', ordenId: 'o1', sectorId: 'corte_conformado', maquinaId: 'm_corte_conformado_plegadora', operarioId: 'op_chaves.emanuel', modelo: 'TTD 500/13', semana: SEM, prioridad: 3, estado: 'pendiente', tiempoEstandarMin: 120, paradas: [] })
  return t
}

// Semielaborados demo (espejo local de articulos OITM de SAP B1).
const semielaborados: Semielaborado[] = [
  { id: 's1', codigo: 'BAT-315-001', descripcion: 'Bobina AT 315 kVA trifasica', sectorOrigen: 'bob_dist_at', modelo: 'TTD 315/13', fase: 'trifasico', tareaOrigenId: 't1', estado: 'disponible', tiempoEstimadoMin: 240, sapItemCode: 'SEMI-BAT-315', actualizado: new Date().toISOString() },
  { id: 's2', codigo: 'BAT-25-007', descripcion: 'Bobina AT 25 kVA monofasica', sectorOrigen: 'bob_rural_at', modelo: 'TMR 25/7', fase: 'monofasico', tareaOrigenId: 't3', estado: 'disponible', tiempoEstimadoMin: 90, sapItemCode: 'SEMI-BAT-25', actualizado: new Date().toISOString() },
  { id: 's3', codigo: 'BBT-500-002', descripcion: 'Bobina BT 500 kVA trifasica', sectorOrigen: 'bob_dist_bt', modelo: 'TTD 500/13', fase: 'trifasico', estado: 'en_proceso', tiempoEstimadoMin: 180, sapItemCode: 'SEMI-BBT-500', actualizado: new Date().toISOString() },
]

// DESACTIVADO (hotfix lunes): el seed demo inyectaba usuarios/ordenes/tareas de
// prueba en IndexedDB y, cuando la PWA corria sin .env (o con una build cacheada
// sin variables), esas tareas aparecian como "fantasma" en la tablet del operario.
// El sistema debe mostrar SOLO los datos reales de Supabase (insert manual del
// planificador). Se deja la funcion como no-op para no romper imports.
export async function ensureSeed(): Promise<void> {
  // Intencionalmente vacio: NO se siembran datos demo. Ver purgarDemo().
  void usuarios; void ordenes; void maquinas; void semielaborados; void mkTareas
  return
}

// HOTFIX: limpia de IndexedDB cualquier dato DEMO sembrado por versiones previas.
// Los demo usan ids con patron fijo (t1.., o1.., op_/u_, s1..); los reales de
// Supabase son UUID, asi que este borrado nunca toca datos de produccion.
// Se ejecuta en el arranque para que las tablets se auto-reparen sin "borrar datos".
export async function purgarDemo(): Promise<void> {
  await db.transaction('rw', [db.usuarios, db.ordenes, db.tareas, db.semielaborados], async () => {
    await db.tareas.filter((t) => /^t\d+$/.test(t.id)).delete()
    await db.ordenes.filter((o) => /^o\d+$/.test(o.id)).delete()
    await db.semielaborados.filter((s) => /^s\d+$/.test(s.id)).delete()
    await db.usuarios.filter((u) => /^(op_|u_)/.test(u.id)).delete()
  })
}

// ============================================================
// Catalogo MAESTRO (v1.5): modelos + componentes (semielaborados).
// Es data estatica desde SAP B1 (OITM). Se siembra SIEMPRE (con o sin backend),
// porque la PWA opera standalone con este catalogo. Idempotente: solo siembra
// si la tabla esta vacia. NO se borra en el fetch inicial de Supabase.
// ============================================================
export async function ensureCatalogo(): Promise<void> {
  // Re-siembra si esta vacio o si cambio el tamano del catalogo (nuevo export SAP).
  // bulkPut es upsert por PK (codigo), asi que es seguro re-ejecutar.
  const [nm, nc] = await Promise.all([db.modelos.count(), db.componentes.count()])
  if (nm === MODELOS_CATALOGO.length && nc === COMPONENTES_CATALOGO.length) return
  await db.transaction('rw', [db.modelos, db.componentes], async () => {
    await db.modelos.bulkPut(MODELOS_CATALOGO)
    await db.componentes.bulkPut(COMPONENTES_CATALOGO)
  })
}

// Util para desarrollo: limpiar y resembrar.
export async function resetDemo(): Promise<void> {
  await db.delete()
  await db.open()
  await ensureSeed()
  await ensureCatalogo()
}
