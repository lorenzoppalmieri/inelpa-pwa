import { useEffect, useState, type ReactNode } from 'react'
import { useEsMovil } from '../../lib/useEsMovil'

// ============================================================
// FILTROS ADAPTATIVOS (v1.56)
//
// En ESCRITORIO no cambia nada: renderiza los filtros tal cual, en línea.
// En MÓVIL los esconde detrás de un botón "Filtros" y los muestra en un drawer
// que sube desde abajo, con un botón grande para aplicar y cerrar.
//
// Se usa envolviendo la barra de filtros que ya existe:
//   <FiltrosMovil>  ...los selects de siempre...  </FiltrosMovil>
// ============================================================
export default function FiltrosMovil({ children, titulo = 'Filtros', activos = 0 }: {
  children: ReactNode
  titulo?: string
  /** Cantidad de filtros distintos del default, para mostrar el globo con el número. */
  activos?: number
}) {
  const esMovil = useEsMovil()
  const [abierto, setAbierto] = useState(false)

  // Con el drawer abierto se bloquea el scroll del fondo (comportamiento de app).
  useEffect(() => {
    if (!abierto) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [abierto])

  // Cerrar con la tecla Escape.
  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto])

  // Escritorio: exactamente el comportamiento anterior.
  if (!esMovil) return <div className="filtros no-print">{children}</div>

  return (
    <>
      <button className="btn btn-bloque no-print" style={{ marginBottom: 10 }} onClick={() => setAbierto(true)}>
        <span>🔎 {titulo}</span>
        {activos > 0 && <span className="sem-badge" style={{ marginLeft: 8 }}>{activos}</span>}
      </button>

      {abierto && (
        <div className="drawer-overlay" onClick={() => setAbierto(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
            <div className="drawer-asa" />
            <div className="section-title" style={{ marginTop: 0 }}>{titulo}</div>
            <div className="drawer-body">{children}</div>
            <button className="btn btn-primary btn-bloque" onClick={() => setAbierto(false)}>
              Ver resultados
            </button>
          </div>
        </div>
      )}
    </>
  )
}
