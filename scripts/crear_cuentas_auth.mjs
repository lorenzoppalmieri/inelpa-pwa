// ============================================================
// INELPA PWA — Crear las cuentas de Supabase Auth de toda la nomina.
//
// Que hace (idempotente, se puede correr varias veces sin romper nada):
//   1. Lee la tabla 'usuarios' de Supabase (perfiles ya sembrados por los .sql).
//   2. Para cada uno crea su cuenta de Auth  usuario@inelpa.local  con una clave
//      inicial, ya confirmada (email_confirm = true). Si ya existe, la saltea.
//   3. Vincula usuarios.auth_id con la cuenta de Auth (por email).
//
// REQUISITOS:
//   - Node 18+ (ya lo tenes: corres npm).
//   - La SERVICE ROLE KEY (secreta) de Supabase:
//       Panel -> Project Settings -> API -> 'service_role' (NO la anon).
//     OJO: esta clave es de ADMIN. No la subas a git ni la compartas.
//
// COMO CORRERLO (desde la carpeta inelpa-pwa, en una terminal):
//   Windows PowerShell:
//     $env:SUPABASE_URL="https://TU-ID.supabase.co"
//     $env:SUPABASE_SERVICE_ROLE_KEY="eyJ...service_role..."
//     $env:CLAVE_INICIAL="inelpa2026"      # opcional; default abajo
//     node scripts/crear_cuentas_auth.mjs
//
//   Windows CMD:
//     set SUPABASE_URL=https://TU-ID.supabase.co
//     set SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
//     set CLAVE_INICIAL=inelpa2026
//     node scripts/crear_cuentas_auth.mjs
//
// Despues de correrlo, todos pueden entrar con su usuario (ej. "carruega.roberto")
// y la CLAVE_INICIAL. Conviene que cada uno la cambie (ver docs/MANTENIMIENTO.md).
// ============================================================

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const CLAVE_INICIAL = process.env.CLAVE_INICIAL?.trim() || 'inelpa2026'
const DOMINIO = 'inelpa.local'

if (!URL || !SERVICE_KEY) {
  console.error('\nFALTAN VARIABLES. Necesito SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Ver las instrucciones al inicio de este archivo.\n')
  process.exit(1)
}
if (CLAVE_INICIAL.length < 6) {
  console.error('\nCLAVE_INICIAL debe tener al menos 6 caracteres (regla de Supabase).\n')
  process.exit(1)
}

// Cliente admin (service_role): salta RLS y permite crear cuentas de Auth.
const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const email = (usuario) => `${usuario.toLowerCase()}@${DOMINIO}`

async function listarTodosLosAuthUsers() {
  // Mapa email(lower) -> id, paginando por si hay muchos.
  const mapa = new Map()
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    for (const u of data.users) if (u.email) mapa.set(u.email.toLowerCase(), u.id)
    if (data.users.length < 200) break
    page++
  }
  return mapa
}

async function main() {
  console.log(`\nProyecto: ${URL}`)
  console.log(`Clave inicial para cuentas nuevas: "${CLAVE_INICIAL}"\n`)

  // 1) Perfiles de planta.
  const { data: perfiles, error: e1 } = await admin
    .from('usuarios')
    .select('id, nombre, usuario, auth_id')
    .order('usuario')
  if (e1) { console.error('No pude leer la tabla usuarios:', e1.message); process.exit(1) }
  if (!perfiles?.length) {
    console.error('La tabla usuarios esta vacia. Corre primero los .sql de perfiles.')
    process.exit(1)
  }

  // 2) Cuentas de Auth ya existentes.
  const authPorEmail = await listarTodosLosAuthUsers()

  let creadas = 0, existentes = 0, vinculadas = 0, errores = 0

  for (const p of perfiles) {
    const mail = email(p.usuario)
    let authId = authPorEmail.get(mail)

    // a) Crear la cuenta si no existe.
    if (!authId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: mail,
        password: CLAVE_INICIAL,
        email_confirm: true,
        user_metadata: { nombre: p.nombre, usuario: p.usuario },
      })
      if (error) { console.error(`  ✗ ${mail}: ${error.message}`); errores++; continue }
      authId = data.user.id
      creadas++
      console.log(`  + creada   ${mail}`)
    } else {
      existentes++
    }

    // b) Vincular auth_id en el perfil si falta o no coincide.
    if (p.auth_id !== authId) {
      const { error } = await admin.from('usuarios').update({ auth_id: authId }).eq('id', p.id)
      if (error) { console.error(`  ✗ vincular ${mail}: ${error.message}`); errores++; continue }
      vinculadas++
    }
  }

  console.log('\n--- Resumen ---')
  console.log(`Perfiles:            ${perfiles.length}`)
  console.log(`Cuentas creadas:     ${creadas}`)
  console.log(`Cuentas ya existian: ${existentes}`)
  console.log(`auth_id vinculados:  ${vinculadas}`)
  console.log(`Errores:             ${errores}`)
  console.log('\nListo. Probar login con cualquier usuario + la clave inicial.\n')
  process.exit(errores ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
