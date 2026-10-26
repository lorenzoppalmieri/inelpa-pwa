// ============================================================
// v2.42 — ¿En qué entorno corre la app?
//
// Producción no define VITE_ENTORNO. El entorno de prueba (Vercel "staging",
// apuntado al proyecto Supabase de test) define VITE_ENTORNO=test.
//
// Para qué: que nadie confunda la PWA de prueba con la de planta. Las dos son
// visualmente idénticas; si alguien planifica en la de prueba creyendo que es
// la real, la planta pierde ese trabajo. Ver docs/ENTORNO_TEST.md.
// ============================================================
import { esEntornoDePrueba } from './entornoRegla'

export { esEntornoDePrueba }

export const ES_ENTORNO_PRUEBA = esEntornoDePrueba(import.meta.env.VITE_ENTORNO)
