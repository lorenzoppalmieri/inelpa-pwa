import { useState } from 'react'
import type { ResultadoAuditoria, TipoAnomalia } from '../../lib/auditoriaTiempos'

// ============================================================
// BANNER AUDITOR DE TIEMPOS (v2.01, interactivo desde v2.11)
//
// Va arriba de las tarjetas de totales del "Detalle por tarea".
//
//  VERDE  = las 3 identidades cierran Y ninguna tarea del filtro actual tiene
//           datos sospechosos. El número que está mirando el planificador es
//           confiable.
//  ROJO   = hay algo que revisar. Dice QUÉ, en CUÁNTAS tareas y de QUIÉN, y
//           ofrece filtrar la tabla para dejar solo esas.
//
// v2.11 — TRES CAMBIOS PEDIDOS DESDE PLANTA:
//  1. Cada categoría mostraba 3 ejemplos y "… y 54 más". Esas 54 eran
//     inalcanzables: no había forma de verlas desde ningún lado. Ahora el
//     contador es un botón que despliega la lista completa.
//  2. Cada línea nombra al COLABORADOR además del modelo y el número. Una
//     observación sin nombre obliga a ir a buscar la tarea en la tabla para
//     saber a quién preguntarle; con el nombre es accionable de una.
//  3. El banner entero se pliega desde arriba a la derecha, porque cuando hay
//     muchas observaciones empuja las tarjetas de totales fuera de la pantalla.
//
// El verde es discreto a propósito: si grita cuando todo está bien, en dos
// semanas nadie lo mira y el rojo tampoco se ve.
// ============================================================

/** Cuántas se muestran antes de pedir que se despliegue la categoría. */
const VISIBLES_AL_INICIO = 3

export default function TimeBalanceAlert({ auditoria, onFiltrar }: {
  auditoria: ResultadoAuditoria
  /** Filtra la tabla dejando solo las tareas con anomalías. */
  onFiltrar?: (ids: string[]) => void
}) {
  // Plegado GENERAL del banner. Arranca abierto: una advertencia que nace
  // cerrada es una advertencia que nadie lee.
  const [abierto, setAbierto] = useState(true)
  // Categorías desplegadas por completo. Se guarda el set de las ABIERTAS
  // porque lo normal es tenerlas cortadas; así el estado por default es vacío.
  const [desplegadas, setDesplegadas] = useState<Set<TipoAnomalia>>(() => new Set())

  const alternarCategoria = (tipo: TipoAnomalia) => setDesplegadas((prev) => {
    const s = new Set(prev)
    if (s.has(tipo)) s.delete(tipo); else s.add(tipo)
    return s
  })

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
        {/* Plegado global, arriba a la derecha. */}
        <button className="ba-link" onClick={() => setAbierto((v) => !v)}>
          {abierto ? 'Ocultar detalle' : 'Mostrar detalle'}
        </button>
      </div>

      {abierto && (
        <div className="ba-detalle">
          {porTipo.map((g) => {
            const todas = desplegadas.has(g.tipo)
            const mostradas = todas ? g.detalles : g.detalles.slice(0, VISIBLES_AL_INICIO)
            const ocultas = g.n - mostradas.length
            return (
              <div className="ba-grupo" key={g.tipo}>
                <div className="ba-grupo-cab">
                  <strong>{g.titulo}</strong> · {g.n}
                </div>
                {/* Con la categoría desplegada la lista puede ser larguísima:
                    se le pone tope de alto y scroll propio para no empujar el
                    resto del tablero fuera de la pantalla. */}
                <ul className={'ba-lista' + (todas ? ' ba-lista-scroll' : '')}>
                  {mostradas.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
                {(ocultas > 0 || todas) && (
                  <button className="ba-link" onClick={() => alternarCategoria(g.tipo)}>
                    {todas ? '▲ Ver menos' : `▼ Ver las ${g.n} observaciones`}
                  </button>
                )}
              </div>
            )
          })}

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
