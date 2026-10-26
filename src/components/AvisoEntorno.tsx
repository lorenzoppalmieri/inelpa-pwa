import { ES_ENTORNO_PRUEBA } from '../lib/entorno'

// ============================================================
// v2.42 — Pestaña fija "ENTORNO DE PRUEBA" arriba al centro.
//
// Solo se dibuja en el entorno de prueba: en producción devuelve null y no
// agrega ni un nodo al DOM (escritorio y tablets de planta intactos).
// pointer-events: none -> nunca tapa un botón ni roba un toque.
// Se monta fuera de <App/> para que también se vea en el login.
// ============================================================
export default function AvisoEntorno() {
  if (!ES_ENTORNO_PRUEBA) return null
  return (
    <div className="aviso-entorno" role="status" aria-label="Entorno de prueba: los datos no son los de planta">
      ENTORNO DE PRUEBA · no es la PWA de planta
    </div>
  )
}
