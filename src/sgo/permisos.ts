export function usuarioEsLorenzo(usuario: string): boolean {
  return usuario.trim().toLowerCase() === 'lorenzo'
}

export function exigirPermisoBorradoSGO(usuario: string): void {
  if (!usuarioEsLorenzo(usuario)) {
    throw new Error('Solo el usuario Lorenzo puede eliminar registros de SGO.')
  }
}

export function exigirPermisoGestionAgendaISO(usuario: string): void {
  if (!['lorenzo', 'azul'].includes(usuario.trim().toLowerCase())) {
    throw new Error('Solo Lorenzo y Azul pueden modificar la Agenda ISO.')
  }
}

export function exigirPermisoGuardarTareaSGO(usuario: string, asignadoA: string, existe: boolean): void {
  const u = usuario.trim().toLowerCase()
  if ((!existe && u !== 'lorenzo') || (existe && u !== 'lorenzo' && u !== asignadoA)) {
    throw new Error('No tenés permiso para modificar esta tarea SGO.')
  }
}
