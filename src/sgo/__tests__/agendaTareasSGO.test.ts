import { describe, expect, it } from 'vitest'
import { agendaISOEstaVencida, agendaISOProxima, puedeGestionarAgendaISO, type ActividadAgendaISO } from '../agendaISO'
import { tareaSGOVencida, tiempoTareaSGOEnMinutos, tiempoTareaSGOLabel, usuarioPuedeTrabajarTareaSGO, type TareaSGO } from '../tareasSGO'
import { exigirPermisoGuardarTareaSGO, exigirPermisoGestionAgendaISO } from '../permisos'

const actividad: ActividadAgendaISO = { id:'a',titulo:'Auditoría',categoria:'auditoria_interna',normas:['iso_9001'],responsable:'Azul',frecuencia:'anual',fechaObjetivo:'2026-08-10',avisoDias:30,estado:'planificada',criticidad:'alta',creadoEn:'',creadoPor:'',actualizadoEn:'',actualizadoPor:'' }
const tarea: TareaSGO = { id:'t',titulo:'Control',objetivo:'Cumplir',descripcion:'Revisar',asignadoA:'lara',importancia:'alta',tiempoEstimadoMin:60,fechaLimite:'2026-08-10',estado:'asignada',creadoEn:'',creadoPor:'lorenzo',actualizadoEn:'',actualizadoPor:'lorenzo' }

describe('Agenda ISO',()=>{
  it('detecta vencimientos y próximas fechas',()=>{expect(agendaISOEstaVencida(actividad,'2026-08-12')).toBe(true);expect(agendaISOProxima({...actividad,fechaObjetivo:'2026-08-20'},'2026-08-12','2026-09-11')).toBe(true)})
  it('limita la gestión a Azul y Lorenzo',()=>{expect(puedeGestionarAgendaISO('azul')).toBe(true);expect(puedeGestionarAgendaISO('lara')).toBe(false);expect(()=>exigirPermisoGestionAgendaISO('nicolas.sgo')).toThrow()})
})

describe('Tareas SGO',()=>{
  it('convierte horas, dias y semanas manteniendo minutos en la base',()=>{
    expect(tiempoTareaSGOEnMinutos(2,'horas')).toBe(120)
    expect(tiempoTareaSGOEnMinutos(1,'dias')).toBe(540)
    expect(tiempoTareaSGOEnMinutos(1.5,'semanas')).toBe(4050)
    expect(tiempoTareaSGOLabel(60)).toBe('1 hora')
    expect(tiempoTareaSGOLabel(540)).toBe('1 día')
    expect(tiempoTareaSGOLabel(2700)).toBe('1 semana')
  })
  it('solo permite trabajar al asignado o Lorenzo',()=>{expect(usuarioPuedeTrabajarTareaSGO('lara',tarea)).toBe(true);expect(usuarioPuedeTrabajarTareaSGO('azul',tarea)).toBe(false);expect(()=>exigirPermisoGuardarTareaSGO('azul','lara',true)).toThrow()})
  it('marca vencida solo mientras sigue abierta',()=>{expect(tareaSGOVencida(tarea,'2026-08-12')).toBe(true);expect(tareaSGOVencida({...tarea,estado:'verificada'},'2026-08-12')).toBe(false)})
})
