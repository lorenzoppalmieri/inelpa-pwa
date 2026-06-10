import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, usuarioAEmail } from '../lib/supabaseClient'
import { iniciarSync, detenerSync } from '../sync/syncEngine'
import { PERMISOS, type Permisos } from './roles'
import type { Usuario, Rol, SectorId, GrupoNomina } from '../types'

interface AuthState {
  usuario: Usuario | null
  permisos: Permisos | null
  cargando: boolean
  login: (usuario: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

const Ctx = createContext<AuthState>(null!)

// ------------------------------------------------------------
// Carga el PERFIL DE PLANTA (rol, nombre, sectores) desde la tabla 'usuarios'
// de Supabase, vinculado por auth_id al usuario logueado en Supabase Auth.
// Devuelve null si la cuenta no tiene perfil o esta inactiva.
// ------------------------------------------------------------
async function cargarPerfil(authId: string): Promise<Usuario | null> {
  if (!supabase) return null
  const { data: perfil, error } = await supabase
    .from('usuarios')
    .select('id, nombre, usuario, rol, grupo_nomina, activo')
    .eq('auth_id', authId)
    .maybeSingle()
  if (error || !perfil || !perfil.activo) return null

  // Sectores que el usuario ve/gestiona (N:N).
  const { data: secs } = await supabase
    .from('usuario_sectores')
    .select('sector_id')
    .eq('usuario_id', perfil.id)

  return {
    id: perfil.id,
    nombre: perfil.nombre,
    usuario: perfil.usuario,
    passwordHash: '', // ya no se usa: la verificacion la hace Supabase Auth.
    rol: perfil.rol as Rol,
    sectores: (secs ?? []).map((s) => s.sector_id as SectorId),
    grupoNomina: (perfil.grupo_nomina as GrupoNomina | null) ?? undefined,
    activo: perfil.activo,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!supabase) { setCargando(false); return }

    // 1) Restaurar sesion existente al abrir la app (la guarda Supabase en localStorage).
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const perfil = await cargarPerfil(data.session.user.id)
        setUsuario(perfil)
        if (perfil) void iniciarSync() // fetch inicial + Realtime
      }
      setCargando(false)
    })

    // 2) Escuchar cambios de sesion (login, refresh de token, logout en otra pestana).
    const { data: sub } = supabase.auth.onAuthStateChange(async (evt, session) => {
      if (!session) {
        setUsuario(null)
        if (evt === 'SIGNED_OUT') void detenerSync()
        return
      }
      const perfil = await cargarPerfil(session.user.id)
      setUsuario(perfil)
      if (perfil) void iniciarSync() // idempotente: no re-sincroniza si ya esta activa
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function login(user: string, password: string) {
    if (!supabase) return { ok: false, error: 'Supabase no esta configurado (.env)' }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usuarioAEmail(user),
      password,
    })
    if (error || !data.user) {
      const msg = error?.message ?? ''
      if (/email not confirmed/i.test(msg))
        return { ok: false, error: 'La cuenta existe pero no esta confirmada (activa "Auto Confirm User")' }
      // Mensaje generico: no exponemos el detalle interno de Supabase al usuario final.
      return { ok: false, error: 'Usuario o contrasena incorrectos' }
    }

    const perfil = await cargarPerfil(data.user.id)
    if (!perfil) {
      await supabase.auth.signOut()
      return { ok: false, error: 'La cuenta no tiene un perfil de planta asignado o esta inactiva' }
    }
    setUsuario(perfil)
    void iniciarSync() // fetch inicial + Realtime (idempotente)
    return { ok: true }
  }

  async function logout() {
    await detenerSync()
    if (supabase) await supabase.auth.signOut()
    setUsuario(null)
  }

  const permisos = usuario ? PERMISOS[usuario.rol] : null
  return <Ctx.Provider value={{ usuario, permisos, cargando, login, logout }}>{children}</Ctx.Provider>
}

export function useAuth() {
  return useContext(Ctx)
}
