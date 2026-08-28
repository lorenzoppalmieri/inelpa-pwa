import { db } from '../db/dexie'
import { guardarIndicadorSGO, guardarMedicionIndicadorSGO } from '../sync/syncEngine'
import { idMedicionIndicador } from './indicadores'
import { resumirMes5S } from './kpi5S'
import { areaSGOLabel, type AreaSGOId, type PilarSGO } from './types'

const DEFINICIONES = [
  { sufijo: '', nombre: 'Cumplimiento físico 5S', pilar: 'mejora' as PilarSGO, campo: 'promedioFisico' as const },
  { sufijo: '-premiable', nombre: 'Cumplimiento 5S premiable', pilar: 'mejora' as PilarSGO, campo: 'promedioPremiable' as const },
  { sufijo: '-seguridad', nombre: 'Cumplimiento de Seguridad en 5S', pilar: 'seguridad' as PilarSGO, campo: 'promedioSeguridad' as const },
  { sufijo: '-ambiente', nombre: 'Cumplimiento Ambiental en 5S', pilar: 'ambiente' as PilarSGO, campo: 'promedioAmbiente' as const },
]

/** Recalcula los KPI desde todas las auditorías del área y mes; nunca desde un único informe. */
export async function actualizarIndicadoresMensuales5S(
  areaId: AreaSGOId, periodo: string, usuario: string, evidencia: string,
): Promise<void> {
  const ejecuciones = await db.ejecucionesControlesSGO.toArray()
  const resumen = resumirMes5S(ejecuciones, periodo).find((item) => item.areaId === areaId)
  if (!resumen) return
  const ahora = new Date().toISOString()

  for (const definicion of DEFINICIONES) {
    const indicadorId = `sgo-5s${definicion.sufijo}-${areaId}`
    const valor = resumen[definicion.campo]
    const existente = await db.indicadoresSGO.get(indicadorId)
    if (!existente || existente.periodo <= periodo) {
      await guardarIndicadorSGO({
        id: indicadorId, areaId, pilar: definicion.pilar, nombre: definicion.nombre, unidad: '%', direccion: 'mayor_mejor',
        meta: 90, umbralAmarillo: 75, valorActual: valor, origen: 'manual', periodo, frecuencia: 'mensual', activo: true,
        actualizadoEn: ahora, actualizadoPor: usuario,
      })
    }
    await guardarMedicionIndicadorSGO({
      id: idMedicionIndicador(indicadorId, periodo), indicadorId, periodo, valor,
      explicacion: `Promedio de ${resumen.auditorias} auditoría(s) 5S realizadas en ${areaSGOLabel(areaId)} durante el mes.`,
      evidencia, cerrado: false, registradoEn: ahora, registradoPor: usuario, actualizadoEn: ahora, actualizadoPor: usuario,
    })
  }
}
