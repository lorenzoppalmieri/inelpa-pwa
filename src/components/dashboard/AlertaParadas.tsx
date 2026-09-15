import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { Tarea, Parada } from '../../types'
import { sectorById, causaLabel, esCausaLogistica } from '../../types'
import { fmtDur, hhmm } from '../../lib/time'
import { calcularTiempoProductivo } from '../../lib/calendario'

// ============================================================
// PARADAS ABIERTAS QUE NO SON DE LOGISTICA  (v2.17)
//
// POR QUE EXISTE: el tablero marcaba "22 EN PARADA" pero arriba solo se veia el
// cartel de espera de material, que filtra por causa de logistica. Las otras
// —ayuda en el sector, falta de herramienta, calidad, corte de luz— no
// aparecian en ninguna parte del tablero: la unica forma de verlas era ir a
// "Asignar tareas" y filtrar por pausadas. Una linea parada tres dias por falta
// de herramienta no le llegaba a nadie.
//
// Es un cartel SEPARADO del de logistica a proposito (decision de Lorenzo): el
// de arriba tiene un destinatario concreto ("avisar a logistica") y mezclarle
// causas que se resuelven dentro del sector le sacaria el filo.
//
// Plegado por defecto: con 20+ paradas abiertas, desplegarlas todas se come la
// pantalla arriba del Gantt. Se muestran los contadores por causa y el detalle
// se abre a pedido, con scroll interno. Mismo patron que TimeBalanceAlert.
//
// El tiempo se mide en HORAS HABILES (`calcularTiempoProductivo`): una parada
// abierta el viernes a las 15:35 lleva 40 minutos de planta el viernes, no las
// 66 horas de reloj que pasaron hasta el lunes.
// ============================================================

interface Fila { t: Tarea; p: Parada; minutos: number }

export default function AlertaParadas({ compacto = false }: { compacto?: boolean }) {
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), []) ?? []
  const nombreMaquina = useMemo(() => {
    const m = new Map(maquinas.map((x) => [x.id, x.nombre]))
    return (id: string) => m.get(id) ?? id
  }, [maquinas])

  const [abierto, setAbierto] = useState(false)
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(id) }, [])
  const ahoraISO = new Date(ahora).toISOString()

  const { filas, porCausa } = useMemo(() => {
    const out: Fila[] = []
    for (const t of tareas) {
      if (t.estado !== 'pausada') continue
      const abiertaP = t.paradas.find((p) => !p.fin)
      // Las de logistica ya las muestra AlertaMaterial, arriba de este cartel.
      if (!abiertaP || esCausaLogistica(abiertaP.causa)) continue
      out.push({ t, p: abiertaP, minutos: calcularTiempoProductivo(abiertaP.inicio, ahoraISO) })
    }
    // Mas vieja primero: la que lleva mas horas de planta parada es la urgente.
    out.sort((a, b) => b.minutos - a.minutos)

    const agr = new Map<string, number>()
    for (const f of out) {
      const k = causaLabel(f.p.causa)
      agr.set(k, (agr.get(k) ?? 0) + 1)
    }
    const porCausa = [...agr.entries()]
      .map(([causa, n]) => ({ causa, n }))
      .sort((a, b) => b.n - a.n)
    return { filas: out, porCausa }
  }, [tareas, ahoraISO])

  if (filas.length === 0) return compacto ? null : <div className="logi-ok">✓ Sin otras paradas abiertas.</div>

  return (
    <div className="paradas-alert" style={compacto ? { marginBottom: 14 } : undefined}>
      <div className="paradas-alert-head">
        <span>⏸ {filas.length} tarea(s) en parada por otras causas</span>
        <button type="button" className="paradas-alert-toggle" onClick={() => setAbierto((v) => !v)}>
          {abierto ? 'Ocultar detalle' : 'Ver detalle'}
        </button>
      </div>

      {/* Resumen siempre visible: de un vistazo se ve si son 8 de "ayuda en el
          sector" (problema de dotacion) o 8 de "falta herramienta" (panol). */}
      <div className="paradas-alert-chips">
        {porCausa.map(({ causa, n }) => (
          <span className="paradas-chip" key={causa}>{causa} <strong>{n}</strong></span>
        ))}
      </div>

      {abierto && (
        <div className="paradas-alert-list">
          {filas.map(({ t, p, minutos }) => (
            <div className="paradas-alert-item" key={t.id}>
              <div className="paradas-alert-maq">{nombreMaquina(t.maquinaId)}</div>
              <div className="paradas-alert-sec">{sectorById(t.sectorId).nombre}</div>
              <div className="paradas-alert-causa">{causaLabel(p.causa)}</div>
              {/* Fecha ademas de la hora: una parada puede llevar dias abierta. */}
              <div className="paradas-alert-desde">
                desde {new Date(p.inicio).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })} {hhmm(p.inicio)}
              </div>
              <div className="paradas-alert-time">{fmtDur(minutos)} de planta</div>
              <div className="paradas-alert-det">
                {t.modelo}{t.nroTransformador ? ` · TR ${t.nroTransformador}` : ''}
                {p.observacion ? <> · <em>{p.observacion}</em></> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
