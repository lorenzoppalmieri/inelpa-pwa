import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import type { AndonAreaId, Objetivo, Tarea } from '../../types'
import { periodoMensual } from '../../types'
import { ANDON_AREAS, calcularAndon, areasDeSectores, type FilaAndon } from '../../lib/andon'
import { guardarObjetivo } from '../../sync/syncEngine'

// ============================================================
// ANDON — tablero de cumplimiento mensual por area + premios por equipo.
// Lo ven todos (operario, encargado, planificador). El planificador configura
// las cantidades objetivo del mes (se resetean cada mes).
// ============================================================
export default function AndonView() {
  const { usuario, permisos } = useAuth()
  const periodo = periodoMensual(new Date())
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const objetivos = useLiveQuery(() => db.objetivos.where('periodo').equals(periodo).toArray(), [periodo]) ?? []

  const mapObj = useMemo(() => new Map<AndonAreaId, number>(objetivos.map((o) => [o.area, o.cantidad])), [objetivos])
  const filas = useMemo(() => {
    const todas = calcularAndon(tareas as Tarea[], mapObj, periodo)
    // El operario solo ve las tareas de sus sectores -> mostramos solo SUS areas
    // (su equipo/premio). Encargado y planificador ven la planta completa.
    if (usuario?.rol === 'operario') {
      const propias = new Set(areasDeSectores(usuario.sectores))
      return todas.filter((f) => propias.has(f.area.id))
    }
    return todas
  }, [tareas, mapObj, periodo, usuario])

  const [editar, setEditar] = useState(false)
  const mesLabel = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  // ---- Vista OPERARIO: numeros grandes + mensaje motivacional ----
  if (usuario?.rol === 'operario') {
    return (
      <div>
        <div className="section-title" style={{ textTransform: 'capitalize' }}>🏆 Mi equipo este mes · {mesLabel}</div>
        {filas.length === 0 ? (
          <div className="empty">Todavía no hay objetivo cargado para tu área. ¡Seguí sumando producción!</div>
        ) : (
          <div className="andon-hero-grid">
            {filas.map((f) => <HeroArea key={f.area.id} f={f} />)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="card-header" style={{ marginBottom: 12 }}>
        <div>
          <div className="section-title" style={{ margin: 0, textTransform: 'capitalize' }}>ANDON · {mesLabel}</div>
          <div className="meta">Objetivos del mes · premios por equipo/área (no individuales)</div>
        </div>
        {permisos?.cargarProgramacion && (
          <button className="btn" onClick={() => setEditar((v) => !v)}>{editar ? 'Cerrar' : '⚙ Configurar objetivos'}</button>
        )}
      </div>

      {editar && permisos?.cargarProgramacion && <ConfigObjetivos periodo={periodo} objetivos={objetivos} onListo={() => setEditar(false)} />}

      <div className="andon-grid">
        {filas.map((f) => (
          <div key={f.area.id} className={'andon-card ' + f.tier.clase}>
            <div className="andon-titulo">{f.area.label}</div>
            <div className="andon-num">
              <span className="andon-real">{f.terminados}</span>
              <span className="andon-obj"> / {f.objetivo || '—'}</span>
            </div>
            <div className="andon-pct">{f.objetivo > 0 ? `${Math.round(f.pct * 100)}%` : 'sin objetivo'}</div>
            <div className="andon-barra"><span style={{ width: `${Math.min(100, f.pct * 100)}%` }} /></div>
            <div className="andon-tier">{f.tier.label}</div>
            {f.retrabajos > 0 && <div className="andon-retra">⚠ {f.retrabajos} retrabajo(s)</div>}
          </div>
        ))}
      </div>

      <div className="legend" style={{ marginTop: 14 }}>
        <span><i className="andon-rojo" /> &lt;80% sin premio</span>
        <span><i className="andon-amarillo" /> ≥80%</span>
        <span><i className="andon-verde1" /> ≥100%</span>
        <span><i className="andon-verde2" /> ≥110%</span>
        <span><i className="andon-verde3" /> ≥115%</span>
        <span><i className="andon-violeta" /> ≥120%</span>
      </div>
    </div>
  )
}

// ---------- Tarjeta grande motivacional (operario) ----------
const MENSAJE: Record<string, string> = {
  violeta: '¡IMPARABLES! 🚀 Premio máximo',
  verde3: '¡Tremendo! Casi al tope 💪',
  verde2: '¡Superando el objetivo! 🔥',
  verde1: '¡Objetivo cumplido! 🎉',
  amarillo: '¡Vamos que se llega! Falta poco para el premio',
  rojo: '¡A meterle que se puede! 💥',
}
const ESCALONES = [0.8, 1.0, 1.1, 1.15, 1.2]

function HeroArea({ f }: { f: FilaAndon }) {
  const sinObjetivo = f.objetivo <= 0
  const sig = ESCALONES.find((e) => f.pct < e)
  const faltan = sig && !sinObjetivo ? Math.max(0, Math.ceil(sig * f.objetivo) - f.terminados) : 0
  return (
    <div className={'andon-hero ' + f.tier.clase}>
      <div className="andon-hero-area">{f.area.label}</div>
      <div className="andon-hero-num">
        <span className="andon-hero-real">{f.terminados}</span>
        <span className="andon-hero-obj">/ {sinObjetivo ? '—' : f.objetivo}</span>
      </div>
      <div className="andon-hero-pct">{sinObjetivo ? 'objetivo no cargado' : `${Math.round(f.pct * 100)}%`}</div>
      <div className="andon-hero-barra"><span style={{ width: `${Math.min(100, f.pct * 100)}%` }} /></div>
      <div className="andon-hero-msg">{sinObjetivo ? '¡Seguí sumando!' : MENSAJE[f.tier.id]}</div>
      {!sinObjetivo && faltan > 0 && (
        <div className="andon-hero-faltan">Faltan <strong>{faltan}</strong> para el próximo premio</div>
      )}
      {f.retrabajos > 0 && <div className="andon-retra">⚠ {f.retrabajos} retrabajo(s) este mes</div>}
    </div>
  )
}

// ---------- Config del planificador: cantidades objetivo del mes ----------
function ConfigObjetivos({ periodo, objetivos, onListo }: {
  periodo: string
  objetivos: Objetivo[]
  onListo: () => void
}) {
  const actuales = useMemo(() => new Map(objetivos.map((o) => [o.area, o.cantidad])), [objetivos])
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const a of ANDON_AREAS) v[a.id] = String(actuales.get(a.id) ?? '')
    return v
  })
  const [msg, setMsg] = useState('')

  async function guardar() {
    let n = 0
    for (const a of ANDON_AREAS) {
      const cantidad = Math.max(0, Math.round(Number(valores[a.id]) || 0))
      const o: Objetivo = { id: `${periodo}_${a.id}`, periodo, area: a.id, cantidad, actualizado: new Date().toISOString() }
      await guardarObjetivo(o)
      n++
    }
    setMsg(`Objetivos del mes guardados (${n} áreas).`)
    setTimeout(onListo, 600)
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="section-title">Objetivos de producción · {periodo}</div>
      <div className="meta" style={{ marginBottom: 10 }}>Cantidad objetivo de la empresa por área para este mes.</div>
      <div className="form-grid">
        {ANDON_AREAS.map((a) => (
          <div className="field" key={a.id}>
            <label>{a.label}</label>
            <input className="input" type="number" min={0} inputMode="numeric"
              value={valores[a.id]} onChange={(e) => setValores((v) => ({ ...v, [a.id]: e.target.value }))} placeholder="0" />
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-bloque" style={{ marginTop: 10 }} onClick={guardar}>Guardar objetivos del mes</button>
      {msg && <div className="meta" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  )
}
