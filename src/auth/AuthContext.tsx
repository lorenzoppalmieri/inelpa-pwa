import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase, usuarioAEmail } from '../lib/supabaseClient'
import { iniciarSync, detenerSync } from '../sync/syncEngine'
import { PERMISOS, type Permisos } from './roles'
import type { Usuario, Rol, SectorId, GrupoNomina } from '../types'

interface AuthState {
  usuario: Usuario | null
  permisos: Permisos | null
  cargando: boolean
  login: (usuario: string, password: string) => Promise<{ ok: boolean; error?: string }>
  cambiarPassword: (nueva: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

const Ctx = createContext<AuthState>(null!)

// ------------------------------------------------------------
// Cache local del PERFIL (rol/nombre/sectores). Permite restaurar la sesion
// offline: si la tablet recarga sin internet pero el token sigue vigente, el
// lookup de red a 'usuarios' falla; en ese caso usamos este cache en vez de
// expulsar al usuario al Login.
// ------------------------------------------------------------
const CACHE_KEY = 'inelpa_perfil'
function guardarCache(u: Usuario) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(u)) } catch { /* storage lleno/bloqueado */ } }
function leerCache(): Usuario | null {
  try { const s = localStorage.getItem(CACHE_KEY); return s ? (JSON.parse(s) as Usuario) : null } catch { return null }
}
function borrarCache() { try { localStorage.removeItem(CACHE_KEY) } catch { /* noop */ } }

// Heuristica: ¿el fallo es por falta de conexion (no por credenciales/perfil)?
function esErrorDeRed(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = (typeof e === 'object' && e && 'message' in e ? String((e as { message?: unknown }).message) : String(e))
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg)
}

// ------------------------------------------------------------
// Carga el PERFIL DE PLANTA desde 'usuarios', vinculado por auth_id.
//  - Devuelve null si la cuenta no tiene perfil o esta inactiva (caso real).
//  - LANZA si el fallo es de red (offline): el caller decide usar el cache.
// ------------------------------------------------------------
async function cargarPerfil(authId: string): Promise<Usuario | null> {
  if (!supabase) return null
  const { data: perfil, error } = await supabase
    .from('usuarios')
    .select('id, nombre, usuario, rol, grupo_nomina, activo')
    .eq('auth_id', authId)
    .maybeSingle()
  if (error) {
    if (esErrorDeRed(error)) throw new Error('OFFLINE')
    return null
  }
  if (!perfil || !perfil.activo) return null

  // Sectores que el usuario ve/gestiona (N:N).
  const { data: secs, error: e2 } = await supabase
    .from('usuario_sectores')
    .select('sector_id')
    .eq('usuario_id', perfil.id)
  if (e2 && esErrorDeRed(e2)) throw new Error('OFFLINE')

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
  // Ref espejo para handlers (online) sin recrear el efecto.
  const usuarioRef = useRef<Usuario | null>(null)
  useEffect(() => { usuarioRef.current = usuario }, [usuario])

  useEffect(() => {
    if (!supabase) { setCargando(false); return }
    let activo = true

    // Resuelve una sesion -> perfil (de red si hay; del cache si esta offline).
    // Importante: solo arrancamos sync si hay conexion. fetchInicial() limpia
    // Dexie antes de traer datos; correrlo offline borraria el espejo local.
    async function aplicarSesion(userId: string) {
      try {
        const perfil = await cargarPerfil(userId)
        if (!activo) return
        if (perfil) {
          guardarCache(perfil)
          setUsuario(perfil)
          if (navigator.onLine) void iniciarSync()
        } else {
          borrarCache() // perfil real inexistente/inactivo
          setUsuario(null)
        }
      } catch {
        // Fallo de red: token valido pero sin internet -> restaurar del cache.
        if (!activo) return
        const cache = leerCache()
        if (cache) setUsuario(cache) // app sigue usable offline; sync arranca al reconectar
        else setUsuario(null)
      }
    }

    // 1) Restaurar sesion existente al abrir la app (token en localStorage).
    ;(async () => {
      try {
        const { data } = await supabase!.auth.getSession()
        if (data.session) await aplicarSesion(data.session.user.id)
      } catch {
        const cache = leerCache()
        if (activo && cache) setUsuario(cache)
      } finally {
        if (activo) setCargando(false)
      }
    })()

    // 2) Cambios de sesion (login, refresh de token, logout en otra pestana).
    //    Ignoramos INITIAL_SESSION: ya lo maneja getSession() de arriba.
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === 'INITIAL_SESSION') return
      if (!session) {
        borrarCache()
        setUsuario(null)
        if (evt === 'SIGNED_OUT') void detenerSync()
        return
      }
      void aplicarSesion(session.user.id)
    })

    // 3) Al recuperar conexion: arrancar/reintentar sync sin volver al Login.
    const onOnline = () => { if (usuarioRef.current) void iniciarSync() }
    window.addEventListener('online', onOnline)

    return () => {
      activo = false
      sub.subscription.unsubscribe()
      window.removeEventListener('online', onOnline)
    }
  }, [])

  async function login(user: string, password: string) {
    if (!supabase) return { ok: false, error: 'Supabase no esta configurado (.env)' }
    // El PRIMER inicio de sesion requiere internet (Supabase valida online).
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { ok: false, error: 'Sin conexion a internet. El inicio de sesion requiere estar en linea.' }
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: usuarioAEmail(user), password })
      if (error || !data?.user) {
        const msg = error?.message ?? ''
        if (esErrorDeRed(error)) return { ok: false, error: 'No se pudo conectar. Verifica tu conexion a internet.' }
        if (/email not confirmed/i.test(msg))
          return { ok: false, error: 'La cuenta existe pero no esta confirmada (activa "Auto Confirm User")' }
        // Mensaje generico: no exponemos el detalle interno de Supabase.
        return { ok: false, error: 'Usuario o contrasena incorrectos' }
      }

      const perfil = await cargarPerfil(data.user.id)
      if (!perfil) {
        await supabase.auth.signOut()
        return { ok: false, error: 'La cuenta no tiene un perfil de planta asignado o esta inactiva' }
      }
      guardarCache(perfil)
      setUsuario(perfil)
      void iniciarSync() // online garantizado aqui
      return { ok: true }
    } catch (e) {
      // signIn o cargarPerfil lanzaron por falta de red.
      if (esErrorDeRed(e)) return { ok: false, error: 'No se pudo conectar. Verifica tu conexion a internet.' }
      return { ok: false, error: 'Error inesperado al iniciar sesion' }
    }
  }

  // El usuario logueado cambia SU PROPIA contrasena (Supabase Auth, online).
  // No requiere intervencion del admin. Min. 6 caracteres (regla de Supabase).
  async function cambiarPassword(nueva: string) {
    if (!supabase) return { ok: false, error: 'Supabase no esta configurado (.env)' }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { ok: false, error: 'Necesitas conexion a internet para cambiar la contrasena.' }
    }
    if (nueva.length < 6) return { ok: false, error: 'La contrasena debe tener al menos 6 caracteres.' }
    try {
      const { error } = await supabase.auth.updateUser({ password: nueva })
      if (error) {
        if (esErrorDeRed(error)) return { ok: false, error: 'No se pudo conectar. Verifica tu conexion a internet.' }
        if (/should be|at least|6 char|weak|short/i.test(error.message)) {
          return { ok: false, error: 'La contrasena es demasiado corta o debil (minimo 6 caracteres).' }
        }
        return { ok: false, error: 'No se pudo cambiar la contrasena. Intenta de nuevo.' }
      }
      return { ok: true }
    } catch (e) {
      if (esErrorDeRed(e)) return { ok: false, error: 'No se pudo conectar. Verifica tu conexion a internet.' }
      return { ok: false, error: 'Error inesperado al cambiar la contrasena.' }
    }
  }

  async function logout() {
    borrarCache()
    await detenerSync()
    if (supabase) await supabase.auth.signOut()
    setUsuario(null)
  }

  const permisos = usuario ? PERMISOS[usuario.rol] : null
  return <Ctx.Provider value={{ usuario, permisos, cargando, login, cambiarPassword, logout }}>{children}</Ctx.Provider>
}

export function useAuth() {
  return useContext(Ctx)
}
