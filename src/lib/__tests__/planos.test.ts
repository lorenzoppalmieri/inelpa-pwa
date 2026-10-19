import { describe, expect, it, vi } from 'vitest'

// La capa de planos importa el cliente de Supabase; acá solo se prueban las
// funciones puras, así que se lo reemplaza por "sin conexión".
vi.mock('../supabaseClient', () => ({ supabase: null }))

import { codigoEnNombre, codigoPorDescripcion, extraerRevision, normalizarTexto, rutaPlano } from '../planos'

// ============================================================
// v2.38 — Reconocer a qué semielaborado va cada PDF por su nombre.
// La misma lógica la usa scripts/cargar_planos.mjs para la carga masiva.
// Regla: nunca adivinar por parecido. O el código / la descripción está
// entero, o no hay match (y el archivo va a la planilla para completar a mano).
// ============================================================
const CODIGOS = new Set(['CUBDIS0000001', 'CUBDIS0000019', 'TAPDIS0000004'])
const CATALOGO = [
  { codigo: 'CUBDIS0000001', descripcion: 'Cuba Distribucion Trifasica Monoposte 16/13 Cu' },
  { codigo: 'CUBDIS0000019', descripcion: 'Cuba Distribucion Trifasica Monoposte 16/13 Al' },
  { codigo: 'DUP0000000001', descripcion: 'Tapa Comun' },
  { codigo: 'DUP0000000002', descripcion: 'Tapa común' },
]

describe('código SAP en el nombre del archivo', () => {
  it('lo encuentra solo, con revisión o con prefijos', () => {
    expect(codigoEnNombre('CUBDIS0000001.pdf', CODIGOS)).toBe('CUBDIS0000001')
    expect(codigoEnNombre('CUBDIS0000001 Rev B.pdf', CODIGOS)).toBe('CUBDIS0000001')
    expect(codigoEnNombre('Plano_cubdis0000019_v2.PDF', CODIGOS)).toBe('CUBDIS0000019')
    expect(codigoEnNombre('C:\\planos\\herreria\\TAPDIS0000004-revA.pdf', CODIGOS)).toBe('TAPDIS0000004')
  })

  it('no inventa: un código incompleto o desconocido no matchea', () => {
    expect(codigoEnNombre('CUBDIS000000.pdf', CODIGOS)).toBeUndefined()
    expect(codigoEnNombre('CUBDIS0000099.pdf', CODIGOS)).toBeUndefined()
    expect(codigoEnNombre('Cuba 315-13 Cu.pdf', CODIGOS)).toBeUndefined()
  })
})

describe('nombre igual a la descripción del catálogo', () => {
  it('matchea aunque el archivo no pueda tener "/" ni acentos', () => {
    expect(codigoPorDescripcion('Cuba Distribucion Trifasica Monoposte 16-13 Cu.pdf', CATALOGO)).toBe('CUBDIS0000001')
    expect(codigoPorDescripcion('cuba distribución trifásica monoposte 16_13 al Rev C.pdf', CATALOGO)).toBe('CUBDIS0000019')
  })

  it('si dos descripciones quedan iguales, no elige ninguna', () => {
    expect(codigoPorDescripcion('Tapa comun.pdf', CATALOGO)).toBeUndefined()
  })

  it('un nombre parecido pero distinto no matchea', () => {
    expect(codigoPorDescripcion('Cuba Distribucion Trifasica 16-13 Cu.pdf', CATALOGO)).toBeUndefined()
  })
})

describe('revisión escrita en el nombre', () => {
  it('reconoce las formas habituales', () => {
    expect(extraerRevision('CUBDIS0000001 Rev B.pdf')).toBe('B')
    expect(extraerRevision('plano rev.02.pdf')).toBe('02')
    expect(extraerRevision('PL-0452_REV_C.pdf')).toBe('C')
    expect(extraerRevision('Cuba Revisión 3.pdf')).toBe('3')
  })

  it('no confunde palabras que empiezan con "rev"', () => {
    expect(extraerRevision('Tapa reversible.pdf')).toBeUndefined()
    expect(extraerRevision('Revestimiento cuba.pdf')).toBeUndefined()
    expect(extraerRevision('CUBDIS0000001.pdf')).toBeUndefined()
  })
})

describe('ruta dentro del bucket', () => {
  it('sin espacios, acentos ni barras, y única por subida', () => {
    const a = rutaPlano('Cuba Distribución 16/13 Cu.pdf', '11111111-2222-3333-4444-555555555555')
    expect(a).toMatch(/^subidos\/[a-z0-9-]+_[0-9a-f]{10}\.pdf$/)
    expect(rutaPlano('x.pdf', 'aaaaaaaa-0000')).not.toBe(rutaPlano('x.pdf', 'bbbbbbbb-0000'))
  })

  it('normalizarTexto deja solo letras y números separados por un espacio', () => {
    expect(normalizarTexto('  Cuba  Distribución 16/13-Cu ')).toBe('cuba distribucion 16 13 cu')
  })
})
