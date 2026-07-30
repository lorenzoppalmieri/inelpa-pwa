import { useFullscreen } from '../../lib/useFullscreen'

// ============================================================
// BOTÓN DE PANTALLA COMPLETA (v1.57)
//
// Toggle Maximize <-> Minimize. Los iconos son los paths de Lucide
// ("maximize" y "minimize") dibujados inline: se ven idénticos y no agregan
// una dependencia al bundle (el proyecto no tiene librería de iconos).
//
// Si el navegador no soporta la API (Safari en iPhone), el botón no se muestra:
// más vale no ofrecer algo que no va a funcionar.
// ============================================================

function IconoMaximizar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

function IconoMinimizar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

export default function BotonFullscreen() {
  const { activo, soportado, alternar } = useFullscreen()

  if (!soportado) return null

  const etiqueta = activo ? 'Salir de pantalla completa' : 'Pantalla completa'

  return (
    <button
      className={'btn btn-fs' + (activo ? ' activo' : '')}
      onClick={() => void alternar()}
      title={`${etiqueta} (o tecla F11)`}
      aria-label={etiqueta}
      aria-pressed={activo}
    >
      {activo ? <IconoMinimizar /> : <IconoMaximizar />}
    </button>
  )
}
