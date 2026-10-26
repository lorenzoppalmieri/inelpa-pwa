// ============================================================
// HANDLER HTTP COMUN de los endpoints SAP -> PWA            v2.40
//
// Puro: recibe sus dependencias (token esperado, funcion que escribe en la
// base, log) por parametro. Asi se prueba sin Deno ni Supabase, y las dos
// Edge Functions (sap-articulos, sap-ordenes) quedan en 20 lineas cada una.
//
// Semantica de respuesta (igual para los dos endpoints):
//   405  metodo distinto de POST                       -> nada procesado
//   401  token ausente o invalido                      -> nada procesado
//   400  cuerpo no JSON / falta la lista / lista vacia -> nada procesado
//   413  mas de MAX_ITEMS_POR_ENVIO items              -> nada procesado
//   500  fallo la base o falta configuracion           -> nada procesado; reintentar
//        el envio completo es seguro (todo es idempotente)
//   200  lote procesado: el resultado de CADA item va en "resultados",
//        en el mismo orden en que llego. Un item rechazado no frena a los demas.
// ============================================================
import { MAX_ITEMS_POR_ENVIO, validarLote, type Validacion } from './sapContrato.ts'

export interface ResultadoItem {
  resultado: string
  [campo: string]: unknown
}

export interface ConfigEndpoint<T> {
  nombre: string // para el log: 'sap-articulos' | 'sap-ordenes'
  claveLista: string // 'articulos' | 'ordenes'
  claveId: string // 'itemCode' | 'docEntry'
  palabraRechazo: string // 'rechazado' | 'rechazada' (concuerda con la funcion SQL)
  validar: (raw: unknown) => Validacion<T>
  idDe: (v: T) => string | number
}

export interface Dependencias<T> {
  tokenEsperado: string | undefined
  /** Escribe los items validos. Debe devolver un resultado por item, en el mismo orden. */
  escribir: (validos: T[]) => Promise<ResultadoItem[]>
  log?: (linea: string) => void
  ahora?: () => number
}

const LARGO_MINIMO_TOKEN = 32

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/** Compara "Authorization: Bearer <token>" en tiempo constante. */
export function tokenValido(header: string | null, esperado: string): boolean {
  if (!header) return false
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!m) return false
  const a = new TextEncoder().encode(m[1].trim())
  const b = new TextEncoder().encode(esperado)
  // No corta en el primer byte distinto: el tiempo no depende de cuanto acierta.
  let dif = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) dif |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return dif === 0
}

export function crearHandler<T>(cfg: ConfigEndpoint<T>, deps: Dependencias<T>) {
  const log = deps.log ?? (() => {})
  const ahora = deps.ahora ?? (() => Date.now())

  return async (req: Request): Promise<Response> => {
    const t0 = ahora()

    if (req.method !== 'POST') {
      return json(405, { ok: false, error: 'Método no permitido. Usar POST.' })
    }
    if (!deps.tokenEsperado || deps.tokenEsperado.length < LARGO_MINIMO_TOKEN) {
      log(`[${cfg.nombre}] ERROR de configuración: SAP_INTEGRATION_TOKEN ausente o demasiado corto`)
      return json(500, { ok: false, error: 'El endpoint no está configurado (falta el token de integración).', reintentable: false })
    }
    if (!tokenValido(req.headers.get('authorization'), deps.tokenEsperado)) {
      return json(401, { ok: false, error: 'Token inválido o ausente. Enviar el header Authorization: Bearer <token>.' })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return json(400, { ok: false, error: 'El cuerpo no es JSON válido.' })
    }
    const lista = body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)[cfg.claveLista]
      : undefined
    if (!Array.isArray(lista)) {
      return json(400, { ok: false, error: `Se espera un objeto con la lista "${cfg.claveLista}": { "${cfg.claveLista}": [ ... ] }` })
    }
    if (lista.length === 0) {
      return json(400, { ok: false, error: `La lista "${cfg.claveLista}" está vacía.` })
    }
    if (lista.length > MAX_ITEMS_POR_ENVIO) {
      return json(413, { ok: false, error: `Máximo ${MAX_ITEMS_POR_ENVIO} ítems por envío; llegaron ${lista.length}. Partir el lote.` })
    }

    const validaciones = validarLote(lista, cfg.validar, cfg.idDe)
    const validos: T[] = []
    for (const v of validaciones) if (v.ok) validos.push(v.valor)

    let escritos: ResultadoItem[] = []
    if (validos.length > 0) {
      try {
        escritos = await deps.escribir(validos)
      } catch (e) {
        log(`[${cfg.nombre}] ERROR al grabar: ${e instanceof Error ? e.message : String(e)}`)
        return json(500, {
          ok: false,
          error: 'No se pudo grabar en la base. Reintentar el envío completo: es seguro (idempotente).',
          reintentable: true,
        })
      }
      if (!Array.isArray(escritos) || escritos.length !== validos.length) {
        log(`[${cfg.nombre}] ERROR: la base devolvió ${Array.isArray(escritos) ? escritos.length : 'algo inválido'} resultados para ${validos.length} ítems`)
        return json(500, { ok: false, error: 'Respuesta inconsistente de la base. Reintentar el envío.', reintentable: true })
      }
    }

    // Unir validacion + escritura respetando el orden de llegada.
    let j = 0
    const resultados: ResultadoItem[] = validaciones.map((v) =>
      v.ok
        ? escritos[j++]
        : { [cfg.claveId]: v.id, resultado: cfg.palabraRechazo, motivo: v.errores.join('; '), errores: v.errores, reintentable: false },
    )

    const rechazados = resultados.filter((r) => r.resultado === cfg.palabraRechazo)
    const reintentables = rechazados.filter((r) => r.reintentable === true).length
    log(`[${cfg.nombre}] recibidos=${lista.length} rechazados=${rechazados.length} reintentables=${reintentables} ms=${ahora() - t0}`)

    return json(200, {
      ok: rechazados.length === 0,
      recibidos: lista.length,
      procesados: lista.length - rechazados.length,
      rechazados: rechazados.length,
      reintentables,
      resultados,
    })
  }
}
