import { useEffect, useState } from 'react'

// ============================================================
// ¿Estamos en pantalla de celular? (v1.56)
//
// Mismo umbral que el CSS (768px) para que JS y estilos no se contradigan.
// Usa matchMedia y escucha los cambios, así rotar el teléfono o redimensionar
// la ventana en la compu recalcula sin recargar.
// ============================================================
export const CORTE_MOVIL = 768

export function useEsMovil(corte = CORTE_MOVIL): boolean {
  const [esMovil, setEsMovil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${corte}px)`).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${corte}px)`)
    const onChange = (e: MediaQueryListEvent) => setEsMovil(e.matches)
    mq.addEventListener('change', onChange)
    setEsMovil(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [corte])

  return esMovil
}
