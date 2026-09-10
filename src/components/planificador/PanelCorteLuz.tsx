import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import { guardarCorteLuz, eliminarCorteLuz } from '../../sync/syncEngine'
import { resumenDeCorte } from '../../lib/cortesLuz'
import { fmtDur, fechaCorta, hhmm } from '../../lib/time'
import { SECTORES, sectorById, type CorteLuz, type SectorId } from '../../types'

// ============================================================
// CORTES DE LUZ (v2.12)
//
// Las tablets están enchufadas a 220 V: cuando se corta la luz se apagan, justo
// cuando el operario tendría que registrar la parada. La demora existe pero
// nadie puede cargarla, y después le aparece como "demora sin justificar" a
// alguien que no hizo nada malo.
//
// Acá el planificador carga el corte CUANDO VUELVE LA LUZ. El sistema le suma
// esa parada a toda tarea cuyo trabajo lo haya cruzado, y aparece sola en el
// Gantt y en la tarjeta del operario.
//
// La parada NO se escribe dentro de cada tarea: se deriva del corte cada vez
// que se calcula (ver `lib/cortesLuz.ts`). Por eso corregir la hora o borrar un
// corte cargado mal recalcula todo al instante, sin tocar ninguna tarea.
// ============================================================

const hoyISO = () => new Date().toLocaleDateString('en-CA')
const ahoraHHMM = () => new Date().toTimeString().slice(0, 5)

/** 'YYYY-MM-DD' + 'HH:MM' locales -> ISO. */
function aISO(fecha: string, hora: string): string {
  return new Date(`${fecha}T${hora}:00`).toISOString()
}

export default function PanelCorteLuz() {
  const { usuario } = useAuth()
  const cortes = useLiveQuery(() => db.cortesLuz.orderBy('desde').reverse().toArray(), []) ?? []
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []

  const [fecha, setFecha] = useState(hoyISO())
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState(ahoraHHMM())
  const [sectores, setSectores] = useState<SectorId[]>([])   // vacío = toda la planta
  const [nota, setNota] = useState('')
  const [msg, setMsg] = useState('')

  const toda = sectores.length === 0

  function alternarSector(s: SectorId) {
    setSectores((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  // Vista previa ANTES de guardar: a cuántas tareas va a pegarle. Cargar un
  // corte que toca 20 tareas sin saberlo de antemano es incómodo.
  const previa = useMemo(() => {
    if (!fecha || !desde || !hasta) return null
    const c: CorteLuz = {
      id: 'previa', desde: aISO(fecha, desde), hasta: aISO(fecha, hasta),
      sectores, cargadoPor: '', actualizado: '',
    }
    if (new Date(c.hasta) <= new Date(c.desde)) return null
    return resumenDeCorte(c, tareas)
  }, [fecha, desde, hasta, sectores, tareas])

  async function registrar() {
    if (!fecha || !desde || !hasta) return
    const dISO = aISO(fecha, desde)
    const hISO = aISO(fecha, hasta)
    if (new Date(hISO) <= new Date(dISO)) {
      setMsg('La hora de vuelta tiene que ser posterior a la del corte.')
      return
    }
    const c: CorteLuz = {
      id: crypto.randomUUID(),
      desde: dISO,
      hasta: hISO,
      sectores,
      nota: nota.trim() || undefined,
      cargadoPor: usuario?.usuario ?? 'desconocido',
      actualizado: new Date().toISOString(),
    }
    await guardarCorteLuz(c)
    const r = resumenDeCorte(c, tareas)
    setMsg(`Corte registrado: ${fmtDur(r.minutosCorte)} de planta parada · ${r.tareasAfectadas} tarea(s) afectada(s).`)
    setNota(''); setDesde('')
  }

  async function quitar(c: CorteLuz) {
    if (!window.confirm(
      `¿Quitar el corte del ${fechaCorta(c.desde)} ${hhmm(c.desde)}–${hhmm(c.hasta)}?\n\n`
      + 'Las paradas que generó desaparecen y los tiempos vuelven a lo que eran.',
    )) return
    await eliminarCorteLuz(c.id)
    setMsg('Corte quitado. Los tiempos de esas tareas se recalcularon.')
  }

  // Informe: lo que se comunica al final del día.
  const resumenes = useMemo(
    () => cortes.map((c) => resumenDeCorte(c, tareas)),
    [cortes, tareas],
  )
  const hoy = hoyISO()
  const deHoy = resumenes.filter((r) => new Date(r.corte.desde).toLocaleDateString('en-CA') === hoy)
  const totalHoy = deHoy.reduce((a, r) => a + r.minutosCorte, 0)
  const perdidoHoy = deHoy.reduce((a, r) => a + r.minutosProductivosPerdidos, 0)

  return (
    <>
      <div className="card">
        <div className="section-title">Registrar un corte de luz</div>
        <div className="meta" style={{ marginBottom: 12 }}>
          Cuando vuelve la luz, cargá acá el rango. El sistema le suma la parada a
          <strong> todas las tareas que estaban trabajando</strong> en los sectores
          afectados, así el tiempo no le queda como demora sin justificar a nadie.
          <br />
          Aparece sola en el Gantt y en la tarjeta del operario.
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Día *</label>
            <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="field">
            <label>Se cortó a las *</label>
            <input className="input" type="time" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="field">
            <label>Volvió a las *</label>
            <input className="input" type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="field">
            <label>Nota (opcional)</label>
            <input className="input" value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="ej. bajó una fase / corte programado de la EPE" />
          </div>
        </div>

        <div className="field" style={{ marginTop: 4 }}>
          <label>Sectores afectados</label>
          <div className="meta" style={{ marginBottom: 6 }}>
            Sin marcar ninguno = <strong>toda la planta</strong>. Marcá solo si el corte
            fue parcial.
          </div>
          <div className="chips">
            <button
              className={'chip' + (toda ? ' on' : '')}
              onClick={() => setSectores([])}
            >
              Toda la planta
            </button>
            {SECTORES.map((s) => (
              <button
                key={s.id}
                className={'chip' + (sectores.includes(s.id) ? ' on' : '')}
                onClick={() => alternarSector(s.id)}
              >
                {s.nombre}
              </button>
            ))}
          </div>
        </div>

        {/* Vista previa: cuántas tareas va a tocar, ANTES de guardar. */}
        {previa && (
          <div className="meta" style={{ marginTop: 10 }}>
            Va a registrar <strong>{fmtDur(previa.minutosCorte)}</strong> de planta parada
            {previa.tareasAfectadas > 0
              ? <> y afectar <strong>{previa.tareasAfectadas} tarea(s)</strong>, con {fmtDur(previa.minutosProductivosPerdidos)} de producción perdida en total.</>
              : <>. <span style={{ color: 'var(--naranja)' }}>Ninguna tarea estaba trabajando en ese rango: no va a cambiar ningún tiempo.</span></>}
          </div>
        )}

        <button className="btn btn-primary btn-bloque" onClick={() => void registrar()}
          disabled={!fecha || !desde || !hasta}>
          ⚡ Registrar corte
        </button>
        {msg && <div className="meta" style={{ marginTop: 10 }}>{msg}</div>}
      </div>

      {/* ---------- Informe del día ---------- */}
      {deHoy.length > 0 && (
        <div className="card" style={{ borderLeft: '5px solid var(--naranja)' }}>
          <div className="section-title" style={{ marginTop: 0 }}>Informe de hoy</div>
          <div style={{ fontSize: '1.05rem' }}>
            La planta estuvo parada <strong style={{ color: 'var(--naranja)' }}>{fmtDur(totalHoy)}</strong> por
            corte de luz{deHoy.length > 1 ? ` en ${deHoy.length} cortes` : ''}.
          </div>
          <div className="meta" style={{ marginTop: 6 }}>
            Producción perdida sumando todas las tareas frenadas: <strong>{fmtDur(perdidoHoy)}</strong>.
            {' '}Es más que el tiempo del corte porque cuenta cada línea que quedó detenida.
          </div>
        </div>
      )}

      <div className="section-title">Cortes registrados ({cortes.length})</div>
      {cortes.length === 0
        ? <div className="empty">No hay cortes de luz registrados.</div>
        : resumenes.map((r) => (
            <div className="card" key={r.corte.id}>
              <div className="card-header">
                <div>
                  <strong>{fechaCorta(r.corte.desde)} · {hhmm(r.corte.desde)} a {hhmm(r.corte.hasta)}</strong>
                  <span className="estado-chip" style={{ marginLeft: 8 }}>{fmtDur(r.minutosCorte)}</span>
                  <div className="sub meta">
                    {r.corte.sectores.length === 0
                      ? 'Toda la planta'
                      : r.corte.sectores.map((s) => sectorById(s).nombre).join(' · ')}
                    {r.corte.nota ? ` · “${r.corte.nota}”` : ''}
                  </div>
                  <div className="sub meta">
                    {r.tareasAfectadas} tarea(s) afectada(s) · {fmtDur(r.minutosProductivosPerdidos)} de producción perdida
                    {' · '}cargado por {r.corte.cargadoPor}
                  </div>
                </div>
                <button className="btn btn-rojo" onClick={() => void quitar(r.corte)}>Quitar</button>
              </div>
            </div>
          ))}
    </>
  )
}
