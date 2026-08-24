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
  // v1.37: Laboratorio = solo su cola de ensayos (vista propia).
  laboratorio: {
    verTareasPropias: false, cambiarEstadoTarea: false, verDashboard: false,
    validarDatos: false, reasignarPrioridad: false, cargarProgramacion: false,
    configurarEstandares: false, verTodosSectores: false,
    gestionProduccion: false, crearReparacion: false,
  },
  // SGO administra eventos, no conformidades y acciones; no modifica la
  // programacion productiva ni opera los modulos de otras areas.
  sgo: {
    verTareasPropias: false, cambiarEstadoTarea: false, verDashboard: true,
    validarDatos: true, reasignarPrioridad: false, cargarProgramacion: false,
    configurarEstandares: false, verTodosSectores: true,
    gestionProduccion: false, crearReparacion: false,
  },
  // v1.62: Mantenimiento (jefe) y tecnicos NO operan los modulos productivos;
  // su pantalla es el editor de mapa (src/mantenimiento). Solo lectura de planta.
  mantenimiento: {
    verTareasPropias: false, cambiarEstadoTarea: false, verDashboard: true,
    validarDatos: false, reasignarPrioridad: false, cargarProgramacion: false,
    configurarEstandares: false, verTodosSectores: true,
    gestionProduccion: false, crearReparacion: false,
  },
  mant_tecnico: {
    verTareasPropias: false, cambiarEstadoTarea: false, verDashboard: false,
    validarDatos: false, reasignarPrioridad: false, cargarProgramacion: false,
    configurarEstandares: false, verTodosSectores: false,
    gestionProduccion: false, crearReparacion: false,
  },
}

// ============================================================
// SUPER ADMIN (v1.43) — Planificación/Gerencia.
// Lista blanca de cuentas que ven el layout de ERP (menú lateral) y pueden
// entrar a los módulos de los demás encargados (Logística, Laboratorio,
// Despacho) con los MISMOS permisos que su responsable.
// No es el rol 'planificador' completo a propósito: hay varios planificadores
// (rocio, alassiato.lucas, zurvera.rocio) que NO deben tener este acceso.
// Para sumar a alguien, agregá su usuario a esta lista.
// ============================================================
// v1.95: se suma 'direccion' — cuenta compartida de Guillermo y Mario. Ve lo
// mismo que Lorenzo (sidebar ERP, Logística, Laboratorio, Despacho, SGO y la
// vista ejecutiva Dirección), pero NO hereda sus poderes destructivos: eliminar
// registros de SGO, cerrar retrabajos críticos, confirmar costeos y cambiar el
// tarifario siguen siendo exclusivos de Lorenzo (ver sgo/permisos.ts).
// Es a propósito: al ser una cuenta de dos personas, la auditoría no podría
// decir quién hizo qué.
export const SUPER_ADMINS: string[] = ['lorenzo', 'direccion']

export function esSuperAdmin(u?: { usuario?: string } | null): boolean {
  return !!u?.usuario && SUPER_ADMINS.includes(u.usuario)
}

/**
 * Cuentas del DIRECTORIO: ven la pestaña ejecutiva 📊 Dirección.
 * Antes era `usuario === 'lorenzo'` escrito a mano en DashboardView, así que el
 * usuario 'direccion' no habría visto la vista Dirección.
 */
export const DIRECTORIO: string[] = ['lorenzo', 'direccion']

export function esDirectorio(u?: { usuario?: string } | null): boolean {
  return !!u?.usuario && DIRECTORIO.includes(u.usuario)
}

export const ROL_LABEL: Record<Rol, string> = {
  operario: 'Operario',
  encargado: 'Encargado',
  planificador: 'Planificador',
  logistica: 'Logística',
  laboratorio: 'Laboratorio',
  sgo: 'SGO Integral',
  mantenimiento: 'Mantenimiento',
  mant_tecnico: 'Técnico Mant.',
}
