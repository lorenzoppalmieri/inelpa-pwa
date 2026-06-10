import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Cliente unico de Supabase (Auth + datos + Realtime).
// Las credenciales vienen de variables de entorno (.env / panel de Vercel):
//   VITE_SUPABASE_URL       -> Project Settings -> API -> Project URL
//   VITE_SUPABASE_ANON_KEY  -> Project Settings -> API -> anon public
// Si faltan, supabase = null y la app avisa en el login (no rompe el arranque).
// ============================================================
// Normalizamos la URL: sin espacios y sin barra(s) al final, que rompen
// las rutas de Auth (//auth/v1/...) -> "Invalid path specified in request URL".
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/+$/, '')
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export const SUPABASE_HABILITADO = Boolean(url && key)

export const supabase: SupabaseClient | null = SUPABASE_HABILITADO
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null

// ------------------------------------------------------------
// Convencion de email sintetico.
// El login de planta es por "usuario" (ej. "lorenzo", "carruega.roberto"),
// pero Supabase Auth requiere un email. Mapeamos usuario -> usuario@DOMINIO.
// Las cuentas en Supabase Auth se crean con ese mismo email.
// Podes cambiar el dominio si la empresa tiene uno propio.
// ------------------------------------------------------------
export const EMAIL_DOMINIO = 'inelpa.local'

export function usuarioAEmail(usuario: string): string {
  const u = usuario.trim().toLowerCase()
  return u.includes('@') ? u : `${u}@${EMAIL_DOMINIO}`
}
