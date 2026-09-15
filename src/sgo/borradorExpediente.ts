// Conserva los campos editados del caso e incorpora los guardados en el expediente.
// Los arrays son valores completos: no se mezclan índices de evidencias.
export function reconciliarBorrador<T>(base: T, borrador: T, actual: T): T {
  if (JSON.stringify(borrador) === JSON.stringify(base)) return actual
  if (JSON.stringify(actual) === JSON.stringify(base)) return borrador
  const objeto = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
  if (!objeto(base) || !objeto(borrador) || !objeto(actual)) return borrador
  const resultado: Record<string, unknown> = {}
  for (const campo of new Set([...Object.keys(base), ...Object.keys(borrador), ...Object.keys(actual)])) {
    const valor = reconciliarBorrador(base[campo], borrador[campo], actual[campo])
    if (valor !== undefined) resultado[campo] = valor
  }
  return resultado as T
}
