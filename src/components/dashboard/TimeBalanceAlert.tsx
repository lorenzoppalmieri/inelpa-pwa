import { useState } from 'react'
import type { ResultadoAuditoria } from '../../lib/auditoriaTiempos'

// ============================================================
// BANNER AUDITOR DE TIEMPOS (v2.01)
//
// Va arriba de las tarjetas de totales del "Detalle por tarea".
//
//  VERDE  = las 3 identidades cierran Y ninguna tarea del filtro actual tiene
//           datos sospechosos. El número que está mirando el planificador es
//           confiable.
//  ROJO   = hay algo que revisar. Dice QUÉ y en CUÁNTAS tareas, con ejemplos
//           concretos, y ofrece filtrar la tabla para dejar solo esas.
//
// El verde es discreto a propósito: si grita cuando todo está bien, en dos
// semanas nadie lo mira y el rojo tampoco se ve.
// ============================================================
export default function TimeBalanceAlert({ auditoria, onFiltrar }: {
  auditoria: ResultadoAuditoria
  /** Filtra la tabla dejando solo las tareas con anomalías. */
  onFiltrar?: (ids: string[]) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const { ok, porTipo, anomalias, tareasAfectadas } = auditoria

  if (ok) {
    return (
      <div className="balance-alert ok">
        <span className="ba-ico">✓</span>
        <span className="ba-txt">
          Balance de tiempos correcto. Todas las demoras coinciden con sus justificaciones.
        </span>
      </div>
    )
  }

  return (
    <div className="balance-alert warn">
      <div className="ba-linea">
        <span className="ba-ico">⚠</span>
        <span className="ba-txt">
          <strong>Advertencia: se detectaron {anomalias.length} observación(es) en los tiempos.</strong>
          {' '}Los totales siguen sumando bien, pero hay datos de planta que conviene revisar
          antes de tomar una decisión con estos números.
        </span>
        <button className="ba-link" onClick={() => setAbierto((v) => !v)}>
          {abierto ? 'Ocultar detalle' : 'Ver detalle'}
        </button>
      </div>

      {abierto && (
        <div className="ba-detalle">
          {porTipo.map((g) => (
            <div className="ba-grupo" key={g.tipo}>
              <div className="ba-grupo-cab">
                <strong>{g.titulo}</strong> · {g.n}
              </div>
              <ul className="ba-lista">
                {g.ejemplos.map((e, i) => <li key={i}>{e}</li>)}
                {g.n > g.ejemplos.length && (
                  <li className="ba-mas">… y {g.n - g.ejemplos.length} más</li>
                )}
              </ul>
            </div>
          ))}
          {onFiltrar && tareasAfectadas.length > 0 && (
            <button className="btn btn-naranja" onClick={() => onFiltrar(tareasAfectadas)}>
              Ver solo estas {tareasAfectadas.length} tarea(s) en la tabla
            </button>
          )}
        </div>
      )}
    </div>
  )
}
