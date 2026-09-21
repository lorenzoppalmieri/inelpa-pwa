import { describe, expect, it } from 'vitest'
import type { Tarea } from '../../types'
import {
  cumplimientoDeSector, lunesDeSemanaISO, semanasDelMes, ventanaEsAproximada,
  type VentanaCierre,
} from '../cierreObjetivos'

// ============================================================
// v2.23 — Cierre de objetivos "7 / 10".
//
// OJO: esto vive en `lib/cierreObjetivos.ts`, NO en `lib/andon.ts`. Ese otro
// archivo es el motor del tablero de premios (ANDON_AREAS, calcularAndon,
// tierDe) que usan AndonView y DireccionView, y es anterior. Son dos cosas
// distintas con nombres parecidos.
//
// Semana 38 de 2026 = lunes 14/9 a viernes 18/9.
// Semana 39 de 2026 = lunes 21/9 a viernes 25/9.
// ============================================================
const SEM38: VentanaCierre = { tipo: 'semana', semana: '2026-W38' }
const SEM39: VentanaCierre = { tipo: 'semana', semana: '2026-W39' }

const en = (d: number, h = 10) => new Date(2026, 8, d, h, 0, 0).toISOString()

function tarea(over: Partial<Tarea> & { id: string }): Tarea {
  return {
    sectorId: 'bob_dist_at' as Tarea['sectorId'],
    maquinaId: 'm1', operarioId: 'juan',
    modelo: 'TTD 100/13', semana: '2026-W38', semanaObjetivo: '2026-W38',
    prioridad: 1, estado: 'pendiente', tiempoEstandarMin: 60, paradas: [],
    ...over,
  }
}

/** Terminada dentro de la semana 38. */
const hecha38 = (id: string, over: Partial<Tarea> = {}) =>
  tarea({ id, estado: 'finalizada', inicioReal: en(15), finReal: en(16), ...over })

const bob = (v: VentanaCierre, ts: Tarea[]) =>
  cumplimientoDeSector(ts, 'bob_dist_at' as Tarea['sectorId'], v)

describe('semanas ISO', () => {
  it('el lunes de la 38 de 2026 es el 14 de septiembre', () => {
    const l = lunesDeSemanaISO('2026-W38')!
    expect(l.getDate()).toBe(14)
    expect(l.getMonth()).toBe(8)
    expect(l.getDay()).toBe(1)
  })

  it('rechaza lo que no es una semana', () => {
    expect(lunesDeSemanaISO('septiembre')).toBeNull()
    expect(lunesDeSemanaISO('2026-W99')).toBeNull()
  })

  it('septiembre 2026 toca varias semanas', () => {
    const s = semanasDelMes(2026, 8)
    expect(s).toContain('2026-W38')
    expect(s.length).toBeGreaterThan(3)
  })
})

describe('EL CASO REPORTADO: el objetivo no se achica al atrasarse', () => {
  // A Juan se le pidieron 10 bobinas para la semana 38. Terminó 7. Las otras 3
  // se atrasaron y la planificadora las movió a la 39.
  const tareas: Tarea[] = [
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => hecha38(`ok${n}`)),
    // Movidas: `semana` ya dice 39, pero el objetivo sigue clavado en la 38.
    ...[1, 2, 3].map((n) => tarea({ id: `atras${n}`, semana: '2026-W39', semanaObjetivo: '2026-W38' })),
  ]

  it('la semana 38 cierra 7 de 10, no 7 de 7', () => {
    const r = bob(SEM38, tareas)
    const juan = r.colaboradores.find((c) => c.operarioId === 'juan')!
    expect(juan.terminadas).toBe(7)
    expect(juan.planificadas).toBe(10)
    expect(juan.pendientes).toBe(3)
  })

  it('esas 3 NO aparecen como objetivo de la semana 39', () => {
    const r = bob(SEM39, tareas)
    const juan = r.colaboradores.find((c) => c.operarioId === 'juan')
    // La 39 no tiene objetivo propio: lo que llega es arrastre, no meta nueva.
    expect(juan?.planificadas ?? 0).toBe(0)
  })

  it('SIN la foto congelada el número mentiría', () => {
    // Mismo escenario pero leyendo `semana` (lo que hacía antes): las 3 movidas
    // se van de la 38 y el cumplimiento da 100%.
    const sinFoto = tareas.map((t) => ({ ...t, semanaObjetivo: t.semana }))
    const juan = bob(SEM38, sinFoto).colaboradores.find((c) => c.operarioId === 'juan')!
    expect(juan.planificadas).toBe(7)
    expect(juan.ratio).toBe(1)   // el 7/7 falso
  })
})

describe('las terminadas se cuentan por la fecha de fin', () => {
  it('arrancada el viernes y cerrada el lunes suma en la semana NUEVA', () => {
    // Objetivo semana 38, se cerró el lunes 21 (semana 39).
    const t = tarea({
      id: 'cruza', estado: 'finalizada',
      semanaObjetivo: '2026-W38', semana: '2026-W38',
      inicioReal: en(18), finReal: en(21),
    })
    expect(bob(SEM38, [t]).terminadas).toBe(0)
    expect(bob(SEM39, [t]).terminadas).toBe(1)
  })

  it('y sigue contando como objetivo de la semana en que se pidió', () => {
    const t = tarea({
      id: 'cruza', estado: 'finalizada',
      semanaObjetivo: '2026-W38', semana: '2026-W39',
      inicioReal: en(18), finReal: en(21),
    })
    expect(bob(SEM38, [t]).planificadas).toBe(1)
    expect(bob(SEM38, [t]).terminadas).toBe(0)     // la 38 queda 0/1
    expect(bob(SEM39, [t]).terminadas).toBe(1)     // y la 39 la recibe
  })

  it('marca lo que se entregó pero venía de antes', () => {
    const t = tarea({
      id: 'arr', estado: 'finalizada',
      semanaObjetivo: '2026-W38', semana: '2026-W39',
      inicioReal: en(18), finReal: en(21),
    })
    const juan = bob(SEM39, [t]).colaboradores.find((c) => c.operarioId === 'juan')!
    expect(juan.terminadasDeArrastre).toBe(1)
  })
})

describe('qué queda afuera', () => {
  it('reparaciones y prototipos no son objetivo de producción', () => {
    const ts = [
      hecha38('rep', { tipo: 'reparacion' }),
      hecha38('proto', { esPrototipo: true }),
      hecha38('real'),
    ]
    const r = bob(SEM38, ts)
    expect(r.terminadas).toBe(1)
    expect(r.planificadas).toBe(1)
  })

  it('una tarea sin colaborador suma al sector pero no a nadie', () => {
    const ts = [hecha38('sin', { operarioId: undefined })]
    const r = bob(SEM38, ts)
    expect(r.terminadas).toBe(1)
    expect(r.colaboradores).toHaveLength(0)
  })

  it('las tareas anteriores a v2.23 caen a `semana`', () => {
    const vieja = tarea({ id: 'v', semanaObjetivo: undefined, semana: '2026-W38' })
    expect(bob(SEM38, [vieja]).planificadas).toBe(1)
  })
})

describe('aviso de historial aproximado', () => {
  it('las semanas anteriores al corte se marcan', () => {
    expect(ventanaEsAproximada({ tipo: 'semana', semana: '2026-W30' })).toBe(true)
  })
  it('las posteriores no', () => {
    expect(ventanaEsAproximada({ tipo: 'semana', semana: '2026-W45' })).toBe(false)
  })
})

describe('varios colaboradores', () => {
  it('ordena el peor cumplimiento primero', () => {
    const ts = [
      ...[1, 2].map((n) => hecha38(`a${n}`, { operarioId: 'ana' })),
      tarea({ id: 'a3', operarioId: 'ana' }),                    // ana 2/3
      hecha38('j1', { operarioId: 'juan' }),
      ...[1, 2, 3].map((n) => tarea({ id: `j${n + 1}`, operarioId: 'juan' })),  // juan 1/4
    ]
    const r = bob(SEM38, ts)
    expect(r.colaboradores[0].operarioId).toBe('juan')
    expect(r.colaboradores[0].terminadas).toBe(1)
    expect(r.colaboradores[0].planificadas).toBe(4)
    expect(r.colaboradores[1].operarioId).toBe('ana')
  })
})
