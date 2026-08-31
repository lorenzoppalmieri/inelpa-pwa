// ============================================================
// MODULO DE MANTENIMIENTO (v1.62/v1.63) — tipos que mapean 1:1 las
// tablas mant_* de Supabase (ver docs/supabase_mantenimiento_v1.62.sql
// y supabase_mantenimiento_registros_v1.63.sql).
// ============================================================

export type Criticidad = 'A' | 'B' | 'C'

export interface MantPlanta {
  id: string                    // 'lorenzatti' | 'cerdan_n1' | 'cerdan_n2'
  nombre: string
  superficie_m2: number | null
  plano_url: string | null      // path en Storage; null -> fallback local
  plano_ancho_px: number | null
  plano_alto_px: number | null
  orden: number
  activa: boolean
}

export interface MantSector {
  id: string                    // 'her' | 'pin' | 'lam' | ...
  nombre: string
  prefijo: string               // HER | PIN | LAM ... (codigo [SECTOR]-[TIPO]-[N])
  color: string                 // hex, color del pin en el mapa
  orden: number
}

// Item normalizado de los jsonb de fichaje (componentes / puntos_loto).
// En la base conviven strings y objetos; la UI los normaliza con comoLineas().
export interface LineaFicha {
  titulo: string
  detalle: string
}

export interface MantActivo {
  id: string                    // codigo: 'LAM-CORT-01'
  nombre: string
  sector_id: string
  planta_id: string
  subarea: string | null
  tipo: string | null
  simbolo: string               // simbolo del editor de mapa (ver simbolos.tsx)
  criticidad: Criticidad
  x_pct: number | null          // 0-100 relativo al ancho del plano; null = sin ubicar
  y_pct: number | null
  // Datos de placa (se fichan con el tiempo; la mayoria esta vacio).
  fabricante: string | null
  modelo: string | null
  nro_serie: string | null
  anio: number | null
  datos_tecnicos: Record<string, unknown>   // potencia, tension, capacidad...
  componentes: unknown[]                    // motores/variadores fichados
  puntos_loto: unknown[]                    // puntos de bloqueo LOTO
  iit_ref: string | null
  pwa_machine_key: string | null            // vinculo con maquinas de produccion (m_bob_07)
  depende_de: string[]                      // codigos de activos de los que depende
  notas: string | null
  activo: boolean
  creado_en: string
  actualizado_en: string
  actualizado_por: string | null
}

// Registro historico de intervencion (planillas RIT migradas, v1.63).
export interface MantRegistro {
  id: number
  fecha: string                 // timestamptz ISO
  tipo: 'preventivo' | 'correctivo'
  sector: string | null
  emisor: string | null
  maquina_texto: string | null  // texto original de la planilla
  activo_id: string | null
  trabajo: string | null
  insumo: string | null
  colaborador: string | null
  fecha_fin: string | null
  horas: number | null
  origen: string
}

// Gama preventiva: tarea periodica que genera OT (por app o cron).
export interface MantGama {
  id: string                    // uuid
  activo_id: string | null
  familia: string | null        // si es gama de familia en vez de activo puntual
  tarea: string
  frecuencia: 'diaria' | 'semanal' | 'quincenal' | 'mensual' | 'trimestral' | 'semestral' | 'anual'
  responsable: 'operario' | 'mantenimiento' | 'externo'
  duracion_est_min: number | null
  orden: number
  activa: boolean
  // v1.66 · instructivo detallado (planilla de Herrería). Opcionales: las
  // gamas viejas (cronograma RIT 51) no los tienen y la UI los oculta.
  tarea_tipo?: string | null    // Limpieza / Inspección / Cambio de aceite...
  proposito?: string | null     // por qué se hace
  componente?: string | null    // sobre qué componente
  ejecucion?: string | null     // paso a paso
  herramienta?: string | null   // herramientas necesarias
  consumible?: string | null    // consumibles / repuestos
}

// Componente / repuesto de una máquina (catálogo con foto). v1.66.
export interface MantComponente {
  id: string
  activo_id: string
  cantidad: string | null
  nombre: string
  foto_path: string | null      // ruta en Storage (bucket 'mantenimiento'); null = sin foto
  orden: number
}

export type OtEstado = 'creada' | 'planificada' | 'en_ejecucion' | 'en_espera' | 'cerrada' | 'cancelada'
export type OtTipo = 'preventiva' | 'correctiva' | 'emergencia'
export type OtPrioridad = 'alta' | 'media' | 'baja'

// Estados abiertos (los que pesan en el mapa y el backlog).
export const OT_ABIERTAS: OtEstado[] = ['creada', 'planificada', 'en_ejecucion', 'en_espera']

// Orden de trabajo (Pilar 4).
export interface MantOT {
  id: string                    // uuid
  numero: number
  tipo: OtTipo
  estado: OtEstado
  prioridad: OtPrioridad
  activo_id: string
  origen: 'automatica' | 'aviso' | 'manual'
  aviso_id: string | null
  gama_id: string | null
  descripcion: string
  responsable: string | null
  fecha_objetivo: string | null // date ISO
  fecha_inicio: string | null
  fecha_cierre: string | null
  cierre_trabajo: string | null
  cierre_causa: string | null
  cierre_repuestos: unknown[]
  horas_hombre: number | null
  tiempo_parada_min: number | null
  loto_requerido: boolean
  loto_checklist: unknown[]
  creado_por: string | null
  creado_en: string
}

// Bloque del layout SCADA (el plano es 100% dato). Coords en % del plano.
export type BloqueTipo = 'muro' | 'maquina' | 'estanteria' | 'zona'
export interface MantBloque {
  id: string
  planta_id: string
  tipo: BloqueTipo
  nombre: string
  x: number; y: number; w: number; h: number   // %
  orden: number
}

// Anotacion de dibujo libre (linea/circulo/texto). Coords en unidades 0..2800 / 0..780.
export type AnotacionTipo = 'linea' | 'circulo' | 'texto'
export interface MantAnotacion {
  id: string
  planta_id: string
  tipo: AnotacionTipo
  color: string
  x1: number | null; y1: number | null; x2: number | null; y2: number | null
  cx: number | null; cy: number | null; r: number | null
  x: number | null; y: number | null; texto: string | null; tam: number | null
}

// Aviso de falla (boton del operario). Realtime -> el mapa se pone rojo.
export interface MantAviso {
  id: string                    // uuid
  activo_id: string
  emisor: string
  sintoma: string
  estado: 'nuevo' | 'en_ot' | 'resuelto' | 'cancelado'
  ot_id: string | null
  creado_en: string
  atendido_en: string | null
}

// ------------------------------------------------------------
// Cola OFFLINE de avisos de mantenimiento (tabla Dexie `avisosMant`).
// Un aviso se guarda primero local y se empuja a mant_avisos cuando hay
// red (ver src/mantenimiento/avisos.ts). El id es uuid de CLIENTE y viaja
// como PK del aviso en Supabase -> el reenvio es idempotente.
// ------------------------------------------------------------
export interface AvisoMantPendiente {
  id: string                    // uuid cliente = mant_avisos.id al subir
  paradaId?: string             // parada de produccion origen (clave anti-duplicado)
  pwaMachineKey?: string        // maquina de produccion ('m_bob_07'); se resuelve
                                // a activo_id RECIEN al enviar (online) via pwa_machine_key
  activoId?: string             // activo ya resuelto (aviso manual desde el modulo)
  emisor: string                // usuario que genero el aviso
  sintoma: string
  origen: 'parada' | 'manual'
  creadoEn: string              // ISO (se conserva al subir: el aviso offline
                                // registra la hora real de la falla, no la de la subida)
  sincronizado: boolean         // false = pendiente de envio
  intentos?: number             // reintentos de envio (transitorios)
  error?: string                // descartado definitivo (sin activo / errores agotados)
}

// ------------------------------------------------------------
// Normaliza un jsonb de fichaje (componentes / puntos_loto) a lineas
// { titulo, detalle } renderizables. Tolera strings, objetos con
// nombre/punto/titulo y primitivos; descarta entradas vacias.
// ------------------------------------------------------------
export function comoLineas(v: unknown): LineaFicha[] {
  if (!Array.isArray(v)) return []
  const CLAVES_TITULO = ['nombre', 'punto', 'titulo', 'codigo', 'descripcion']
  const lineas: LineaFicha[] = []
  for (const it of v) {
    if (typeof it === 'string') {
      if (it.trim()) lineas.push({ titulo: it, detalle: '' })
      continue
    }
    if (it && typeof it === 'object') {
      const o = it as Record<string, unknown>
      const clave = CLAVES_TITULO.find((k) => typeof o[k] === 'string' && String(o[k]).trim())
      const titulo = clave ? String(o[clave]) : JSON.stringify(it)
      const detalle = Object.entries(o)
        .filter(([k]) => k !== clave)
        .map(([k, val]) => `${k}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`)
        .join(' · ')
      if (titulo.trim()) lineas.push({ titulo, detalle })
      continue
    }
    if (it != null) lineas.push({ titulo: String(it), detalle: '' })
  }
  return lineas
}
