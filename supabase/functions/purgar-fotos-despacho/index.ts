// ============================================================
// EDGE FUNCTION · purgar-fotos-despacho  (v1.46)
//
// Borra del bucket las fotos de los transformadores ENTREGADOS hace más de 90
// días, y deja en el registro la marca `fotos_purgadas` = { fecha, cantidad }.
//
// Es el mismo criterio que corre en la app (src/lib/purgaFotos.ts). Tenerlo
// también acá hace que la limpieza no dependa de que alguien abra la PWA.
// Correr las dos no rompe nada: la segunda no encuentra nada para borrar.
//
// ---- DESPLIEGUE (una sola vez, desde tu máquina) ----
//   npx supabase login
//   npx supabase link --project-ref <TU_PROJECT_REF>
//   npx supabase functions deploy purgar-fotos-despacho --no-verify-jwt
//
// Después programá el cron con docs/supabase_purga_fotos_v1.46.sql.
//
// Variables que Supabase ya inyecta solas: SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY. No hace falta configurar nada más.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'despacho-fotos'
const DIAS_RETENCION = 90

// Deriva el path dentro del bucket a partir de la URL pública.
function pathDesdeUrl(url: string): string | undefined {
  const marca = `/${BUCKET}/`
  const i = url.indexOf(marca)
  if (i === -1) return undefined
  const path = url.slice(i + marca.length).split('?')[0]
  return path ? decodeURIComponent(path) : undefined
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const corte = new Date(Date.now() - DIAS_RETENCION * 86400000).toISOString()

  const { data: vencidos, error } = await supabase
    .from('despachos')
    .select('id, fotos, fotos_purgadas')
    .eq('estado', 'entregado')
    .lt('entregada_en', corte)
    .not('fotos', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  let purgados = 0, archivos = 0, errores = 0

  for (const d of vencidos ?? []) {
    const urls: string[] = d.fotos ?? []
    if (urls.length === 0) continue

    const paths = urls.map(pathDesdeUrl).filter((p): p is string => !!p)
    if (paths.length > 0) {
      const { error: errDel } = await supabase.storage.from(BUCKET).remove(paths)
      // Si el borrado falla NO se marca: el registro queda para el próximo pase.
      if (errDel) { errores++; continue }
      archivos += paths.length
    }

    const cantidad = urls.length + (d.fotos_purgadas?.cantidad ?? 0)
    const { error: errUpd } = await supabase
      .from('despachos')
      .update({ fotos: null, fotos_purgadas: { fecha: new Date().toISOString(), cantidad } })
      .eq('id', d.id)

    if (errUpd) { errores++; continue }
    purgados++
  }

  return new Response(
    JSON.stringify({ ok: true, revisados: vencidos?.length ?? 0, purgados, archivos, errores }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
