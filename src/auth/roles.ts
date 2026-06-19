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
  cargarProgramacion: boolean     // planificador: programacion semanal (ordenes/fabricacion)
  configurarEstandares: boolean   // planificador: tiempos estandar
  verTodosSectores: boolean       // planificador: planta completa
  // v1.9: granularidad para reparaciones.
  gestionProduccion: boolean      // crear/editar/mover ordenes de FABRICACION + drag del Gantt
  crearReparacion: boolean        // cargar tareas de tipo 'reparacion' (encargados de planta)
}

export const PERMISOS: Record<Rol, Permisos> = {
  operario: {
    verTareasPropias: true, cambiarEstadoTarea: true, verDashboard: false,
    validarDatos: false, reasignarPrioridad: false, cargarProgramacion: false,
    configurarEstandares: false, verTodosSectores: false,
    gestionProduccion: false, crearReparacion: false,
  },
  encargado: {
    verTareasPropias: false, cambiarEstadoTarea: true, verDashboard: true,
    validarDatos: true, reasignarPrioridad: true, cargarProgramacion: false,
    configurarEstandares: false, verTodosSectores: false,
    // Encargados de planta (ulises, omar, santiago): SOLO reparaciones, sin produccion.
    gestionProduccion: false, crearReparacion: true,
  },
  planificador: {
    verTareasPropias: false, cambiarEstadoTarea: true, verDashboard: true,
    validarDatos: true, reasignarPrioridad: true, cargarProgramacion: true,
    configurarEstandares: true, verTodosSectores: true,
    gestionProduccion: true, crearReparacion: true,
  },
  // v1.11: Logistica = SOLO lectura. Ve la planta para anticipar abastecimiento.
  logistica: {
    verTareasPropias: false, cambiarEstadoTarea: false, verDashboard: true,
    validarDatos: false, reasignarPrioridad: false, cargarProgramacion: false,
    configurarEstandares: false, verTodosSectores: true,
    gestionProduccion: false, crearReparacion: false,
  },
}

export const ROL_LABEL: Record<Rol, string> = {
  operario: 'Operario',
  encargado: 'Encargado',
  planificador: 'Planificador',
  logistica: 'Logística',
}
