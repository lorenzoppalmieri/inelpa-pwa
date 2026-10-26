// ============================================================
// v2.42 — Regla ÚNICA para decidir si un valor de VITE_ENTORNO es "prueba".
//
// Archivo sin import.meta a propósito: lo usan la app (src/lib/entorno.ts) y
// también vite.config.ts al armar el manifest, que corre en Node durante el
// build. Un cálculo, una sola función.
// ============================================================

/** true si el valor de VITE_ENTORNO indica el entorno de prueba. */
export function esEntornoDePrueba(valor: string | undefined | null): boolean {
  return ['test', 'prueba', 'staging'].includes((valor ?? '').trim().toLowerCase())
}
