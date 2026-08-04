import { supabase } from './supabaseClient'

// ============================================================
// LECTURA COMPLETA DE SUPABASE (v1.70) — helper compartido por TODOS los módulos
//
// EL PROBLEMA QUE RESUELVE: Supabase/PostgREST corta cualquier `select()` en
// 1000 filas por defecto (ajuste global "Max rows" del proyecto). No devuelve
// error: simplemente faltan filas. Eso hizo que, al pasar `paradas` las 1000
// filas, TODAS las tareas del tablero mostraran "Demora justificada = 0".
//
// Este helper pide de a 1000 hasta agotar la tabla.
//
// POR QUÉ SE ORDENA SIEMPRE: sin un ORDER BY estable, Postgres no garantiza el
// mismo orden entre páginas, así que se pueden repetir o saltear filas. Por eso
// `traerTodo` ordena por `id` y `traerTodoDe` exige que quien llama ya haya
// puesto un `.order(...)`.
//
// REGLA PARA EL FUTURO: cualquier lectura de una tabla que crezca con el tiempo
// (tareas, paradas, mensajes, despachos, órdenes de trabajo, registros...) va
// por acá. Para tablas chicas cuesta lo mismo que antes: una sola request.
// ============================================================
export const PAGINA = 1000
const TOPE_FILAS = 500000   // guarda dura contra un bucle infinito

/** Forma mínima de una consulta de Supabase lista para paginar. */
export interface ConsultaPaginable<T> {
  range(desde: number, hasta: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>
}

/**
 * Trae TODAS las filas de una consulta armada por quien llama.
 *
 * `construir` se invoca UNA VEZ POR PÁGINA a propósito: una consulta de Supabase
 * no se puede reutilizar después de ejecutarse.
 *
 * @example
 *   const paradas = await traerTodoDe('paradas', () =>
 *     supabase!.from('paradas').select('id, inicio, fin').order('id'))
 */
export async function traerTodoDe<T>(
  etiqueta: string,
  construir: () => ConsultaPaginable<T>,
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data, error } = await construir().range(desde, desde + PAGINA - 1)
    if (error) {
      console.warn(`[supabase] ${etiqueta}: falló la página ${desde} —`, error.message)
      break   // se devuelve lo que se haya podido traer
    }
    const lote = data ?? []
    filas.push(...lote)
    if (lote.length < PAGINA) break    // última página
  }
  return filas
}

/**
 * Atajo para el caso más común: traer una tabla entera.
 * Ordena por `id`, que es la PK en todas las tablas del proyecto.
 */
export async function traerTabla<T>(tabla: string, columnas = '*'): Promise<T[]> {
  const sb = supabase
  if (!sb) return []
  return traerTodoDe<T>(tabla, () =>
    sb.from(tabla).select(columnas).order('id', { ascending: true }) as unknown as ConsultaPaginable<T>)
}
