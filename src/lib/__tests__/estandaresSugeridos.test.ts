import { describe, expect, it } from 'vitest'
import type { Tarea, TiempoEstandar } from '../../types'
import { claveEstandar, modeloBase } from '../../types'
import { sugerenciasEstandar } from '../estandaresSugeridos'

// ============================================================
// v2.20 — Las tres fases de un trifasico son el MISMO estandar.
//
// Bobinar F1, F2 o F3 lleva lo mismo: el diseño no cambia entre fases. Antes se
// agrupaba por codigo de semielaborado y salian tres sugerencias distintas, cada
// una con un tercio de la muestra.
// ============================================================

const nombreMaquina = (id: string) => `Bobinadora ${id.slice(-2)}`

/** Tarea finalizada de bobinado con un neto controlado. */
function bobina(id: string, codigo: string, netoMin: number, estandarMin = 100): Tarea {
  // Sin paradas, el neto = fin - inicio en minutos laborables. Se arranca a las
  // 08:00 de un lunes para no cruzar almuerzo ni cierre.
  const ini = new Date('2026-09-14T11:00:00.000Z')          // 08:00 -03:00
  const fin = new Date(ini.getTime() + netoMin * 60000)
  return {
    id,
    sectorId: 'bob_dist_at' as Tarea['sectorId'],
    maquinaId: 'm_bob_19',
    operarioId: 'op1',
    componenteCodigo: codigo,
    modelo: 'TTD 63/13',
    semana: '2026-W38',
    prioridad: 1,
    estado: 'finalizada',
    tiempoEstandarMin: estandarMin,
    paradas: [],
    inicioReal: ini.toISOString(),
    finReal: fin.toISOString(),
  } as Tarea
}

describe('modeloBase', () => {
  // EL FORMATO REAL DEL CATÁLOGO: la fase va en el MEDIO, entre la tensión y el
  // material. No al final. La primera versión de modeloBase anclaba a `$` y no
  // limpiaba nada; este es el caso que lo destapó.
  it('saca la fase del medio, como viene de SAP', () => {
    expect(modeloBase('Bobina AT Distribucion Trifasica Cuadrado 63/33 F1 Al'))
      .toBe('Bobina AT Distribucion Trifasica Cuadrado 63/33 Al')
    expect(modeloBase('Bobina BT Distribucion Trifasica Redondo 160/13 F3 Al'))
      .toBe('Bobina BT Distribucion Trifasica Redondo 160/13 Al')
  })

  it('las tres fases del mismo modelo colapsan al mismo texto', () => {
    const d = (f: string) => `Bobina AT Distribucion Trifasica Cuadrado 63/33 ${f} Al`
    expect(modeloBase(d('F1'))).toBe(modeloBase(d('F2')))
    expect(modeloBase(d('F2'))).toBe(modeloBase(d('F3')))
  })

  it('tolera las variantes de escritura', () => {
    const esperado = 'Bobina AT Distribucion Trifasica 63/13 Al'
    expect(modeloBase('Bobina AT Distribucion Trifasica 63/13 F1 Al')).toBe(esperado)
    expect(modeloBase('Bobina AT Distribucion Trifasica 63/13 - F3 Al')).toBe(esperado)
    expect(modeloBase('Bobina AT Distribucion Trifasica 63/13 Fase 2 Al')).toBe(esperado)
    expect(modeloBase('Bobina AT Distribucion Trifasica 63/13  f3  Al')).toBe(esperado)
  })

  it('NO toca lo que distingue de verdad a una bobina', () => {
    // Potencia, tensión, material, AT/BT, línea y forma se conservan enteros.
    const d = 'Bobina BT Rural Monofasica 16/7 Cu'
    expect(modeloBase(d)).toBe(d)
    // Y no se come tokens que sólo se le parecen.
    expect(modeloBase('Bobina AT 63/13 F4 Al')).toBe('Bobina AT 63/13 F4 Al')
    expect(modeloBase('Bobina AT 63/13 F12 Al')).toBe('Bobina AT 63/13 F12 Al')
  })

  it('tolera vacío', () => {
    expect(modeloBase('')).toBe('')
  })
})

describe('claveEstandar agrupa las fases juntas', () => {
  const sec = 'bob_dist_at' as Tarea['sectorId']
  it('las tres fases del mismo modelo y máquina dan la MISMA clave', () => {
    const k = (cod: string, f: string) =>
      claveEstandar(sec, 'TTD 63/33', 'm_bob_19', cod, `Bobina AT Distribucion Trifasica Cuadrado 63/33 ${f} Al`)
    expect(k('BOBALT0000151', 'F1')).toBe(k('BOBALT0000152', 'F2'))
    expect(k('BOBALT0000152', 'F2')).toBe(k('BOBALT0000153', 'F3'))
  })

  it('máquinas distintas siguen siendo estándares distintos', () => {
    const d = 'Bobina AT Distribucion Trifasica Cuadrado 63/33 F1 Al'
    expect(claveEstandar(sec, 'TTD 63/33', 'm_bob_19', 'BOBALT0000151', d))
      .not.toBe(claveEstandar(sec, 'TTD 63/33', 'm_bob_02', 'BOBALT0000151', d))
  })

  it('modelos distintos NO se mezclan', () => {
    const k = (desc: string) => claveEstandar(sec, 'X', 'm_bob_19', 'C1', desc)
    expect(k('Bobina AT Distribucion Trifasica Cuadrado 63/33 F1 Al'))
      .not.toBe(k('Bobina AT Distribucion Trifasica Cuadrado 100/33 F1 Al'))
    // AT y BT tampoco.
    expect(k('Bobina AT Distribucion Trifasica Cuadrado 63/33 F1 Al'))
      .not.toBe(k('Bobina BT Distribucion Trifasica Cuadrado 63/33 F1 Al'))
    // Ni el material.
    expect(k('Bobina AT Distribucion Trifasica Cuadrado 63/33 F1 Al'))
      .not.toBe(k('Bobina AT Distribucion Trifasica Cuadrado 63/33 F1 Cu'))
  })

  it('montaje no usa máquina ni componente', () => {
    const m = 'montaje_pa_dist' as Tarea['sectorId']
    expect(claveEstandar(m, 'TTD 63/13', 'cualquiera', 'PARDIS0000010', 'lo que sea'))
      .toBe(claveEstandar(m, 'TTD 63/13'))
  })
})

describe('sugerenciasEstandar consolida por modelo base', () => {
  // NOTA: estos tests dependen del catálogo real (componentePorCodigo). Si los
  // códigos de abajo no estuvieran en catalogoComponentes.json, la descripción
  // sale undefined y la clave cae al código — que es justamente lo que
  // verificamos que NO pase.
  const CODS = ['BOBALT0000151', 'BOBALT0000152', 'BOBALT0000153']

  it('15 bobinas (5 por fase) dan UNA sola fila con 15 muestras', () => {
    const tareas: Tarea[] = []
    CODS.forEach((cod, i) => {
      for (let n = 0; n < 5; n++) {
        // Netos alrededor de 150' contra un estándar de 100' -> +50% de desvío.
        tareas.push(bobina(`${cod}-${n}`, cod, 148 + i + n, 100))
      }
    })
    const out = sugerenciasEstandar(tareas, [], nombreMaquina)
    expect(out).toHaveLength(1)
    expect(out[0].muestras).toBe(15)
    // La etiqueta no puede mostrar una fase: la fila junta las tres.
    expect(out[0].modelo).not.toMatch(/F[123]\s*$/i)
  })

  it('respeta el estándar vigente guardado con la clave nueva', () => {
    const tareas = CODS.flatMap((cod, i) =>
      [0, 1, 2].map((n) => bobina(`${cod}-${n}`, cod, 150 + i, 100)))
    const id = sugerenciasEstandar(tareas, [], nombreMaquina)[0].id
    const vigente: TiempoEstandar[] = [{ id, area: 'bobinado', modelo: 'x', maquinaId: 'm_bob_19', minutos: 150, actualizado: '' } as TiempoEstandar]
    // Con el vigente ya en 150', el desvío cae por debajo del umbral.
    expect(sugerenciasEstandar(tareas, vigente, nombreMaquina)).toHaveLength(0)
  })

  it('no sugiere por debajo del mínimo de muestras', () => {
    const tareas = [bobina('a', CODS[0], 200, 100), bobina('b', CODS[1], 200, 100)]
    expect(sugerenciasEstandar(tareas, [], nombreMaquina, { minMuestras: 3 })).toHaveLength(0)
  })
})
