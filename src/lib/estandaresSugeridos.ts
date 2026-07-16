import type { Tarea, TiempoEstandar, AreaDemora, SectorId } from '../types'
import { areaDemora, claveEstandar, esReparacion, sectorById } from '../types'
import { tiempoNetoMin, tiempoEstimadoMin } from './kpi'

// ============================================================
// ASISTENTE DE MEJORA CONTINUA (v1.24) — sugiere ajustar los tiempos ESTANDAR
// usando la MEDIANA de los tiempos reales ejecutados (robusta a outliers).
//
// Regla de negocio BIFURCADA (agrupamiento condicional):
//   - Bobinado: el estandar depende de MODELO + MAQUINA (automatica vs manual).
//               -> se agrupa por la combinacion (modelo, maquina).
//   - Montaje (y demas sectores manuales): trabajo en equipo, sin maquina.
//               -> se agrupa SOLO por MODELO (estandar "global" del modelo).
// La clave la resuelve `claveEstandar` (types) para que sea deterministica y
// coincida con el id de la fila en la tabla `tiempos_estandar`.
// ============================================================

export interface SugerenciaEstandar {
  id: string             // = claveEstandar(...) (PK en tiempos_estandar)
  area: AreaDemora
  modelo: string
  maquinaId?: string     // solo bobinado
  maquinaLabel: string   // "Bobinadora 19" | "N/A - Trabajo Manual (Montaje)"
  actualMin: number      // estandar vigente (tabla, o mediana de lo planificado)
  sugeridoMin: number    // mediana del tiempo neto real
  desviacionPct: number  // (sugerido - actual) / actual   (ej. 0.18 = +18%)
  muestras: number       // cantidad de tareas usadas
}

export interface OpcionesSugerencia {
  umbral?: number        // desviacion minima para sugerir (default 0.05 = 5%)
  minMuestras?: number   // muestras minimas para confiar en la mediana (default 3)
}

// Mediana de un arreglo de numeros (no muta el original).
export function mediana(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2
}

interface Grupo {
  area: AreaDemora
  sectorId: SectorId     // sector representativo (para etiquetar PA/PO/dist/rural)
  modelo: string
  maquinaId?: string
  netos: number[]        // tiempo neto real de cada tarea
  estandares: number[]   // tiempo estandar con que se planifico cada tarea
}

// Motor: agrupa las tareas finalizadas y devuelve las sugerencias que superan el
// umbral de desviacion respecto del estandar vigente.
export function sugerenciasEstandar(
  tareas: Tarea[],
  estandaresActuales: TiempoEstandar[],
  nombreMaquina: (id: string) => string,
  opciones: OpcionesSugerencia = {},
): SugerenciaEstandar[] {
  const umbral = opciones.umbral ?? 0.05
  const minMuestras = opciones.minMuestras ?? 3

  const vigentePorId = new Map(estandaresActuales.map((e) => [e.id, e]))

  // 1) Agrupamiento condicional segun la regla de negocio.
  const grupos = new Map<string, Grupo>()
  for (const t of tareas) {
    if (t.estado !== 'finalizada') continue
    if (esReparacion(t)) continue           // reparaciones no tienen estandar de modelo
    if (t.esPrototipo) continue             // los prototipos no afinan estandares
    if (!t.modelo) continue
    const neto = tiempoNetoMin(t)
    if (neto <= 0) continue

    const area = areaDemora(t.sectorId)
    const usaMaquina = area === 'bobinado'
    const id = claveEstandar(t.sectorId, t.modelo, t.maquinaId)
    const g = grupos.get(id) ?? {
      area, sectorId: t.sectorId, modelo: t.modelo, maquinaId: usaMaquina ? t.maquinaId : undefined, netos: [], estandares: [],
    }
    g.netos.push(neto)
    g.estandares.push(tiempoEstimadoMin(t))
    grupos.set(id, g)
  }

  // 2) Para cada grupo: mediana del neto vs estandar vigente -> desviacion.
  const out: SugerenciaEstandar[] = []
  for (const [id, g] of grupos) {
    if (g.netos.length < minMuestras) continue
    const sugeridoMin = Math.round(mediana(g.netos))
    // Estandar vigente: el guardado en la tabla si existe; si no, la mediana de
    // lo que efectivamente se planifico para ese grupo.
    const actualMin = vigentePorId.get(id)?.minutos ?? Math.round(mediana(g.estandares))
    if (actualMin <= 0) continue
    const desviacionPct = (sugeridoMin - actualMin) / actualMin
    if (Math.abs(desviacionPct) < umbral) continue

    // Bobinado: nombre de la máquina. Manual (montaje/herrería): nombre del SECTOR
    // (PA/PO · dist/rural), para que cada operación se vea como estándar separado.
    const maquinaLabel = g.area === 'bobinado' && g.maquinaId
      ? nombreMaquina(g.maquinaId)
      : `${sectorById(g.sectorId).nombre} · manual`

    out.push({ id, area: g.area, modelo: g.modelo, maquinaId: g.maquinaId, maquinaLabel, actualMin, sugeridoMin, desviacionPct, muestras: g.netos.length })
  }

  // 3) Mayor desviacion primero (lo mas urgente de corregir arriba).
  return out.sort((a, b) => Math.abs(b.desviacionPct) - Math.abs(a.desviacionPct))
}

// Convierte una sugerencia aceptada en la fila de estandar a persistir.
export function estandarDesdeSugerencia(s: SugerenciaEstandar): TiempoEstandar {
  return {
    id: s.id,
    area: s.area,
    modelo: s.modelo,
    maquinaId: s.maquinaId,
    minutos: s.sugeridoMin,
    actualizado: new Date().toISOString(),
  }
}
