import type { Rol } from '../types'

// ============================================================
// Matriz de seguridad de 3 niveles.
// ============================================================
export interface Permisos {
  verTareasPropias: boolean       // operario: solo su sector / semana
  cambiarEstadoTarea: boolean     // registrar inicio/fin/paradas
  verDashboard: boolean           // Gantt + KPIs
  validarDatos: boolean           // encargado: validar cargas de planta
  reasignarPrioridad: boolean     // encargado: prioridades diarias
  cargarProgramacion: boolean     // planificador: programacion semanal
  configurarEstandares: boolean   // planificador: tiempos estandar
  verTodosSectores: boolean       // planificador: planta completa
}

export const PERMISOS: Record<Rol, Permisos> = {
  operario: {
    verTareasPropias: true, cambiarEstadoTarea: true, verDashboard: false,
    validarDatos: false, reasignarPrioridad: false, cargarProgramacion: false,
    configurarEstandares: false, verTodosSectores: false,
  },
  encargado: {
    verTareasPropias: false, cambiarEstadoTarea: true, verDashboard: true,
    validarDatos: true, reasignarPrioridad: true, cargarProgramacion: false,
    configurarEstandares: false, verTodosSectores: false,
  },
  planificador: {
    verTareasPropias: false, cambiarEstadoTarea: true, verDashboard: true,
    validarDatos: true, reasignarPrioridad: true, cargarProgramacion: true,
    configurarEstandares: true, verTodosSectores: true,
  },
}

export const ROL_LABEL: Record<Rol, string> = {
  operario: 'Operario',
  encargado: 'Encargado',
  planificador: 'Planificador',
}
