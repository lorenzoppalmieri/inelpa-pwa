import { ESTADOS, ESTADO_ORDEN } from './estado'

// ============================================================
// LEYENDA FIJA DEL SEMAFORO (P9) — los 4 estados canonicos con su
// color y palabra de planta. Se muestra en el TableroOT; el SCADA y
// el mapa tienen la suya con conteos (misma fuente ESTADOS).
// ============================================================

export default function LeyendaSemaforo() {
  return (
    <div className="mant-leyenda-semaforo no-print" aria-label="Leyenda del semáforo de estados">
      {ESTADO_ORDEN.map((id) => (
        <span key={id} className="mant-chip" title={ESTADOS[id].label}>
          <i style={{ background: ESTADOS[id].color }} />
          {ESTADOS[id].label}
        </span>
      ))}
    </div>
  )
}
