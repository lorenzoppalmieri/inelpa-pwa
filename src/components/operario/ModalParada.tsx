import { useEffect, useMemo, useState } from 'react'
import {
  causasDeSector, CATEGORIA_LABEL, areaDemora, esCausaRetrabajo, contarPalabras,
  MAX_PALABRAS_RETRABAJO,
  type CausaParada, type CategoriaParada, type CausaParadaDef, type SectorId,
} from '../../types'
import { dentroVentanaAlmuerzo, ventanaAlmuerzoTexto } from '../../lib/calendario'

// v1.92: el ALMUERZO solo se puede registrar entre las 12 y las 13 (regla de
// planta: son 30 minutos). Antes un operario salía a comprar comida y lo marcaba
// a las 11:45, sumando 45' de pausa no productiva. Solo aplica a esta causa: una
// rotura o una falta de material se registran a cualquier hora.
const CAUSA_ALMUERZO = 'almuerzo'

// Normaliza para buscar sin acentos ni mayusculas.
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Orden de categorias en el modal.
// v1.88: 'laboratorio' va despues de 'calidad'. Sin agregarlo aca, las causas de
// esa categoria NO se dibujan: el modal solo pinta los grupos que estan en esta
// lista, no todos los que existan en el catalogo.
const ORDEN_CAT: CategoriaParada[] = ['material', 'logistica', 'maquina', 'personal', 'calidad', 'laboratorio', 'no_productiva', 'otra']

export default function ModalParada({ sectorId, onConfirm, onCancel }: {
  sectorId: SectorId
  onConfirm: (causa: CausaParada, obs: string) => void
  onCancel: () => void
}) {
  const [causa, setCausa] = useState<CausaParada | null>(null)
  const [obs, setObs] = useState('')
  const [q, setQ] = useState('')
  // Se refresca solo: si el operario abre el modal a las 11:59 y confirma a las
  // 12:01, el botón se habilita sin que tenga que cerrar y volver a abrir.
  const [almuerzoOk, setAlmuerzoOk] = useState(() => dentroVentanaAlmuerzo())
  useEffect(() => {
    const id = setInterval(() => setAlmuerzoOk(dentroVentanaAlmuerzo()), 20000)
    return () => clearInterval(id)
  }, [])
  const bloqueada = (c: CausaParada) => c === CAUSA_ALMUERZO && !almuerzoOk
  // En Montaje el operario NO escribe observación (solo elige la causa).
  // v1.94: salvo en RETRABAJO — ahí sí escribe, como en el resto de la planta.
  const esMontaje = areaDemora(sectorId) === 'montaje'

  // v1.94: la explicación es OBLIGATORIA en los retrabajos y tiene tope de
  // palabras. La parada abre sola una no conformidad y Lara la investiga sin
  // haber estado en planta: sin esta línea, arranca a ciegas.
  const retrabajo = !!causa && esCausaRetrabajo(causa)
  const palabras = contarPalabras(obs)
  const seExcede = retrabajo && palabras > MAX_PALABRAS_RETRABAJO
  const faltaTexto = retrabajo && palabras === 0
  const obsInvalida = seExcede || faltaTexto

  // Causas de la SECCION del operario (+ globales) -> filtro por texto -> agrupa.
  const grupos = useMemo(() => {
    const base = causasDeSector(sectorId)
    const qn = norm(q.trim())
    const filtradas = qn
      ? base.filter((c) => norm(c.label).includes(qn) || String(c.codigo ?? '').includes(qn))
      : base
    const out: { cat: CategoriaParada; items: CausaParadaDef[] }[] = []
    for (const cat of ORDEN_CAT) {
      const items = filtradas.filter((c) => c.categoria === cat)
      if (items.length) out.push({ cat, items })
    }
    return out
  }, [q, sectorId])

  const total = grupos.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="modal-overlay" onClick={onCancel}>
      {/* v1.78: modal de alto acotado. Cabecera y pie fijos; la lista de causas
          es la unica zona que scrollea. Antes, en tablet APAISADA el pie
          (observacion + boton "Iniciar parada") quedaba fuera de la pantalla y
          el operario no podia confirmar la parada. */}
      <div className="modal modal-flex" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Registrar parada</h2>
          <p className="meta" style={{ marginBottom: 12 }}>Busca o elige la causa. La hora de inicio se registra automaticamente.</p>

          <div className="field">
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="🔍 Buscar causa (ej. alambre, mantenimiento, retrabajo)…"
              autoFocus
            />
          </div>
        </div>

        <div className="causa-scroll modal-cuerpo">
          {total === 0 && <div className="empty" style={{ padding: '20px 0' }}>Sin resultados para "{q}".</div>}
          {grupos.map((g) => (
            <div key={g.cat} style={{ marginBottom: 12 }}>
              <div className="causa-cat">{CATEGORIA_LABEL[g.cat]}</div>
              <div className="causa-grid">
                {g.items.map((c) => (
                  <button
                    key={c.id}
                    className={'causa-btn' + (causa === c.id ? ' sel' : '') + (bloqueada(c.id) ? ' fuera-ventana' : '')}
                    disabled={bloqueada(c.id)}
                    title={bloqueada(c.id) ? `El almuerzo se registra entre las ${ventanaAlmuerzoTexto()}.` : undefined}
                    onClick={() => setCausa(c.id)}
                  >
                    {c.label}
                    {bloqueada(c.id) && <span className="causa-bloqueo">🔒 solo {ventanaAlmuerzoTexto()}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-pie">
          {/* v1.94: en RETRABAJO el campo aparece siempre (también en Montaje) y
              es obligatorio, con tope de palabras. En el resto sigue como antes. */}
          {retrabajo ? (
            <div className="field" style={{ marginBottom: 8 }}>
              <label>¿Qué pasó? — máximo {MAX_PALABRAS_RETRABAJO} palabras *</label>
              <input
                className={'input' + (seExcede ? ' input-error' : '')}
                value={obs} autoFocus
                onChange={(e) => setObs(e.target.value)}
                placeholder="ej. se pasó de vueltas la capa 3"
              />
              <div className="retrabajo-ayuda">
                <span className={seExcede ? 'excedido' : ''}>{palabras} / {MAX_PALABRAS_RETRABAJO} palabras</span>
                {seExcede
                  ? <strong> · Pasaste el límite: contá qué pasó en {MAX_PALABRAS_RETRABAJO} palabras o menos.</strong>
                  : faltaTexto
                    ? <span> · Escribí en pocas palabras qué pasó. Va al informe de calidad.</span>
                    : <span> · Esto lo va a leer quien investigue el retrabajo.</span>}
              </div>
            </div>
          ) : !esMontaje && (
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Observacion (opcional)</label>
              <input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="detalle..." />
            </div>
          )}
          {/* Validación FINAL: el botón puede haberse seleccionado dentro de la
              ventana y confirmarse fuera. Acá se decide de verdad. */}
          {causa && bloqueada(causa) && (
            <div className="meta" style={{ color: 'var(--rojo)', fontWeight: 700, marginBottom: 8 }}>
              🔒 El almuerzo se registra entre las {ventanaAlmuerzoTexto()}. Son 30 minutos.
            </div>
          )}
          <div className="row-actions">
            <button className="btn" style={{ flex: 1 }} onClick={onCancel}>Cancelar</button>
            <button className="btn btn-naranja" style={{ flex: 1 }} disabled={!causa || bloqueada(causa) || obsInvalida}
              onClick={() => causa && !bloqueada(causa) && !obsInvalida && onConfirm(causa, obs)}>Iniciar parada</button>
          </div>
        </div>
      </div>
    </div>
  )
}
