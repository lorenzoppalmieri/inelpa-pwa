import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { TareaLaboratorio } from '../../types'
import { ENSAYOS_LAB, estadoEnsayo, idDespachoDeLab } from '../../types'
import { esSuperAdmin } from '../../auth/roles'
import { useAuth } from '../../auth/AuthContext'
import { guardarLaboratorio } from '../../sync/syncEngine'
import { fechaCorta, hhmm, fmtDur } from '../../lib/time'
import { calcularTiempoProductivo } from '../../lib/calendario'
import { PERIODOS_HISTORIAL, rangoReporte, enRango, type PeriodoReporte } from '../../lib/periodoReporte'
import FichaLaboratorio from './FichaLaboratorio'

// ============================================================
// VISTA DEL LABORATORISTA (v1.37) — cola de ensayos. Las tareas llegan solas
// cuando Montaje PO finaliza un transformador. El laboratorista abre la ficha,
// corre los ensayos y finaliza (rutea a despacho o retrabajo).
//
// v1.73: el historial dejó de estar capado. Antes "Ensayadas" mostraba
// `.slice(0, 30)` a secas: el contador decía el total real pero solo se pintaban
// 30, sin "ver más", sin buscador y sin filtro. Un protocolo de hace dos meses
// era literalmente inalcanzable desde la interfaz. Ahora va por período (igual
// que Logística y Despacho), con búsqueda y paginado.
// ============================================================

const PAGINA = 20

// ============================================================
// v1.79 — SEMAFORO DE ESPERA EN LA COLA.
//
// El umbral viejo era `min > 3*480 ? rojo : min > 480 ? naranja : naranja`:
// las dos ultimas ramas daban EL MISMO COLOR, asi que un trafo con 2 horas de
// espera se veia igual que uno con 20. El semaforo no señalaba nada hasta el
// salto a rojo.
//
// Ademas 480 min (8h) no es una jornada de esta planta: Lun-Jue se produce de
// 07:00 a 15:45 (los ultimos 15' son limpieza) = 525 min. Los viernes son 465.
// Se toma 525 como "una jornada" para que el umbral signifique algo real.
// ============================================================
const JORNADA_MIN = 525

function colorEspera(min: number): string {
  if (min > 3 * JORNADA_MIN) return 'var(--rojo)'       // mas de 3 jornadas
  if (min > JORNADA_MIN) return 'var(--naranja)'        // entre 1 y 3 jornadas
  return 'var(--estado-fin)'                            // menos de una jornada
}

/** "50h 55m" no dice mucho a simple vista; "≈ 5,8 jornadas" si. Solo se agrega
 *  cuando ya paso al menos una jornada completa, para no ensuciar la tarjeta. */
function jornadasLabel(min: number): string {
  const j = min / JORNADA_MIN
  if (j < 1) return ''
  return ` · ≈ ${j.toFixed(1).replace('.', ',')} ${j < 2 ? 'jornada' : 'jornadas'}`
}

export default function LaboratorioView() {
  const { usuario } = useAuth()
  const puedeAnular = esSuperAdmin(usuario)   // v1.80: hoy solo 'lorenzo'
  const tareas = useLiveQuery(() => db.laboratorio.toArray(), []) ?? []
  const [abierta, setAbierta] = useState<TareaLaboratorio | null>(null)
  // v1.80: ficha en proceso de anulacion + motivo tipeado + aviso de bloqueo.
  const [anulando, setAnulando] = useState<TareaLaboratorio | null>(null)
  const [motivo, setMotivo] = useState('')
  const [errAnular, setErrAnular] = useState('')
  const [verAnuladas, setVerAnuladas] = useState(false)
  const [periodo, setPeriodo] = useState<PeriodoReporte>('mes_actual')
  const [buscar, setBuscar] = useState('')
  const [tope, setTope] = useState(PAGINA)

  // Reloj para la antigüedad de la cola (se refresca solo cada 30").
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(id) }, [])
  const ahoraISO = new Date(ahora).toISOString()

  // Al cambiar cualquier filtro se vuelve a la primera tanda.
  useEffect(() => { setTope(PAGINA) }, [periodo, buscar])

  const coincide = (t: TareaLaboratorio, q: string) =>
    !q || `${t.modelo} ${t.nroSerie ?? ''} ${t.ot ?? ''} ${t.cliente ?? ''} ${t.comentario ?? ''}`.toLowerCase().includes(q)

  const g = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    // La COLA se muestra siempre completa: es el trabajo pendiente, no historial.
    // v1.80: las anuladas NO son trabajo pendiente ni historial de ensayos; van
    // a su propia lista aparte (abajo del todo, solo para el super admin).
    const pendientes = tareas.filter((t) => t.estado !== 'finalizada' && t.estado !== 'anulada' && coincide(t, q))
      .sort((a, b) => (a.creada < b.creada ? -1 : 1))

    const anuladas = tareas.filter((t) => t.estado === 'anulada' && coincide(t, q))
      .sort((a, b) => ((b.anuladaEn ?? '') < (a.anuladaEn ?? '') ? -1 : 1))

    const finalizadasTodas = tareas.filter((t) => t.estado === 'finalizada')
    const r = rangoReporte(periodo)
    const finalizadas = finalizadasTodas
      .filter((t) => enRango(t.finalizada ?? t.creada, r.desde, r.hasta) && coincide(t, q))
      .sort((a, b) => ((b.finalizada ?? '') < (a.finalizada ?? '') ? -1 : 1))

    return { pendientes, anuladas, finalizadas, totalFinalizadas: finalizadasTodas.length }
  }, [tareas, periodo, buscar])

  const visibles = g.finalizadas.slice(0, tope)

  // ---------- v1.80: ANULAR / RESTAURAR una ficha (solo super admin) ----------
  // Abre el modal, pero antes CHEQUEA que la ficha no haya generado ya un
  // despacho. Un ensayo aprobado crea el despacho con id derivado del suyo
  // (desp_<labId>); si se anulara la ficha, ese despacho quedaria huerfano en el
  // modulo de embalaje, sin origen que lo explique.
  async function pedirAnular(t: TareaLaboratorio) {
    setMotivo(''); setErrAnular('')
    const desp = await db.despachos.get(idDespachoDeLab(t.id))
    if (desp) {
      setErrAnular('Esta ficha ya liberó el trafo a Despacho. Primero hay que dar de baja el despacho; si no, quedaría sin origen.')
    }
    setAnulando(t)
  }

  async function confirmarAnular() {
    const t = anulando
    if (!t || !motivo.trim() || errAnular) return
    await guardarLaboratorio({
      ...t,
      estado: 'anulada',
      anuladaEn: new Date().toISOString(),
      anuladaPor: usuario?.usuario,
      motivoAnulacion: motivo.trim(),
    })
    setAnulando(null); setMotivo('')
  }

  // Vuelve la ficha a la cola. La anulacion es reversible a proposito: si se
  // anula una de mas, no hay que rehacer nada a mano en la base.
  async function restaurar(t: TareaLaboratorio) {
    if (!window.confirm(`Devolver a la cola de ensayos:\n\n${t.modelo}\nSerie ${t.nroSerie || '(sin serie)'}`)) return
    await guardarLaboratorio({
      ...t, estado: 'pendiente',
      anuladaEn: undefined, anuladaPor: undefined, motivoAnulacion: undefined,
    })
  }

  // Resumen de ensayos de una tarea (para la tarjeta finalizada).
  const resumen = (t: TareaLaboratorio) => {
    const ap = ENSAYOS_LAB.filter((e) => estadoEnsayo(t, e.key) === 'aprobado').length
    const re = ENSAYOS_LAB.filter((e) => estadoEnsayo(t, e.key) === 'rechazado').length
    return `${ap} aprobado(s)${re ? ` · ${re} rechazado(s)` : ''}`
  }

  // Cuánto lleva esperando ensayo, en minutos de planta (no cuenta la noche ni
  // el fin de semana). Sirve para que un trafo no se quede semanas sin que nadie
  // lo note: antes solo se veía la fecha de ingreso.
  const espera = (t: TareaLaboratorio) => calcularTiempoProductivo(t.creada, ahoraISO)

  return (
    <div>
      <div className="section-title" style={{ margin: '4px 0 12px' }}>🔬 Laboratorio · cola de ensayos</div>

      <div className="logi-kpis">
        <div className="logi-kpi"><div className="n">{g.pendientes.length}</div><div className="l">Pendientes de ensayo</div></div>
        <div className="logi-kpi"><div className="n">{g.finalizadas.length}</div><div className="l">Ensayadas (período)</div></div>
        <div className="logi-kpi"><div className="n">{g.totalFinalizadas}</div><div className="l">Ensayadas (histórico)</div></div>
      </div>

      {/* Buscador + período. El buscador filtra las dos listas; el período, solo el historial. */}
      <div className="filtros">
        <input
          className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)}
          placeholder="🔍 Buscar por modelo, N° de serie, OT o cliente…" style={{ flex: 1, minWidth: 220 }}
        />
        <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoReporte)}>
          {PERIODOS_HISTORIAL.map((p) => <option key={p.id} value={p.id}>Ensayadas · {p.label}</option>)}
        </select>
        {(buscar || periodo !== 'mes_actual') && (
          <button className="btn" onClick={() => { setBuscar(''); setPeriodo('mes_actual') }}>↺ Limpiar</button>
        )}
      </div>

      <div className="section-title">Pendientes de ensayo ({g.pendientes.length})</div>
      {/* v1.79: sin esto los colores no se entienden. Se aclara ademas que el
          tiempo es de PLANTA (no reloj), que es la duda que surge al leerlo. */}
      {g.pendientes.length > 0 && (
        <div className="meta" style={{ margin: '-6px 0 10px' }}>
          Ordenados del que más espera al que menos. La espera está en <strong>horas de planta</strong> (no
          cuenta noches, fines de semana ni feriados) · <span style={{ color: 'var(--estado-fin)', fontWeight: 700 }}>menos de 1 jornada</span> ·{' '}
          <span style={{ color: 'var(--naranja)', fontWeight: 700 }}>1 a 3 jornadas</span> ·{' '}
          <span style={{ color: 'var(--rojo)', fontWeight: 700 }}>más de 3 jornadas</span>
        </div>
      )}
      {g.pendientes.length === 0
        ? <div className="empty">{buscar ? 'Ningún pendiente coincide con la búsqueda.' : 'Sin transformadores esperando ensayo.'}</div>
        : g.pendientes.map((t) => {
          const min = espera(t)
          return (
            <div className="card logi-tarea" key={t.id}>
              <div className="card-header">
                <div>
                  <h3>{t.modelo}{t.nroSerie ? ` · Serie ${t.nroSerie}` : ' · (sin serie)'}</h3>
                  <div className="meta">
                    Cliente <strong>{t.cliente || 'Stock'}</strong>{t.ot ? ` · OT ${t.ot}` : ''}{t.linea ? ` · ${t.linea === 'rural' ? 'Rural' : 'Distribución'}` : ''} · Ingresó {fechaCorta(t.creada)} {hhmm(t.creada)}
                    {' · '}
                    <strong style={{ color: colorEspera(min) }}>
                      esperando {fmtDur(min)}{jornadasLabel(min)}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="row-actions">
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setAbierta(t)}>🔬 Abrir ensayo</button>
                {/* v1.80: sacar de la cola una ficha desfasada o duplicada. Solo
                    super admin; no borra la fila, la marca como anulada. */}
                {puedeAnular && (
                  <button className="btn" onClick={() => void pedirAnular(t)} title="Sacar de la cola (queda registrado)">
                    ✕ Anular
                  </button>
                )}
              </div>
            </div>
          )
        })}

      <div className="section-title">
        Ensayadas · {PERIODOS_HISTORIAL.find((p) => p.id === periodo)?.label}
        {' '}({g.finalizadas.length}{g.totalFinalizadas !== g.finalizadas.length ? ` de ${g.totalFinalizadas}` : ''})
      </div>
      {g.finalizadas.length === 0
        ? <div className="empty">
            {g.totalFinalizadas === 0
              ? 'Aún no hay ensayos finalizados.'
              : `Ninguno con estos filtros. Hay ${g.totalFinalizadas} en el histórico — probá "Todas (histórico)".`}
          </div>
        : <>
            {visibles.map((t) => (
              <div className="card" key={t.id}>
                <div className="card-header">
                  <div>
                    <h3>{t.modelo}{t.nroSerie ? ` · Serie ${t.nroSerie}` : ''}</h3>
                    <div className="meta">
                      {resumen(t)} · {t.finalizada ? `${fechaCorta(t.finalizada)} ${hhmm(t.finalizada)}` : ''}
                      {t.cliente ? ` · ${t.cliente}` : ''}{t.ot ? ` · OT ${t.ot}` : ''}
                      {t.comentario ? <> · <em>{t.comentario}</em></> : null}
                    </div>
                  </div>
                  <span className="estado-chip" style={{ background: t.resultado === 'retrabajo' ? 'var(--rojo)' : 'var(--estado-fin)' }}>
                    {t.resultado === 'retrabajo' ? 'Retrabajo' : 'Aprobado → Despacho'}
                  </span>
                </div>
                <div className="row-actions">
                  <button className="btn" onClick={() => setAbierta(t)}>👁 Ver ensayo</button>
                </div>
              </div>
            ))}
            {g.finalizadas.length > visibles.length && (
              <button className="btn btn-bloque" onClick={() => setTope((n) => n + PAGINA)}>
                ▼ Ver {Math.min(PAGINA, g.finalizadas.length - visibles.length)} más
                <span className="meta"> (mostrando {visibles.length} de {g.finalizadas.length})</span>
              </button>
            )}
          </>}

      {/* ---------- v1.80: fichas ANULADAS (solo super admin) ----------
          Plegado por defecto para no ensuciar la vista. Existe para poder
          justificar por que un trafo terminado no tiene ensayo, y para
          devolverlo a la cola si se anulo por error. */}
      {puedeAnular && g.anuladas.length > 0 && (
        <>
          <button className="btn btn-bloque" style={{ marginTop: 18 }} onClick={() => setVerAnuladas((v) => !v)}>
            {verAnuladas ? '▲ Ocultar' : '▼ Ver'} fichas anuladas ({g.anuladas.length})
          </button>
          {verAnuladas && g.anuladas.map((t) => (
            <div className="card" key={t.id} style={{ opacity: .75, borderLeft: '4px solid var(--texto-tenue)' }}>
              <div className="card-header">
                <div>
                  <h3 style={{ textDecoration: 'line-through' }}>{t.modelo}{t.nroSerie ? ` · Serie ${t.nroSerie}` : ' · (sin serie)'}</h3>
                  <div className="meta">
                    Anulada por <strong>{t.anuladaPor || '—'}</strong>
                    {t.anuladaEn ? ` el ${fechaCorta(t.anuladaEn)} ${hhmm(t.anuladaEn)}` : ''}
                    {t.ot ? ` · OT ${t.ot}` : ''} · Había ingresado {fechaCorta(t.creada)}
                  </div>
                  {t.motivoAnulacion && <div className="meta" style={{ marginTop: 4 }}>Motivo: <em>{t.motivoAnulacion}</em></div>}
                </div>
              </div>
              <div className="row-actions">
                <button className="btn" onClick={() => void restaurar(t)}>↺ Devolver a la cola</button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ---------- v1.80: modal de anulacion ---------- */}
      {anulando && (
        <div className="modal-overlay" onClick={() => setAnulando(null)}>
          <div className="modal modal-flex" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Anular ficha de laboratorio</h2>
            </div>
            <div className="modal-cuerpo">
              {/* Se repiten modelo y serie para que no se anule la tarjeta equivocada. */}
              <div className="card" style={{ borderLeft: '4px solid var(--naranja)' }}>
                <strong>{anulando.modelo}</strong>
                <div className="meta" style={{ marginTop: 4 }}>
                  Serie <strong>{anulando.nroSerie || '(sin serie)'}</strong>
                  {anulando.ot ? ` · OT ${anulando.ot}` : ''} · Cliente {anulando.cliente || 'Stock'}
                  {' · '}Ingresó {fechaCorta(anulando.creada)} {hhmm(anulando.creada)}
                </div>
              </div>
              {errAnular
                ? <div className="meta" style={{ color: 'var(--rojo)', fontWeight: 700, marginTop: 10 }}>⚠ {errAnular}</div>
                : (
                  <>
                    <div className="meta" style={{ marginTop: 10 }}>
                      Sale de la cola de ensayos. <strong>No se borra</strong>: queda registrada con tu usuario y el
                      motivo, y podés devolverla a la cola cuando quieras. La tarea de Montaje que la generó no se toca.
                    </div>
                    <div className="field" style={{ marginTop: 12 }}>
                      <label>Motivo *</label>
                      <input
                        className="input" value={motivo} autoFocus
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="ej. duplicada por error de carga de serie"
                      />
                    </div>
                  </>
                )}
            </div>
            <div className="modal-pie">
              <div className="row-actions">
                <button className="btn" style={{ flex: 1 }} onClick={() => setAnulando(null)}>Cancelar</button>
                <button
                  className="btn btn-naranja" style={{ flex: 1 }}
                  disabled={!motivo.trim() || !!errAnular}
                  onClick={() => void confirmarAnular()}
                >
                  Anular ficha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {abierta && (
        <FichaLaboratorio
          tarea={tareas.find((x) => x.id === abierta.id) ?? abierta}
          onClose={() => setAbierta(null)}
        />
      )}
    </div>
  )
}
