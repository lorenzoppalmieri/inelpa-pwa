import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tarea } from '../../types'
import type { ParadaRow, TareaRow } from '../mappers'

// ============================================================
// v2.59 — "No me llegan las tareas" (mazza.alexander, 24/11/2026).
// El tiempo real no reenvía lo que pasó mientras la tablet estuvo sin red; la
// puesta al día lo recupera. Y NUNCA puede borrar trabajo: ante un error no toca
// nada, y lo que está sin subir en la cola manda sobre el servidor.
// ============================================================

const mem = vi.hoisted(() => ({
  supabase: null as unknown,
  tareas: [] as Tarea[],
  cola: [] as { entidadId: string; sincronizado: boolean }[],
}))

vi.mock('../../lib/supabaseClient', () => ({ get supabase() { return mem.supabase } }))
vi.mock('../../db/dexie', () => ({
  db: {
    tareas: {
      toArray: async () => [...mem.tareas],
      bulkPut: async (ts: Tarea[]) => { for (const t of ts) { mem.tareas = mem.tareas.filter((x) => x.id !== t.id).concat(t) } },
      bulkDelete: async (ids: string[]) => { mem.tareas = mem.tareas.filter((t) => !ids.includes(t.id)) },
    },
    syncQueue: { filter: (fn: (o: { entidadId: string; sincronizado: boolean }) => boolean) => ({ toArray: async () => mem.cola.filter(fn) }) },
  },
}))

const { planificarPonerseAlDia, ponerseAlDiaTareas } = await import('../ponerseAlDia')

function fila(id: string, estado = 'pendiente', extra: Partial<TareaRow> = {}): TareaRow {
  return {
    id, tipo: 'fabricacion', orden_id: null, sector_id: 'bob_dist_bt', maquina_id: 'bob07', operario_id: 'alexander',
    modelo: 'TTD 315/13', semana: '2026-W48', prioridad: 1, estado, tiempo_estandar_min: 60,
    creada_en: '2026-11-24T12:00:00.000Z',
    ...extra,
  } as unknown as TareaRow
}
function local(id: string, estado: Tarea['estado'] = 'pendiente', paradas: Tarea['paradas'] = []): Tarea {
  return { id, tipo: 'fabricacion', sectorId: 'bob_dist_bt', maquinaId: 'bob07', operarioId: 'alexander', modelo: 'TTD 315/13', semana: '2026-W48', prioridad: 1, estado, tiempoEstandarMin: 60, paradas } as unknown as Tarea
}

/** Supabase de mentira: from().select().neq()/in().order().range(). */
function fakeSupabase(tablas: { tareas: TareaRow[]; paradas: ParadaRow[] }, falla?: 'tareas' | 'paradas') {
  return {
    from(tabla: 'tareas' | 'paradas') {
      let filas: Record<string, unknown>[] = [...tablas[tabla]] as unknown as Record<string, unknown>[]
      const b = {
        select: () => b,
        neq: (c: string, v: unknown) => { filas = filas.filter((f) => f[c] !== v); return b },
        in: (c: string, vs: unknown[]) => { filas = filas.filter((f) => vs.includes(f[c])); return b },
        order: () => b,
        range: (a: number, z: number) => Promise.resolve(falla === tabla
          ? { data: null, error: { message: 'sin red' } }
          : { data: filas.slice(a, z + 1), error: null }),
      }
      return b
    },
  }
}

beforeEach(() => { mem.supabase = null; mem.tareas = []; mem.cola = [] })

describe('qué hay que actualizar (función pura)', () => {
  it('una tarea nueva en el servidor se escribe y se le piden las paradas', () => {
    const plan = planificarPonerseAlDia([fila('nueva')], [], new Set())
    expect(plan.escribir.map((r) => r.id)).toEqual(['nueva'])
    expect(plan.pedirParadas).toEqual(['nueva'])
    expect(plan.revisar).toEqual([])
  })

  it('lo que tiene cambios sin subir NO se toca (lo local es más nuevo)', () => {
    const plan = planificarPonerseAlDia([fila('a', 'pendiente')], [local('a', 'en_proceso')], new Set(['a']))
    expect(plan.escribir).toEqual([])
    expect(plan.revisar).toEqual([])
  })

  it('una abierta local que el servidor ya no lista como abierta se revisa por id', () => {
    const plan = planificarPonerseAlDia([], [local('vieja', 'en_proceso'), local('cerrada', 'finalizada')], new Set())
    expect(plan.revisar).toEqual(['vieja'])
  })

  it('si cambió el estado (o la pausa no cuadra), se piden las paradas', () => {
    const plan = planificarPonerseAlDia([fila('a', 'pausada'), fila('b', 'pendiente')], [local('a', 'en_proceso'), local('b')], new Set())
    expect(plan.pedirParadas).toEqual(['a'])
  })
})

describe('puesta al día contra el servidor', () => {
  it('EL CASO REPORTADO: la tarea asignada durante el corte aparece en la tablet', async () => {
    mem.tareas = [local('ya-estaba')]
    mem.supabase = fakeSupabase({ tareas: [fila('ya-estaba'), fila('asignada-sin-red')], paradas: [] })
    const r = await ponerseAlDiaTareas('test', true)
    expect(r).toMatchObject({ nuevas: 1 })
    expect(mem.tareas.map((t) => t.id).sort()).toEqual(['asignada-sin-red', 'ya-estaba'])
  })

  it('una tarea borrada en Planificación desaparece; una finalizada en otra tablet se actualiza', async () => {
    mem.tareas = [local('borrada', 'pendiente'), local('terminada', 'en_proceso')]
    mem.supabase = fakeSupabase({ tareas: [fila('terminada', 'finalizada')], paradas: [] })
    const r = await ponerseAlDiaTareas('test', true)
    expect(r).toMatchObject({ borradas: 1 })
    expect(mem.tareas.map((t) => [t.id, t.estado])).toEqual([['terminada', 'finalizada']])
  })

  it('SIN RED: no toca absolutamente nada', async () => {
    mem.tareas = [local('a', 'en_proceso'), local('b')]
    mem.supabase = fakeSupabase({ tareas: [], paradas: [] }, 'tareas')
    expect(await ponerseAlDiaTareas('test', true)).toBeNull()
    expect(mem.tareas.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('si fallan las paradas, tampoco toca nada (nada de listas a medias)', async () => {
    mem.tareas = []
    mem.supabase = fakeSupabase({ tareas: [fila('nueva', 'pausada')], paradas: [] }, 'paradas')
    expect(await ponerseAlDiaTareas('test', true)).toBeNull()
    expect(mem.tareas).toEqual([])
  })

  it('una tarea con cambios sin subir no se pisa ni se borra', async () => {
    mem.tareas = [local('mia', 'en_proceso')]
    mem.cola = [{ entidadId: 'mia', sincronizado: false }]
    mem.supabase = fakeSupabase({ tareas: [], paradas: [] })
    await ponerseAlDiaTareas('test', true)
    expect(mem.tareas.map((t) => [t.id, t.estado])).toEqual([['mia', 'en_proceso']])
  })

  it('trae las paradas de una tarea que llega pausada', async () => {
    mem.supabase = fakeSupabase({
      tareas: [fila('p', 'pausada')],
      paradas: [{ id: 'x', tarea_id: 'p', causa: 'espera_consumibles', inicio: '2026-11-24T13:00:00.000Z', fin: null } as unknown as ParadaRow],
    })
    await ponerseAlDiaTareas('test', true)
    expect(mem.tareas[0].paradas).toHaveLength(1)
  })
})
