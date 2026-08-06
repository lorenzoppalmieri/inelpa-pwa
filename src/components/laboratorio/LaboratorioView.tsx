import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { TareaLaboratorio } from '../../types'
import { ENSAYOS_LAB, estadoEnsayo } from '../../types'
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

export default function LaboratorioView() {
  const tareas = useLiveQuery(() => db.laboratorio.toArray(), []) ?? []
  const [abierta, setAbierta] = useState<TareaLaboratorio | null>(null)
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
    const pendientes = tareas.filter((t) => t.estado !== 'finalizada' && coincide(t, q))
      .sort((a, b) => (a.creada < b.creada ? -1 : 1))

    const finalizadasTodas = tareas.filter((t) => t.estado === 'finalizada')
    const r = rangoReporte(periodo)
    const finalizadas = finalizadasTodas
      .filter((t) => enRango(t.finalizada ?? t.creada, r.desde, r.hasta) && coincide(t, q))
      .sort((a, b) => ((b.finalizada ?? '') < (a.finalizada ?? '') ? -1 : 1))

    return { pendientes, finalizadas, totalFinalizadas: finalizadasTodas.length }
  }, [tareas, periodo, buscar])

  const visibles = g.finalizadas.slice(0, tope)

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
                    <strong style={{ color: min > 3 * 480 ? 'var(--rojo)' : min > 480 ? 'var(--naranja)' : 'var(--naranja)' }}>
                      esperando {fmtDur(min)}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="row-actions">
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setAbierta(t)}>🔬 Abrir ensayo</button>
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

      {abierta && (
        <FichaLaboratorio
          tarea={tareas.find((x) => x.id === abierta.id) ?? abierta}
          onClose={() => setAbierta(null)}
        />
      )}
    </div>
  )
}
