import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { SimboloActivo } from './simbolos'
import type { MantActivo, MantPlanta, MantSector } from './types'

// ============================================================
// LISTADO DE ACTIVOS — MANTENIMIENTO (v1.63)
// Tabla buscable de TODOS los activos (todas las plantas) para llegar
// a cualquier ficha sin pasar por el mapa. Click en la fila -> ficha.
// ============================================================

export default function ActivosLista({ onVerFicha }: { onVerFicha: (id: string) => void }) {
  const [activos, setActivos] = useState<MantActivo[]>([])
  const [sectores, setSectores] = useState<MantSector[]>([])
  const [plantas, setPlantas] = useState<MantPlanta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [plantaFiltro, setPlantaFiltro] = useState('')
  const [soloSinUbicar, setSoloSinUbicar] = useState(false)

  useEffect(() => {
    if (!supabase) { setCargando(false); return }
    let vivo = true
    ;(async () => {
      const [{ data: as, error: e1 }, { data: ss }, { data: ps }] = await Promise.all([
        supabase.from('mant_activos').select('id, nombre, sector_id, planta_id, subarea, tipo, simbolo, criticidad, x_pct, y_pct, activo').order('id'),
        supabase.from('mant_sectores').select('*').order('orden'),
        supabase.from('mant_plantas').select('*').order('orden'),
      ])
      if (!vivo) return
      if (e1) { setError('No se pudieron cargar los activos. Revisá la conexión.'); setCargando(false); return }
      setActivos((as ?? []) as MantActivo[])
      setSectores((ss ?? []) as MantSector[])
      setPlantas((ps ?? []) as MantPlanta[])
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [])

  const sectorPorId = useMemo(() => new Map(sectores.map((s) => [s.id, s])), [sectores])
  const plantaPorId = useMemo(() => new Map(plantas.map((p) => [p.id, p])), [plantas])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return activos.filter((a) => {
      if (!a.activo) return false
      if (plantaFiltro && a.planta_id !== plantaFiltro) return false
      if (soloSinUbicar && a.x_pct != null && a.y_pct != null) return false
      if (!q) return true
      return `${a.id} ${a.nombre} ${a.subarea ?? ''} ${a.tipo ?? ''}`.toLowerCase().includes(q)
    })
  }, [activos, busqueda, plantaFiltro, soloSinUbicar])

  if (!supabase) return <div className="empty">Supabase no está configurado (faltan credenciales en .env).</div>

  return (
    <div>
      <div className="filtros no-print">
        <input
          className="input"
          style={{ minHeight: 48, flex: '1 1 240px' }}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="🔎 Buscar por código, nombre, subárea o tipo…"
          aria-label="Buscar activo"
        />
        <select className="select" value={plantaFiltro} onChange={(e) => setPlantaFiltro(e.target.value)} aria-label="Filtrar por planta">
          <option value="">Todas las plantas</option>
          {plantas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <label className="mant-check">
          <input type="checkbox" checked={soloSinUbicar} onChange={(e) => setSoloSinUbicar(e.target.checked)} />
          Sin ubicar en el mapa
        </label>
      </div>

      {error && <div className="error-msg" style={{ textAlign: 'left', margin: '0 0 8px' }}>{error}</div>}
      <div className="meta" style={{ marginBottom: 10 }}>{filtrados.length} activo(s)</div>

      {cargando ? (
        <div className="empty">Cargando activos…</div>
      ) : filtrados.length === 0 ? (
        <div className="empty">Sin activos que coincidan con el filtro.</div>
      ) : (
        <div className="mant-tabla-wrap">
          <table className="mant-tabla">
            <thead>
              <tr>
                <th></th>
                <th>Código</th>
                <th>Nombre</th>
                <th>Sector</th>
                <th>Planta</th>
                <th>Crit.</th>
                <th>Mapa</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((a) => {
                const sec = sectorPorId.get(a.sector_id)
                const ubicado = a.x_pct != null && a.y_pct != null
                return (
                  <tr key={a.id} onClick={() => onVerFicha(a.id)} title={`Ver ficha de ${a.id}`}>
                    <td style={{ color: sec?.color ?? '#94a3b8', width: 40 }}><SimboloActivo simbolo={a.simbolo} size={22} /></td>
                    <td><strong>{a.id}</strong></td>
                    <td>{a.nombre}{a.subarea ? <span className="meta"> · {a.subarea}</span> : null}</td>
                    <td>
                      {sec && <span className="mant-chip"><i style={{ background: sec.color }} />{sec.prefijo}</span>}
                    </td>
                    <td className="meta">{plantaPorId.get(a.planta_id)?.nombre ?? a.planta_id}</td>
                    <td><span className={`mant-chip-crit mant-crit-${a.criticidad}`}>{a.criticidad}</span></td>
                    <td>{ubicado ? '📍' : <span className="meta">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
