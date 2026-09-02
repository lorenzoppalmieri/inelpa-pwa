import type { Tarea } from '../types'
import { esReparacion, DEMORA_ALMUERZO, topeDemora } from '../types'
import { desglosePausas, metricasTarea } from './kpi'

// ============================================================
// AUDITOR DE TIEMPOS (v2.01)
//
// POR QUE EXISTE. El pedido original era un banner que verificara que
// "Justificada + Sin justificar === Demorado". Con la descomposicion de
// metricasTarea esa igualdad es una IDENTIDAD ALGEBRAICA: no puede fallar
// nunca. Un semaforo que no puede ponerse en rojo da confianza falsa.
//
// Asi que el banner verifica las identidades (barato, y detecta si alguien
// rompe la matematica en el futuro) PERO ADEMAS audita los DATOS, que si
// pueden venir mal y hoy nadie ve. Todo lo que se detecta aca ya paso en
// produccion al menos una vez:
//
//   - paradas que el operario nunca cerro (se estiman contra el fin de la
//     tarea, silenciosamente: la demora puede quedar inflada);
//   - almuerzos de mas de 30 minutos (regla de RRHH) o dos el mismo dia;
//   - paradas que empiezan antes de que arranque la tarea o terminan despues
//     de que se cierre (arrastran tiempo que no pertenece a esa tarea);
//   - tareas finalizadas con fin anterior al inicio;
//   - tareas finalizadas con Real = 0 (inicio y fin iguales).
//
// El auditor NO corrige nada. Solo nombra las tareas culpables para que el
// planificador las abra y las arregle: corregir en automatico un dato de
// planta seria peor que el error.
// ============================================================

export type TipoAnomalia =
  | 'fin_antes_inicio'
  | 'real_cero'
  | 'parada_mas_larga'
  | 'parada_abierta'
  | 'parada_fuera_ventana'
  | 'almuerzo_largo'
  | 'almuerzo_duplicado'
  | 'ecuacion_rota'

export interface Anomalia {
  tipo: TipoAnomalia
  tareaId: string
  /** Texto corto para la lista del banner. */
  detalle: string
}

/** Cuanto puede durar un almuerzo antes de ser sospechoso (RRHH: 30'). */
const TOPE_ALMUERZO = topeDemora(DEMORA_ALMUERZO) ?? 30
/** Tolerancia al comparar los bordes de una parada con los de la tarea. */
const MARGEN_BORDE_MIN = 1

function fechaDe(iso: string): string {
  return iso.slice(0, 10)
}

/** Etiqueta corta de la tarea para mostrar en la lista de anomalias. */
export function etiquetaTarea(t: Tarea): string {
  return `${t.modelo}${t.nroTransformador ? ` · N° ${t.nroTransformador}` : ''}`
}

// ------------------------------------------------------------
// Auditoria de UNA tarea. Se separa para poder testearla sola.
// ------------------------------------------------------------
export function auditarTarea(t: Tarea): Anomalia[] {
  const out: Anomalia[] = []
  const et = etiquetaTarea(t)
  if (!t.inicioReal || !t.finReal) return out

  const ini = new Date(t.inicioReal).getTime()
  const fin = new Date(t.finReal).getTime()

  if (fin < ini) {
    out.push({ tipo: 'fin_antes_inicio', tareaId: t.id, detalle: `${et}: se cerró antes de arrancar` })
    return out // el resto de las cuentas no tiene sentido sobre una tarea invertida
  }

  const m = metricasTarea(t)
  if (m.real === 0) {
    out.push({ tipo: 'real_cero', tareaId: t.id, detalle: `${et}: tiempo real = 0 (inicio y fin iguales)` })
  }
  // Una parada no puede durar mas que la tarea que la contiene. Si pasa, la
  // parada quedo abierta de un dia para otro o se cargo fuera de ventana.
  if (m.justificada > m.real && m.real > 0) {
    out.push({
      tipo: 'parada_mas_larga', tareaId: t.id,
      detalle: `${et}: las paradas (${m.justificada}′) suman más que la tarea (${m.real}′)`,
    })
  }

  const tramos = desglosePausas(t)
  const almuerzosPorDia = new Map<string, number>()

  for (const tr of tramos) {
    if (tr.abierta) {
      out.push({ tipo: 'parada_abierta', tareaId: t.id, detalle: `${et}: “${tr.label}” quedó sin cerrar` })
    }
    const tIni = new Date(tr.inicio).getTime()
    const tFin = new Date(tr.fin).getTime()
    const margen = MARGEN_BORDE_MIN * 60_000
    if (tIni < ini - margen || tFin > fin + margen) {
      out.push({
        tipo: 'parada_fuera_ventana', tareaId: t.id,
        detalle: `${et}: “${tr.label}” cae fuera del inicio/fin de la tarea`,
      })
    }
    if (tr.causa === DEMORA_ALMUERZO || tr.label.toLowerCase().startsWith('almuerzo')) {
      const dia = fechaDe(tr.inicio)
      almuerzosPorDia.set(dia, (almuerzosPorDia.get(dia) ?? 0) + 1)
      if (tr.minutos > TOPE_ALMUERZO) {
        out.push({
          tipo: 'almuerzo_largo', tareaId: t.id,
          detalle: `${et}: almuerzo de ${Math.round(tr.minutos)}′ (el tope es ${TOPE_ALMUERZO}′)`,
        })
      }
    }
  }
  for (const [dia, n] of almuerzosPorDia) {
    if (n > 1) {
      out.push({ tipo: 'almuerzo_duplicado', tareaId: t.id, detalle: `${et}: ${n} almuerzos el ${dia}` })
    }
  }
  return out
}

export interface Totales {
  n: number
  estimado: number
  real: number
  demorado: number
  justificada: number
  sinJust: number
  adelanto: number
  aplicada: number
  excedente: number
}

export interface ResultadoAuditoria {
  /** true = las 3 identidades cierran Y no hay anomalías de datos. */
  ok: boolean
  /** Identidades algebraicas. Si alguna falla, se rompió el motor de cálculo. */
  ecuaciones: { nombre: string; izq: number; der: number; ok: boolean }[]
  anomalias: Anomalia[]
  /** Anomalías agrupadas por tipo, ordenadas de más a menos frecuentes. */
  porTipo: { tipo: TipoAnomalia; n: number; titulo: string; ejemplos: string[] }[]
  /** Ids de las tareas con alguna anomalía (para filtrar la tabla). */
  tareasAfectadas: string[]
}

const TITULOS: Record<TipoAnomalia, string> = {
  fin_antes_inicio: 'Tareas cerradas antes de arrancar',
  real_cero: 'Tareas finalizadas con tiempo real cero',
  parada_mas_larga: 'Paradas más largas que la propia tarea',
  parada_abierta: 'Paradas que quedaron sin cerrar',
  parada_fuera_ventana: 'Paradas fuera del inicio/fin de la tarea',
  almuerzo_largo: 'Almuerzos por encima del tope de 30′',
  almuerzo_duplicado: 'Almuerzos duplicados el mismo día',
  ecuacion_rota: 'Descuadre en la sumatoria de totales',
}

/**
 * Audita el conjunto que se está mostrando en pantalla.
 * @param tareas las tareas YA filtradas (lo que el usuario ve).
 * @param tot    los totales acumulados de esas tareas.
 */
export function auditarTiempos(tareas: Tarea[], tot: Totales): ResultadoAuditoria {
  const ecuaciones = [
    { nombre: 'Demorado − Adelanto = Real − Estimado', izq: tot.demorado - tot.adelanto, der: tot.real - tot.estimado },
    { nombre: 'Justif. aplicada + Sin justificar = Demorado', izq: tot.aplicada + tot.sinJust, der: tot.demorado },
    { nombre: 'Justif. aplicada + Excedente = Demora justificada', izq: tot.aplicada + tot.excedente, der: tot.justificada },
  ].map((e) => ({ ...e, ok: e.izq === e.der }))

  const anomalias: Anomalia[] = []
  for (const t of tareas) {
    // Las reparaciones se excluyen: no penalizan por definición y romperían la
    // tercera identidad a propósito. Ver el comentario en metricasTarea.
    if (esReparacion(t)) continue
    anomalias.push(...auditarTarea(t))
  }
  for (const e of ecuaciones) {
    if (!e.ok) {
      anomalias.push({
        tipo: 'ecuacion_rota', tareaId: '',
        detalle: `${e.nombre} → ${e.izq} ≠ ${e.der} (difieren ${Math.abs(e.izq - e.der)}′)`,
      })
    }
  }

  const grupos = new Map<TipoAnomalia, Anomalia[]>()
  for (const a of anomalias) {
    const arr = grupos.get(a.tipo) ?? []
    arr.push(a)
    grupos.set(a.tipo, arr)
  }
  const porTipo = [...grupos.entries()]
    .map(([tipo, arr]) => ({
      tipo, n: arr.length, titulo: TITULOS[tipo],
      ejemplos: arr.slice(0, 3).map((a) => a.detalle),
    }))
    .sort((a, b) => b.n - a.n)

  return {
    ok: anomalias.length === 0,
    ecuaciones,
    anomalias,
    porTipo,
    tareasAfectadas: [...new Set(anomalias.map((a) => a.tareaId).filter(Boolean))],
  }
}
