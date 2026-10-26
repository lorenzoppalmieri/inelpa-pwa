import { describe, expect, it, vi } from 'vitest'
import {
  MAX_ITEMS_POR_ENVIO, normalizarFecha, validarArticulo, validarLote, validarOrden,
  type ArticuloSap, type OrdenSap,
} from '../sapContrato.ts'
import { crearHandler, tokenValido, type ResultadoItem } from '../sapHandler.ts'

// ============================================================
// v2.40 — Contrato de entrada SAP -> PWA (endpoints sap-articulos y sap-ordenes).
// La escritura en la base (funciones SQL) se probo aparte contra Postgres real;
// aca se prueba todo lo que pasa ANTES de tocar la base: validacion, lote,
// token y la semantica HTTP del handler.
// ============================================================

const TRAFO = 'TTD13V0000001'
const articuloOk = (extra: Record<string, unknown> = {}) => ({
  itemCode: TRAFO, itemName: 'TTD 16/13 - Tanque Expansion - Plataforma - Cobre', itemType: 'PT',
  uom: 'UN', active: true, defaultWarehouse: '03', hasBatch: false, ...extra,
})
const ordenOk = (extra: Record<string, unknown> = {}) => ({
  docEntry: 425, docNum: '257', parentDocEntry: null, itemCode: 'BOBALT0000109',
  plannedQty: 1, uom: 'UN', dueDate: '2026-11-06', startDate: '2026-10-29', warehouse: '03', status: 'R', ...extra,
})

describe('validarArticulo', () => {
  it('acepta un PT con receta y la normaliza', () => {
    const r = validarArticulo(articuloOk({ bom: [{ itemCode: 'BOBALT0000109', quantity: '1', uom: 'UN' }] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor.bom).toEqual([{ itemCode: 'BOBALT0000109', quantity: 1, uom: 'UN' }])
  })

  it('sin "bom" (o bom null) NO toca la receta: el campo queda ausente', () => {
    for (const extra of [{}, { bom: null }]) {
      const r = validarArticulo(articuloOk(extra))
      expect(r.ok).toBe(true)
      if (r.ok) expect('bom' in r.valor).toBe(false)
    }
  })

  it('bom: [] es un vaciado explicito de la receta', () => {
    const r = validarArticulo(articuloOk({ bom: [] }))
    expect(r.ok && r.valor.bom).toEqual([])
  })

  it('entiende los booleanos del Service Layer (tYES/tNO, Y/N) y el tipo en minusculas', () => {
    const r = validarArticulo(articuloOk({ active: 'tYES', hasBatch: 'N', itemType: 'se' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect([r.valor.active, r.valor.hasBatch, r.valor.itemType]).toEqual([true, false, 'SE'])
  })

  it('rechaza tipo invalido, codigo faltante y booleanos ausentes, juntando todos los motivos', () => {
    const r = validarArticulo({ itemName: 'x', itemType: 'ZZ' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.id).toBeNull()
      expect(r.errores.join(' | ')).toMatch(/itemCode: es obligatorio/)
      expect(r.errores.join(' | ')).toMatch(/itemType: tiene que ser PT, SE o MP/)
      expect(r.errores.join(' | ')).toMatch(/active: es obligatorio/)
    }
  })

  it('rechaza una receta autorreferente, cantidades no positivas y bom que no es lista', () => {
    expect(validarArticulo(articuloOk({ bom: [{ itemCode: TRAFO, quantity: 1 }] })).ok).toBe(false)
    expect(validarArticulo(articuloOk({ bom: [{ itemCode: 'X', quantity: 0 }] })).ok).toBe(false)
    expect(validarArticulo(articuloOk({ bom: [{ itemCode: 'X', quantity: -2 }] })).ok).toBe(false)
    expect(validarArticulo(articuloOk({ bom: { itemCode: 'X' } })).ok).toBe(false)
  })

  it('acepta cantidades decimales en la receta (kilos de alambre)', () => {
    const r = validarArticulo(articuloOk({ itemType: 'SE', bom: [{ itemCode: 'ALAMBRE01', quantity: '12.75', uom: 'KG' }] }))
    expect(r.ok && r.valor.bom?.[0].quantity).toBe(12.75)
  })

  it('rechaza un ItemCode de mas de 50 caracteres (limite de SAP B1)', () => {
    expect(validarArticulo(articuloOk({ itemCode: 'X'.repeat(51) })).ok).toBe(false)
  })
})

describe('validarOrden', () => {
  it('acepta una orden liberada y la normaliza', () => {
    const r = validarOrden(ordenOk({ docEntry: '425', docNum: 257, plannedQty: '5' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor).toMatchObject({ docEntry: 425, docNum: '257', plannedQty: 5, status: 'R', parentDocEntry: null })
  })

  it('acepta el estado del Service Layer (boposReleased) y fechas con hora', () => {
    const r = validarOrden(ordenOk({ status: 'boposReleased', dueDate: '2026-11-06T00:00:00Z' }))
    expect(r.ok && r.valor.dueDate).toBe('2026-11-06')
  })

  it('solo acepta ordenes liberadas', () => {
    for (const status of ['P', 'L', 'C', 'boposPlanned', 'boposClosed', undefined, '']) {
      const r = validarOrden(ordenOk({ status }))
      expect(r.ok, `status=${String(status)}`).toBe(false)
      if (!r.ok) expect(r.errores.join(' ')).toMatch(/liberadas/)
    }
  })

  it('rechaza cantidades no enteras: una orden de 2,5 bobinas no existe', () => {
    const r = validarOrden(ordenOk({ plannedQty: 2.5 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.id).toBe(425)
  })

  it('rechaza fechas imposibles y fecha de entrega faltante', () => {
    expect(validarOrden(ordenOk({ dueDate: '2026-02-30' })).ok).toBe(false)
    expect(validarOrden(ordenOk({ dueDate: '06/11/2026' })).ok).toBe(false)
    expect(validarOrden(ordenOk({ dueDate: undefined })).ok).toBe(false)
  })

  it('rechaza una orden que es su propio padre; acepta padre ausente o null', () => {
    expect(validarOrden(ordenOk({ parentDocEntry: 425 })).ok).toBe(false)
    const sinPadre = validarOrden({ ...ordenOk(), parentDocEntry: undefined })
    expect(sinPadre.ok && sinPadre.valor.parentDocEntry).toBeNull()
    const conPadre = validarOrden(ordenOk({ parentDocEntry: '424' }))
    expect(conPadre.ok && conPadre.valor.parentDocEntry).toBe(424)
  })
})

describe('normalizarFecha', () => {
  it('toma la fecha tal cual, sin mover el dia por zona horaria', () => {
    expect(normalizarFecha('2026-11-06T00:00:00-03:00')).toBe('2026-11-06')
    expect(normalizarFecha('2026-11-06T23:59:59Z')).toBe('2026-11-06')
    expect(normalizarFecha('2028-02-29')).toBe('2028-02-29')
    expect(normalizarFecha('2026-02-29')).toBeNull()
  })
})

describe('validarLote', () => {
  it('rechaza el segundo item repetido dentro del mismo envio y deja pasar el primero', () => {
    const r = validarLote([ordenOk(), ordenOk({ docEntry: 426 }), ordenOk()], validarOrden, (o: OrdenSap) => o.docEntry)
    expect(r.map((x) => x.ok)).toEqual([true, true, false])
    if (!r[2].ok) expect(r[2].errores[0]).toMatch(/posición 0/)
  })
})

describe('tokenValido', () => {
  const T = 'a'.repeat(48)
  it('acepta el token exacto, con "Bearer" en cualquier mayuscula', () => {
    expect(tokenValido(`Bearer ${T}`, T)).toBe(true)
    expect(tokenValido(`bearer   ${T}  `, T)).toBe(true)
  })
  it('rechaza token distinto, de otro largo, sin prefijo o ausente', () => {
    expect(tokenValido(`Bearer ${'b'.repeat(48)}`, T)).toBe(false)
    expect(tokenValido(`Bearer ${T}x`, T)).toBe(false)
    expect(tokenValido(T, T)).toBe(false)
    expect(tokenValido(null, T)).toBe(false)
  })
})

describe('crearHandler (semantica HTTP)', () => {
  const TOKEN = 'k'.repeat(48)
  const auth = { Authorization: `Bearer ${TOKEN}` }
  const post = (body: unknown, headers: Record<string, string> = auth) =>
    new Request('http://x/functions/v1/sap-ordenes', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  const creadas = () => vi.fn(async (v: OrdenSap[]) => v.map((o) => ({ docEntry: o.docEntry, resultado: 'creada' }) as ResultadoItem))
  // OJO: el token va en un objeto y no como parametro con default, porque un
  // default de JS se aplica tambien cuando se pasa undefined a proposito.
  const handler = (escribir = creadas(), cfg: { token: string | undefined } = { token: TOKEN }) =>
    ({ escribir, h: crearHandler<OrdenSap>(
      { nombre: 'sap-ordenes', claveLista: 'ordenes', claveId: 'docEntry', palabraRechazo: 'rechazada', validar: validarOrden, idDe: (o) => o.docEntry },
      { tokenEsperado: cfg.token, escribir },
    ) })

  it('405 si no es POST, 500 si falta configurar el token, 401 si el token no coincide', async () => {
    expect((await handler().h(new Request('http://x', { method: 'GET' }))).status).toBe(405)
    expect((await handler(creadas(), { token: undefined }).h(post({ ordenes: [ordenOk()] }))).status).toBe(500)
    expect((await handler(creadas(), { token: 'corto' }).h(post({ ordenes: [ordenOk()] }))).status).toBe(500)
    expect((await handler().h(post({ ordenes: [ordenOk()] }, { Authorization: 'Bearer otro' }))).status).toBe(401)
    expect((await handler().h(post({ ordenes: [ordenOk()] }, {}))).status).toBe(401)
  })

  it('400 / 413 para sobres invalidos, sin llegar a la base', async () => {
    const { h, escribir } = handler()
    expect((await h(post('{no es json'))).status).toBe(400)
    expect((await h(post({ otraCosa: [] }))).status).toBe(400)
    expect((await h(post([ordenOk()]))).status).toBe(400)
    expect((await h(post({ ordenes: [] }))).status).toBe(400)
    const muchas = Array.from({ length: MAX_ITEMS_POR_ENVIO + 1 }, (_, i) => ordenOk({ docEntry: i + 1 }))
    expect((await h(post({ ordenes: muchas }))).status).toBe(413)
    expect(escribir).not.toHaveBeenCalled()
  })

  it('lote mixto: graba solo los validos, responde 200 y respeta el orden de llegada', async () => {
    const { h, escribir } = handler()
    const res = await h(post({ ordenes: [ordenOk({ docEntry: 1 }), ordenOk({ docEntry: 2, status: 'P' }), ordenOk({ docEntry: 3 })] }))
    expect(res.status).toBe(200)
    expect(escribir).toHaveBeenCalledTimes(1)
    expect(escribir.mock.calls[0][0].map((o) => o.docEntry)).toEqual([1, 3])
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, recibidos: 3, procesados: 2, rechazados: 1, reintentables: 0 })
    expect(body.resultados.map((r: ResultadoItem) => [r.docEntry, r.resultado])).toEqual([[1, 'creada'], [2, 'rechazada'], [3, 'creada']])
    expect(body.resultados[1].reintentable).toBe(false)
  })

  it('cuenta como reintentables los rechazos que la base marca asi (articulo todavia no sincronizado)', async () => {
    const escribir = vi.fn(async (v: OrdenSap[]) => v.map((o) => ({ docEntry: o.docEntry, resultado: 'rechazada', reintentable: true }) as ResultadoItem))
    const body = await (await handler(escribir).h(post({ ordenes: [ordenOk()] }))).json()
    expect(body).toMatchObject({ ok: false, rechazados: 1, reintentables: 1 })
  })

  it('500 reintentable si falla la base o devuelve una cantidad de resultados que no cierra', async () => {
    const falla = vi.fn(async () => { throw new Error('connection refused') })
    const r1 = await handler(falla).h(post({ ordenes: [ordenOk()] }))
    expect(r1.status).toBe(500)
    expect((await r1.json()).reintentable).toBe(true)
    const corta = vi.fn(async () => [] as ResultadoItem[])
    expect((await handler(corta).h(post({ ordenes: [ordenOk()] }))).status).toBe(500)
  })

  it('un lote todo valido responde ok=true', async () => {
    const body = await (await handler().h(post({ ordenes: [ordenOk({ docEntry: 10 }), ordenOk({ docEntry: 11 })] }))).json()
    expect(body).toMatchObject({ ok: true, recibidos: 2, procesados: 2, rechazados: 0 })
  })

  it('el mismo handler sirve para articulos (otra lista, otro id, otra concordancia)', async () => {
    const escribir = vi.fn(async (v: ArticuloSap[]) => v.map((a) => ({ itemCode: a.itemCode, resultado: 'creado' }) as ResultadoItem))
    const h = crearHandler<ArticuloSap>(
      { nombre: 'sap-articulos', claveLista: 'articulos', claveId: 'itemCode', palabraRechazo: 'rechazado', validar: validarArticulo, idDe: (a) => a.itemCode },
      { tokenEsperado: TOKEN, escribir },
    )
    const body = await (await h(post({ articulos: [articuloOk(), { itemCode: 'MALO' }] }))).json()
    expect(body.resultados.map((r: ResultadoItem) => [r.itemCode, r.resultado])).toEqual([[TRAFO, 'creado'], ['MALO', 'rechazado']])
  })
})
