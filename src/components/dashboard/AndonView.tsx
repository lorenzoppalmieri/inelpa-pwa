import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import type { AndonAreaId, Objetivo, Tarea } from '../../types'
import { periodoMensual } from '../../types'
import { ANDON_AREAS, calcularAndon, type AndonAreaDef } from '../../lib/andon'
import { etiquetaVentana, type VentanaCierre } from '../../lib/cierreObjetivos'
import { isoWeek } from '../../lib/time'
import CierreArea from './CierreArea'
import { guardarObjetivo } from '../../sync/syncEngine'

// ============================================================
// ANDON — tablero de cumplimiento mensual por area + premios por equipo.
//
// v2.23: pasa a ser tambien la herramienta de CIERRE de la semana y del mes.
//  - las tarjetas se clickean y entran al detalle por colaborador (CierreArea);
//  - un selector arriba elige que semana o que mes se esta mirando;
//  - NO la ven los operarios. Antes era su tablero de premios; se les saco por
//    decision de Lorenzo (16/9/2026) porque ahora muestra cumplimiento
//    individual de cada colaborador. La barrera esta en tres lugares: la
//    pestaña de DashboardView, la pestaña de OperarioView, y el guard de abajo
//    —que es el que importa, porque es el unico que no se puede saltear
//    entrando por otro lado.
// ============================================================
export default function AndonView() {
  const { usuario, permisos } = useAuth()
  const periodo = periodoMensual(new Date())

  // Ventana de cierre: por defecto la semana en curso, que es la foto del lunes.
  const [ventana, setVentana] = useState<VentanaCierre>(() => ({ tipo: 'semana', semana: isoWeek(new Date()) }))
  const [areaAbierta, setAreaAbierta] = useState<AndonAreaDef | null>(null)
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const objetivos = useLiveQuery(() => db.objetivos.where('periodo').equals(periodo).toArray(), [periodo]) ?? []

  const mapObj = useMemo(() => new Map<AndonAreaId, number>(objetivos.map((o) => [o.area, o.cantidad])), [objetivos])
  // v2.23: se saco el filtrado por sectores propios del operario. Ya no hay
  // vista de operario acá (ver el guard de abajo), así que quien entra ve
  // siempre la planta completa.
  const filas = useMemo(
    () => calcularAndon(tareas as Tarea[], mapObj, periodo),
    [tareas, mapObj, periodo],
  )

  const [editar, setEditar] = useState(false)
  const mesLabel = new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  // ---- GUARD DE PRIVACIDAD (v2.23) ----
  // Este tablero ahora muestra el cumplimiento individual de cada colaborador.
  // `verDashboard` es false para el rol operario y true para encargado,
  // planificador y direccion. Se chequea ACA y no solo en la pestaña: es el
  // unico punto que no se puede saltear si alguien llega por otro camino.
  if (!permisos?.verDashboard) {
    return <div className="empty">Esta sección es de planificación y no está disponible para tu usuario.</div>
  }

  // ---- Detalle de un area (drill-down) ----
  if (areaAbierta) {
    return <CierreArea area={areaAbierta} ventana={ventana} onVolver={() => setAreaAbierta(null)} />
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

      {/* v2.23: qué "foto" se está mirando. La semana es para el control de los
          lunes; el mes, para el cierre. El selector solo afecta al DETALLE por
          colaborador — las tarjetas de abajo siguen siendo del mes en curso,
          porque el premio por equipo es mensual y no cambia de regla. */}
      <SelectorVentana ventana={ventana} onCambio={setVentana} />

      <div className="andon-grid">
        {filas.map((f) => (
          <div key={f.area.id} className={'andon-card clickable ' + f.tier.clase}
            role="button" tabIndex={0}
            title={`Ver el detalle por colaborador · ${etiquetaVentana(ventana)}`}
            onClick={() => setAreaAbierta(f.area)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAreaAbierta(f.area) }}>
            <div className="andon-titulo">{f.area.label}</div>
            <div className="andon-num">
              <span className="andon-real">{f.terminados}</span>
              <span className="andon-obj"> / {f.objetivo || '—'}</span>
            </div>
            <div className="andon-pct">{f.objetivo > 0 ? `${Math.round(f.pct * 100)}%` : 'sin objetivo'}</div>
            <div className="andon-barra"><span style={{ width: `${Math.min(100, f.pct * 100)}%` }} /></div>
            <div className="andon-tier">{f.tier.label}</div>
            {f.retrabajos > 0 && <div className="andon-retra">⚠ {f.retrabajos} retrabajo(s)</div>}
            <div className="andon-vermas">Ver por colaborador →</div>
          </div>
        ))}
      </div>

      <div className="legend" style={{ marginTop: 14 }}>
        <span><i className="andon-rojo" /> &lt;80% · sin premio</span>
        <span><i className="andon-verde1" /> 81–90% · premio parcial</span>
        <span><i className="andon-verde3" /> 91–99% · premio parcial</span>
        <span><i className="andon-violeta" /> 100% · premio completo</span>
      </div>
    </div>
  )
}

// ---------- Selector de la ventana de cierre (v2.23) ----------
// Semana para el control de los lunes; mes para el cierre mensual. Se ofrecen
// las últimas 8 semanas y los últimos 6 meses: más atrás el dato ya es
// aproximado (ver FECHA_CORTE_OBJETIVOS) y no tiene sentido invitar a mirarlo.
function SelectorVentana({ ventana, onCambio }: {
  ventana: VentanaCierre
  onCambio: (v: VentanaCierre) => void
}) {
  const semanas = useMemo(() => {
    const out: string[] = []
    const d = new Date()
    for (let i = 0; i < 8; i++) { out.push(isoWeek(d)); d.setDate(d.getDate() - 7) }
    return out
  }, [])
  const meses = useMemo(() => {
    const out: { anio: number; mes: number; label: string }[] = []
    const d = new Date()
    for (let i = 0; i < 6; i++) {
      out.push({
        anio: d.getFullYear(), mes: d.getMonth(),
        label: d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
      })
      d.setMonth(d.getMonth() - 1)
    }
    return out
  }, [])

  return (
    <div className="filtros" style={{ marginBottom: 12 }}>
      <select className="select" value={ventana.tipo}
        onChange={(e) => onCambio(e.target.value === 'semana'
          ? { tipo: 'semana', semana: semanas[0] }
          : { tipo: 'mes', anio: meses[0].anio, mes: meses[0].mes })}>
        <option value="semana">Por semana</option>
        <option value="mes">Por mes</option>
      </select>

      {ventana.tipo === 'semana' ? (
        <select className="select" value={ventana.semana}
          onChange={(e) => onCambio({ tipo: 'semana', semana: e.target.value })}>
          {semanas.map((s) => (
            <option key={s} value={s}>{etiquetaVentana({ tipo: 'semana', semana: s })}</option>
          ))}
        </select>
      ) : (
        <select className="select" value={`${ventana.anio}-${ventana.mes}`}
          onChange={(e) => {
            const [a, m] = e.target.value.split('-').map(Number)
            onCambio({ tipo: 'mes', anio: a, mes: m })
          }}>
          {meses.map((m) => (
            <option key={`${m.anio}-${m.mes}`} value={`${m.anio}-${m.mes}`} style={{ textTransform: 'capitalize' }}>
              {m.label}
            </option>
          ))}
        </select>
      )}

      <span className="meta" style={{ flex: 1 }}>
        Entrá a un área para ver el detalle por colaborador de {etiquetaVentana(ventana).toLowerCase()}.
      </span>
    </div>
  )
}

// v2.23: se retiró `HeroArea`, la tarjeta grande motivacional que veía el
// operario ("¡IMPARABLES! 🚀", "Faltan N para el próximo premio"). El Andon dejó
// de ser accesible para ellos, así que ese componente quedaba muerto.
// Si algún día se quiere devolver un tablero de premios a la planta, el CSS
// (.andon-hero*) sigue en index.css y esto se recupera del historial de git.

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
