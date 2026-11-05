import { useEffect, useState, type ReactNode } from 'react'

// ============================================================
// CONFIRMACIÓN DE ACCIÓN (v2.45) — tarjeta del operario.
//
// Reclamo de planta (5/11/2026): trabajando, los operarios tocan la tablet sin
// querer y arrancan una tarea que no era, inician una parada o la finalizan.
// Cada acción de la tarjeta pasa ahora por esta pregunta, con el DETALLE de la
// pieza a la vista (OF, semielaborado, N° de trafo) para que el operario
// verifique que es la correcta antes de confirmar.
//
// Botones grandes (tablet con guantes) y una trampa contra el doble toque: el
// botón de confirmar recién se habilita a los 0,6 s. Sin eso, un segundo toque
// accidental sobre el mismo lugar de la pantalla confirmaba al instante y la
// confirmación no servía de nada.
// ============================================================
const ARMADO_MS = 600

export type TonoConfirmacion = 'primary' | 'naranja' | 'verde'

export default function ConfirmarAccion({ titulo, detalle, textoSi, textoNo = 'Cancelar', tono = 'primary', onSi, onNo }: {
  titulo: string
  detalle?: ReactNode
  textoSi: string
  textoNo?: string
  tono?: TonoConfirmacion
  onSi: () => void
  onNo: () => void
}) {
  const [armado, setArmado] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setArmado(true), ARMADO_MS)
    return () => clearTimeout(id)
  }, [])

  const claseSi = tono === 'verde' ? 'btn-verde' : tono === 'naranja' ? 'btn-naranja' : 'btn-primary'

  return (
    <div className="modal-overlay" onClick={onNo}>
      <div className="modal confirmar-accion" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <h2 className="confirmar-titulo">{titulo}</h2>
        {detalle && <div className="confirmar-detalle">{detalle}</div>}
        <div className="confirmar-botones">
          <button className="btn confirmar-btn" onClick={onNo}>{textoNo}</button>
          <button className={'btn confirmar-btn ' + claseSi} disabled={!armado} onClick={() => armado && onSi()}>
            {textoSi}
          </button>
        </div>
      </div>
    </div>
  )
}
