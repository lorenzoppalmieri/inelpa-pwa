import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import { guardarAusencias, eliminarAusencia, eliminarPeriodoAusencia } from '../../sync/syncEngine'
import { diasLaborablesDelRango } from '../../lib/calendario'
import {
  MOTIVOS_AUSENCIA, motivoAusenciaLabel, idAusencia,
  type Ausencia, type MotivoAusencia,
} from '../../types'

// ============================================================
// AUSENTISMO / COLABORADORES (v2.04, rangos en v2.05)
//
// Por defecto se asume que TODOS vinieron en su horario normal. Acá se marcan
// las excepciones: quién faltó y qué días.
//
// El impacto no es administrativo, es operativo: el día marcado deja de existir
// para las tareas de esa persona. Si dejó una tarea en curso, las horas de ese
// día no suman ni a su Tiempo Real ni a sus demoras. Ver `lib/calendario.ts`.
//
// POR QUÉ UNA FILA POR DÍA Y NO UN RANGO. El motor de calendario razona día por
// día; guardar "del 12 al 26" obligaría a expandir el rango en cada cálculo de
// cada tarea. Se expande UNA vez, acá, y se guarda un día por fila agrupados por
// `periodoId`. Así una licencia se muestra y se borra entera, pero también se
// puede sacar un día suelto si la persona volvió antes.
//
// OJO: cargar una ausencia REESCRIBE los KPIs de esos días. Es lo correcto
// —todo se recalcula desde los timestamps— pero conviene saberlo antes de que
// alguien pregunte por qué cambió un número que ya había mirado.
// ============================================================

/** Día de hoy en 'YYYY-MM-DD' local (en-CA da exactamente ese formato). */
const hoyISO = () => new Date().toLocaleDateString('en-CA')

function fechaLinda(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/** Arriba de esto se pide confirmación: suele ser un año tipeado mal. */
const DIAS_AVISO = 30

interface Grupo {
  clave: string
  usuarioId: string
  motivo: MotivoAusencia
  nota?: string
  cargadaPor: string
  desde: string
  hasta: string
  dias: Ausencia[]
  periodoId?: string
}

export default function PanelAusentismo() {
  const { usuario } = useAuth()
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const ausencias = useLiveQuery(() => db.ausencias.orderBy('fecha').toArray(), []) ?? []

  const [usuarioId, setUsuarioId] = useState('')
  const [desde, setDesde] = useState(hoyISO())
  const [hasta, setHasta] = useState('')
  const [motivo, setMotivo] = useState<MotivoAusencia>('enfermedad')
  const [nota, setNota] = useState('')
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')

  const gente = useMemo(
    () => [...usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [usuarios],
  )
  const nombreDe = useMemo(() => {
    const m = new Map(usuarios.map((u) => [u.id, u.nombre]))
    return (id: string) => m.get(id) ?? id
  }, [usuarios])

  // Días hábiles que se van a marcar con lo que hay cargado en el formulario.
  // Se calcula en vivo para que se vea ANTES de apretar el botón.
  const diasAMarcar = useMemo(
    () => (desde ? diasLaborablesDelRango(desde, hasta || desde) : []),
    [desde, hasta],
  )

  // Agrupa por periodoId; las sueltas quedan como grupo de un día.
  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, Grupo>()
    for (const a of ausencias) {
      const clave = a.periodoId ?? a.id
      const g = map.get(clave)
      if (g) {
        g.dias.push(a)
        if (a.fecha < g.desde) g.desde = a.fecha
        if (a.fecha > g.hasta) g.hasta = a.fecha
      } else {
        map.set(clave, {
          clave, usuarioId: a.usuarioId, motivo: a.motivo, nota: a.nota,
          cargadaPor: a.cargadaPor, desde: a.fecha, hasta: a.fecha,
          dias: [a], periodoId: a.periodoId,
        })
      }
    }
    // Más reciente primero.
    return [...map.values()].sort((x, y) => (x.desde < y.desde ? 1 : -1))
  }, [ausencias])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? grupos.filter((g) => nombreDe(g.usuarioId).toLowerCase().includes(t)) : grupos
  }, [grupos, q, nombreDe])

  async function marcar() {
    if (!usuarioId || diasAMarcar.length === 0) return

    if (diasAMarcar.length > DIAS_AVISO) {
      const ok = window.confirm(
        `Vas a marcar ${diasAMarcar.length} días hábiles de ${nombreDe(usuarioId)}, `
        + `del ${fechaLinda(diasAMarcar[0])} al ${fechaLinda(diasAMarcar[diasAMarcar.length - 1])}.\n\n¿Confirmás?`,
      )
      if (!ok) return
    }

    const yaCargados = new Set(ausencias.map((a) => a.id))
    // Un día ya marcado no se pisa: puede tener otro motivo cargado antes.
    const nuevos = diasAMarcar.filter((f) => !yaCargados.has(idAusencia(usuarioId, f)))
    if (nuevos.length === 0) {
      setMsg(`${nombreDe(usuarioId)} ya figura ausente en todos esos días.`)
      return
    }

    const esPeriodo = nuevos.length > 1
    const periodoId = esPeriodo ? `per_${usuarioId}_${desde}_${Date.now()}` : undefined
    const ahora = new Date().toISOString()

    await guardarAusencias(nuevos.map((f) => ({
      id: idAusencia(usuarioId, f),
      usuarioId,
      fecha: f,
      motivo,
      nota: nota.trim() || undefined,
      cargadaPor: usuario?.usuario ?? 'desconocido',
      actualizado: ahora,
      periodoId,
    })))

    const salteados = diasAMarcar.length - nuevos.length
    setMsg(
      `${nombreDe(usuarioId)}: ${nuevos.length} día(s) marcado(s)`
      + (esPeriodo ? `, del ${fechaLinda(nuevos[0])} al ${fechaLinda(nuevos[nuevos.length - 1])}` : ` (${fechaLinda(nuevos[0])})`)
      + (salteados > 0 ? ` · ${salteados} ya estaban cargados` : '') + '.',
    )
    setNota('')
    setHasta('')
  }

  async function quitarGrupo(g: Grupo) {
    const quien = nombreDe(g.usuarioId)
    if (g.periodoId && g.dias.length > 1) {
      if (!window.confirm(`¿Quitar los ${g.dias.length} días de ${quien}, del ${fechaLinda(g.desde)} al ${fechaLinda(g.hasta)}?`)) return
      await eliminarPeriodoAusencia(g.periodoId)
    } else {
      if (!window.confirm(`¿Quitar la ausencia de ${quien} del ${fechaLinda(g.desde)}?`)) return
      await eliminarAusencia(g.dias[0].id)
    }
    setMsg('Ausencia quitada. Esos días vuelven a contar para sus tareas.')
  }

  async function quitarDia(a: Ausencia) {
    if (!window.confirm(`¿Quitar solo el ${fechaLinda(a.fecha)}?`)) return
    await eliminarAusencia(a.id)
    setMsg(`${fechaLinda(a.fecha)} vuelve a contar para sus tareas.`)
  }

  const hoy = hoyISO()

  return (
    <>
      <div className="card">
        <div className="section-title">Marcar una ausencia</div>
        <div className="meta" style={{ marginBottom: 12 }}>
          Por defecto se asume que todos vinieron en su horario normal. Acá se cargan
          las excepciones. Los días marcados <strong>dejan de contar</strong> para el
          tiempo real y las demoras de las tareas de esa persona — incluidas las que
          haya dejado en curso.
          <br />
          Dejá <strong>«Hasta» vacío</strong> para un solo día. Para vacaciones o una
          licencia médica, poné el rango completo: se marcan solo los días hábiles.
          <br />
          Si alguien se retiró antes de hora, eso no va acá: lo marca el operario con
          la parada «Retiro».
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Colaborador *</label>
            <select className="select" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
              <option value="">— Elegí —</option>
              {gente.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Desde *</label>
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="field">
            <label>Hasta (vacío = un solo día)</label>
            <input className="input" type="date" value={hasta} min={desde}
              onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="field">
            <label>Motivo</label>
            <select className="select" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoAusencia)}>
              {MOTIVOS_AUSENCIA.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Nota (opcional)</label>
            <input className="input" value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="ej. parte médico presentado" />
          </div>
        </div>

        {/* Se muestra ANTES de guardar: si el rango pisa un feriado o un fin de
            semana, que se vea acá y no después en el listado. */}
        {desde && (
          <div className="meta" style={{ marginBottom: 10 }}>
            {diasAMarcar.length === 0
              ? <span style={{ color: 'var(--naranja)' }}>Ese rango no tiene días hábiles (cae en fin de semana o feriado).</span>
              : <>Se van a marcar <strong>{diasAMarcar.length} día(s) hábil(es)</strong>
                {hasta && hasta !== desde && <> · del {fechaLinda(diasAMarcar[0])} al {fechaLinda(diasAMarcar[diasAMarcar.length - 1])}</>}
                {hasta && hasta !== desde && <span className="meta"> (no se cuentan sábados, domingos ni feriados)</span>}</>}
          </div>
        )}

        <button className="btn btn-primary btn-bloque" onClick={() => void marcar()}
          disabled={!usuarioId || diasAMarcar.length === 0}>
          ＋ Marcar ausencia
        </button>
        {msg && <div className="meta" style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div className="section-title">Ausencias cargadas ({grupos.length})</div>

      {grupos.length > 0 && (
        <div className="card" style={{ paddingTop: 10, paddingBottom: 10 }}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Buscar por colaborador…" />
        </div>
      )}

      {visibles.length === 0
        ? <div className="empty">{grupos.length === 0 ? 'No hay ausencias cargadas.' : 'Ningún colaborador coincide con la búsqueda.'}</div>
        : visibles.map((g) => {
            const pasado = g.hasta < hoy
            const esPeriodo = g.dias.length > 1
            return (
              <div className="card" key={g.clave} style={{ opacity: pasado ? 0.65 : 1 }}>
                <div className="card-header">
                  <div>
                    <strong>{nombreDe(g.usuarioId)}</strong>
                    <div className="sub meta">
                      {esPeriodo
                        ? `${fechaLinda(g.desde)} al ${fechaLinda(g.hasta)} · ${g.dias.length} días hábiles`
                        : fechaLinda(g.desde)}
                      {' · '}{motivoAusenciaLabel(g.motivo)}
                      {g.nota ? ` · “${g.nota}”` : ''}
                    </div>
                    <div className="sub meta">Cargada por {g.cargadaPor}</div>
                  </div>
                  <button className="btn btn-rojo" onClick={() => void quitarGrupo(g)}>
                    {esPeriodo ? 'Quitar período' : 'Quitar'}
                  </button>
                </div>

                {/* Días sueltos del período: sirve para el caso "volvió antes". */}
                {esPeriodo && (
                  <details style={{ marginTop: 8 }}>
                    <summary className="meta" style={{ cursor: 'pointer' }}>Ver los días uno por uno</summary>
                    <div className="nc-causas" style={{ marginTop: 6 }}>
                      {g.dias.map((a) => (
                        <div key={a.id} className="nc-causa">
                          <span className="nc-lbl">{fechaLinda(a.fecha)}</span>
                          <span className="nc-acciones">
                            <button className="nc-link" onClick={() => void quitarDia(a)}>✕ quitar este día</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )
          })}
    </>
  )
}
