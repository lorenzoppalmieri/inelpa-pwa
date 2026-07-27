import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import type { FleteInterno } from '../../types'
import { guardarFlete, eliminarFlete } from '../../sync/syncEngine'
import { fechaCorta } from '../../lib/time'
import ChipsInput from './ChipsInput'

// ============================================================
// FLETES / VIAJES INTERNOS (v1.28, Fase 3) — registro de traslados con su costo
// y estadística de gasto del día. Base de la "estadística de gastos de flete".
// El equipo registra; solo la supervisora (Melany) elimina.
// ============================================================

export function ars(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}
function hoyLocal(): string { return new Date().toLocaleDateString('en-CA') }

export default function FletesInternos({ esSupervisora }: { esSupervisora: boolean }) {
  const { usuario } = useAuth()
  const fletes = useLiveQuery(() => db.fletes.toArray(), []) ?? []

  const [concepto, setConcepto] = useState('')
  const [costo, setCosto] = useState('')
  const [transportista, setTransportista] = useState('')
  const [fecha, setFecha] = useState<string>(hoyLocal)
  // v1.42: detalle del viaje, para que el desglose de Reportes sirva de auditoría.
  const [cliente, setCliente] = useState('')
  const [series, setSeries] = useState<string[]>([])
  const [msg, setMsg] = useState('')

  async function crear() {
    const c = Number(costo)
    if (!concepto.trim() || !(c >= 0) || !costo) { setMsg('Completá el concepto y el costo.'); return }
    const f: FleteInterno = {
      id: crypto.randomUUID(),
      fecha: new Date(`${fecha}T12:00:00`).toISOString(),
      concepto: concepto.trim(),
      costo: c,
      transportista: transportista.trim() || undefined,
      cliente: cliente.trim() || undefined,
      series: series.length ? series : undefined,
      creada: new Date().toISOString(),
      creadaPor: usuario?.usuario,
    }
    await guardarFlete(f)
    setConcepto(''); setCosto(''); setTransportista(''); setFecha(hoyLocal()); setCliente(''); setSeries([])
    setMsg(`Flete registrado: ${ars(c)}.`)
  }
  async function borrar(f: FleteInterno) {
    if (!window.confirm(`¿Eliminar el flete "${f.concepto}" (${ars(f.costo)})?`)) return
    await eliminarFlete(f)
  }

  const { delDia, totalDia, totalMes } = useMemo(() => {
    const hoy = hoyLocal()
    const mes = hoy.slice(0, 7)
    const delDia = fletes.filter((f) => f.fecha.slice(0, 10) === hoy).sort((a, b) => (a.creada < b.creada ? 1 : -1))
    const totalDia = delDia.reduce((s, f) => s + f.costo, 0)
    const totalMes = fletes.filter((f) => f.fecha.slice(0, 7) === mes).reduce((s, f) => s + f.costo, 0)
    return { delDia, totalDia, totalMes }
  }, [fletes])

  return (
    <div className="card">
      <div className="section-title">Fletes internos del día · total <strong style={{ color: 'var(--naranja)' }}>{ars(totalDia)}</strong> · mes {ars(totalMes)}</div>
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Concepto</label>
          <input className="input" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="ej. Traslado a depósito 25 de mayo / reacomodo con grúa" />
        </div>
        <div className="field"><label>Costo (ARS)</label><input className="input" type="number" min={0} value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0" /></div>
        <div className="field"><label>Transportista (opcional)</label><input className="input" value={transportista} onChange={(e) => setTransportista(e.target.value)} /></div>
        <div className="field"><label>Fecha</label><input type="date" className="input" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
        <div className="field"><label>Cliente / destino (opcional)</label><input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="ej. EPE Rosario / Depósito 25 de Mayo" /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>N° de serie o modelo (opcional) — podés cargar varios</label>
          <ChipsInput valores={series} onChange={setSeries} placeholder="ej. 24-1187 · Enter para agregar" />
        </div>
      </div>
      <button className="btn btn-primary btn-bloque" style={{ marginTop: 10 }} onClick={crear}>＋ Registrar flete</button>
      {msg && <div className="meta" style={{ marginTop: 8 }}>{msg}</div>}

      {delDia.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {delDia.map((f) => (
            <div key={f.id} className="pareto-row" style={{ marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <strong>{f.concepto}</strong>
                <div className="meta">
                  {ars(f.costo)}{f.transportista ? ` · ${f.transportista}` : ''} · {fechaCorta(f.fecha)}
                  {f.cliente ? ` · ${f.cliente}` : ''}
                  {f.series?.length ? ` · series ${f.series.join(', ')}` : ''}
                </div>
              </div>
              {esSupervisora && <button className="btn btn-rojo" onClick={() => void borrar(f)}>🗑</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
