import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import type { MantActivo } from './types'

// ============================================================
// AVISO DE FALLA — modal simple (3 toques) para el operario.
// Inserta en mant_avisos; Realtime hace que el pin del activo pase a
// rojo en el mapa al instante. Reutilizable: se le puede pasar un activo
// ya elegido (desde el pin del mapa) o dejar que el operario lo busque.
//   - activoPreset: si viene, se saltea el buscador.
//   - onCerrar: cierra el modal.
//   - onCreado: aviso insertado (para refrescar la vista que lo abrio).
// ============================================================

export default function AvisoFalla({ activoPreset, onCerrar, onCreado }: {
  activoPreset?: { id: string; nombre: string } | null
  onCerrar: () => void
  onCreado?: (activoId: string) => void
}) {
  const { usuario } = useAuth()
  const [activos, setActivos] = useState<Pick<MantActivo, 'id' | 'nombre' | 'sector_id'>[]>([])
  const [busca, setBusca] = useState('')
  const [activoId, setActivoId] = useState(activoPreset?.id ?? '')
  const [sintoma, setSintoma] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // Solo se cargan los activos si hay que elegir (sin preset).
  useEffect(() => {
    if (activoPreset || !supabase) return
    let vivo = true
    ;(async () => {
      const { data } = await supabase
        .from('mant_activos')
        .select('id, nombre, sector_id')
        .eq('activo', true)
        .order('id')
      if (vivo) setActivos((data ?? []) as Pick<MantActivo, 'id' | 'nombre' | 'sector_id'>[])
    })()
    return () => { vivo = false }
  }, [activoPreset])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return activos.slice(0, 40)
    return activos.filter((a) => `${a.id} ${a.nombre}`.toLowerCase().includes(q)).slice(0, 40)
  }, [activos, busca])

  const nombreElegido = activoPreset?.nombre
    ?? activos.find((a) => a.id === activoId)?.nombre
    ?? ''

  async function enviar() {
    if (!supabase) return
    if (!activoId) { setError('Elegí la máquina que falla.'); return }
    if (!sintoma.trim()) { setError('Escribí qué le pasa (aunque sea corto).'); return }
    setGuardando(true)
    setError('')
    const { error: e } = await supabase.from('mant_avisos').insert({
      activo_id: activoId,
      emisor: usuario?.usuario ?? 'desconocido',
      sintoma: sintoma.trim(),
    })
    setGuardando(false)
    if (e) { setError(`No se pudo enviar el aviso: ${e.message}`); return }
    onCreado?.(activoId)
    onCerrar()
  }

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal" onClick={(ev) => ev.stopPropagation()}>
        <h2>🔴 Avisar una falla</h2>

        {activoPreset ? (
          <div className="mant-aviso" style={{ marginBottom: 12 }}>
            Máquina: <strong>{activoPreset.id}</strong> · {activoPreset.nombre}
          </div>
        ) : (
          <>
            <div className="field">
              <label>Máquina</label>
              <input
                className="input"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="🔎 Buscar por código o nombre…"
                aria-label="Buscar máquina"
              />
            </div>
            <div className="mant-aviso-lista">
              {filtrados.map((a) => (
                <button
                  key={a.id}
                  className={'mant-aviso-op' + (a.id === activoId ? ' sel' : '')}
                  onClick={() => setActivoId(a.id)}
                >
                  <strong>{a.id}</strong> · {a.nombre}
                </button>
              ))}
              {filtrados.length === 0 && <div className="meta">Sin coincidencias.</div>}
            </div>
            {activoId && <div className="meta" style={{ margin: '6px 0' }}>Elegida: <strong>{activoId}</strong> · {nombreElegido}</div>}
          </>
        )}

        <div className="field" style={{ marginTop: 10 }}>
          <label>¿Qué le pasa?</label>
          <textarea
            className="input"
            style={{ minHeight: 90, padding: '10px 14px' }}
            value={sintoma}
            onChange={(e) => setSintoma(e.target.value)}
            placeholder="Ej.: hace ruido raro en el reductor / pierde aceite / no arranca"
            autoFocus
          />
        </div>

        {error && <div className="error-msg" style={{ textAlign: 'left' }}>{error}</div>}

        <div className="row-actions" style={{ marginTop: 14 }}>
          <button className="btn btn-rojo" style={{ flex: 1, minHeight: 48 }} disabled={guardando} onClick={() => void enviar()}>
            {guardando ? 'Enviando…' : '🔔 Enviar aviso'}
          </button>
          <button className="btn" style={{ minHeight: 48 }} onClick={onCerrar}>Cancelar</button>
        </div>
        <div className="meta" style={{ marginTop: 10 }}>Mantenimiento lo verá al instante en el mapa y en el tablero.</div>
      </div>
    </div>
  )
}
