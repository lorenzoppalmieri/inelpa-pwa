import { describe, it, expect } from 'vitest'
import type { EntregaEpp, ReglaEpp } from '../../types'
import { catalogoEfectivo, idReglaEpp, keyDesdeNombre, puestoEppPorId } from '../catalogo'
import { entregadasEn, entregaReciente, estadoEntrega, puedeGestionarEpp } from '../types'

const regla = (p: Partial<ReglaEpp> & Pick<ReglaEpp, 'ambito' | 'ambitoId' | 'eppKey'>): ReglaEpp => ({
  id: idReglaEpp(p.ambito, p.ambitoId, p.eppKey), actualizadoEn: '2026-11-05T10:00:00Z', ...p,
})
const entrega = (p: Partial<EntregaEpp>): EntregaEpp => ({
  id: crypto.randomUUID(), colaboradorId: 'c1', eppKey: 'guante_vaqueta', anio: 2026, fecha: '2026-11-05T10:00:00Z', ...p,
})

describe('catálogo efectivo (planilla + ajustes HyS)', () => {
  const base = puestoEppPorId('soldadura')!.epps

  it('sin reglas es igual a la planilla', () => {
    const ef = catalogoEfectivo('soldadura', 'c1', [])
    expect(ef.map((e) => [e.key, e.limite])).toEqual(base.map((e) => [e.key, e.limite]))
    expect(ef.every((e) => e.origen === 'catalogo')).toBe(true)
  })

  it('el ajuste por persona gana sobre el del puesto, y solo para esa persona', () => {
    const reglas = [
      regla({ ambito: 'puesto', ambitoId: 'soldadura', eppKey: 'guante_vaqueta', limite: 6 }),
      regla({ ambito: 'colaborador', ambitoId: 'c1', eppKey: 'guante_vaqueta', limite: 10 }),
    ]
    expect(catalogoEfectivo('soldadura', 'c1', reglas).find((e) => e.key === 'guante_vaqueta')).toMatchObject({ limite: 10, origen: 'persona' })
    expect(catalogoEfectivo('soldadura', 'c2', reglas).find((e) => e.key === 'guante_vaqueta')).toMatchObject({ limite: 6, origen: 'puesto' })
  })

  it('quitar, agregar nuevo y restaurar lo quitado en el puesto', () => {
    const reglas = [
      regla({ ambito: 'puesto', ambitoId: 'soldadura', eppKey: 'delantal', quitado: true }),
      regla({ ambito: 'colaborador', ambitoId: 'c1', eppKey: 'faja_lumbar', nombre: 'Faja lumbar', limite: 1 }),
      regla({ ambito: 'colaborador', ambitoId: 'c1', eppKey: 'delantal' }),   // vuelve a tenerlo, con lo de la planilla
    ]
    const c1 = catalogoEfectivo('soldadura', 'c1', reglas)
    const c2 = catalogoEfectivo('soldadura', 'c2', reglas)
    expect(c2.some((e) => e.key === 'delantal')).toBe(false)
    expect(c1.find((e) => e.key === 'delantal')?.limite).toBe(base.find((e) => e.key === 'delantal')?.limite)
    expect(c1.find((e) => e.key === 'faja_lumbar')).toMatchObject({ nombre: 'Faja lumbar', limite: 1 })
    expect(c2.some((e) => e.key === 'faja_lumbar')).toBe(false)
  })

  it('sin tope deja el límite en null', () => {
    const ef = catalogoEfectivo('soldadura', 'c1', [regla({ ambito: 'puesto', ambitoId: 'soldadura', eppKey: 'delantal', sinTope: true })])
    expect(ef.find((e) => e.key === 'delantal')?.limite).toBeNull()
  })

  it('keyDesdeNombre es estable', () => {
    expect(keyDesdeNombre('Protección auditiva – copa')).toBe('proteccion_auditiva_copa')
  })
})

describe('anulación y doble toque', () => {
  it('las entregas anuladas no cuentan para el cupo', () => {
    const ents = [entrega({}), entrega({ anulada: true }), entrega({})]
    expect(entregadasEn(ents, 'c1', 'guante_vaqueta', 2026)).toBe(2)
  })

  it('anular el duplicado devuelve el casillero (vuelve a haber cupo)', () => {
    const def = { key: 'x', nombre: 'X', frecuencia: '2 al año', limite: 2 }
    const a = entrega({ eppKey: 'x' }), b = entrega({ eppKey: 'x' })
    expect(estadoEntrega(def, 'x', 'c1', 2026, [a, b], []).motivo).toBe('sin_cupo')
    expect(estadoEntrega(def, 'x', 'c1', 2026, [a, { ...b, anulada: true }], []).motivo).toBe('ok')
  })

  it('detecta una entrega del mismo EPP hace menos de 2 minutos', () => {
    const ahora = Date.parse('2026-11-05T10:01:00Z')
    const ents = [entrega({ fecha: '2026-11-05T10:00:30Z' })]
    expect(entregaReciente(ents, 'c1', 'guante_vaqueta', ahora)).toBeDefined()
    expect(entregaReciente(ents, 'c1', 'otro', ahora)).toBeUndefined()
    expect(entregaReciente(ents, 'c1', 'guante_vaqueta', ahora + 5 * 60000)).toBeUndefined()
    expect(entregaReciente([{ ...ents[0], anulada: true }], 'c1', 'guante_vaqueta', ahora)).toBeUndefined()
  })

  it('corrigen Lorenzo y HyS; pañol y la cuenta compartida no', () => {
    expect(puedeGestionarEpp({ usuario: 'lorenzo', rol: 'planificador' })).toBe(true)
    expect(puedeGestionarEpp({ usuario: 'azul', rol: 'sgo' })).toBe(true)
    expect(puedeGestionarEpp({ usuario: 'giuliano', rol: 'logistica' })).toBe(false)
    expect(puedeGestionarEpp({ usuario: 'direccion', rol: 'planificador' })).toBe(false)
  })
})
