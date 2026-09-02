import { useMemo, useState } from 'react'
import type { Tarea } from '../../types'
import { esReparacion } from '../../types'
import { metricasTarea, excedeTolerancia, TOLERANCIA_DESVIO } from '../../lib/kpi'

// ============================================================
// KPI Tiempo Estimado vs NETO (sin librerias de graficos: divs + CSS).
//
//  - Solo tareas FINALIZADAS (excluye reparaciones: son tiempo no productivo).
//  - Estimado = tiempoEstandarMin (teorico de planificacion).
//  - NETO     = Tiempo Real - Demoras Justificadas.
//
// v2.00 — POR QUE CAMBIO. Antes la barra roja comparaba contra el Tiempo Real
// CRUDO y mostraba desvios de +495%: el Real incluye las horas que el operario
// YA justifico (falta de insumos, corte de luz, espera de puente grua). El
// grafico castigaba al operario por esperas que no dependian de el, y el numero
// no servia para tomar ninguna decision.
//
// Ahora se mide contra el NETO. Ejemplo del pedido: real 10 h, de las cuales 6 h
// justificadas, estandar 5 h -> neto 4 h -> VERDE, porque operativamente fue
// eficiente.
//
// OJO: el neto perdona SOLO lo que el operario cargo como parada. Si dejo la
// tarea abierta el fin de semana sin marcar nada, sigue en rojo — y esta bien,
// esa es la senal de que falta disciplina de carga.
//
// La demora justificada sale de metricasTarea(), que a su vez usa minutosParada()
// (fusiona intervalos superpuestos, el almuerzo le gana a la justificada). Por
// eso estos numeros coinciden por construccion con la tabla "Detalle por tarea"
// y con el Gantt: no hay una segunda version de la cuenta viviendo aca.
// ============================================================
type Agrupar = 'maquina' | 'modelo'

interface Fila {
  clave: string
  estimado: number
  /** Real crudo (laborable, sin almuerzo). Solo para el tooltip. */
  real: number
  /** Suma de paradas justificadas. Solo para el tooltip. */
  justificada: number
  /** real - justificada. Es LO QUE SE GRAFICA y sobre lo que se calcula el %. */
  neto: number
  n: number
}

// minutos -> "H:MM"
function hhmm(min: number): string {
  const m = Math.max(0, Math.round(min))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}
// minutos -> "12h 30m" (para los tooltips, mas legible que H:MM)
function hm(min: number): string {
  const m = Math.max(0, Math.round(min))
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
function desvio(f: Fila): number {
  return f.estimado > 0 ? (f.neto - f.estimado) / f.estimado : 0
}

export default function EstimadoVsRealizado({ tareas, nombreMaquina }: {
  tareas: Tarea[]
  nombreMaquina: (id: string) => string
}) {
  const [agrupar, setAgrupar] = useState<Agrupar>('maquina')

  const filas = useMemo<Fila[]>(() => {
    const fin = tareas.filter((t) => t.estado === 'finalizada' && !esReparacion(t))
    const map = new Map<string, Fila>()
    for (const t of fin) {
      const clave = agrupar === 'maquina' ? nombreMaquina(t.maquinaId) : t.modelo
      const m = metricasTarea(t)
      const cur = map.get(clave) ?? { clave, estimado: 0, real: 0, justificada: 0, neto: 0, n: 0 }
      cur.estimado += m.estimado
      cur.real += m.real
      cur.justificada += m.justificada
      // Se acumula tarea por tarea (no real total - justificada total) para que
      // ninguna tarea pueda aportar un neto negativo y tapar el exceso de otra.
      cur.neto += Math.max(0, m.real - m.justificada)
      cur.n++
      map.set(clave, cur)
    }
    // Peor desvio primero (lo que mas conviene mirar).
    return [...map.values()].sort((a, b) => desvio(b) - desvio(a))
  }, [tareas, agrupar, nombreMaquina])

  // Escala global (compara magnitudes entre filas y dentro de cada fila).
  const max = Math.max(1, ...filas.flatMap((f) => [f.estimado, f.neto]))

  return (
    <div className="card">
      <div className="evr-head">
        <div className="seg">
          <button className={'seg-btn' + (agrupar === 'maquina' ? ' on' : '')} onClick={() => setAgrupar('maquina')}>Por máquina</button>
          <button className={'seg-btn' + (agrupar === 'modelo' ? ' on' : '')} onClick={() => setAgrupar('modelo')}>Por modelo</button>
        </div>
        <div className="evr-legend">
          <span><i style={{ background: 'var(--azul-claro)' }} /> Estimado</span>
          <span><i style={{ background: 'var(--estado-fin)' }} /> Neto ≤ est.</span>
          <span><i style={{ background: 'var(--rojo)' }} /> Neto &gt; est.</span>
        </div>
      </div>
      <div className="meta" style={{ padding: '0 4px 8px' }}>
        Neto = Tiempo Real − demoras justificadas. Tolerancia {Math.round(TOLERANCIA_DESVIO * 100)}% antes de marcar en rojo.
      </div>

      {filas.length === 0 ? (
        <div className="empty">Sin tareas finalizadas en el período.</div>
      ) : filas.map((f) => {
        const d = desvio(f)
        const sobre = excedeTolerancia(f.neto, f.estimado)
        const detalle =
          `${f.clave} · ${f.n} u.\n` +
          `Tiempo Real crudo: ${hm(f.real)}\n` +
          `Demoras justificadas: ${hm(f.justificada)}\n` +
          `Tiempo Neto: ${hm(f.neto)}\n` +
          `Estimado: ${hm(f.estimado)}\n` +
          `Desvío sobre el neto: ${d > 0 ? '+' : ''}${(d * 100).toFixed(0)}%`
        return (
          <div className="evr-row" key={f.clave} title={detalle}>
            <div className="evr-lbl">
              <div>{f.clave}</div>
              <div className="sub meta">{f.n} u.</div>
            </div>
            <div className="evr-bars">
              <div className="evr-track">
                <div className="evr-bar evr-est" style={{ width: `${(f.estimado / max) * 100}%` }} />
                <span className="evr-val">{hhmm(f.estimado)}</span>
              </div>
              <div className="evr-track">
                <div className={'evr-bar ' + (sobre ? 'evr-over' : 'evr-ok')} style={{ width: `${(f.neto / max) * 100}%` }} />
                <span className="evr-val">{hhmm(f.neto)}</span>
              </div>
            </div>
            <div className={'evr-desvio ' + (sobre ? 'mal' : 'bien')} title={detalle}>
              {d > 0 ? '+' : ''}{(d * 100).toFixed(0)}%
            </div>
          </div>
        )
      })}
    </div>
  )
}
