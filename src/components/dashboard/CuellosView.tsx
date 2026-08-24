import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { fmtDur } from '../../lib/time'
import { areaSGOLabel } from '../../sgo/types'
import {
  oeePorEstacion, oeePorSector, agregarOEE, esperaPorArea, restriccionesInternas,
  colaPorEstacion, type Ventana,
} from '../../lib/oee'

// ============================================================
// CUELLOS DE BOTELLA Y OEE POR ESTACIÓN (v1.97)
//
// Pantalla COMPARTIDA: se monta igual en Producción y en SGO. Es un solo
// componente a propósito — si fueran dos, se desincronizarían al primer cambio.
//
// Es autocontenido: lee sus propios datos de Dexie y no recibe props. Así
// montarlo en otro lado es una línea y no arrastra estado del contenedor.
//
// TODO el cálculo vive en lib/oee.ts. Acá solo se dibuja.
// ============================================================

const PERIODOS = [
  { id: 'semana', label: 'Últimos 7 días', dias: 7 },
  { id: 'quincena', label: 'Últimos 15 días', dias: 15 },
  { id: 'mes', label: 'Últimos 30 días', dias: 30 },
] as const
type PeriodoId = typeof PERIODOS[number]['id']

const pct = (x: number) => `${Math.round(x * 100)}%`
const tono = (x: number) => (x >= 0.75 ? 'var(--estado-fin)' : x >= 0.5 ? 'var(--naranja)' : 'var(--rojo)')

export default function CuellosView() {
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), []) ?? []
  const [periodoId, setPeriodoId] = useState<PeriodoId>('semana')

  const nombreMaquina = useMemo(() => {
    const m = new Map(maquinas.map((x) => [x.id, x.nombre]))
    return (id: string) => m.get(id) ?? id
  }, [maquinas])

  const ventana: Ventana = useMemo(() => {
    const dias = PERIODOS.find((p) => p.id === periodoId)?.dias ?? 7
    const hasta = new Date()
    const desde = new Date(hasta.getTime() - dias * 86400000)
    return { desdeISO: desde.toISOString(), hastaISO: hasta.toISOString() }
  }, [periodoId])

  const estaciones = useMemo(() => oeePorEstacion(tareas, ventana), [tareas, ventana])
  const sectores = useMemo(() => oeePorSector(estaciones), [estaciones])
  const planta = useMemo(() => agregarOEE(estaciones), [estaciones])
  const esperas = useMemo(() => esperaPorArea(tareas, ventana), [tareas, ventana])
  const internas = useMemo(() => restriccionesInternas(tareas, ventana), [tareas, ventana])
  const cola = useMemo(() => colaPorEstacion(tareas), [tareas])

  // Ranking por área RESPONSABLE (suma de lo que le hizo perder a los demás).
  const ranking = useMemo(() => {
    const m = new Map<string, { area: string; minutos: number; eventos: number; a: typeof esperas }>()
    for (const e of esperas) {
      const reg = m.get(e.responsable) ?? { area: e.responsable, minutos: 0, eventos: 0, a: [] }
      reg.minutos += e.minutos; reg.eventos += e.eventos; reg.a.push(e)
      m.set(e.responsable, reg)
    }
    return [...m.values()].sort((x, y) => y.minutos - x.minutos)
  }, [esperas])

  const maxEspera = Math.max(1, ...ranking.map((r) => r.minutos))
  const maxCola = Math.max(1, ...cola.map((c) => c.minutosPendientes))

  return (
    <div className="cuellos">
      <div className="card cuellos-head">
        <div>
          <div className="section-title" style={{ margin: 0 }}>Cuellos de botella y OEE</div>
          <div className="meta">
            El OEE se calcula sobre el <strong>turno de cada estación</strong>, no sobre la duración de
            cada transformador. Solo entran las estaciones que trabajaron en el período.
          </div>
        </div>
        <select className="select" value={periodoId} onChange={(e) => setPeriodoId(e.target.value as PeriodoId)}>
          {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      {estaciones.length === 0 ? (
        <div className="empty">Sin actividad registrada en el período.</div>
      ) : (
        <>
          {/* ---------- OEE de planta ---------- */}
          <div className="tot-cards">
            <div className="tot-card destacada">
              <div className="l">OEE de planta</div>
              <div className="n" style={{ color: tono(planta.oee) }}>{pct(planta.oee)}</div>
              <div className="s">{estaciones.length} estación(es) con actividad</div>
            </div>
            <div className="tot-card"><div className="l">Disponibilidad</div><div className="n">{pct(planta.disponibilidad)}</div><div className="s">{fmtDur(planta.paradasMin)} en paradas</div></div>
            <div className="tot-card"><div className="l">Rendimiento</div><div className="n">{pct(planta.rendimiento)}</div><div className="s">{fmtDur(planta.estandarMin)} de estándar producido</div></div>
            <div className="tot-card"><div className="l">Calidad</div><div className="n">{pct(planta.calidad)}</div><div className="s">{planta.piezasOk} de {planta.piezas} piezas</div></div>
          </div>

          {/* ---------- Quién hace esperar a quién ---------- */}
          <div className="section-title" style={{ margin: '18px 0 6px' }}>Quién genera la espera</div>
          <div className="meta" style={{ marginBottom: 8 }}>
            Tiempo que cada área le hizo perder a las demás, según las paradas registradas en planta.
            Las restricciones internas de un sector no entran acá: van más abajo.
          </div>
          {ranking.length === 0 ? <div className="empty">Sin esperas imputables en el período. 👌</div> : (
            <div className="card">
              {ranking.map((r) => (
                <div className="cuello-fila" key={r.area}>
                  <div className="cuello-area">
                    <strong>{areaSGOLabel(r.area)}</strong>
                    <span className="meta"> · {r.eventos} parada(s)</span>
                    <div className="cuello-detalle meta">
                      {r.a.sort((x, y) => y.minutos - x.minutos).map((e) => (
                        <span key={e.afectada}>→ {areaSGOLabel(e.afectada)} {fmtDur(e.minutos)}</span>
                      ))}
                    </div>
                  </div>
                  <div className="cuello-barra"><div style={{ width: `${(r.minutos / maxEspera) * 100}%` }} /></div>
                  <div className="cuello-min">{fmtDur(r.minutos)}</div>
                </div>
              ))}
            </div>
          )}

          {/* ---------- Restricciones internas ---------- */}
          {internas.length > 0 && (
            <>
              <div className="section-title" style={{ margin: '18px 0 6px' }}>Restricciones internas</div>
              <div className="meta" style={{ marginBottom: 8 }}>
                Tiempo perdido dentro del propio sector. No se le imputa a nadie: son oportunidades de
                mejora que se resuelven con equipamiento o método, no reclamando a otra área.
              </div>
              <div className="card">
                {internas.map((i) => (
                  <div className="cuello-fila" key={i.motivo}>
                    <div className="cuello-area"><strong>{i.motivo}</strong><span className="meta"> · {i.eventos} vez/veces</span></div>
                    <div className="cuello-min">{fmtDur(i.minutos)}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ---------- OEE por sector ---------- */}
          <div className="section-title" style={{ margin: '18px 0 6px' }}>OEE por sector</div>
          <div className="meta" style={{ marginBottom: 8 }}>Ordenado del más bajo al más alto: arriba está el que hay que mirar.</div>
          <table className="tabla-detalle tabla-cards">
            <thead>
              <tr>
                <th>Sector</th><th className="num">Estaciones</th>
                <th className="num">Disponib.</th><th className="num">Rendim.</th><th className="num">Calidad</th><th className="num">OEE</th>
              </tr>
            </thead>
            <tbody>
              {sectores.map((s) => (
                <tr key={s.sectorId}>
                  <td data-label="Sector">{s.label}</td>
                  <td className="num" data-label="Estaciones">{s.estaciones}</td>
                  <td className="num" data-label="Disponib.">{pct(s.datos.disponibilidad)}</td>
                  <td className="num" data-label="Rendim.">{pct(s.datos.rendimiento)}</td>
                  <td className="num" data-label="Calidad">{pct(s.datos.calidad)}</td>
                  <td className="num" data-label="OEE" style={{ fontWeight: 800, color: tono(s.datos.oee) }}>{pct(s.datos.oee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ---------- Cola por estación ---------- */}
      <div className="section-title" style={{ margin: '18px 0 6px' }}>Cola por estación</div>
      <div className="meta" style={{ marginBottom: 8 }}>
        Trabajo pendiente delante de cada estación, en jornadas de 8h 45m. Muestra el cuello
        <strong> antes</strong> de que explote. No depende del período elegido.
      </div>
      {cola.length === 0 ? <div className="empty">Sin tareas pendientes.</div> : (
        <div className="card">
          {cola.slice(0, 12).map((c) => (
            <div className="cuello-fila" key={c.maquinaId}>
              <div className="cuello-area">
                <strong>{nombreMaquina(c.maquinaId)}</strong>
                <span className="meta"> · {c.tareas} tarea(s) pendiente(s)</span>
              </div>
              <div className="cuello-barra"><div style={{ width: `${(c.minutosPendientes / maxCola) * 100}%` }} /></div>
              <div className="cuello-min">{c.jornadas} jornada(s)</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
