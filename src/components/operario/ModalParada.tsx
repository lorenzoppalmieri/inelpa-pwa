import { useMemo, useState } from 'react'
import {
  causasDeSector, CATEGORIA_LABEL, areaDemora,
  type CausaParada, type CategoriaParada, type CausaParadaDef, type SectorId,
} from '../../types'

// Normaliza para buscar sin acentos ni mayusculas.
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Orden de categorias en el modal.
// v1.88: 'laboratorio' va despues de 'calidad'. Sin agregarlo aca, las causas de
// esa categoria NO se dibujan: el modal solo pinta los grupos que estan en esta
// lista, no todos los que existan en el catalogo.
const ORDEN_CAT: CategoriaParada[] = ['material', 'logistica', 'maquina', 'personal', 'calidad', 'laboratorio', 'no_productiva', 'otra']

export default function ModalParada({ sectorId, onConfirm, onCancel }: {
  sectorId: SectorId
  onConfirm: (causa: CausaParada, obs: string) => void
  onCancel: () => void
}) {
  const [causa, setCausa] = useState<CausaParada | null>(null)
  const [obs, setObs] = useState('')
  const [q, setQ] = useState('')
  // En Montaje el operario NO escribe observación (solo elige la causa).
  const esMontaje = areaDemora(sectorId) === 'montaje'

  // Causas de la SECCION del operario (+ globales) -> filtro por texto -> agrupa.
  const grupos = useMemo(() => {
    const base = causasDeSector(sectorId)
    const qn = norm(q.trim())
    const filtradas = qn
      ? base.filter((c) => norm(c.label).includes(qn) || String(c.codigo ?? '').includes(qn))
      : base
    const out: { cat: CategoriaParada; items: CausaParadaDef[] }[] = []
    for (const cat of ORDEN_CAT) {
      const items = filtradas.filter((c) => c.categoria === cat)
      if (items.length) out.push({ cat, items })
    }
    return out
  }, [q, sectorId])

  const total = grupos.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="modal-overlay" onClick={onCancel}>
      {/* v1.78: modal de alto acotado. Cabecera y pie fijos; la lista de causas
          es la unica zona que scrollea. Antes, en tablet APAISADA el pie
          (observacion + boton "Iniciar parada") quedaba fuera de la pantalla y
          el operario no podia confirmar la parada. */}
      <div className="modal modal-flex" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Registrar parada</h2>
          <p className="meta" style={{ marginBottom: 12 }}>Busca o elige la causa. La hora de inicio se registra automaticamente.</p>

          <div className="field">
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="🔍 Buscar causa (ej. alambre, mantenimiento, retrabajo)…"
              autoFocus
            />
          </div>
        </div>

        <div className="causa-scroll modal-cuerpo">
          {total === 0 && <div className="empty" style={{ padding: '20px 0' }}>Sin resultados para "{q}".</div>}
          {grupos.map((g) => (
            <div key={g.cat} style={{ marginBottom: 12 }}>
              <div className="causa-cat">{CATEGORIA_LABEL[g.cat]}</div>
              <div className="causa-grid">
                {g.items.map((c) => (
                  <button key={c.id} className={'causa-btn' + (causa === c.id ? ' sel' : '')} onClick={() => setCausa(c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-pie">
          {!esMontaje && (
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Observacion (opcional)</label>
              <input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="detalle..." />
            </div>
          )}
          <div className="row-actions">
            <button className="btn" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
            <button className="btn btn-naranja" style={{ flex: 1 }} disabled={!causa}
              onClick={() => causa && onConfirm(causa, obs)}>Iniciar parada</button>
          </div>
        </div>
      </div>
    </div>
  )
}
