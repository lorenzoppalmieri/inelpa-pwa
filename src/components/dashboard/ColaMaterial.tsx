import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { Tarea, Parada, SolicitudLogistica, EstadoSolicitudLog } from '../../types'
import { sectorById, causaLabel, esCausaLogistica, ESTADOS_SOLICITUD_LOG, RESPONSABLES_LOGISTICA } from '../../types'
import { fmtDur, hhmm } from '../../lib/time'
import { minutosLaboralesLogistica } from '../../lib/calendario'
import { guardarSolicitudLogistica } from '../../sync/syncEngine'

// ============================================================
// Cola interactiva de pedidos de material (vista logistica).
// Cada parada de material ABIERTA es una tarjeta. La solicitud (asignado+estado)
// se guarda 1:1 por parada. Tiempos medidos en horario de logistica (L-V 8-17).
// ============================================================
export default function ColaMaterial() {
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), []) ?? []
  const solicitudes = useLiveQuery(() => db.solicitudesLogistica.toArray(), []) ?? []

  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(id) }, [])
  const ahoraISO = new Date(ahora).toISOString()

  const nombreMaquina = useMemo(() => { const m = new Map(maquinas.map((x) => [x.id, x.nombre])); return (id: string) => m.get(id) ?? id }, [maquinas])
  const solPorParada = useMemo(() => new Map(solicitudes.map((s) => [s.paradaId, s])), [solicitudes])

  // Tarjetas = paradas de material abiertas (tareas pausadas).
  const pedidos = useMemo(() => {
    const out: { t: Tarea; p: Parada; sol?: SolicitudLogistica }[] = []
    for (const t of tareas) {
      if (t.estado !== 'pausada') continue
      const abierta = t.paradas.find((p) => !p.fin)
      if (abierta && esCausaLogistica(abierta.causa)) out.push({ t, p: abierta, sol: solPorParada.get(abierta.id) })
    }
    const rank = (e?: EstadoSolicitudLog) => (e === 'entregado' ? 2 : e === 'en_camino' ? 1 : 0)
    out.sort((a, b) => rank(a.sol?.estado) - rank(b.sol?.estado) || (a.p.inicio < b.p.inicio ? -1 : 1))
    return out
  }, [tareas, solPorParada])

  async function actualizar(t: Tarea, p: Parada, patch: Partial<SolicitudLogistica>) {
    const prev = solPorParada.get(p.id)
    const base: SolicitudLogistica = prev ?? {
      id: p.id, paradaId: p.id, tareaId: t.id, estado: 'pendiente', creada: p.inicio, actualizado: ahoraISO,
    }
    const next: SolicitudLogistica = { ...base, ...patch, actualizado: new Date().toISOString() }
    // Sellos de tiempo segun el estado destino.
    if (next.estado === 'en_camino' && !next.tomadaEn) next.tomadaEn = next.actualizado
    if (next.estado === 'entregado' && !next.entregadaEn) next.entregadaEn = next.actualizado
    await guardarSolicitudLogistica(next)
  }

  if (pedidos.length === 0) return <div className="logi-ok">✓ Sin pedidos de material en cola.</div>

  return (
    <div className="cola-grid">
      {pedidos.map(({ t, p, sol }) => {
        const estado: EstadoSolicitudLog = sol?.estado ?? 'pendiente'
        const clase = ESTADOS_SOLICITUD_LOG.find((e) => e.id === estado)?.clase ?? 'sol-pendiente'
        const espera = fmtDur(minutosLaboralesLogistica(p.inicio, ahoraISO))
        return (
          <div className={'cola-card ' + clase} key={p.id}>
            <div className="cola-top">
              <div className="cola-maq">{nombreMaquina(t.maquinaId)}</div>
              <span className="cola-estado">{ESTADOS_SOLICITUD_LOG.find((e) => e.id === estado)?.label}</span>
            </div>
            <div className="cola-sec">{sectorById(t.sectorId).nombre}</div>
            <div className="cola-causa">{causaLabel(p.causa)}</div>
            <div className="cola-time">Pedido {hhmm(p.inicio)} · espera <strong>{espera}</strong></div>

            <label className="cola-lbl">Asignar a</label>
            <select className="input" value={sol?.asignado ?? ''}
              onChange={(e) => actualizar(t, p, { asignado: e.target.value || undefined, estado: e.target.value && estado === 'pendiente' ? 'en_camino' : estado })}>
              <option value="">— Sin asignar —</option>
              {RESPONSABLES_LOGISTICA.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>

            <div className="cola-acciones">
              {ESTADOS_SOLICITUD_LOG.map((e) => (
                <button key={e.id} className={'seg-btn' + (estado === e.id ? ' on' : '')} onClick={() => actualizar(t, p, { estado: e.id })}>{e.label}</button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
