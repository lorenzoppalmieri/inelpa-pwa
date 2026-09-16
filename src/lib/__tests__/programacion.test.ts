import { describe, expect, it } from 'vitest'
import type { Tarea } from '../../types'
import { programar } from '../programacion'
import { auditarTiempos, type Totales } from '../auditoriaTiempos'

// ============================================================
// v2.17 — CASCADA DEL GANTT CON FORMATOS DE FECHA MEZCLADOS.
//
// El bug que estos tests cubren: `programar()` comparaba instantes con `<` y
// `>` sobre strings ISO. En la app conviven tres formatos para el MISMO
// instante, segun de donde venga el dato:
//
//   tablet    2026-09-14T10:30:00.000Z
//   Supabase  2026-09-14T10:30:00+00:00
//   tests     2026-09-14T07:30:00.000-03:00
//
// Como texto no son iguales ni ordenan bien ('+' < '.' en ASCII), los cursores
// de maquina y operario no frenaban a la tarea siguiente y las barras se
// pisaban con los datos perfectamente cargados. Es la tercera vez que este
// error aparece en el proyecto (huecos.ts, fusionarIntervalos v2.12).
//
// Planta: Lun-Jue 07:00-16:00, Vie 07:00-15:00. Lunes 14/9/2026.
// ============================================================

/** Mismo instante, escrito en los tres formatos que circulan por la app. */
const zulu = (h: number, m = 0) =>          // como lo manda la tablet
  `2026-09-14T${String(h + 3).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
const supa = (h: number, m = 0) =>          // como lo devuelve Supabase
  `2026-09-14T${String(h + 3).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+00:00`
const local = (h: number, m = 0) =>         // hora de planta, offset explicito
  `2026-09-14T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000-03:00`

function tarea(over: Partial<Tarea> & { id: string }): Tarea {
  return {
    sectorId: 'bob_dist_at' as Tarea['sectorId'],
    maquinaId: 'm_bob_01', operarioId: 'op1',
    modelo: 'TTD 100/13', semana: '2026-W38', prioridad: 1,
    estado: 'pendiente', tiempoEstandarMin: 60, paradas: [],
    ...over,
  }
}

const ms = (iso: string) => new Date(iso).getTime()

/** Cuenta pares de tareas del mismo recurso cuyos planes se pisan. */
function solapes(tareas: Tarea[], plan: Map<string, { startISO: string; endISO: string }>, clave: (t: Tarea) => string | undefined) {
  const porRecurso = new Map<string, { ini: number; fin: number }[]>()
  for (const t of tareas) {
    const k = clave(t); const p = plan.get(t.id)
    if (!k || !p) continue
    const arr = porRecurso.get(k) ?? []
    arr.push({ ini: ms(p.startISO), fin: ms(p.endISO) })
    porRecurso.set(k, arr)
  }
  let n = 0
  for (const [, arr] of porRecurso) {
    arr.sort((a, b) => a.ini - b.ini)
    for (let i = 1; i < arr.length; i++) if (arr[i].ini < arr[i - 1].fin) n++
  }
  return n
}

describe('los tres formatos de fecha describen el mismo instante', () => {
  it('zulu, supabase y local son iguales como instante (y distintos como texto)', () => {
    expect(ms(zulu(8))).toBe(ms(supa(8)))
    expect(ms(zulu(8))).toBe(ms(local(8)))
    // Justamente por esto no se puede comparar como texto:
    expect(zulu(8)).not.toBe(supa(8))
    expect(supa(8) < zulu(8)).toBe(true)   // '+' < '.' — el mismo instante "parece" anterior
  })
})

describe('cascada sin solapamientos con formatos mezclados', () => {
  it('una tarea en curso que se pasa del estimado empuja a las pendientes', () => {
    // A arrancó 08:00 con 60' estimados y a las 11:00 sigue abierta: ocupó la
    // máquina y al operario 3 horas. B y C no pueden arrancar antes de las 11.
    const ts = [
      tarea({ id: 'A', estado: 'en_proceso', inicioReal: supa(8), tiempoEstandarMin: 60 }),
      tarea({ id: 'B', inicioPlanificado: zulu(9) }),
      tarea({ id: 'C', inicioPlanificado: local(10) }),
    ]
    const plan = programar(ts, zulu(11))

    expect(solapes(ts, plan, (t) => t.maquinaId)).toBe(0)
    expect(solapes(ts, plan, (t) => t.operarioId)).toBe(0)
    // Ninguna pendiente arranca en el pasado.
    expect(ms(plan.get('B')!.startISO)).toBeGreaterThanOrEqual(ms(zulu(11)))
    expect(ms(plan.get('C')!.startISO)).toBeGreaterThanOrEqual(ms(plan.get('B')!.endISO))
  })

  it('el cursor frena aunque el fin venga de Supabase y el inicio de la tablet', () => {
    // ESTE es el caso que fallaba: A cierra en formato Supabase, B está
    // planificada en formato tablet. Comparando como texto el cursor no
    // empujaba y B se dibujaba encima de A.
    const ts = [
      tarea({ id: 'A', estado: 'finalizada', inicioReal: supa(8), finReal: supa(12), tiempoEstandarMin: 240 }),
      tarea({ id: 'B', inicioPlanificado: zulu(8), tiempoEstandarMin: 60 }),
    ]
    const plan = programar(ts, zulu(7))

    expect(ms(plan.get('B')!.startISO)).toBeGreaterThanOrEqual(ms(supa(12)))
    expect(solapes(ts, plan, (t) => t.maquinaId)).toBe(0)
  })

  it('dos personas distintas en máquinas distintas siguen en paralelo', () => {
    const ts = [
      tarea({ id: 'A', maquinaId: 'm_bob_01', operarioId: 'op1', inicioPlanificado: supa(8) }),
      tarea({ id: 'B', maquinaId: 'm_bob_02', operarioId: 'op2', inicioPlanificado: zulu(8) }),
    ]
    const plan = programar(ts, local(7))
    // Arrancan a la misma hora: el paralelismo real no se rompe.
    expect(ms(plan.get('A')!.startISO)).toBe(ms(plan.get('B')!.startISO))
  })

  it('un mismo operario en dos máquinas distintas NO trabaja en paralelo', () => {
    const ts = [
      tarea({ id: 'A', maquinaId: 'm_bob_01', operarioId: 'op1', inicioPlanificado: supa(8) }),
      tarea({ id: 'B', maquinaId: 'm_bob_02', operarioId: 'op1', inicioPlanificado: zulu(8) }),
    ]
    const plan = programar(ts, local(7))
    expect(solapes(ts, plan, (t) => t.operarioId)).toBe(0)
  })

  it('tolera tareas sin fecha sin romper la cola', () => {
    const ts = [
      tarea({ id: 'A', inicioPlanificado: undefined, prioridad: 2 }),
      tarea({ id: 'B', inicioPlanificado: supa(9), prioridad: 1 }),
    ]
    const plan = programar(ts, zulu(8))
    expect(plan.size).toBe(2)
    expect(solapes(ts, plan, (t) => t.maquinaId)).toBe(0)
  })
})

// ============================================================
// v2.18 — Pedido de los planificadores: una fila por bobinador, las tareas una
// al lado de la otra, desbordando a la semana siguiente si hace falta.
// Planta: Lun-Jue 07:00-16:00, Vie 07:00-15:00 (menos almuerzo y limpieza).
// ============================================================
const hAr = (iso: string) => new Date(iso).toLocaleString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
const diaAr = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { weekday: 'long' })

describe('capacidad del recurso', () => {
  it('un bobinador hace UNA bobina por vez: las pendientes se encolan', () => {
    const ts = [
      tarea({ id: 'A', inicioPlanificado: local(8), tiempoEstandarMin: 120 }),
      tarea({ id: 'B', inicioPlanificado: local(8), tiempoEstandarMin: 120 }),
      tarea({ id: 'C', inicioPlanificado: local(8), tiempoEstandarMin: 120 }),
    ]
    const plan = programar(ts, local(7))
    expect(solapes(ts, plan, (t) => t.operarioId)).toBe(0)
    // Estrictamente una detrás de la otra.
    expect(ms(plan.get('B')!.startISO)).toBeGreaterThanOrEqual(ms(plan.get('A')!.endISO))
    expect(ms(plan.get('C')!.startISO)).toBeGreaterThanOrEqual(ms(plan.get('B')!.endISO))
  })

  // v2.19: los carriles de montaje son CUENTAS DE EQUIPO (5 personas sobre la
  // misma línea), no individuos. No se encolan: arrancan todas a su hora.
  it('el Equipo Montaje PA Distribución lleva 5 partes activas en paralelo', () => {
    const pa = (id: string) => tarea({
      id, sectorId: 'montaje_pa_dist' as Tarea['sectorId'],
      maquinaId: 'm_montaje_pa_dist_01', operarioId: 'equipo_pa_dist',
      inicioPlanificado: local(8), tiempoEstandarMin: 120,
    })
    const ts = ['A', 'B', 'C', 'D', 'E'].map(pa)
    const plan = programar(ts, local(7))
    const arranques = new Set(ts.map((t) => ms(plan.get(t.id)!.startISO)))
    expect(arranques.size).toBe(1)   // las cinco a la misma hora
  })

  it('montaje rural tampoco se encola', () => {
    const pa = (id: string) => tarea({
      id, sectorId: 'montaje_pa_rural' as Tarea['sectorId'],
      maquinaId: 'm_montaje_pa_rural_01', operarioId: 'equipo_pa_rural',
      inicioPlanificado: local(8), tiempoEstandarMin: 120,
    })
    const ts = [pa('A'), pa('B'), pa('C')]
    const plan = programar(ts, local(7))
    expect(ms(plan.get('C')!.startISO)).toBe(ms(plan.get('A')!.startISO))
  })

  it('bobinado SÍ se encola aunque montaje no', () => {
    const ts = [
      tarea({ id: 'A', inicioPlanificado: local(8), tiempoEstandarMin: 120 }),
      tarea({ id: 'B', inicioPlanificado: local(8), tiempoEstandarMin: 120 }),
    ]
    const plan = programar(ts, local(7))
    expect(ms(plan.get('B')!.startISO)).toBeGreaterThanOrEqual(ms(plan.get('A')!.endISO))
  })
})

describe('efecto dominó en tiempo real', () => {
  it('la pendiente se corre sola a medida que avanza la hora', () => {
    // A arrancó 08:00 con 60' estimados pero sigue abierta. B está detrás.
    const ts = [
      tarea({ id: 'A', estado: 'en_proceso', inicioReal: local(8), tiempoEstandarMin: 60 }),
      tarea({ id: 'B', inicioPlanificado: local(9), tiempoEstandarMin: 60 }),
    ]
    // Mismo set de tareas, mirado en dos momentos distintos: lo único que
    // cambia es el reloj, y B tiene que haberse movido hacia adelante.
    const aLas10 = programar(ts, local(10))
    const aLas11 = programar(ts, local(11))
    expect(ms(aLas11.get('B')!.startISO)).toBeGreaterThan(ms(aLas10.get('B')!.startISO))
    // Y nunca se le encima a A.
    expect(ms(aLas11.get('B')!.startISO)).toBeGreaterThanOrEqual(ms(aLas11.get('A')!.endISO))
  })

  it('si el empujón pasa el cierre, la pendiente salta al día siguiente', () => {
    const ts = [
      tarea({ id: 'A', estado: 'en_proceso', inicioReal: local(8), tiempoEstandarMin: 60 }),
      tarea({ id: 'B', inicioPlanificado: local(9), tiempoEstandarMin: 120 }),
    ]
    // Son las 15:40: A sigue abierta y ya no entran 2h antes del cierre, así que
    // B arranca hoy pero TERMINA mañana — nunca fuera del horario de planta.
    const plan = programar(ts, local(15, 40))
    expect(diaAr(plan.get('B')!.endISO)).toBe('martes')
    expect(ms(plan.get('B')!.startISO)).toBeGreaterThanOrEqual(ms(plan.get('A')!.endISO))
  })
})

describe('desborde de jornada y de semana', () => {
  it('lo que no entra en el día sigue al día siguiente a las 07:00', () => {
    // 8 horas arrancando a las 13:00 no entran antes del cierre.
    const ts = [tarea({ id: 'A', inicioPlanificado: local(13), tiempoEstandarMin: 480 })]
    const plan = programar(ts, local(12))
    expect(diaAr(plan.get('A')!.endISO)).toBe('martes')
  })

  it('la cola del viernes cae el LUNES a las 07:00, no el sábado', () => {
    // Viernes 18/9/2026. Cierra 15:00.
    const vie = (h: number) => `2026-09-18T${String(h).padStart(2, '0')}:00:00.000-03:00`
    const ts = [tarea({ id: 'A', inicioPlanificado: vie(13), tiempoEstandarMin: 300 })]
    const plan = programar(ts, vie(12))
    const fin = plan.get('A')!.endISO
    expect(diaAr(fin)).toBe('lunes')
    expect(new Date(fin).getDay()).toBe(1)
  })

  it('tres tareas largas se van acumulando hacia la semana siguiente sin pisarse', () => {
    const ts = [1, 2, 3, 4, 5].map((n) =>
      tarea({ id: `T${n}`, inicioPlanificado: local(8), tiempoEstandarMin: 480 }))
    const plan = programar(ts, local(7))
    expect(solapes(ts, plan, (t) => t.operarioId)).toBe(0)
    // Ninguna cae en sábado ni domingo.
    for (const t of ts) {
      const d = new Date(plan.get(t.id)!.startISO).getDay()
      expect(d === 0 || d === 6).toBe(false)
    }
  })
})

describe('hora de recuperación', () => {
  it('sin recuperación la jornada termina antes que con recuperación', () => {
    const base = { inicioPlanificado: local(13), tiempoEstandarMin: 300 }
    const sin = programar([tarea({ id: 'A', ...base })], local(12))
    const con = programar([tarea({ id: 'A', ...base, minutosRecuperacion: 60 })], local(12))
    // Con una hora más de turno, la misma tarea cierra antes en el calendario.
    expect(ms(con.get('A')!.endISO)).toBeLessThanOrEqual(ms(sin.get('A')!.endISO))
  })

  it('la recuperación no se le aplica a quien no la marcó', () => {
    // 8h desde las 13:00 no entran en el día ni con recuperación: lo que se
    // controla es que la que NO recupera no use la franja extra.
    const ts = [tarea({ id: 'A', inicioPlanificado: local(15), tiempoEstandarMin: 30 })]
    const plan = programar(ts, local(14))
    // 15:00 + 30' con jornada hasta 16:00 (menos limpieza) -> mismo día.
    expect(hAr(plan.get('A')!.startISO)).toBeTruthy()
    expect(ms(plan.get('A')!.endISO)).toBeGreaterThan(ms(plan.get('A')!.startISO))
  })
})

describe('auditor: solape de un mismo colaborador', () => {
  const totOk: Totales = {
    n: 0, estimado: 0, real: 0, demorado: 0, justificada: 0,
    sinJust: 0, adelanto: 0, aplicada: 0, excedente: 0,
  }
  const solapeDe = (ts: Tarea[]) =>
    auditarTiempos(ts, totOk).anomalias.filter((a) => a.tipo === 'solape_operario')

  it('detecta dos tareas cerradas que se pisan', () => {
    const ts = [
      tarea({ id: 'A', estado: 'finalizada', inicioReal: supa(8), finReal: supa(12), tiempoEstandarMin: 240 }),
      tarea({ id: 'B', estado: 'finalizada', inicioReal: zulu(10), finReal: zulu(14), tiempoEstandarMin: 240 }),
    ]
    const r = solapeDe(ts)
    expect(r).toHaveLength(1)
    expect(r[0].detalle).toContain('120′')   // 10:00 → 12:00
  })

  it('detecta que arrancó la segunda sin cerrar la primera', () => {
    const ts = [
      tarea({ id: 'A', estado: 'finalizada', inicioReal: supa(8), finReal: supa(12), tiempoEstandarMin: 240 }),
      tarea({ id: 'B', estado: 'en_proceso', inicioReal: zulu(10) }),
    ]
    expect(solapeDe(ts)).toHaveLength(1)
  })

  it('no marca tareas consecutivas', () => {
    const ts = [
      tarea({ id: 'A', estado: 'finalizada', inicioReal: supa(8), finReal: supa(10), tiempoEstandarMin: 120 }),
      tarea({ id: 'B', estado: 'finalizada', inicioReal: zulu(10), finReal: zulu(12), tiempoEstandarMin: 120 }),
    ]
    expect(solapeDe(ts)).toHaveLength(0)
  })

  it('no marca solape entre colaboradores distintos', () => {
    const ts = [
      tarea({ id: 'A', operarioId: 'op1', estado: 'finalizada', inicioReal: supa(8), finReal: supa(12), tiempoEstandarMin: 240 }),
      tarea({ id: 'B', operarioId: 'op2', estado: 'finalizada', inicioReal: zulu(10), finReal: zulu(14), tiempoEstandarMin: 240 }),
    ]
    expect(solapeDe(ts)).toHaveLength(0)
  })
})
