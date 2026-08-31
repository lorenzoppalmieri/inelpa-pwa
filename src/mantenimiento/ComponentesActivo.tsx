import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { urlFotoComponente } from './fotos'
import type { MantComponente } from './types'

// ============================================================
// CATÁLOGO DE REPUESTOS / PARTES DE UNA MÁQUINA (v1.66)
// Lee mant_componentes y muestra tarjetas Cantidad + Nombre + Foto para
// que el operario identifique y pida el repuesto. La foto se baja con
// link firmado solo al abrir la ficha (nunca viaja en la tabla).
// Componente self-contained: se monta con <ComponentesActivo activoId=.. />.
// ============================================================

function FotoComp({ path, alt }: { path: string | null; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let vivo = true
    if (!path) return
    void urlFotoComponente(path).then((u) => { if (vivo) setUrl(u) })
    return () => { vivo = false }
  }, [path])

  if (!path) return <div className="mant-comp-foto sin"><span>sin foto</span></div>
  if (err || !url) return <div className="mant-comp-foto sin"><span>{err ? 'sin foto' : '…'}</span></div>
  return <img className="mant-comp-foto" src={url} alt={alt} loading="lazy" onError={() => setErr(true)} />
}

export default function ComponentesActivo({ activoId }: { activoId: string }) {
  const [comps, setComps] = useState<MantComponente[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!supabase) { setCargando(false); return }
    let vivo = true
    ;(async () => {
      const { data } = await supabase
        .from('mant_componentes')
        .select('*')
        .eq('activo_id', activoId)
        .order('orden')
      if (vivo) { setComps((data ?? []) as MantComponente[]); setCargando(false) }
    })()
    return () => { vivo = false }
  }, [activoId])

  if (cargando) return null
  if (comps.length === 0) return null

  return (
    <div className="card">
      <div className="section-title" style={{ margin: '0 0 10px', fontSize: '1.05rem' }}>
        🧩 Repuestos / partes ({comps.length})
      </div>
      <div className="mant-comp-grid">
        {comps.map((c) => (
          <div key={c.id} className="mant-comp-card">
            <FotoComp path={c.foto_path} alt={c.nombre} />
            <div className="mant-comp-txt">
              <strong>{c.nombre}</strong>
              {c.cantidad && <span className="meta">Cantidad: {c.cantidad}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
