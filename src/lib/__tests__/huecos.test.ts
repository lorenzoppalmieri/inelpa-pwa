import { describe, expect, it } from 'vitest'
import type { Tarea } from '../../types'
import { huecosPorTarea } from '../huecos'
import { metricasDeLista, metricasTarea } from '../kpi'

// ============================================================
// v2.03 — Huecos de tiempo muerto en Bobinado.
//
// Planta: Lun-Jue 07:00-16:00 (menos 15' de limpieza), Vie 07:00-15:00.
// Almuerzo grupo A: 12:00-12:30 (franja FIJA para el cálculo de huecos).
//
// Martes 1/9/2026 y miércoles 2/9/2026. Se usa offset -03:00 A PROPÓSITO:
// `aperturaDelDia` devuelve UTC, y si alguien vuelve a comparar como texto en
// vez de por instante, estos tests lo agarran.
// ============================================================
const M = (d: number, h: number, m = 0) =>
  `2026-09-0${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000-03:00`

function tarea(over: Partial<Tarea> & { id: string }): Tarea {
  return {
    sectorId: 'bob_dist_at' as Tarea['sectorId'],
    maquinaId: 'm_bob_01', operarioId: 'op1',
    modelo: 'TTD 100/13', semana: '2026-W36', prioridad: 1,
    estado: 'finalizada', tiempoEstandarMin: 60, paradas: [],
    ...over,
  }
}

const hueco = (ts: Tarea[], id: string) => huecosPorTarea(ts).get(id)?.minutos ?? 0

describe('cálculo del hueco', () => {
  it('mide el tiempo muerto entre dos tareas del mismo operario', () => {
    const ts = [
      tarea({ id: 'A', inicioReal: M(1, 8), finReal: M(1, 10) }),
      tarea({ id: 'B', inicioReal: M(1, 10, 30), finReal: M(1, 11, 30) }),
    ]
    expect(hueco(ts, 'B')).toBe(30)
  })

  it('EL ALMUERZO NO SE COBRA: 11:50 → 13:00 descuenta la franja fija', () => {
    const ts = [
      tarea({ id: 'A', inicioReal: M(1, 8), finReal: M(1, 11, 50) }),
      tarea({ id: 'B', inicioReal: M(1, 13), finReal: M(1, 15) }),
    ]
    // 11:50→13:00 son 70 minutos de reloj; 30 son almuerzo (12:00-12:30).
    expect(hueco(ts, 'B')).toBe(40)
  })

  it('la noche no cuenta: cierra al final del turno y abre a la mañana siguiente', () => {
    const ts = [
      tarea({ id: 'A', inicioReal: M(1, 13), finReal: M(1, 15, 45) }), // 15:45 = fin productivo
      tarea({ id: 'B', inicioReal: M(2, 7), finReal: M(2, 9) }),
    ]
    expect(hueco(ts, 'B')).toBe(0)
  })

  it('un trabajo en OTRO SECTOR en el medio no se cobra como tiempo muerto', () => {
    const ts = [
      tarea({ id: 'A', inicioReal: M(1, 8), finReal: M(1, 10) }),
      // Se fue a ayudar a herrería 10:00-11:30. No es bobinado: no recibe hueco,
      // pero sí ocupa el tiempo del operario.
      tarea({ id: 'H', sectorId: 'soldadura_dist' as Tarea['sectorId'], inicioReal: M(1, 10), finReal: M(1, 11, 30) }),
      tarea({ id: 'B', inicioReal: M(1, 11, 30), finReal: M(1, 13) }),
    ]
    expect(hueco(ts, 'B')).toBe(0)
    expect(hueco(ts, 'H')).toBe(0) // herrería no recibe huecos
  })

  it('tareas solapadas dan hueco 0, nunca negativo', () => {
    const ts = [
      tarea({ id: 'A', inicioReal: M(1, 8), finReal: M(1, 11) }),
      tarea({ id: 'B', inicioReal: M(1, 9), finReal: M(1, 12) }),
    ]
    expect(hueco(ts, 'B')).toBe(0)
  })

  it('usa el fin MÁS TARDÍO de las tareas previas, no el de la anterior inmediata', () => {
    const ts = [
      tarea({ id: 'A', inicioReal: M(1, 8), finReal: M(1, 11) }),
      tarea({ id: 'A2', inicioReal: M(1, 8, 30), finReal: M(1, 9) }), // arranca después pero cierra antes
      tarea({ id: 'B', inicioReal: M(1, 11, 15), finReal: M(1, 13) }),
    ]
    expect(hueco(ts, 'B')).toBe(15) // desde las 11:00, no desde las 09:00
  })

  it('si una tarea previa quedó SIN CERRAR, no se cobra hueco ESE día', () => {
    const ts = [
      tarea({ id: 'A', estado: 'en_proceso', inicioReal: M(1, 8), finReal: undefined }),
      tarea({ id: 'B', inicioReal: M(1, 11), finReal: M(1, 13) }),
    ]
    expect(hueco(ts, 'B')).toBe(0)
  })

  // v2.09 — el bug que encontró Lorenzo controlando las bobinadoras: una tarea
  // vieja abandonada sin cerrar dejaba a esa persona sin huecos PARA SIEMPRE.
  it('una tarea abandonada de un día anterior NO anula los huecos de los días siguientes', () => {
    const ts = [
      // Quedó abierta el martes y nadie la cerró nunca.
      tarea({ id: 'ABANDONADA', estado: 'en_proceso', inicioReal: M(1, 8), finReal: undefined }),
      // Miércoles: arranca 08:15, debería cobrar el hueco de arranque de turno.
      tarea({ id: 'B', inicioReal: M(2, 8, 15), finReal: M(2, 10) }),
    ]
    expect(hueco(ts, 'B')).toBe(75)
    expect(huecosPorTarea(ts).get('B')?.tipo).toBe('arranque_turno')
  })

  it('dos bobinas en paralelo el MISMO día siguen sin generar tiempo muerto', () => {
    const ts = [
      tarea({ id: 'PAR', estado: 'en_proceso', inicioReal: M(1, 8), finReal: undefined }),
      tarea({ id: 'B', inicioReal: M(1, 9), finReal: M(1, 12) }),
    ]
    expect(hueco(ts, 'B')).toBe(0)
  })

  it('cuenta el arranque del turno: apertura 07:00 → primera tarea', () => {
    const ts = [tarea({ id: 'B', inicioReal: M(1, 8, 15), finReal: M(1, 10) })]
    const h = huecosPorTarea(ts).get('B')
    expect(h?.minutos).toBe(75)
    expect(h?.tipo).toBe('arranque_turno')
  })

  it('no se cobra hueco a sectores que no son Bobinado', () => {
    const ts = [tarea({ id: 'X', sectorId: 'montaje_po_dist' as Tarea['sectorId'], inicioReal: M(1, 9), finReal: M(1, 11) })]
    expect(hueco(ts, 'X')).toBe(0)
  })

  it('no mezcla operarios distintos', () => {
    const ts = [
      tarea({ id: 'A', operarioId: 'op1', inicioReal: M(1, 7), finReal: M(1, 10) }),
      tarea({ id: 'B', operarioId: 'op2', inicioReal: M(1, 7), finReal: M(1, 12) }),
    ]
    expect(hueco(ts, 'B')).toBe(0) // op2 arrancó 07:00, no hereda el fin de op1
  })

  it('las reparaciones no reciben hueco', () => {
    const ts = [
      tarea({ id: 'A', inicioReal: M(1, 8), finReal: M(1, 10) }),
      tarea({ id: 'R', tipo: 'reparacion', inicioReal: M(1, 11), finReal: M(1, 12) }),
    ]
    expect(hueco(ts, 'R')).toBe(0)
  })
})

describe('inyección en las métricas', () => {
  const ts = [
    tarea({ id: 'A', inicioReal: M(1, 8), finReal: M(1, 10) }),
    tarea({ id: 'B', tiempoEstandarMin: 60, inicioReal: M(1, 10, 30), finReal: M(1, 11, 30) }),
  ]

  // v2.27 — CAMBIO DE REGLA (Lorenzo, 23/9/2026). Antes este test afirmaba que
  // el hueco entraba en el Real (60 + 30 = 90) y caía en Demora sin justificar.
  // Ahora el Neto es SOLO tiempo trabajado, en todos los indicadores: el hueco
  // se sigue midiendo, pero como dato aparte que no toca ningún tiempo.
  it('el hueco se mide pero NO entra en el Real ni en la demora', () => {
    const sin = metricasTarea(ts[1])
    const con = metricasDeLista(ts).get('B')!
    expect(sin.real).toBe(60)
    expect(con.hueco).toBe(30)          // se sigue midiendo...
    expect(con.real).toBe(60)           // ...pero el Real es solo lo trabajado
    expect(con.demorado).toBe(0)        // clavada en el estándar
    expect(con.sinJustificar).toBe(0)
  })

  it('EL CASO REPORTADO: volver después de semanas sin tareas no infla la tarea', () => {
    // Última tarea el 1/9, la siguiente el 2/9... pero imaginemos que entre medio
    // no hubo nada: el hueco puede ser enorme. Antes esas jornadas entraban
    // enteras en el Real de UNA tarea (el caso de 102 h de Neto en una bobina).
    // B va de 09:00 a 10:00: ojo con elegir una franja que toque los 15' de
    // limpieza (15:45-16:00) o el almuerzo, porque el motor los descuenta —
    // la primera versión de este test usaba 15-16 y daba 45, que era lo correcto.
    const lejos = [
      tarea({ id: 'A', inicioReal: M(1, 8), finReal: M(1, 9) }),
      tarea({ id: 'B', tiempoEstandarMin: 60, inicioReal: M(2, 9), finReal: M(2, 10) }),
    ]
    const b = metricasDeLista(lejos).get('B')!
    expect(b.hueco).toBeGreaterThan(400)   // más de una jornada de tiempo muerto
    expect(b.real).toBe(60)                // y aun así la tarea mide lo que duró
  })

  it('las 3 identidades del auditor siguen cerrando con huecos', () => {
    for (const m of metricasDeLista(ts).values()) {
      expect(m.demorado - m.adelanto).toBe(m.real - m.estimado)
      expect(m.justificadaAplicada + m.sinJustificar).toBe(m.demorado)
      expect(m.justificadaAplicada + m.justificadaExcedente).toBe(m.justificada)
    }
  })

  it('metricasTarea sin el tercer parámetro se comporta como antes de v2.03', () => {
    expect(metricasTarea(ts[1]).hueco).toBe(0)
    expect(metricasTarea(ts[1]).real).toBe(60)
  })
})
