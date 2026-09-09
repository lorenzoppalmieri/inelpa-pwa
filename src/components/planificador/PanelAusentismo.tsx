import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import { guardarAusencia, eliminarAusencia } from '../../sync/syncEngine'
import {
  MOTIVOS_AUSENCIA, motivoAusenciaLabel, idAusencia,
  type Ausencia, type MotivoAusencia,
} from '../../types'

// ============================================================
// AUSENTISMO / COLABORADORES (v2.04)
//
// Por defecto se asume que TODOS vinieron en su horario normal. Acá se marcan
// las excepciones: quién faltó y qué día.
//
// El impacto no es administrativo, es operativo: el día marcado deja de existir
// para las tareas de esa persona. Si dejó una tarea en curso, las horas de ese
// día no suman ni a su Tiempo Real ni a sus demoras. Ver `lib/calendario.ts`.
//
// OJO: cargar una ausencia REESCRIBE los KPIs de ese día. Es lo correcto —todo
// se recalcula desde los timestamps— pero conviene saberlo antes de que alguien
// pregunte por qué cambió un número que ya había mirado.
// ============================================================

/** Día de hoy en formato 'YYYY-MM-DD' local (no UTC: en-CA da ese formato). */
const hoyISO = () => new Date().toLocaleDateString('en-CA')

function fechaLinda(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export default function PanelAusentismo() {
  const { usuario } = useAuth()
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const ausencias = useLiveQuery(() => db.ausencias.orderBy('fecha').reverse().toArray(), []) ?? []

  const [usuarioId, setUsuarioId] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [motivo, setMotivo] = useState<MotivoAusencia>('enfermedad')
  const [nota, setNota] = useState('')
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')

  // Colaboradores ordenados por nombre. Se listan todos: una ausencia puede
  // cargarse para cualquiera, no solo para los de producción.
  const gente = useMemo(
    () => [...usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [usuarios],
  )
  const nombreDe = useMemo(() => {
    const m = new Map(usuarios.map((u) => [u.id, u.nombre]))
    return (id: string) => m.get(id) ?? id
  }, [usuarios])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? ausencias.filter((a) => nombreDe(a.usuarioId).toLowerCase().includes(t)) : ausencias
  }, [ausencias, q, nombreDe])

  async function marcar() {
    if (!usuarioId || !fecha) return
    const id = idAusencia(usuarioId, fecha)
    if (ausencias.some((a) => a.id === id)) {
      setMsg(`${nombreDe(usuarioId)} ya figura ausente el ${fechaLinda(fecha)}.`)
      return
    }
    const a: Ausencia = {
      id,
      usuarioId,
      fecha,
      motivo,
      nota: nota.trim() || undefined,
      cargadaPor: usuario?.usuario ?? 'desconocido',
      actualizado: new Date().toISOString(),
    }
    await guardarAusencia(a)
    setMsg(`${nombreDe(usuarioId)} marcado ausente el ${fechaLinda(fecha)}.`)
    setNota('')
  }

  async function quitar(a: Ausencia) {
    if (!window.confirm(`¿Quitar la ausencia de ${nombreDe(a.usuarioId)} del ${fechaLinda(a.fecha)}?`)) return
    await eliminarAusencia(a.id)
    setMsg(`Ausencia quitada. Ese día vuelve a contar para sus tareas.`)
  }

  const hoy = hoyISO()

  return (
    <>
      <div className="card">
        <div className="section-title">Marcar una ausencia</div>
        <div className="meta" style={{ marginBottom: 12 }}>
          Por defecto se asume que todos vinieron en su horario normal. Acá se cargan
          las excepciones. El día marcado <strong>deja de contar</strong> para el
          tiempo real y las demoras de las tareas de esa persona — incluidas las que
          haya dejado en curso.
          <br />
          Es para el <strong>día completo</strong>. Si alguien se retiró antes,
          eso lo marca el operario con la parada «Retiro».
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
            <label>Día *</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
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
              placeholder="ej. certificado presentado" />
          </div>
        </div>

        <button className="btn btn-primary btn-bloque" onClick={() => void marcar()} disabled={!usuarioId || !fecha}>
          ＋ Marcar ausencia
        </button>
        {msg && <div className="meta" style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      <div className="section-title">Ausencias cargadas ({ausencias.length})</div>

      {ausencias.length > 0 && (
        <div className="card" style={{ paddingTop: 10, paddingBottom: 10 }}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 Buscar por colaborador…" />
        </div>
      )}

      {visibles.length === 0
        ? <div className="empty">{ausencias.length === 0 ? 'No hay ausencias cargadas.' : 'Ningún colaborador coincide con la búsqueda.'}</div>
        : visibles.map((a) => {
            const pasado = a.fecha < hoy
            return (
              <div className="card" key={a.id} style={{ opacity: pasado ? 0.65 : 1 }}>
                <div className="card-header">
                  <div>
                    <strong>{nombreDe(a.usuarioId)}</strong>
                    <div className="sub meta">
                      {fechaLinda(a.fecha)} · {motivoAusenciaLabel(a.motivo)}
                      {a.nota ? ` · “${a.nota}”` : ''}
                    </div>
                    <div className="sub meta">Cargada por {a.cargadaPor}</div>
                  </div>
                  <button className="btn btn-rojo" onClick={() => void quitar(a)}>Quitar</button>
                </div>
              </div>
            )
          })}
    </>
  )
}
