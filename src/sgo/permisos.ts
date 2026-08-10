export function usuarioEsLorenzo(usuario: string): boolean {
  return usuario.trim().toLowerCase() === 'lorenzo'
}

export function exigirPermisoBorradoSGO(usuario: string): void {
  if (!usuarioEsLorenzo(usuario)) {
    throw new Error('Solo el usuario Lorenzo puede eliminar registros de SGO.')
  }
}
