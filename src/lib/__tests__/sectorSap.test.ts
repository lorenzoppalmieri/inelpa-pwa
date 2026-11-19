import { describe, expect, it } from 'vitest'
import { sectorSugeridoSap } from '../sectorSap'
import { descripcionSemiTarea } from '../../data/catalogo'
import { nombreSemielaborado, type Tarea } from '../../types'

// ============================================================
// v2.56 — Sector sugerido por familia de artículo SAP. Tabla validada por
// Lorenzo (19/11/2026) sobre la receta nueva del TTD 400/13 ("CARGA SAP").
// Los códigos son reales de esa receta y de las OF de prueba de ALAMO.
// ============================================================
describe('sector sugerido para una OF de SAP', () => {
  it('transformador -> Montaje PO de su línea', () => {
    expect(sectorSugeridoSap('TTD13V0000011', 'distribucion')).toBe('montaje_po_dist')
    expect(sectorSugeridoSap('TMR07V0000001', 'rural')).toBe('montaje_po_rural')
  })

  it('parte activa -> Montaje PA de su línea', () => {
    expect(sectorSugeridoSap('PARDIS0000011')).toBe('montaje_pa_dist')
    expect(sectorSugeridoSap('PARRUR0000003')).toBe('montaje_pa_rural')
  })

  it('bobinas -> Bobinado AT/BT según la línea de la OF; sin línea, elige la planificadora', () => {
    expect(sectorSugeridoSap('BOBALT0000172', 'distribucion')).toBe('bob_dist_at')
    expect(sectorSugeridoSap('BOBBAJ0000172', 'distribucion')).toBe('bob_dist_bt')
    expect(sectorSugeridoSap('BOBALT0000001', 'rural')).toBe('bob_rural_at')
    expect(sectorSugeridoSap('BOBBAJ0000001', 'rural')).toBe('bob_rural_bt')
    expect(sectorSugeridoSap('BOBALT0000172', 'general')).toBeUndefined()
  })

  it('cuba, tanque y tapa -> Soldadura de su línea', () => {
    for (const c of ['CUBDIS0000047', 'TANDIS0000011', 'TAPDIS0000011']) expect(sectorSugeridoSap(c)).toBe('soldadura_dist')
    for (const c of ['CUBRUR0000001', 'TAPRUR0000001']) expect(sectorSugeridoSap(c)).toBe('soldadura_rural')
  })

  it('prensayugos, patas, piezas chicas de herrería y el cáncamo -> Corte y conformado', () => {
    for (const c of [
      'PRESUP0000080', 'PREINF0000080', 'PATDIS0000002', 'CUBRZL0000001', 'HERRZP0000001', 'HERPOR0000001',
      'TANSOD0000004', 'TANSOI0000004', 'TANDES0000001', 'TANBVS0000001', 'TANTBV0000001', 'ACCBRI0000001',
      'TAPDES0000001', 'TAPVAI0000001', 'HIECHA0000005',
    ]) expect(sectorSugeridoSap(c), c).toBe('corte_conformado')
  })

  it('el refuerzo de cuba no se confunde con la cuba (el orden de las reglas importa)', () => {
    expect(sectorSugeridoSap('CUBDIS0000004')).toBe('soldadura_dist')
    expect(sectorSugeridoSap('CUBRZL0000004')).toBe('corte_conformado')
  })

  it('lo que no está en la tabla lo elige la planificadora', () => {
    for (const c of ['TAPIDF0000001', 'NUCSTE0000011', 'TACDIS0000004', 'ACCMAY0000001', '', undefined]) {
      expect(sectorSugeridoSap(c as string | undefined)).toBeUndefined()
    }
  })
})

describe('nombre del semielaborado de una tarea de OF de SAP', () => {
  const sap = { componenteCodigo: 'PARDIS0000122', modelo: 'Parte Activa Distribucion Trifasica 100/13 Al' }

  it('artículo fuera del catálogo viejo: se usa el ItemName (no el código suelto)', () => {
    expect(descripcionSemiTarea(sap)).toBe('Parte Activa Distribucion Trifasica 100/13 Al')
    expect(nombreSemielaborado(sap as Tarea)).toBe('Parte Activa Distribucion Trifasica 100/13 Al')
  })

  it('artículo del catálogo: se sigue usando la descripción del catálogo', () => {
    expect(descripcionSemiTarea({ componenteCodigo: 'BOBBAJ0000110', modelo: 'TTD 16/13' }))
      .toBe('Bobina BT Distribucion Trifasica Cuadrado 16/13 F2 Cu')
  })

  it('sin código no hay semielaborado', () => {
    expect(descripcionSemiTarea({ modelo: 'TTD 16/13' })).toBeUndefined()
  })
})

