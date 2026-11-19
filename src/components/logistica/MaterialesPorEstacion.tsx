import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { SECTORES, sectorById, nombreSemielaborado, RESPONSABLES_LOGISTICA, type SectorId } from '../../types'
import { descripcionSemiTarea } from '../../data/catalogo'
import { formatoCantidad, recetaPorArticulo } from '../../lib/materiales'
import {
  deshacerPaso, marcarEnPreparacion, marcarEntregado, tableroEntregas, type ItemEntrega, type Urgencia,
} from '../../lib/preparacionMaterial'
import { programar } from '../../lib/programacion'
import { minutosLaboralesLogistica } from '../../lib/calendario'
import { fechaCorta, fmtDur, hhmm } from '../../lib/time'
import { eliminarPreparacionMaterial, guardarPreparacionMaterial } from '../../sync/syncEngine'
import { useAuth } from '../../auth/AuthContext'

// ============================================================
// v2.58 — TABLERO DE ENTREGA DE MATERIALES (Logística).
//
// Antes (v2.57) era una lista de solo lectura con TODO lo que había que
// preparar. Ahora es un tablero de trabajo:
//
//   Por preparar  --[▶ Preparar]-->  En preparación  --[✓ Entregado]-->  (sale)
//
// Orden estratégico: urgente (el operario ya arrancó, o el arranque previsto
// pasó) > hoy > lo que viene, por hora prevista de arranque según la cascada
// del Gantt. El horizonte esconde lo lejano para que el pañol no se tape de
// trabajo que no corre. Las entregadas de hoy quedan plegadas abajo para
// revisar o deshacer. La lógica vive en lib/preparacionMaterial (testeada).
//
// Es el registro OPERATIVO de la entrega física: el movimiento de stock sigue
// siendo la transferencia de SAP sobre la OF.
// ============================================================

const HORIZONTES: { id: string; label: string; dias: number | null }[] = [
  { id: 'hoy', label: 'Hoy', dias: 0 },
  { id: 'manana', label: 'Hoy y mañana', dias: 1 },
  { id: '3d', label: 'Próximos 3 días', dias: 3 },
  { id: 'semana', label: 'Próxima semana', dias: 7 },
  { id: 'todo', label: 'Todo', dias: null },
]

const URGENCIA: Record<Urgencia, { txt: string; clase: string }> = {
  urgente: { txt: 'Urgente', clase: 'prep-chip urgente' },
  hoy: { txt: 'Hoy', clase: 'prep-chip hoy' },
  proxima: { txt: '', clase: 'prep-chip proxima' },
}

export default function MaterialesPorEstacion() {
  const { usuario } = useAuth()
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), []) ?? []
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const ordenes = useLiveQuery(() => db.ordenes.toArray(), []) ?? []
  const lineas = useLiveQuery(() => db.materialesReceta.toArray(), []) ?? []
  const preparaciones = useLiveQuery(() => db.preparacionesMaterial.toArray(), []) ?? []

  const [sector, setSector] = useState<'todos' | SectorId>('todos')
  const [horizonte, setHorizonte] = useState('manana')
  const [responsable, setResponsable] = useState('')
  const [guardando, setGuardando] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  // Reloj de minuto: la urgencia y el "hace X min" se actualizan solos.
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setAhoraMs(Date.now()), 60000); return () => clearInterval(id) }, [])
  const ahora = useMemo(() => new Date(ahoraMs), [ahoraMs])

  // Escriben logística y planificación (misma regla que la base, RLS v2.58).
  const puedeOperar = usuario?.rol === 'logistica' || usuario?.rol === 'planificador'

  const nombreMaquina = useMemo(() => { const m = new Map(maquinas.map((x) => [x.id, x.nombre])); return (id: string) => m.get(id) ?? id }, [maquinas])
  const nombreOperario = useMemo(() => { const m = new Map(usuarios.map((x) => [x.id, x.nombre])); return (id: string) => m.get(id) ?? id }, [usuarios])
  const nroOrden = useMemo(() => new Map(ordenes.map((o) => [o.id, o.nroOrden])), [ordenes])
  const recetas = useMemo(() => recetaPorArticulo(lineas), [lineas])

  // Arranque previsto: la MISMA cascada que dibuja el Gantt.
  const planes = useMemo(
    () => programar(tareas, new Date(ahoraMs).toISOString(), undefined, { nombreOperario }),
    [tareas, ahoraMs, nombreOperario],
  )
  const dias = HORIZONTES.find((h) => h.id === horizonte)?.dias ?? null
  const tablero = useMemo(
    () => tableroEntregas(tareas, preparaciones, recetas, planes, ahora, { sectorId: sector === 'todos' ? undefined : sector, horizonteDias: dias }),
    [tareas, preparaciones, recetas, planes, ahora, sector, dias],
  )
  const urgentes = tablero.porPreparar.filter((i) => i.urgencia === 'urgente').length
    + tablero.enPreparacion.filter((i) => i.urgencia === 'urgente').length
  const sinNombre = useMemo(() => new Set(lineas.filter((l) => !l.childName).map((l) => l.childCode)).size, [lineas])

  async function preparar(i: ItemEntrega) {
    setGuardando(i.tarea.id); setMsg('')
    await guardarPreparacionMaterial(marcarEnPreparacion(i.tarea, i.prep, responsable || usuario?.nombre, usuario?.nombre, new Date().toISOString()))
    setGuardando(null)
  }
  async function entregar(i: ItemEntrega) {
    setGuardando(i.tarea.id); setMsg('')
    await guardarPreparacionMaterial(marcarEntregado(i.tarea, i.prep, responsable || undefined, usuario?.nombre, new Date().toISOString()))
    setGuardando(null)
    setMsg(`✓ Entregado en ${nombreMaquina(i.tarea.maquinaId)}.`)
  }
  async function deshacer(i: ItemEntrega) {
    if (!i.prep) return
    setGuardando(i.tarea.id); setMsg('')
    const atras = deshacerPaso(i.prep, new Date().toISOString())
    if (atras) await guardarPreparacionMaterial(atras)
    else await eliminarPreparacionMaterial(i.prep.id)
    setGuardando(null)
  }

  const comunes = {
    ahora, puedeOperar, guardando, nombreMaquina, nombreOperario, nroOrden,
    onPreparar: preparar, onEntregar: entregar, onDeshacer: deshacer,
  }

  return (
    <div>
      <div className="logi-kpis">
        <div className={'logi-kpi' + (urgentes > 0 ? ' prio-alta' : '')}><div className="n">{urgentes}</div><div className="l">Urgentes</div></div>
        <div className="logi-kpi prio-media"><div className="n">{tablero.porPreparar.length}</div><div className="l">Por preparar</div></div>
        <div className="logi-kpi prio-baja"><div className="n">{tablero.enPreparacion.length}</div><div className="l">En preparación</div></div>
        <div className="logi-kpi"><div className="n">{tablero.entregadasHoy.length}</div><div className="l">Entregadas hoy</div></div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <select className="input" value={horizonte} onChange={(e) => setHorizonte(e.target.value)} style={{ maxWidth: 200 }} title="Hasta cuándo mirar">
          {HORIZONTES.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>
        <select className="input" value={sector} onChange={(e) => setSector(e.target.value as 'todos' | SectorId)} style={{ maxWidth: 260 }}>
          <option value="todos">Todos los sectores</option>
          {SECTORES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        {puedeOperar && (
          <select className="input" value={responsable} onChange={(e) => setResponsable(e.target.value)} style={{ maxWidth: 220 }} title="Quién prepara">
            <option value="">Prepara: {usuario?.nombre ?? 'yo'}</option>
            {RESPONSABLES_LOGISTICA.map((r) => <option key={r} value={r}>Prepara: {r}</option>)}
          </select>
        )}
      </div>

      <div className="meta" style={{ marginBottom: 12 }}>
        Receta de SAP × cantidad de cada tarea, ordenado por urgencia y arranque previsto (Gantt). El movimiento de stock sigue siendo la transferencia de SAP.
        {sinNombre > 0 && <> · {sinNombre} material(es) se ven con el código porque SAP todavía no mandó ese artículo.</>}
        {!puedeOperar && <> · Solo lectura para tu usuario.</>}
      </div>
      {msg && <div className="meta" style={{ marginBottom: 10, color: 'var(--estado-fin)' }}>{msg}</div>}

      <div className="prep-tablero">
        <section>
          <div className="section-title">Por preparar ({tablero.porPreparar.length})</div>
          {tablero.porPreparar.length === 0 && <div className="empty">Nada por preparar en este horizonte.</div>}
          {tablero.porPreparar.map((i) => <TarjetaEntrega key={i.tarea.id} i={i} {...comunes} />)}
          {tablero.fueraDeHorizonte > 0 && (
            <div className="meta" style={{ marginTop: 6 }}>
              {tablero.fueraDeHorizonte} más para después.{' '}
              <button type="button" className="btn-link" onClick={() => setHorizonte('todo')}>Ver todo</button>
            </div>
          )}
        </section>
        <section>
          <div className="section-title">En preparación ({tablero.enPreparacion.length})</div>
          {tablero.enPreparacion.length === 0 && <div className="empty">No hay entregas en preparación.</div>}
          {tablero.enPreparacion.map((i) => <TarjetaEntrega key={i.tarea.id} i={i} {...comunes} />)}
        </section>
      </div>

      {tablero.entregadasHoy.length > 0 && (
        <details className="materiales-tarea" style={{ marginTop: 16 }}>
          <summary>✓ Entregadas hoy ({tablero.entregadasHoy.length})</summary>
          <table className="tabla-detalle">
            <thead><tr><th>Hora</th><th>Estación</th><th>Qué</th><th>Responsable</th><th className="num">Preparación</th><th></th></tr></thead>
            <tbody>
              {tablero.entregadasHoy.map((i) => (
                <tr key={i.tarea.id}>
                  <td>{hhmm(i.prep?.entregadoEn)}</td>
                  <td>{nombreMaquina(i.tarea.maquinaId)}</td>
                  <td style={{ whiteSpace: 'normal' }}>
                    {i.tarea.ordenId && nroOrden.get(i.tarea.ordenId) ? `OF ${nroOrden.get(i.tarea.ordenId)} · ` : ''}
                    {nombreSemielaborado(i.tarea, descripcionSemiTarea(i.tarea))} · {formatoCantidad(i.prep?.unidadesEntregadas ?? i.unidades)} u.
                  </td>
                  <td>{i.prep?.responsable ?? '—'}</td>
                  <td className="num">{fmtDur(minutosLaboralesLogistica(i.prep?.preparandoEn, i.prep?.entregadoEn))}</td>
                  <td>{puedeOperar && <button className="btn" disabled={guardando === i.tarea.id} onClick={() => void deshacer(i)} title="Volver a En preparación">↩</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}

/** "hoy 15:00" · "vie. 20/11 07:00" */
function cuando(iso: string | undefined, ahora: Date): string {
  if (!iso) return 'sin fecha'
  const d = new Date(iso)
  const mismoDia = d.toLocaleDateString('en-CA') === ahora.toLocaleDateString('en-CA')
  return mismoDia ? `hoy ${hhmm(iso)}` : `${d.toLocaleDateString('es-AR', { weekday: 'short' })} ${fechaCorta(iso)} ${hhmm(iso)}`
}

// Fuera del componente padre A PROPÓSITO: si se definiera adentro, React la
// trataría como un componente nuevo en cada render (cada minuto, cada cambio
// en vivo) y el desplegable de materiales se cerraría solo.
function TarjetaEntrega({ i, ahora, puedeOperar, guardando, nombreMaquina, nombreOperario, nroOrden, onPreparar, onEntregar, onDeshacer }: {
  i: ItemEntrega
  ahora: Date
  puedeOperar: boolean
  guardando: string | null
  nombreMaquina: (id: string) => string
  nombreOperario: (id: string) => string
  nroOrden: Map<string, string>
  onPreparar: (i: ItemEntrega) => Promise<void>
  onEntregar: (i: ItemEntrega) => Promise<void>
  onDeshacer: (i: ItemEntrega) => Promise<void>
}) {
  const t = i.tarea
  const u = URGENCIA[i.urgencia]
  const ocupado = guardando === t.id
  const enCurso = t.estado === 'en_proceso' || t.estado === 'pausada'
  return (
    <div className={'prep-card' + (i.urgencia === 'urgente' ? ' es-urgente' : '')}>
      <div className="prep-card-top">
        <span className={u.clase}>{u.txt || cuando(i.inicioISO, ahora)}</span>
        <strong>{nombreMaquina(t.maquinaId)}</strong>
        <span className="meta">{sectorById(t.sectorId).nombre}</span>
      </div>
      <div className="prep-card-titulo">
        {t.ordenId && nroOrden.get(t.ordenId) ? <>OF {nroOrden.get(t.ordenId)} · </> : null}
        {nombreSemielaborado(t, descripcionSemiTarea(t))}
      </div>
      <div className="meta">
        <strong>{formatoCantidad(i.unidades)} u.</strong>
        {i.complemento && <span className="prep-chip complemento" style={{ marginLeft: 6 }}>Complemento</span>}
        {' · '}
        {enCurso
          ? <>En curso{t.operarioId ? ` · ${nombreOperario(t.operarioId)}` : ''}{t.estado === 'pausada' ? ' (pausada)' : ''}</>
          : <>Arranque previsto {cuando(i.inicioISO, ahora)}</>}
      </div>
      {i.etapa === 'en_preparacion' && i.prep?.preparandoEn && (
        <div className="meta" style={{ marginTop: 4 }}>
          🚚 Preparando{i.prep.responsable ? `: ${i.prep.responsable}` : ''} · hace {fmtDur(minutosLaboralesLogistica(i.prep.preparandoEn, ahora.toISOString()))}
        </div>
      )}
      <details className="materiales-tarea" open={i.urgencia === 'urgente' || undefined}>
        <summary>📦 {i.materiales.length} material(es)</summary>
        <table className="tabla-detalle">
          <tbody>
            {i.materiales.map((m) => (
              <tr key={`${m.codigo}|${m.unidad}`}>
                <td style={{ whiteSpace: 'normal' }}>
                  {m.nombre}{m.esSemielaborado && <span className="meta"> · semielaborado</span>}
                </td>
                <td className="num">{formatoCantidad(m.cantidad)} {m.unidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {puedeOperar && (
        <div className="prep-acciones">
          {i.etapa === 'por_preparar' && (
            <button className="btn btn-primary" disabled={ocupado} onClick={() => void onPreparar(i)}>▶ Preparar</button>
          )}
          {i.etapa === 'en_preparacion' && (
            <>
              <button className="btn btn-primary prep-btn-ok" disabled={ocupado} onClick={() => void onEntregar(i)}>✓ Entregado</button>
              <button className="btn" disabled={ocupado} onClick={() => void onDeshacer(i)} title="Volver a Por preparar">↩</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

