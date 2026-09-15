// ============================================================
// DIFF DEL CATALOGO CONTRA UN EXPORT DE SAP B1
//
// Compara la lista de items de SAP (codigo <TAB> descripcion) contra el catalogo
// que hoy tiene la PWA, y dice que cambiaria ANTES de cambiar nada.
//
// NO ESCRIBE NADA. Es solo un informe.
//
// USO:
//   node scripts/diff_catalogo.mjs "C:\ruta\LISTA DE SEMI.txt" [codigos_en_uso.csv]
//
// El segundo archivo es OPCIONAL pero es el que importa de verdad: la salida de
// la consulta de Supabase que lista los `componente_codigo` usados por tareas
// (bajar el resultado como CSV). Sin el, el script solo puede decir que codigos
// se caen del CATALOGO; con el, dice cuales de esos estan realmente en uso, que
// es lo unico que obliga a frenar.
//
// POR QUE ESTE SCRIPT EXISTE: reemplazar el catalogo de un saque es peligroso.
// Las tareas guardan `componenteCodigo`; si un codigo desaparece, esas tareas
// quedan huerfanas — el operario deja de ver "Bobina AT Distribucion 315/13 Cu"
// y pasa a ver el codigo pelado, y el semielaborado se cae del desplegable.
// No rompe nada visiblemente: empeora en silencio. Por eso primero se mide.
// ============================================================
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = join(aqui, '..')

const rutaLista = process.argv[2]
if (!rutaLista) {
  console.error('Falta la ruta del export de SAP.\n  node scripts/diff_catalogo.mjs "C:\\ruta\\LISTA DE SEMI.txt"')
  process.exit(1)
}

// ---------- 1) Leer el export de SAP ----------
// Formato esperado: CODIGO <TAB> Descripcion, una por linea.
const lineas = readFileSync(rutaLista, 'utf8').split(/\r?\n/)
const sap = new Map()          // codigo -> descripcion
const malFormadas = []
for (const [i, l] of lineas.entries()) {
  if (!l.trim()) continue
  const partes = l.split('\t')
  if (partes.length < 2 || !partes[0].trim()) { malFormadas.push(`${i + 1}: ${l.slice(0, 60)}`); continue }
  sap.set(partes[0].trim(), partes.slice(1).join(' ').trim())
}

// Los transformadores son los que arrancan con un prefijo de producto terminado.
const ES_TRAFO = /^(TMR|TBR|TTR|TTD)/
const sapTrafos = [...sap.keys()].filter((c) => ES_TRAFO.test(c))
const sapSemis = [...sap.keys()].filter((c) => !ES_TRAFO.test(c))

// ---------- 2) Leer el catalogo actual de la PWA ----------
const modelos = JSON.parse(readFileSync(join(raiz, 'src/data/catalogoModelos.json'), 'utf8'))
const componentes = JSON.parse(readFileSync(join(raiz, 'src/data/catalogoComponentes.json'), 'utf8'))

const pwaModelos = new Map(modelos.map((m) => [m.codigo, m]))
const pwaComps = new Map(componentes.map((c) => [c.codigo, c]))

// Codigos de componente REFERENCIADOS por algun BOM. Son los que, si
// desaparecen, dejan modelos sin despiece.
const enUsoPorBOM = new Set()
for (const m of modelos) for (const c of (m.componentes ?? [])) enUsoPorBOM.add(c)

// ---------- 2b) Codigos USADOS POR TAREAS (opcional) ----------
// Este es el riesgo de verdad: una tarea ya cargada que apunta a un codigo que
// deja de existir queda huerfana. El operario pasa a ver el codigo pelado.
// El parser es DELIBERADAMENTE tolerante al formato: barre el archivo entero
// buscando cualquier cosa con forma de codigo de item. Asi da igual si el
// archivo es el CSV exportado (con encabezado y columnas), una sola linea con
// todos los codigos separados por coma (salida de `string_agg`), o una lista
// pegada a mano. El export del editor de Supabase se corta en las 100 filas que
// muestra en pantalla, asi que conviene la version de una sola celda.
const rutaEnUso = process.argv[3]
const usadosPorTareas = new Map()   // codigo -> { tareas, conProduccion }
if (rutaEnUso) {
  const texto = readFileSync(rutaEnUso, 'utf8')
  // Primero se intenta leer el CSV completo (codigo,tareas,con_produccion).
  for (const l of texto.split(/\r?\n/)) {
    const m = l.match(/^\s*"?([A-Z]{3,}\d{3,})"?\s*[,;]\s*"?(\d+)"?\s*[,;]\s*"?(\d+)"?/)
    if (m) usadosPorTareas.set(m[1], { tareas: Number(m[2]), conProduccion: Number(m[3]) })
  }
  // Y despues se agregan los codigos sueltos que hayan quedado afuera (por
  // ejemplo si el archivo es solo una lista separada por comas, sin contadores).
  for (const cod of texto.match(/[A-Z]{3,}\d{3,}/g) ?? []) {
    if (!usadosPorTareas.has(cod)) usadosPorTareas.set(cod, { tareas: 0, conProduccion: 0 })
  }
}

// ---------- 3) Comparar ----------
const dif = (a, b) => [...a].filter((x) => !b.has(x))

const trafosNuevos = dif(new Set(sapTrafos), pwaModelos)
const trafosQueSiguen = sapTrafos.filter((c) => pwaModelos.has(c))
const trafosSoloEnPWA = [...pwaModelos.keys()].filter((c) => !sap.has(c))

const semisNuevos = dif(new Set(sapSemis), pwaComps)
const semisSoloEnPWA = [...pwaComps.keys()].filter((c) => !sap.has(c))
// LOS PELIGROSOS: estan en un BOM y no vienen en el export nuevo.
const semisEnRiesgo = semisSoloEnPWA.filter((c) => enUsoPorBOM.has(c))
// LOS CRITICOS: hay TAREAS apuntando a ellos y no vienen en el export.
const semisHuerfanos = rutaEnUso
  ? [...usadosPorTareas.keys()].filter((c) => !sap.has(c))
  : []

// Modelos que siguen existiendo pero cuya descripcion cambio en SAP.
const renombrados = trafosQueSiguen
  .filter((c) => sap.get(c) !== pwaModelos.get(c).nombre)
  .map((c) => ({ codigo: c, pwa: pwaModelos.get(c).nombre, sap: sap.get(c) }))

// Modelos NUEVOS: no tienen despiece. Es el trabajo real que queda por delante.
const nuevosSinBOM = trafosNuevos.length

// ---------- 4) Informe ----------
const n = (x) => String(x).padStart(5)
console.log(`
============================================================
DIFF DEL CATALOGO — ${new Date().toLocaleString('es-AR')}
Export leido: ${rutaLista}
============================================================

EXPORT DE SAP
  ${n(sap.size)}  items en total
  ${n(sapTrafos.length)}  transformadores
  ${n(sapSemis.length)}  semielaborados
  ${n(malFormadas.length)}  lineas que no se pudieron leer

CATALOGO ACTUAL DE LA PWA
  ${n(modelos.length)}  modelos
  ${n(componentes.length)}  componentes
  ${n(enUsoPorBOM.size)}  componentes referenciados por algun despiece

TRANSFORMADORES
  ${n(trafosNuevos.length)}  NUEVOS (hay que darlos de alta, y les falta el despiece)
  ${n(trafosQueSiguen.length)}  ya existian
  ${n(renombrados.length)}  cambiaron de descripcion en SAP
  ${n(trafosSoloEnPWA.length)}  estan en la PWA y NO vienen en el export

SEMIELABORADOS
  ${n(semisNuevos.length)}  NUEVOS
  ${n(semisSoloEnPWA.length)}  estan en la PWA y NO vienen en el export
  ${n(semisEnRiesgo.length)}  >>> DE ESOS, estan usados por el despiece de algun modelo <<<
`)

if (malFormadas.length) {
  console.log('LINEAS ILEGIBLES (revisar el archivo):')
  for (const l of malFormadas.slice(0, 20)) console.log('   ' + l)
  if (malFormadas.length > 20) console.log(`   ... y ${malFormadas.length - 20} mas`)
  console.log()
}

if (semisEnRiesgo.length) {
  console.log('!! COMPONENTES EN RIESGO — usados por un despiece y ausentes del export.')
  console.log('   Si se reemplaza el catalogo de un saque, esos modelos pierden esa pieza.')
  for (const c of semisEnRiesgo.slice(0, 40)) {
    console.log(`   ${c}  ${pwaComps.get(c)?.descripcion ?? ''}`)
  }
  if (semisEnRiesgo.length > 40) console.log(`   ... y ${semisEnRiesgo.length - 40} mas`)
  console.log()
}

if (renombrados.length) {
  console.log('CAMBIARON DE NOMBRE EN SAP (mismo codigo):')
  for (const r of renombrados.slice(0, 20)) {
    console.log(`   ${r.codigo}\n      PWA: ${r.pwa}\n      SAP: ${r.sap}`)
  }
  if (renombrados.length > 20) console.log(`   ... y ${renombrados.length - 20} mas`)
  console.log()
}

if (!rutaEnUso) {
  console.log('NOTA: no se paso el archivo de codigos en uso. El chequeo mas')
  console.log('      importante (tareas que quedarian huerfanas) NO se hizo.\n')
} else if (semisHuerfanos.length === 0) {
  console.log(`OK: los ${usadosPorTareas.size} codigos usados por tareas estan TODOS en el export.`)
  console.log('    Actualizar el catalogo no deja ninguna tarea huerfana.\n')
} else {
  console.log('!!! CRITICO — CODIGOS USADOS POR TAREAS QUE NO VIENEN EN EL EXPORT.')
  console.log('    Si se actualiza asi, esas tareas pierden el nombre del semielaborado.')
  for (const c of semisHuerfanos) {
    const u = usadosPorTareas.get(c)
    console.log(`    ${c}  ${u.tareas} tarea(s), ${u.conProduccion} con produccion  —  ${pwaComps.get(c)?.descripcion ?? '(no esta en el catalogo)'}`)
  }
  console.log()
}

console.log(`PENDIENTE PRINCIPAL: ${nuevosSinBOM} modelos nuevos sin despiece.`)
console.log('El export no dice que semielaborados lleva cada transformador.\n')
