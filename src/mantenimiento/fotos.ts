import { supabase } from '../lib/supabaseClient'

// ============================================================
// FOTOS DE COMPONENTES — bucket privado 'mantenimiento' (v1.66).
// Mismo criterio que archivos.ts: la imagen NO va en la tabla (cada tablet
// espeja todas las filas). En mant_componentes.foto_path queda solo la ruta
// y la foto se baja con link firmado temporal, solo al abrir la ficha.
// ============================================================
export const BUCKET_MANTENIMIENTO = 'mantenimiento'

// Link firmado temporal para mostrar la foto de un componente.
export async function urlFotoComponente(path?: string | null, segundos = 600): Promise<string | null> {
  if (!path || !supabase) return null
  const { data, error } = await supabase.storage.from(BUCKET_MANTENIMIENTO).createSignedUrl(path, segundos)
  if (error) return null
  return data?.signedUrl ?? null
}
