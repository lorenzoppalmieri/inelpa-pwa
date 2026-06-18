import type { Tarea, EstadoTarea } from '../types'
import { sectorById } from '../types'
import { calcularOEE } from './kpi'
import { programar } from './programacion'
import { componentePorCodigo } from '../data/catalogo'
import { fmtDur } from './time'

const ESTADO_LABEL: Record<EstadoTarea, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  pausada: 'Pausada',
  finalizada: 'Finalizada',
}

// ============================================================
// Exportacion de reportes (KPIs y programacion) a CSV.
//
// Se usa CSV UTF-8 con BOM y separador ";" -> Excel (es-AR) lo abre directo,
// con acentos correctos y columnas separadas, sin dependencias externas.
// ============================================================

type Celda = string | number

// Descarga un arreglo de filas como archivo .csv.
function descargarCSV(nombre: string, filas: Celda[][]): void {
  const sep = ';'
  const esc = (v: Celda): string => {
    const s = String(v ?? '')
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const csv = '﻿' + filas.map((f) => f.map(esc).join(sep)).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Porcentaje con 1 decimal y coma decimal (formato es-AR para Excel).
function p1(n: number): string { return (n * 100).toFixed(1).replace('.', ',') }
function slug(s: string): string { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') }
function sello(): string { return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') }

function esFinalizada(t: Tarea): boolean { return t.estado === 'finalizada' && !!t.inicioReal && !!t.finReal }
function fechaHora(iso?: string): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ---------- 1) KPIs / OEE por estacion y por sector ----------
export function hayDatosKpi(tareas: Tarea[]): boolean {
  return tareas.some(esFinalizada)
}

export function exportarKpisCSV(
  tareas: Tarea[],
  nombreMaquina: (id: string) => string,
  periodoLabel: string,
): boolean {
  const fin = tareas.filter(esFinalizada)
  if (fin.length === 0) return false

  const filas: Celda[][] = []
  filas.push(['Reporte de eficiencia (OEE) - INELPA'])
  filas.push(['Periodo', periodoLabel])
  filas.push(['Generado', new Date().toLocaleString('es-AR')])
  filas.push(['Tareas finalizadas', fin.length])
  filas.push([])

  const header = ['', 'Disponibilidad %', 'Rendimiento %', 'Calidad %', 'OEE %', 'Tareas finalizadas']

  // Por estacion (maquina)
  filas.push(['POR ESTACION (MAQUINA)'])
  filas.push(['Estacion', ...header.slice(1)])
  const porMaq = new Map<string, Tarea[]>()
  for (const t of fin) { const a = porMaq.get(t.maquinaId) ?? []; a.push(t); porMaq.set(t.maquinaId, a) }
  ;[...porMaq.entries()]
    .map(([id, ts]) => ({ nombre: nombreMaquina(id), ts, oee: calcularOEE(ts) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach(({ nombre, ts, oee }) => filas.push([nombre, p1(oee.disponibilidad), p1(oee.rendimiento), p1(oee.calidad), p1(oee.oee), ts.length]))
  filas.push([])

  // Por sector
  filas.push(['POR SECTOR'])
  filas.push(['Sector', ...header.slice(1)])
  const porSec = new Map<string, Tarea[]>()
  for (const t of fin) { const a = porSec.get(t.sectorId) ?? []; a.push(t); porSec.set(t.sectorId, a) }
  ;[...porSec.entries()]
    .map(([id, ts]) => ({ nombre: sectorById(id as Tarea['sectorId']).nombre, ts, oee: calcularOEE(ts) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach(({ nombre, ts, oee }) => filas.push([nombre, p1(oee.disponibilidad), p1(oee.rendimiento), p1(oee.calidad), p1(oee.oee), ts.length]))
  filas.push([])

  // Total planta
  const g = calcularOEE(fin)
  filas.push(['TOTAL PLANTA', p1(g.disponibilidad), p1(g.rendimiento), p1(g.calidad), p1(g.oee), fin.length])

  descargarCSV(`OEE_${slug(periodoLabel)}_${sello()}.csv`, filas)
  return true
}

// ---------- 2) Programacion activa (cola del Gantt) ----------
export function hayDatosProgramacion(tareas: Tarea[]): boolean {
  return tareas.some((t) => t.estado !== 'finalizada')
}

export function exportarProgramacionCSV(
  tareas: Tarea[],
  ahoraISO: string,
  nombreMaquina: (id: string) => string,
  nombreOperario: (id: string) => string,
  materialTarea: (t: Tarea) => string,
): boolean {
  const activas = tareas.filter((t) => t.estado !== 'finalizada')
  if (activas.length === 0) return false

  const plan = programar(tareas, ahoraISO)
  const rows = activas
    .map((t) => ({ t, p: plan.get(t.id) }))
    .filter((x): x is { t: Tarea; p: { startISO: string; endISO: string; estimada: boolean } } => !!x.p)
    .sort((a, b) => {
      const ma = nombreMaquina(a.t.maquinaId), mb = nombreMaquina(b.t.maquinaId)
      if (ma !== mb) return ma.localeCompare(mb)
      return a.p.startISO < b.p.startISO ? -1 : a.p.startISO > b.p.startISO ? 1 : 0
    })

  const filas: Celda[][] = []
  filas.push(['Programacion activa - INELPA'])
  filas.push(['Generado', new Date().toLocaleString('es-AR')])
  filas.push(['Tareas en cola', rows.length])
  filas.push([])
  filas.push(['ID Tarea', 'Estacion', 'Operario', 'Modelo', 'Semielaborado', 'Material', 'Estado', 'Inicio planificado', 'Fin estimado', 'Duracion estimada'])
  for (const { t, p } of rows) {
    // Descripcion del semielaborado (OITM/OITT) resuelta desde el catalogo,
    // igual que en la barra del Gantt. '-' si la tarea no tiene (ej. reparacion).
    const semielaborado = componentePorCodigo(t.componenteCodigo)?.descripcion ?? '-'
    filas.push([
      t.id,
      nombreMaquina(t.maquinaId),
      t.operarioId ? nombreOperario(t.operarioId) : '-',
      t.modelo,
      semielaborado,
      materialTarea(t),
      ESTADO_LABEL[t.estado] ?? t.estado,
      fechaHora(p.startISO),
      fechaHora(p.endISO),
      fmtDur(t.tiempoEstandarMin),
    ])
  }

  descargarCSV(`Programacion_${sello()}.csv`, filas)
  return true
}
