import { useState } from 'react'
import type { DespachoTrafo, LineaProduccion } from '../../types'
import { guardarDespacho } from '../../sync/syncEngine'
import { useAuth } from '../../auth/AuthContext'
import { db } from '../../db/dexie'
import { buscarDespachoEnPlantaPorSerie } from '../../types'
import ChipsInput from './ChipsInput'

// ============================================================
// ALTA EXCEPCIONAL DE DESPACHO (v1.73) — SOLO super admin.
//
// El camino normal es uno solo: Laboratorio libera el trafo con su protocolo
// aprobado y aparece en "Esperando embalaje". El alta a mano se eliminó para
// todos porque permitía preparar para despacho una unidad sin ensayo, y era la
// principal fuente de series duplicadas.
//
// Queda esta válvula para un único caso: un transformador ANTERIOR a la app que
// aparece físicamente en un depósito y nunca tuvo ensayo cargado acá. Está
// cerrada bajo un desplegable y avisa antes de crear si la serie ya existe.
// ============================================================

export default function AltaExcepcionalDespacho() {
  const { usuario } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [ot, setOt] = useState('')
  const [cliente, setCliente] = useState('')
  const [numerosSerie, setNumerosSerie] = useState<string[]>([])
  const [modelo, setModelo] = useState('')
  const [potencia, setPotencia] = useState('')
  const [tipo, setTipo] = useState('')
  const [cut, setCut] = useState('')
  const [linea, setLinea] = useState<LineaProduccion>('distribucion')
  const [motivo, setMotivo] = useState('')
  const [msg, setMsg] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function crear() {
    if (numerosSerie.length === 0) { setMsg('Cargá al menos un N° de serie.'); return }
    if (!motivo.trim()) { setMsg('Escribí por qué esta unidad no pasa por Laboratorio.'); return }

    // No se permite crear encima de una serie que ya está en planta.
    const todos = await db.despachos.toArray()
    for (const s of numerosSerie) {
      const choca = buscarDespachoEnPlantaPorSerie(todos, s)
      if (choca) {
        setMsg(`La serie ${s} ya existe en Despacho (${choca.estado}${choca.deposito ? ` · ${choca.deposito}` : ''}). No se creó nada.`)
        return
      }
    }

    setGuardando(true)
    const now = new Date().toISOString()
    const d: DespachoTrafo = {
      id: crypto.randomUUID(),
      ot: ot.trim(), cliente: cliente.trim() || 'Stock',
      nroSerie: numerosSerie.join(', '), numerosSerie,
      modelo: modelo.trim() || undefined,
      cut: cut.trim() || undefined,
      potencia: potencia.trim() || undefined,
      tipo: tipo.trim() || undefined,
      linea,
      fechaIngreso: now,
      estado: 'esperando_embalaje',
      observaciones: `⚠ Alta excepcional (sin ensayo de Laboratorio) · ${motivo.trim()}`,
      creada: now, creadaPor: usuario?.usuario,
    }
    await guardarDespacho(d)
    setGuardando(false)
    setOt(''); setCliente(''); setNumerosSerie([]); setModelo(''); setPotencia(''); setTipo(''); setCut(''); setMotivo('')
    setMsg(`Ingresado sin ensayo: ${numerosSerie.length} unidad(es). Queda marcado en las observaciones.`)
  }

  if (!abierto) {
    return (
      <div style={{ marginBottom: 12 }}>
        <button className="btn" onClick={() => { setAbierto(true); setMsg('') }}>
          🔑 Carga excepcional (solo gerencia)
        </button>
      </div>
    )
  }

  return (
    <div className="card" style={{ borderLeft: '4px solid var(--naranja)' }}>
      <div className="section-title" style={{ marginTop: 0, color: 'var(--naranja)' }}>
        🔑 Alta excepcional · transformador sin ensayo de Laboratorio
      </div>
      <div className="meta" style={{ marginBottom: 10 }}>
        Solo para una unidad <strong>anterior a la app</strong> que apareció físicamente y nunca tuvo ensayo cargado acá.
        Todo lo que se fabrica hoy entra por Laboratorio. Queda registrado quién la creó y por qué.
      </div>
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>N° de serie (uno o varios)</label>
          <ChipsInput valores={numerosSerie} onChange={setNumerosSerie} placeholder="ej. 24664 · Enter para agregar" />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Motivo <span style={{ color: 'var(--rojo)' }}>*</span></label>
          <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ej. unidad de 2021 encontrada en Cerdán, sin ensayo en el sistema" />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Modelo (descripción completa)</label>
          <input className="input" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="TTD 63/33 - Tanque Expansion - Plataforma - Aluminio" />
        </div>
        <div className="field"><label>OT</label><input className="input" value={ot} onChange={(e) => setOt(e.target.value)} placeholder="OT-1234" /></div>
        <div className="field"><label>Cliente</label><input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="vacío = Stock" /></div>
        <div className="field"><label>Potencia</label><input className="input" value={potencia} onChange={(e) => setPotencia(e.target.value)} placeholder="315 kVA" /></div>
        <div className="field"><label>Tipo</label><input className="input" value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Trifásico / Monoposte…" /></div>
        <div className="field"><label>CUT (opcional · solo EPE)</label><input className="input" value={cut} onChange={(e) => setCut(e.target.value)} placeholder="ej. 49078" /></div>
        <div className="field"><label>Línea</label>
          <select className="input" value={linea} onChange={(e) => setLinea(e.target.value as LineaProduccion)}>
            <option value="distribucion">Distribución</option>
            <option value="rural">Rural</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button className="btn" onClick={() => setAbierto(false)}>Cerrar</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={guardando} onClick={() => void crear()}>
          {guardando ? 'Ingresando…' : '＋ Ingresar sin ensayo'}
        </button>
      </div>
      {msg && <div className="meta" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  )
}
