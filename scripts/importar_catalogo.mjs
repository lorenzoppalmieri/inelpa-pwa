// ============================================================
// IMPORTADOR DE CATALOGO SAP B1 -> PWA
//
// Fusiona un export de items de SAP (codigo <TAB> descripcion) con el catalogo
// actual de la PWA, y PROPONE el despiece de los modelos nuevos.
//
// USO:
//   node scripts/importar_catalogo.mjs "C:\ruta\LISTA DE SEMI.txt"           (simulacion)
//   node scripts/importar_catalogo.mjs "C:\ruta\LISTA DE SEMI.txt" --aplicar (escribe)
//
// SIN --aplicar NO TOCA NINGUN ARCHIVO. Deja un CSV para validar:
//   docs/despiece_propuesto.csv
//
// ------------------------------------------------------------
// REGLA DE ORO: AGREGAR Y ACTUALIZAR, NUNCA BORRAR.
//
// Las tareas guardan `componenteCodigo`. Si un codigo desaparece del catalogo,
// esas tareas quedan huerfanas: el operario deja de ver "Bobina AT 315/13 Cu" y
// pasa a ver el codigo pelado. No rompe nada visible, empeora en silencio.
//
// Ademas este export viene FILTRADO: no trae ni un prensayugo (PRESUP/PREINF),
// y la PWA los usa en 323 despieces. Confirmado con Lorenzo el 15/9/2026: en SAP
// siguen existiendo, la lista se saco con un filtro por grupo de articulo. Por
// eso borrar lo ausente seria destruir informacion buena.
// ------------------------------------------------------------
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = join(aqui, '..')
const APLICAR = process.argv.includes('--aplicar')
const rutaLista = process.argv[2]
if (!rutaLista) { console.error('Falta la ruta del export de SAP.'); process.exit(1) }

// ============================================================
// CASO ESPECIAL — TMR19V0000001 (detectado en el diff del 15/9/2026)
//
// La PWA tenia ese codigo como "TMR 40/7 - Monoposte - Aluminio"; en SAP es
// "TMR 5/19 - Monoposte - Cobre". Ademas TMR07V0000012 —que en SAP SI es el
// 40/7 Al— no existia en la PWA. En algun import viejo ese modelo se cargo con
// el codigo del bloque siguiente y quedo corrido.
//
// Decision de Lorenzo: manda SAP. El despiece viejo (que es de un 40/7 Al) se
// MUDA al codigo correcto, y el que se quedo con el codigo equivocado se rearma
// desde cero. Sin esto, alguien pidiendo un 5/19 de cobre recibiria bobinas de
// 40/7 de aluminio.
// ============================================================
const MUDANZA_BOM = { desde: 'TMR19V0000001', hacia: 'TMR07V0000012' }

// ---------- utilidades de parseo ----------
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** "315/13" y "315-13" son lo mismo. Devuelve [potencia, tension]. */
function potTension(desc) {
  const m = desc.match(/(\d+(?:[.,]\d+)?)\s*[/-]\s*(\d+(?:[.,]\d+)?)/)
  if (!m) return [null, null]
  const num = (x) => Number(String(x).replace(',', '.'))
  return [num(m[1]), num(m[2])]
}

function materialDe(desc) {
  const d = norm(desc)
  if (/\bcobre\b|\bcu\b/.test(d)) return 'cobre'
  if (/\baluminio\b|\bal\b/.test(d)) return 'aluminio'
  return null
}

function lineaDe(codigo, desc) {
  const d = norm(desc)
  if (/\bdistribucion\b/.test(d)) return 'distribucion'
  if (/\brural\b/.test(d)) return 'rural'
  // Por prefijo, para los que no lo dicen en el texto.
  if (/^TTD/.test(codigo) || /DIS/.test(codigo)) return 'distribucion'
  if (/^(TMR|TBR|TTR)/.test(codigo) || /RUR/.test(codigo)) return 'rural'
  return null
}

function faseDe(codigo, desc) {
  const d = norm(desc)
  if (/\btrifasic/.test(d)) return 'trifasico'
  if (/\bbifasic|\bbifilar/.test(d)) return 'bifasico'
  if (/\bmonofasic/.test(d)) return 'monofasico'
  // Los transformadores la llevan en el prefijo: TMR/TBR mono, TTR/TTD tri.
  if (/^(TMR|TBR)/.test(codigo)) return 'monofasico'
  if (/^(TTR|TTD)/.test(codigo)) return 'trifasico'
  return null
}

/** Montaje del modelo: lo dice la descripcion ("Monoposte" / "Plataforma"). */
function montajeDe(desc) {
  const d = norm(desc)
  if (/plataforma/.test(d) && /monoposte/.test(d)) return 'Monoposte-Plataforma'
  if (/plataforma/.test(d)) return 'Plataforma'
  if (/monoposte/.test(d)) return 'Monoposte'
  return null
}

/** Tipo de tanque, si la descripcion lo menciona. */
function tanqueDe(desc) {
  const d = norm(desc)
  if (/tanque expansion/.test(d)) return 'Tanque Expansion'
  if (/llenado integral/.test(d)) return 'Llenado Integral'
  return null
}

/** Numero de fase de una bobina trifasica: F1 / F2 / F3. */
function numeroFase(desc) {
  const m = desc.match(/\bF([123])\b/)
  return m ? Number(m[1]) : null
}

// ============================================================
// Prefijo -> como se clasifica el componente DENTRO de la PWA.
//
// Los nombres NO son inventados: salen de lo que ya tiene
// catalogoComponentes.json. Son 'bobina_at' / 'bobina_bt' / 'herreria_cuba' /
// 'herreria_tanque' / 'herreria_tapa', no 'bobina' ni 'cuba'. La primera version
// de este script uso los nombres "logicos" y el resultado fue que NINGUNA pieza
// existente empataba: 54 de 55 despieces salieron vacios.
//
// `sectorId` tampoco puede quedar en null: es lo que usa
// `componenteSirveSector` para decidir que semielaborados le aparecen a cada
// sector en el desplegable del planificador. Un componente sin sector no se lo
// puede elegir nadie.
// ============================================================
const CLASES = {
  BOBALT: { categoria: 'bobina_at', nivel: 'AT', sector: { distribucion: 'bob_dist_at', rural: 'bob_rural_at' } },
  BOBBAJ: { categoria: 'bobina_bt', nivel: 'BT', sector: { distribucion: 'bob_dist_bt', rural: 'bob_rural_bt' } },
  PARDIS: { categoria: 'parte_activa', nivel: null, fijo: 'montaje_pa_dist' },
  PARRUR: { categoria: 'parte_activa', nivel: null, fijo: 'montaje_pa_rural' },
  CUBDIS: { categoria: 'herreria_cuba', nivel: null, fijo: 'soldadura_dist' },
  CUBRUR: { categoria: 'herreria_cuba', nivel: null, fijo: 'soldadura_rural' },
  TAPDIS: { categoria: 'herreria_tapa', nivel: null, fijo: 'soldadura_dist' },
  TAPRUR: { categoria: 'herreria_tapa', nivel: null, fijo: 'soldadura_rural' },
  TANDIS: { categoria: 'herreria_tanque', nivel: null, fijo: 'soldadura_dist' },
  TANRUR: { categoria: 'herreria_tanque', nivel: null, fijo: 'soldadura_rural' },
  PRESUP: { categoria: 'prensayugo', nivel: null, fijo: 'corte_conformado' },
  PREINF: { categoria: 'prensayugo', nivel: null, fijo: 'corte_conformado' },
}

function sectorDe(clase, linea) {
  if (!clase) return null
  if (clase.fijo) return clase.fijo
  return clase.sector?.[linea] ?? null
}

const ES_TRAFO = /^(TMR|TBR|TTR|TTD)/

// ---------- 1) Leer ----------
const sap = new Map()
for (const l of readFileSync(rutaLista, 'utf8').split(/\r?\n/)) {
  if (!l.trim()) continue
  const p = l.split('\t')
  if (p.length < 2 || !p[0].trim()) continue
  sap.set(p[0].trim(), p.slice(1).join(' ').trim())
}

const rutaModelos = join(raiz, 'src/data/catalogoModelos.json')
const rutaComps = join(raiz, 'src/data/catalogoComponentes.json')
const modelos = JSON.parse(readFileSync(rutaModelos, 'utf8'))
const componentes = JSON.parse(readFileSync(rutaComps, 'utf8'))

const modeloPorCod = new Map(modelos.map((m) => [m.codigo, m]))
const compPorCod = new Map(componentes.map((c) => [c.codigo, c]))

// ---------- 2) Componentes: agregar nuevos, actualizar descripciones ----------
let compsNuevos = 0, compsRenombrados = 0
for (const [cod, desc] of sap) {
  if (ES_TRAFO.test(cod)) continue
  const clase = CLASES[cod.slice(0, 6)]
  const ex = compPorCod.get(cod)
  if (ex) {
    if (ex.descripcion !== desc) { ex.descripcion = desc; compsRenombrados++ }
    continue
  }
  const [pot, ten] = potTension(desc)
  const linea = lineaDe(cod, desc)
  const nuevo = {
    codigo: cod,
    descripcion: desc,
    categoria: clase?.categoria ?? 'otro',
    sectorId: sectorDe(clase, linea),
    nivel: clase?.nivel ?? null,
    linea,
    fase: faseDe(cod, desc),
    material: materialDe(desc),
    potencia: pot,
    tension: ten,
  }
  componentes.push(nuevo)
  compPorCod.set(cod, nuevo)
  compsNuevos++
}

// ---------- 3) Indice de componentes para armar despieces ----------
// Se indexa por (categoria, linea, fase, potencia, tension, material) porque esa
// combinacion es la que identifica una pieza. El montaje solo lo miran cuba y
// tapa; las bobinas y la parte activa no dependen de el.
// Se indexa SOLO por categoria y despues se filtra atributo por atributo.
//
// La primera version usaba una clave compuesta exacta y fallaba: no todas las
// piezas declaran todos los atributos. Los PRENSAYUGOS y las TAPAS guardan
// `fase: null` —su descripcion no dice si son de un mono o de un trifasico—, asi
// que una clave exacta contra un modelo trifasico nunca empataba. Ese fue el
// motivo de que 54 despieces salieran sin prensayugo ni tapa.
//
// Potencia y tension SI se exigen exactas: son la identidad de la pieza. Si
// alguna no las tuviera, preferimos que quede marcada como faltante y la mire
// una persona, antes que empatarla de mas.
const porCategoria = new Map()
for (const c of componentes) {
  if (!porCategoria.has(c.categoria)) porCategoria.set(c.categoria, [])
  porCategoria.get(c.categoria).push(c)
}

/** null del lado de la pieza significa "no aplica", no "no coincide". */
const compatible = (valorPieza, valorModelo) => valorPieza == null || valorPieza === valorModelo

function buscar(categoria, m, extra = () => true) {
  return (porCategoria.get(categoria) ?? []).filter((c) =>
    c.potencia === m.potencia
    && c.tension === m.tension
    && compatible(c.linea, m.linea)
    && compatible(c.material, m.material)
    && compatible(c.fase, m.fase)
    && extra(c))
}

/** Cuba y tapa dependen del montaje; "Monoposte-Plataforma" sirve para los dos. */
const sirveMontaje = (m) => (c) => {
  const mm = montajeDe(c.descripcion)
  return !mm || !m.montaje || mm === m.montaje || mm === 'Monoposte-Plataforma'
}
/**
 * Sistema de refrigeracion de la tapa. Tiene que ser el MISMO que el del modelo.
 *
 * REGLA DE PLANTA (Lorenzo, 15/9/2026): son dos sistemas excluyentes.
 *   - "con Tanque Expansion" -> el transformador LLEVA un tanque aparte.
 *   - "Llenado Integral"     -> NO lleva tanque. El aceite va todo en la cuba.
 * Poner un tanque a un llenado integral es pedirle a herreria una pieza que ese
 * transformador no tiene.
 */
const sirveTanque = (m) => (c) => {
  const t = tanqueDe(c.descripcion)
  return (t ?? null) === (m.tanque ?? null) || t === null
}

/** Arma el despiece propuesto de un modelo. Devuelve codigos + que falto. */
function proponerBOM(m) {
  const cods = []
  const faltantes = []
  const nBobinas = m.fase === 'trifasico' ? 3 : 1

  // Primero BT y despues AT, en el mismo orden en que aparecen en los despieces
  // que ya existen (ver TTD 315/13 en catalogoModelos.json).
  for (const cat of ['bobina_bt', 'bobina_at']) {
    const cands = buscar(cat, m)
      .sort((a, b) => (numeroFase(a.descripcion) ?? 0) - (numeroFase(b.descripcion) ?? 0))
    if (cands.length < nBobinas) faltantes.push(`${cat} (${cands.length}/${nBobinas})`)
    cods.push(...cands.slice(0, nBobinas).map((c) => c.codigo))
  }

  for (const cat of ['prensayugo', 'parte_activa', 'herreria_cuba', 'herreria_tanque', 'herreria_tapa']) {
    // SOLO los de tanque de expansion llevan la pieza "tanque". Un LLENADO
    // INTEGRAL no tiene tanque: el aceite va en la cuba. Antes esto decia
    // `!m.tanque`, que le buscaba tanque tambien a los llenado integral.
    if (cat === 'herreria_tanque' && m.tanque !== 'Tanque Expansion') continue
    let extra = () => true
    if (cat === 'herreria_cuba') extra = sirveMontaje(m)
    if (cat === 'herreria_tapa') extra = (c) => sirveMontaje(m)(c) && sirveTanque(m)(c)
    let cands = buscar(cat, m, extra)
    // La tapa define el sistema de refrigeracion: si hay alguna que lo dice
    // EXPLICITAMENTE y coincide con el modelo, se prefiere a una generica. Sin
    // esto, una tapa que no menciona el sistema podria colarse en un modelo del
    // sistema contrario.
    if (cat === 'herreria_tapa') {
      const exactas = cands.filter((c) => tanqueDe(c.descripcion) === m.tanque)
      if (exactas.length) cands = exactas
    }
    // Superior antes que inferior, como estan en los despieces que ya existen.
    if (cat === 'prensayugo') {
      cands = [...cands].sort((a, b) => a.codigo.localeCompare(b.codigo) * -1)
    }
    // Los prensayugos son DOS (superior e inferior); el resto, uno.
    const esperados = cat === 'prensayugo' ? 2 : 1
    if (cands.length < esperados) faltantes.push(`${cat} (${cands.length}/${esperados})`)
    cods.push(...cands.slice(0, esperados).map((c) => c.codigo))
  }
  return { cods, faltantes }
}

// ---------- 4) Modelos ----------
let modelosNuevos = 0, modelosRenombrados = 0
const propuestas = []           // para el CSV de validacion
const bomMudado = modeloPorCod.get(MUDANZA_BOM.desde)?.componentes?.slice() ?? null

for (const [cod, desc] of sap) {
  if (!ES_TRAFO.test(cod)) continue
  const [pot, ten] = potTension(desc)
  const ex = modeloPorCod.get(cod)

  if (ex) {
    if (ex.nombre !== desc) {
      // Cambio de nombre: hay que rearmar el despiece, porque el que tenia era
      // el de OTRO transformador (caso TMR19V0000001).
      ex.nombre = desc
      ex.linea = lineaDe(cod, desc); ex.fase = faseDe(cod, desc)
      ex.material = materialDe(desc); ex.potencia = pot; ex.tension = ten
      ex.montaje = montajeDe(desc); ex.tanque = tanqueDe(desc)
      const { cods, faltantes } = proponerBOM(ex)
      ex.componentes = cods
      modelosRenombrados++
      propuestas.push({ codigo: cod, nombre: desc, tipo: 'RENOMBRADO', cods, faltantes })
    }
    continue
  }

  const m = {
    codigo: cod, nombre: desc,
    linea: lineaDe(cod, desc), fase: faseDe(cod, desc), material: materialDe(desc),
    potencia: pot, tension: ten,
    montaje: montajeDe(desc), tanque: tanqueDe(desc),
    componentes: [],
  }
  // El 40/7 Al recupera el despiece que estaba mal asignado.
  if (cod === MUDANZA_BOM.hacia && bomMudado) {
    m.componentes = bomMudado
    propuestas.push({ codigo: cod, nombre: desc, tipo: 'NUEVO (hereda el despiece mudado)', cods: bomMudado, faltantes: [] })
  } else {
    const { cods, faltantes } = proponerBOM(m)
    m.componentes = cods
    propuestas.push({ codigo: cod, nombre: desc, tipo: 'NUEVO', cods, faltantes })
  }
  modelos.push(m)
  modeloPorCod.set(cod, m)
  modelosNuevos++
}

// ---------- 5) Informe + CSV de validacion ----------
const completos = propuestas.filter((p) => p.faltantes.length === 0)
const incompletos = propuestas.filter((p) => p.faltantes.length > 0)

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const csv = [
  ['Codigo', 'Modelo', 'Tipo', 'Piezas', 'Falta', 'Despiece propuesto'].map(esc).join(';'),
  ...propuestas.map((p) => [
    p.codigo, p.nombre, p.tipo, p.cods.length,
    p.faltantes.join(' + ') || 'completo',
    p.cods.join(' '),
  ].map(esc).join(';')),
].join('\r\n')
writeFileSync(join(raiz, 'docs/despiece_propuesto.csv'), '\uFEFF' + csv, 'utf8')

console.log(`
============================================================
IMPORTACION DE CATALOGO — ${APLICAR ? 'APLICANDO' : 'SIMULACION (no escribe el catalogo)'}
============================================================
COMPONENTES
  ${String(compsNuevos).padStart(5)}  nuevos
  ${String(compsRenombrados).padStart(5)}  cambiaron de descripcion
  ${String(componentes.length).padStart(5)}  total despues del merge (no se borro ninguno)

MODELOS
  ${String(modelosNuevos).padStart(5)}  nuevos
  ${String(modelosRenombrados).padStart(5)}  corregidos (nombre + despiece rearmado)
  ${String(modelos.length).padStart(5)}  total despues del merge

DESPIECE PROPUESTO
  ${String(completos.length).padStart(5)}  completos
  ${String(incompletos.length).padStart(5)}  >>> INCOMPLETOS: hay que revisarlos a mano <<<

Detalle para validar: docs/despiece_propuesto.csv
`)

if (incompletos.length) {
  console.log('MODELOS CON DESPIECE INCOMPLETO (primeros 25):')
  for (const p of incompletos.slice(0, 25)) {
    console.log(`  ${p.codigo}  ${p.nombre}`)
    console.log(`      falta: ${p.faltantes.join(' + ')}`)
  }
  if (incompletos.length > 25) console.log(`  ... y ${incompletos.length - 25} mas`)
  console.log()
}

if (APLICAR) {
  // RESPALDO ANTES DE PISAR. El catalogo es la unica fuente del despiece: si el
  // merge sale mal, sin esto la vuelta atras depende de que el archivo estuviera
  // commiteado. Se escribe una sola vez (si ya hay .bak es de una corrida
  // anterior y ESE es el original bueno, no se pisa).
  for (const r of [rutaModelos, rutaComps]) {
    if (!existsSync(r + '.bak')) copyFileSync(r, r + '.bak')
  }
  console.log('Respaldo: catalogoModelos.json.bak y catalogoComponentes.json.bak')

  writeFileSync(rutaModelos, JSON.stringify(modelos, null, 0).replace(/\},\{/g, '},\n{'), 'utf8')
  writeFileSync(rutaComps, JSON.stringify(componentes, null, 0).replace(/\},\{/g, '},\n{'), 'utf8')
  console.log('Catalogo actualizado. Correr `npx tsc -b --force` y revisar la app.')
} else {
  console.log('Simulacion: no se toco ningun archivo del catalogo.')
  console.log('Para aplicar, repetir el comando agregando  --aplicar\n')
}
