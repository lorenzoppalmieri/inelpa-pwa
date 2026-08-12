// Crea y vincula las cuentas individuales del equipo SGO.
// No modifica la contraseña de una cuenta que ya exista.
//
// Requisitos:
//   1) La tabla public.usuarios debe admitir el rol 'sgo'.
//   2) Ejecutar desde una terminal local con la SERVICE ROLE KEY. Nunca guardar
//      esa clave en .env, Git, la PWA ni compartirla por chat.
//
// PowerShell, desde la raíz del proyecto:
//   $env:SUPABASE_URL="https://TU-ID.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."
//   $env:CLAVE_LARA="clave-individual-segura"
//   $env:CLAVE_NICOLAS="otra-clave-individual-segura"
//   $env:CLAVE_AZUL="otra-clave-individual-segura"
//   node scripts/crear_equipo_sgo.mjs
//
// Al terminar, limpiar los secretos de la terminal:
//   Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY,Env:CLAVE_LARA,Env:CLAVE_NICOLAS,Env:CLAVE_AZUL

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

const EQUIPO = [
  { nombre: 'Lara', usuario: 'lara', email: 'lara@inelpa.local', clave: process.env.CLAVE_LARA?.trim() },
  // `nicolas` ya pertenece a Mantenimiento; no se reutiliza ni se cambia su rol.
  { nombre: 'Nicolas - Auditor de Logistica', usuario: 'nicolas.sgo', email: 'nicolas.sgo@inelpa.local', clave: process.env.CLAVE_NICOLAS?.trim() },
  { nombre: 'Azul', usuario: 'azul', email: 'azul@inelpa.local', clave: process.env.CLAVE_AZUL?.trim() },
]

if (!URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const sinClave = EQUIPO.filter((u) => !u.clave || u.clave.length < 10)
if (sinClave.length) {
  console.error(`Cada clave debe tener al menos 10 caracteres. Revisar: ${sinClave.map((u) => u.usuario).join(', ')}`)
  process.exit(1)
}

if (new Set(EQUIPO.map((u) => u.clave)).size !== EQUIPO.length) {
  console.error('Las tres personas deben tener contraseñas diferentes.')
  process.exit(1)
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function listarUsuariosAuth() {
  const usuarios = []
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`No se pudo consultar Supabase Auth: ${error.message}`)
    usuarios.push(...data.users)
    if (data.users.length < 200) return usuarios
    page += 1
  }
}

async function crearOVincular(definicion, authExistentes) {
  const { data: perfil, error: perfilError } = await admin.from('usuarios').upsert({
    nombre: definicion.nombre,
    usuario: definicion.usuario,
    rol: 'sgo',
    grupo_nomina: null,
    activo: true,
  }, { onConflict: 'usuario' }).select('id, auth_id').single()
  if (perfilError) throw new Error(`${definicion.usuario}: no se pudo crear el perfil: ${perfilError.message}`)

  let authUser = authExistentes.find((u) => u.email?.toLowerCase() === definicion.email)
  let creada = false
  if (!authUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: definicion.email,
      password: definicion.clave,
      email_confirm: true,
      user_metadata: { nombre: definicion.nombre, usuario: definicion.usuario, equipo: 'SGO' },
    })
    if (error || !data.user) throw new Error(`${definicion.usuario}: no se pudo crear Auth: ${error?.message ?? 'respuesta vacía'}`)
    authUser = data.user
    authExistentes.push(authUser)
    creada = true
  }

  if (perfil.auth_id !== authUser.id) {
    const { error } = await admin.from('usuarios').update({ auth_id: authUser.id, activo: true }).eq('id', perfil.id)
    if (error) throw new Error(`${definicion.usuario}: no se pudo vincular auth_id: ${error.message}`)
  }

  return { usuario: definicion.usuario, email: definicion.email, creada }
}

async function main() {
  const authExistentes = await listarUsuariosAuth()
  const resultados = []
  for (const persona of EQUIPO) resultados.push(await crearOVincular(persona, authExistentes))

  console.log('\nEquipo SGO listo:')
  for (const r of resultados) console.log(`- ${r.usuario}: ${r.creada ? 'cuenta creada y vinculada' : 'cuenta existente vinculada; contraseña conservada'}`)
  console.log('\nIngresan en la PWA escribiendo solamente: lara, nicolas.sgo o azul.')
  console.log('GestionSGO permanece activo como cuenta de contingencia.')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
