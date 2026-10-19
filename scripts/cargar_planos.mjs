// ============================================================
// INELPA PWA — Carga MASIVA de planos (PDF) de semielaborados. v2.38
//
// Qué hace (idempotente: se puede correr las veces que haga falta):
//   1. Lee todos los PDF de una carpeta (incluye subcarpetas).
//   2. Decide a qué semielaborado(s) va cada uno, en este orden:
//        a) la planilla MAPA, si se la pasás (ver abajo);
//        b) un código SAP escrito en el nombre ("CUBDIS0000001 Rev B.pdf");
//        c) un nombre IGUAL a la descripción del catálogo
//           ("Cuba Distribucion Trifasica Plataforma 315-13 Cu.pdf").
//      Nunca adivina por parecido: si no está seguro, no vincula.
//   3. Sube cada PDF al bucket privado 'planos' y lo deja como plano VIGENTE.
//      El anterior (si había) pasa al historial. Si el mismo archivo ya estaba
//      vigente, lo saltea.
//   4. Deja dos planillas en la carpeta desde donde lo corrés:
//        planos_sin_vincular.csv   -> los PDF que no pudo ubicar, con la
//                                     columna "codigos" vacía para completar.
//        componentes_sin_plano.csv -> los semielaborados que siguen sin plano
//                                     (para saber qué código va en cada uno).
//
// SEGUNDA PASADA: completá "codigos" en planos_sin_vincular.csv (uno o varios
// separados por coma: un mismo plano puede servir para varios) y corré de nuevo
// con MAPA apuntando a ese archivo.
//
// REQUISITOS: haber corrido docs/supabase_planos_v2.38.sql. La SERVICE ROLE
// KEY (Panel -> Project Settings -> API). Es de ADMIN: no la subas a git ni la
// pegues en ningún chat.
//
// CÓMO CORRERLO (PowerShell, desde la carpeta inelpa-pwa):
//   $env:SUPABASE_URL="https://TU-ID.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="..."
//   $env:CARPETA="C:\ruta\a\los\planos"
//   $env:SIMULAR="1"          # opcional: muestra qué haría, sin subir nada
//   $env:MAPA="planos_sin_vincular.csv"   # opcional: segunda pasada
//   node scripts/cargar_planos.mjs
//
// La lógica para reconocer códigos y descripciones es la MISMA que
// src/lib/planos.ts (codigoEnNombre, codigoPorDescripcion, extraerRevision).
// Si se cambia allá, cambiarla acá.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

const URL = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const CARPETA = process.env.CARPETA?.trim()
const MAPA = process.env.MAPA?.trim()
const SIMULAR = process.env.SIMULAR === '1'
const SUBIDO_POR = process.env.SUBIDO_POR?.trim() || 'carga_masiva'
const BUCKET = 'planos'
const MAX_MB = 25

if (!URL || !KEY) { console.error('\nFALTAN VARIABLES: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.\n'); process.exit(1) }
if (!CARPETA || !existsSync(CARPETA)) { console.error(`\nFALTA LA CARPETA o no existe: ${CARPETA ?? '(vacía)'}\nCargá $env:CARPETA con la ruta de los PDF.\n`); process.exit(1) }

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// ---------- misma lógica que src/lib/planos.ts ----------
const normalizar = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const baseNombre = (n) => (n.split(/[\\/]/).pop() ?? n).replace(/\.pdf$/i, '')
const RE_REV = /(?:^|[^a-z])rev(?:isi[oó]n)?[\s._-]*([a-z0-9]{1,3})(?![a-z0-9])/i
const extraerRevision = (n) => { const m = baseNombre(n).match(RE_REV); return m ? m[1].toUpperCase() : null }
const codigoEnNombre = (n, codigos) =>
  baseNombre(n).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).find((p) => codigos.has(p))
function codigoPorDescripcion(n, porDescripcion) {
  const sinRev = baseNombre(n).replace(new RegExp(RE_REV.source, 'gi'), ' ')
  const k = normalizar(sinRev)
  const hits = porDescripcion.get(k)
  return hits && hits.length === 1 ? hits[0] : undefined
}
const slug = (n) => normalizar(baseNombre(n)).replace(/ /g, '-').slice(0, 50) || 'plano'

// ---------- utilidades ----------
function listarPdfs(dir) {
  const out = []
  for (const nombre of readdirSync(dir)) {
    const p = join(dir, nombre)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...listarPdfs(p))
    else if (/\.pdf$/i.test(nombre)) out.push({ ruta: p, nombre, bytes: st.size })
  }
  return out
}

async function traerTodo(tabla, columnas) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(tabla).select(columnas).order(tabla === 'planos' ? 'id' : 'codigo').range(desde, desde + 999)
    if (error) throw new Error(`No pude leer ${tabla}: ${error.message}`)
    filas.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return filas
}

// Planilla: archivo;codigos  (codigos separados por coma o espacio)
function leerMapa(ruta) {
  const m = new Map()
  const txt = readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '')
  for (const linea of txt.split(/\r?\n/)) {
    const [archivo, codigos] = linea.split(';')
    if (!archivo || !codigos || /^archivo$/i.test(archivo.trim())) continue
    const lista = codigos.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)
    if (lista.length) m.set(archivo.trim().toLowerCase(), lista)
  }
  return m
}

const csv = (filas) => '\uFEFF' + filas.map((f) => f.map((v) => String(v ?? '').replace(/;/g, ',')).join(';')).join('\r\n') + '\r\n'

async function vincular(codigo, ruta, nombre, revision) {
  const { data: nuevo, error: e1 } = await sb.from('planos').insert({
    componente_codigo: codigo, revision, ruta, nombre_archivo: nombre, vigente: false, subido_por: SUBIDO_POR,
  }).select('id').single()
  if (e1) throw new Error(`registrar ${codigo}: ${e1.message}`)
  const { error: e2 } = await sb.from('planos').update({ vigente: false })
    .eq('componente_codigo', codigo).eq('vigente', true).neq('id', nuevo.id)
  if (e2) throw new Error(`pasar a historial ${codigo}: ${e2.message}`)
  const { error: e3 } = await sb.from('planos').update({ vigente: true }).eq('id', nuevo.id)
  if (e3) throw new Error(`activar ${codigo}: ${e3.message}`)
}

// ---------- principal ----------
async function main() {
  console.log(`\nProyecto: ${URL}`)
  console.log(`Carpeta:  ${CARPETA}${SIMULAR ? '   [SIMULACIÓN: no se sube nada]' : ''}\n`)

  const componentes = await traerTodo('componentes', 'codigo, descripcion, activo')
  const codigos = new Set(componentes.map((c) => c.codigo.toUpperCase()))
  const porDescripcion = new Map()
  for (const c of componentes) {
    const k = normalizar(c.descripcion)
    if (!k) continue
    porDescripcion.set(k, [...(porDescripcion.get(k) ?? []), c.codigo])
  }
  const vigentes = new Map()
  for (const p of await traerTodo('planos', 'id, componente_codigo, ruta, vigente')) {
    if (p.vigente) vigentes.set(p.componente_codigo, p.ruta)
  }
  const mapa = MAPA ? leerMapa(MAPA) : new Map()
  if (MAPA) console.log(`Planilla MAPA: ${mapa.size} archivo(s) con códigos.\n`)

  const pdfs = listarPdfs(CARPETA)
  console.log(`PDF encontrados: ${pdfs.length}\n`)

  const sinVincular = []
  let subidos = 0, vinculos = 0, yaEstaban = 0, errores = 0
  const conPlanoAhora = new Set(vigentes.keys())

  for (const f of pdfs) {
    // 1) ¿A qué semielaborado(s) va?
    let lista = mapa.get(f.nombre.toLowerCase())
    let via = 'planilla'
    if (!lista) {
      const c = codigoEnNombre(f.nombre, codigos)
      if (c) { lista = [c]; via = 'código en el nombre' }
    }
    if (!lista) {
      const c = codigoPorDescripcion(f.nombre, porDescripcion)
      if (c) { lista = [c]; via = 'descripción' }
    }
    if (!lista) { sinVincular.push(f.nombre); continue }

    const desconocidos = lista.filter((c) => !codigos.has(c))
    if (desconocidos.length) {
      console.error(`  ✗ ${f.nombre}: códigos que no existen en el catálogo: ${desconocidos.join(', ')}`)
      errores++; continue
    }
    if (f.bytes > MAX_MB * 1024 * 1024) {
      console.error(`  ✗ ${f.nombre}: pesa ${(f.bytes / 1048576).toFixed(1)} MB (máximo ${MAX_MB} MB).`)
      errores++; continue
    }

    // 2) Ruta por CONTENIDO: el mismo archivo siempre cae en la misma ruta, así
    //    correr el script dos veces no duplica nada en Storage.
    const contenido = readFileSync(f.ruta)
    const hash = createHash('sha256').update(contenido).digest('hex').slice(0, 16)
    const ruta = `masivo/${hash}_${slug(f.nombre)}.pdf`
    const revision = extraerRevision(f.nombre)

    const pendientes = lista.filter((c) => vigentes.get(c) !== ruta)
    yaEstaban += lista.length - pendientes.length
    if (pendientes.length === 0) continue

    if (SIMULAR) {
      console.log(`  · ${f.nombre} -> ${pendientes.join(', ')}  (${via}${revision ? `, Rev ${revision}` : ''})`)
      pendientes.forEach((c) => conPlanoAhora.add(c))
      vinculos += pendientes.length
      continue
    }

    try {
      const { error } = await sb.storage.from(BUCKET).upload(ruta, contenido, { contentType: 'application/pdf', upsert: true })
      if (error) throw new Error(`subir: ${error.message}`)
      subidos++
      for (const c of pendientes) {
        await vincular(c, ruta, f.nombre, revision)
        vigentes.set(c, ruta)
        conPlanoAhora.add(c)
        vinculos++
      }
      console.log(`  + ${f.nombre} -> ${pendientes.join(', ')}  (${via}${revision ? `, Rev ${revision}` : ''})`)
    } catch (e) {
      console.error(`  ✗ ${f.nombre}: ${e.message}`)
      errores++
    }
  }

  // 3) Planillas para la segunda pasada.
  writeFileSync('planos_sin_vincular.csv', csv([['archivo', 'codigos'], ...sinVincular.map((n) => [n, ''])]))
  const sinPlano = componentes.filter((c) => c.activo !== false && !conPlanoAhora.has(c.codigo))
  writeFileSync('componentes_sin_plano.csv', csv([['codigo', 'descripcion'], ...sinPlano.map((c) => [c.codigo, c.descripcion])]))

  console.log('\n--- Resumen ---')
  console.log(`PDF leídos:                 ${pdfs.length}`)
  console.log(`Archivos subidos:           ${SIMULAR ? '(simulación)' : subidos}`)
  console.log(`Vínculos ${SIMULAR ? 'a crear' : 'creados'}:            ${vinculos}`)
  console.log(`Ya estaban vigentes:        ${yaEstaban}`)
  console.log(`Sin vincular:               ${sinVincular.length}  -> planos_sin_vincular.csv`)
  console.log(`Semielaborados sin plano:   ${sinPlano.length}  -> componentes_sin_plano.csv`)
  console.log(`Errores:                    ${errores}\n`)
  process.exit(errores ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
