import { useMemo } from 'react'
import {
  BLOQUES_AGENDA_ISO, bloqueDe, marcaDe, semanasDelAnio, cargaPorMes,
  type ActividadAgendaISO, type BloqueAgendaISO,
} from '../../sgo/agendaISO'

// ============================================================
// MATRIZ DE LA AGENDA ISO (v1.84) — réplica del R.I.T 6.2/05
//
// Filas = actividades agrupadas en los 3 bloques del papel.
// Columnas = 12 meses x semanas 1..5 (la semana DEL MES, como en la planilla).
//
// La marca real del documento es el CASILLERO PINTADO — el texto de la celda no
// significa nada (confirmado con Lorenzo). Por eso acá la celda es un botón de
// color, no un campo.
//
// Un click cicla: vacía -> programada -> hecha -> vacía. Azul reprograma y marca
// con el mismo gesto, sin abrir ningún modal: es lo que más va a hacer.
//
// TONO: sin ranking, sin rojo agresivo. Lo vencido se marca con un borde y un
// punto, no gritando. "Es una agenda para todos, que no se sientan presionados."
// ============================================================

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
/** Semanas por mes en la planilla: los meses de 5 semanas están fijados en el papel. */
const SEMANAS_MES = [5, 4, 5, 4, 5, 4, 4, 5, 4, 4, 5, 4]

export default function MatrizAgendaISO({
  actividades, anio, hoy, puedeEditar, onCiclar, onAbrir,
}: {
  actividades: ActividadAgendaISO[]
  anio: number
  hoy: string                  // 'YYYY-MM-DD'
  puedeEditar: boolean
  onCiclar: (a: ActividadAgendaISO, mes: number, semana: number) => void
  onAbrir: (a: ActividadAgendaISO) => void
}) {
  const mesHoy = Number(hoy.slice(5, 7))
  const anioHoy = Number(hoy.slice(0, 4))

  // Agrupa por bloque respetando el orden del papel.
  const porBloque = useMemo(() => {
    const m = new Map<BloqueAgendaISO, ActividadAgendaISO[]>()
    for (const b of BLOQUES_AGENDA_ISO) m.set(b.id, [])
    for (const a of actividades) m.get(bloqueDe(a))!.push(a)
    for (const [, arr] of m) {
      arr.sort((x, y) => (x.orden ?? 999) - (y.orden ?? 999) || x.titulo.localeCompare(y.titulo))
    }
    return m
  }, [actividades])

  const carga = useMemo(() => cargaPorMes(actividades, anio), [actividades, anio])
  const maxCarga = Math.max(1, ...carga)
  const totalAnio = carga.reduce((a, b) => a + b, 0)

  return (
    <div>
      {/* ---------- Gráfico de carga por mes ----------
          Es lo que la grilla esconde: mirando la matriz no se ve que las 12
          auditorías internas caen todas entre octubre y diciembre. */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header" style={{ marginBottom: 6 }}>
          <div>
            <div className="section-title" style={{ margin: 0 }}>Carga del año {anio}</div>
            <div className="meta">{totalAnio} actividades programadas · sirve para repartir, no para medir</div>
          </div>
        </div>
        <div className="agenda-carga">
          {carga.map((n, i) => (
            <div key={i} className={'agenda-carga-col' + (anio === anioHoy && i + 1 === mesHoy ? ' actual' : '')}>
              <div className="agenda-carga-n">{n || ''}</div>
              <div className="agenda-carga-barra" style={{ height: `${(n / maxCarga) * 100}%` }} />
              <div className="agenda-carga-mes">{MESES[i]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- La matriz ---------- */}
      <div className="agenda-scroll">
        <table className="agenda-matriz">
          <thead>
            <tr>
              <th className="agenda-col-act" rowSpan={2}>ACTIVIDAD</th>
              {MESES.map((m, i) => (
                <th key={m} colSpan={SEMANAS_MES[i]}
                  className={anio === anioHoy && i + 1 === mesHoy ? 'mes-actual' : ''}>{m}</th>
              ))}
            </tr>
            <tr>
              {MESES.flatMap((_, i) =>
                Array.from({ length: SEMANAS_MES[i] }, (_, k) => (
                  <th key={`${i}-${k}`}
                    className={'agenda-sem'
                      + (k === SEMANAS_MES[i] - 1 ? ' fin-mes' : '')
                      + (i % 2 === 1 ? ' banda' : '')}>{k + 1}</th>
                )))}
            </tr>
          </thead>
          <tbody>
            {BLOQUES_AGENDA_ISO.map((b) => {
              const filas = porBloque.get(b.id) ?? []
              if (filas.length === 0) return null
              return [
                <tr key={b.id} className="agenda-bloque">
                  <td colSpan={1 + SEMANAS_MES.reduce((x, y) => x + y, 0)}>{b.label}</td>
                </tr>,
                ...filas.map((a) => {
                  const total = semanasDelAnio(a, anio).length
                  return (
                    <tr key={a.id}>
                      <td className="agenda-col-act">
                        <button className="agenda-titulo" onClick={() => onAbrir(a)} title={`${a.titulo} — abrir la ficha`}>
                          <span className="agenda-titulo-txt">{a.titulo}</span>
                          {total > 0 && <span className="agenda-cuenta">{total}</span>}
                        </button>
                      </td>
                      {MESES.flatMap((_, i) =>
                        Array.from({ length: SEMANAS_MES[i] }, (_, k) => {
                          const mes = i + 1, sem = k + 1
                          const marca = marcaDe(a, anio, mes, sem)
                          // "Pasada" = su mes ya quedó atrás y nadie la marcó hecha.
                          const pasada = !!marca && !marca.hecha
                            && (anio < anioHoy || (anio === anioHoy && mes < mesHoy))
                          const cls = ['agenda-celda']
                          if (marca) cls.push(marca.hecha ? 'hecha' : 'programada')
                          if (pasada) cls.push('pasada')
                          if (anio === anioHoy && mes === mesHoy) cls.push('col-actual')
                          // Banda alterna por mes + línea gruesa al cerrar el mes:
                          // sin esto la grilla es un mar de casilleros sin referencia.
                          if (i % 2 === 1) cls.push('banda')
                          if (k === SEMANAS_MES[i] - 1) cls.push('fin-mes')
                          return (
                            <td key={`${mes}-${sem}`} className={cls.join(' ')}>
                              <button
                                disabled={!puedeEditar}
                                onClick={() => onCiclar(a, mes, sem)}
                                aria-label={`${a.titulo} · ${MESES[i]} semana ${sem}${marca ? (marca.hecha ? ' · hecha' : ' · programada') : ''}`}
                                title={!puedeEditar ? 'Solo Lorenzo y Azul reprograman'
                                  : marca ? (marca.hecha ? 'Hecha — click para quitar' : 'Programada — click para marcar hecha')
                                  : 'Click para programar esta semana'}
                              >
                                {/* v1.86: UN SOLO COLOR en toda la planilla. El estado
                                    no se distingue por tono sino por el relleno:
                                    llena = programada · llena con tilde = hecha ·
                                    solo contorno = quedó atrás sin marcar. */}
                                {marca?.hecha ? '✓' : ''}
                              </button>
                            </td>
                          )
                        }))}
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        </table>
      </div>

      <div className="agenda-leyenda meta">
        <span><i className="lg programada" /> Programada</span>
        <span><i className="lg hecha">✓</i> Hecha</span>
        <span><i className="lg pasada" /> Quedó atrás sin marcar</span>
        {puedeEditar
          ? <span>· Click en el casillero: programar → hecha → quitar</span>
          : <span>· La reprograman Lorenzo y Azul</span>}
      </div>
    </div>
  )
}
