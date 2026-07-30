import { db } from '../db/dexie'
import { supabase } from './supabaseClient'
import { guardarDespacho } from '../sync/syncEngine'
import { BUCKET_FOTOS } from '../components/dashboard/FichaDespacho'
import { despachosAPurgar, despachoPurgado, pathDesdeUrl, DIAS_RETENCION_FOTOS } from './purgaFotos'

// ============================================================
// DISPARADOR DE LA PURGA (v1.46).
//
// No hay backend propio, así que el barrido corre en el cliente cuando alguien
// abre el módulo de Despacho. Recaudos para que eso no moleste:
//   · una vez por día como mucho (marca en localStorage)
//   · solo con conexión y sesión de Supabase (borrar exige estar autenticado)
//   · solo un encargado lo dispara: no queremos que 5 tablets peleen por lo mismo
//   · si el borrado del archivo falla, NO se marca como purgado -> se reintenta
//
// Si además se despliega la Edge Function (ver supabase/functions/), esto pasa a
// ser una red de contención: lo que ya borró el cron simplemente no aparece.
// ============================================================

const CLAVE_ULTIMA = 'inelpa.purgaFotos.ultima'   // 'YYYY-MM-DD'
let corriendo = false

function hoyLocal(): string { return new Date().toLocaleDateString('en-CA') }

function yaCorrioHoy(): boolean {
  try { return localStorage.getItem(CLAVE_ULTIMA) === hoyLocal() } catch { return false }
}
function marcarCorrida(): void {
  try { localStorage.setItem(CLAVE_ULTIMA, hoyLocal()) } catch { /* modo privado: se reintenta mañana */ }
}

export interface ResultadoPurga { revisados: number; purgados: number; archivos: number; errores: number }

/**
 * Borra las fotos vencidas. Devuelve null si no correspondía correr ahora.
 * @param forzar ignora la marca diaria (para un botón manual).
 */
export async function purgarFotosVencidas(forzar = false): Promise<ResultadoPurga | null> {
  if (corriendo) return null
  if (!forzar && yaCorrioHoy()) return null
  if (!supabase) return null
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null

  // Borrar del bucket requiere sesión: sin ella la API responde 401 y quedaría
  // el registro marcado como purgado con los archivos todavía en la nube.
  const { data: sesion } = await supabase.auth.getSession()
  if (!sesion?.session) return null

  corriendo = true
  const res: ResultadoPurga = { revisados: 0, purgados: 0, archivos: 0, errores: 0 }
  try {
    const todos = await db.despachos.toArray()
    const vencidos = despachosAPurgar(todos)
    res.revisados = vencidos.length
    if (vencidos.length === 0) { marcarCorrida(); return res }

    for (const d of vencidos) {
      const paths = (d.fotos ?? [])
        .map((u) => pathDesdeUrl(u, BUCKET_FOTOS))
        .filter((p): p is string => !!p)

      if (paths.length > 0) {
        const { error } = await supabase.storage.from(BUCKET_FOTOS).remove(paths)
        if (error) { res.errores++; continue }   // sin marcar: se reintenta mañana
        res.archivos += paths.length
      }
      // Si alguna URL no era del bucket, igual se limpia el campo: el registro
      // no puede quedar apuntando a algo que ya no vamos a conservar.
      await guardarDespacho(despachoPurgado(d))
      res.purgados++
    }
    marcarCorrida()
    return res
  } catch {
    return res
  } finally {
    corriendo = false
  }
}

export { DIAS_RETENCION_FOTOS }
