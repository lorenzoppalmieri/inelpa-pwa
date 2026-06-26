import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { Tarea, Parada } from '../../types'
import { sectorById, causaLabel, esCausaLogistica } from '../../types'
import { componentePorCodigo } from '../../data/catalogo'
import { fmtDur, minutosEntre } from '../../lib/time'

// ============================================================
// Alerta de ESPERA DE MATERIAL (abastecimiento). Tareas 'pausada' cuya parada
// abierta es una causa de logistica. La ven logistica, encargados y planificador.
//  - compacto=true: no muestra nada si no hay alertas (para el dashboard).
//  - compacto=false: muestra el cartel verde "sin esperas" (vista logistica).
// ============================================================
export default function AlertaMaterial({ compacto = false }: { compacto?: boolean }) {
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), []) ?? []
  const nombreMaquina = useMemo(() => { const m = new Map(maquinas.map((x) => [x.id, x.nombre])); return (id: string) => m.get(id) ?? id }, [maquinas])

  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(id) }, [])
  const ahoraISO = new Date(ahora).toISOString()

  const alertas = useMemo(() => {
    const out: { t: Tarea; p: Parada }[] = []
    for (const t of tareas) {
      if (t.estado !== 'pausada') continue
      const abierta = t.paradas.find((p) => !p.fin)
      if (abierta && esCausaLogistica(abierta.causa)) out.push({ t, p: abierta })
    }
    out.sort((a, b) => (a.p.inicio < b.p.inicio ? -1 : 1)) // mas vieja primero
    return out
  }, [tareas])

  if (alertas.length === 0) {
    return compacto ? null : <div className="logi-ok">✓ Sin esperas de material en este momento.</div>
  }

  return (
    <div className="logi-alert" style={compacto ? { marginBottom: 14 } : undefined}>
      <div className="logi-alert-head">⚠ {alertas.length} sector(es) esperando material — avisar a logística</div>
      <div className="logi-alert-list">
        {alertas.map(({ t, p }) => {
          const comp = componentePorCodigo(t.componenteCodigo)
          const queMaterial = comp ? comp.descripcion : (t.componenteCodigo || null)
          const transf = t.nroTransformador ? `TR ${t.nroTransformador}` : t.modelo
          return (
            <div className="logi-alert-item" key={t.id}>
              <div className="logi-alert-maq">{nombreMaquina(t.maquinaId)}</div>
              <div className="logi-alert-sec">{sectorById(t.sectorId).nombre}</div>
              <div className="logi-alert-causa">{causaLabel(p.causa)}</div>
              <div className="logi-alert-time">hace {fmtDur(minutosEntre(p.inicio, ahoraISO))}</div>
              <div className="logi-alert-det">
                📦 <strong>{queMaterial ?? 'Material sin especificar'}</strong>
                {transf ? <> · {transf}</> : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
