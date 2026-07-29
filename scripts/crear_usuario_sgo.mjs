// Crea/vincula EXCLUSIVAMENTE la cuenta GestionSGO de Supabase Auth.
// Requisito: ejecutar antes docs/supabase_sgo_nucleo_v1.49.sql.
//
// PowerShell, desde la raiz del proyecto:
//   $env:SUPABASE_URL="https://TU-ID.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."
//   $env:CLAVE_INICIAL="una-clave-segura"
//   node scripts/crear_usuario_sgo.mjs

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const CLAVE_INICIAL = process.env.CLAVE_INICIAL?.trim()
const USUARIO = 'GestionSGO'
const EMAIL = 'gestionsgo@inelpa.local'

if (!URL || !SERVICE_KEY || !CLAVE_INICIAL) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o CLAVE_INICIAL.')
  process.exit(1)
}
if (CLAVE_INICIAL.length < 8) {
  console.error('CLAVE_INICIAL debe tener al menos 8 caracteres.')
  process.exit(1)
}

const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function buscarAuth() {
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const encontrada = data.users.find((u) => u.email?.toLowerCase() === EMAIL)
    if (encontrada) return encontrada
    if (data.users.length < 200) return undefined
    page++
  }
}

async function main() {
  // Perfil de aplicacion. Requiere que el enum rol_usuario ya contenga 'sgo'.
  const { data: perfil, error: perfilError } = await admin.from('usuarios').upsert({
    nombre: 'Gestión SGO', usuario: USUARIO, rol: 'sgo', grupo_nomina: null, activo: true,
  }, { onConflict: 'usuario' }).select('id, auth_id').single()
  if (perfilError) throw new Error(`No se pudo crear el perfil: ${perfilError.message}`)

  let authUser = await buscarAuth()
  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL, password: CLAVE_INICIAL, email_confirm: true,
      user_metadata: { nombre: 'Gestión SGO', usuario: USUARIO },
    })
    if (error) throw new Error(`No se pudo crear Auth: ${error.message}`)
    authUser = data.user
    console.log(`Cuenta creada: ${EMAIL}`)
  } else {
    console.log(`La cuenta ya existía: ${EMAIL}`)
  }

  if (perfil.auth_id !== authUser.id) {
    const { error } = await admin.from('usuarios').update({ auth_id: authUser.id }).eq('id', perfil.id)
    if (error) throw new Error(`No se pudo vincular auth_id: ${error.message}`)
  }
  console.log(`Listo. Ingreso: ${USUARIO}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
