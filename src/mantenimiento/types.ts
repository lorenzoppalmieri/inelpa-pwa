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
}

// Orden de trabajo (Pilar 4). La tabla existe pero hoy esta vacia.
export interface MantOT {
  id: string                    // uuid
  numero: number
  tipo: 'preventiva' | 'correctiva' | 'emergencia'
  estado: 'creada' | 'planificada' | 'en_ejecucion' | 'en_espera' | 'cerrada' | 'cancelada'
  prioridad: 'alta' | 'media' | 'baja'
  activo_id: string
  descripcion: string
  responsable: string | null
  fecha_objetivo: string | null // date ISO
  creado_en: string
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
