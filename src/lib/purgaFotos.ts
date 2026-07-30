import type { DespachoTrafo } from '../types'

// ============================================================
// PURGA DE FOTOS DE DESPACHO (v1.46) — control de costo de storage.
//
// Las fotos del embalaje son evidencia útil MIENTRAS el trafo está en juego: si
// el cliente reclama un golpe o un faltante, se miran. Pasado un tiempo
// razonable desde la entrega nadie las vuelve a abrir, pero se siguen pagando
// todos los meses. A los 3 meses de ENTREGADO se borran del bucket.
//
// Qué NO se borra:
//   · nada que no esté en estado 'entregado' (sigue el proceso abierto)
//   · nada sin fecha de entrega (no se puede medir la antigüedad)
//   · nada entregado hace menos de 90 días
//
// En lugar de las fotos queda `fotosPurgadas` = { fecha, cantidad }: así la
// ficha puede decir "3 fotos eliminadas por antigüedad" y no confundir un
// borrado deliberado con un embalaje que nunca se fotografió.
// ============================================================

/** Días desde la entrega a partir de los cuales las fotos se borran. */
export const DIAS_RETENCION_FOTOS = 90

/**
 * Deriva el path dentro del bucket a partir de la URL pública.
 * Supabase publica en `.../storage/v1/object/public/<bucket>/<path>`.
 * Devuelve undefined si la URL no pertenece al bucket (no se toca nada ajeno).
 */
export function pathDesdeUrl(url: string, bucket: string): string | undefined {
  const marca = `/${bucket}/`
  const i = url.indexOf(marca)
  if (i === -1) return undefined
  const path = url.slice(i + marca.length).split('?')[0]
  return path ? decodeURIComponent(path) : undefined
}

/** ¿A este despacho ya le corresponde perder las fotos? */
export function correspondePurgar(d: DespachoTrafo, ahora: number, dias = DIAS_RETENCION_FOTOS): boolean {
  if (d.estado !== 'entregado') return false
  if (!d.entregadaEn) return false
  if (!d.fotos?.length) return false
  const transcurridos = (ahora - Date.parse(d.entregadaEn)) / 86400000
  return transcurridos >= dias
}

/** Despachos cuyas fotos ya vencieron. */
export function despachosAPurgar(despachos: DespachoTrafo[], ahora = Date.now(), dias = DIAS_RETENCION_FOTOS): DespachoTrafo[] {
  return despachos.filter((d) => correspondePurgar(d, ahora, dias))
}

/** Cómo queda el registro después de borrarle las fotos. */
export function despachoPurgado(d: DespachoTrafo, fechaISO = new Date().toISOString()): DespachoTrafo {
  const cantidad = (d.fotos?.length ?? 0) + (d.fotosPurgadas?.cantidad ?? 0)
  return { ...d, fotos: undefined, fotosPurgadas: { fecha: fechaISO, cantidad } }
}

/** Texto para la ficha. undefined si a este trafo no se le purgó nada. */
export function leyendaPurga(d: DespachoTrafo, fmtFecha: (iso: string) => string): string | undefined {
  if (!d.fotosPurgadas) return undefined
  const { cantidad, fecha } = d.fotosPurgadas
  return `${cantidad} foto${cantidad === 1 ? '' : 's'} eliminada${cantidad === 1 ? '' : 's'} por antigüedad el ${fmtFecha(fecha)} (política: ${DIAS_RETENCION_FOTOS} días desde la entrega).`
}
