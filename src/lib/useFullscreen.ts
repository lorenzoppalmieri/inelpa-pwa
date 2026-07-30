import { useCallback, useEffect, useState } from 'react'

// ============================================================
// PANTALLA COMPLETA (v1.57)
//
// Envuelve la Fullscreen API del navegador con los prefijos que todavía hacen
// falta (Safari usa webkit*). Devuelve el estado real leído del navegador, no
// una copia nuestra: así el botón queda sincronizado aunque el usuario salga con
// F11 o con Escape, que es el caso que rompe las implementaciones ingenuas.
//
// LIMITACIÓN REAL: Safari en iPhone NO soporta la Fullscreen API (sí iPad).
// En ese caso `soportado` es false y el botón se esconde; en iOS el equivalente
// es instalar la PWA en la pantalla de inicio, que ya corre sin barras.
// ============================================================

// Métodos con prefijo que no están en los tipos estándar de TypeScript.
interface DocConPrefijos extends Document {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  msFullscreenElement?: Element | null
  msExitFullscreen?: () => Promise<void> | void
}
interface ElConPrefijos extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
  msRequestFullscreen?: () => Promise<void> | void
}

function elementoActual(): Element | null {
  const d = document as DocConPrefijos
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? d.msFullscreenElement ?? null
}

function haySoporte(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.documentElement as ElConPrefijos
  return Boolean(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)
}

export interface EstadoFullscreen {
  activo: boolean
  soportado: boolean
  /** true si la PWA ya corre instalada (sin barras del navegador). */
  instalada: boolean
  alternar: () => Promise<void>
}

export function useFullscreen(): EstadoFullscreen {
  const [activo, setActivo] = useState(() => !!elementoActual())
  const [soportado] = useState(haySoporte)
  const [instalada] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
  )

  // El navegador es la fuente de verdad: escuchamos su evento en vez de asumir
  // que nuestro toggle funcionó (el usuario puede salir con Escape o F11).
  useEffect(() => {
    const sincronizar = () => setActivo(!!elementoActual())
    document.addEventListener('fullscreenchange', sincronizar)
    document.addEventListener('webkitfullscreenchange', sincronizar)
    sincronizar()
    return () => {
      document.removeEventListener('fullscreenchange', sincronizar)
      document.removeEventListener('webkitfullscreenchange', sincronizar)
    }
  }, [])

  const alternar = useCallback(async () => {
    const d = document as DocConPrefijos
    try {
      if (elementoActual()) {
        await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.() ?? d.msExitFullscreen?.())
      } else {
        const el = document.documentElement as ElConPrefijos
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.() ?? el.msRequestFullscreen?.())
      }
    } catch {
      // El navegador puede rechazarlo (ej. si no viene de un gesto del usuario).
      // No se rompe nada: el evento fullscreenchange deja el estado consistente.
    }
  }, [])

  return { activo, soportado, instalada, alternar }
}
