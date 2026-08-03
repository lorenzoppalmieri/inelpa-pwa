import type { PilarSGO } from './types'

export type TipoAuditoriaLogistica = 'recepcion' | 'stock' | 'despacho' | 'embalaje_carga'
export type EstadoPuntoAuditoria = 'pendiente' | 'conforme' | 'no_conforme' | 'no_aplica'

export interface PuntoAuditoriaLogistica {
  id: string
  label: string
  pilar: PilarSGO
  estado: EstadoPuntoAuditoria
  observacion?: string
}

export interface DatosAuditoriaLogistica {
  tipo: TipoAuditoriaLogistica
  auditor: string
  fecha: string
  ubicacion: string
  proveedor?: string
  documentoSap?: string
  remito?: string
  transportista?: string
  patente?: string
  chofer?: string
  ordenes?: string
  series?: string
  checklist: PuntoAuditoriaLogistica[]
  observaciones?: string
  accionInmediata?: string
  responsableSector?: string
  porcentajeCumplimiento: number
}

export interface PlantillaAuditoriaLogistica {
  id: TipoAuditoriaLogistica
  label: string
  descripcion: string
  icono: string
  pilar: PilarSGO
  frecuencia: 'semanal' | 'quincenal'
  puntos: Omit<PuntoAuditoriaLogistica, 'estado' | 'observacion'>[]
}

export const PLANTILLAS_AUDITORIA_LOGISTICA: PlantillaAuditoriaLogistica[] = [
  {
    id: 'recepcion', label: 'Recepción de materiales', icono: '📥', pilar: 'calidad', frecuencia: 'semanal',
    descripcion: 'Control documental, físico y de seguridad antes de liberar el material al depósito.',
    puntos: [
      { id: 'rec_documentos', label: 'Orden de compra, remito y material recibido coinciden.', pilar: 'calidad' },
      { id: 'rec_cantidad', label: 'Código, descripción y cantidad fueron verificados.', pilar: 'calidad' },
      { id: 'rec_estado', label: 'Embalaje y material llegan sin golpes, humedad, corrosión ni daño visible.', pilar: 'calidad' },
      { id: 'rec_trazabilidad', label: 'Lote, identificación y certificados requeridos son trazables.', pilar: 'calidad' },
      { id: 'rec_sap', label: 'La recepción quedó registrada o referenciada en SAP B1.', pilar: 'entrega' },
      { id: 'rec_descarga', label: 'La descarga se realizó con equipo, circulación y EPP seguros.', pilar: 'seguridad' },
      { id: 'rec_cuarentena', label: 'El material dudoso o no conforme quedó identificado y segregado.', pilar: 'calidad' },
    ],
  },
  {
    id: 'stock', label: 'Stock y depósito', icono: '📦', pilar: 'costos', frecuencia: 'semanal',
    descripcion: 'Exactitud de inventario, ubicación, preservación, trazabilidad y condiciones del depósito.',
    puntos: [
      { id: 'stk_conteo', label: 'El conteo físico de la muestra coincide con SAP B1.', pilar: 'costos' },
      { id: 'stk_ubicacion', label: 'Ubicación, código y descripción están visibles y coinciden.', pilar: 'calidad' },
      { id: 'stk_trazabilidad', label: 'Lote, FIFO y movimientos conservan trazabilidad.', pilar: 'calidad' },
      { id: 'stk_segregacion', label: 'Material no conforme, reservado o en cuarentena está segregado.', pilar: 'calidad' },
      { id: 'stk_preservacion', label: 'El material está protegido de humedad, golpes, polvo y deterioro.', pilar: 'calidad' },
      { id: 'stk_estiba', label: 'Estanterías, estiba, carga máxima y estabilidad son seguras.', pilar: 'seguridad' },
      { id: 'stk_pasillos', label: 'Pasillos, salidas y elementos contra incendio permanecen accesibles.', pilar: 'seguridad' },
      { id: 'stk_diferencias', label: 'Las diferencias detectadas tienen explicación, responsable y ajuste controlado.', pilar: 'costos' },
    ],
  },
  {
    id: 'despacho', label: 'Despacho de transformadores', icono: '🚚', pilar: 'entrega', frecuencia: 'semanal',
    descripcion: 'Liberación, documentación, identidad del equipo y entrega al transporte.',
    puntos: [
      { id: 'des_lib_lab', label: 'El transformador está liberado por Laboratorio.', pilar: 'calidad' },
      { id: 'des_identidad', label: 'Modelo, potencia, serie y cliente coinciden con la documentación.', pilar: 'calidad' },
      { id: 'des_accesorios', label: 'Accesorios, protocolo, manuales y documentación están completos.', pilar: 'calidad' },
      { id: 'des_visual', label: 'La inspección visual final no presenta pérdidas, golpes, suciedad ni piezas flojas.', pilar: 'calidad' },
      { id: 'des_remito', label: 'Remito, pedido, destino y fecha comprometida son correctos.', pilar: 'entrega' },
      { id: 'des_transporte', label: 'Transportista, chofer, patente y unidad están identificados.', pilar: 'entrega' },
      { id: 'des_evidencia', label: 'Se registró evidencia fotográfica antes de cargar.', pilar: 'calidad' },
      { id: 'des_zona', label: 'La zona de carga está demarcada, despejada y operada en forma segura.', pilar: 'seguridad' },
    ],
  },
  {
    id: 'embalaje_carga', label: 'Embalaje y verificación sobre camión', icono: '🪢', pilar: 'entrega', frecuencia: 'semanal',
    descripcion: 'Control final del embalaje, trincado y estado del transformador ya ubicado sobre el camión.',
    puntos: [
      { id: 'emb_instructivo', label: 'El embalaje corresponde al modelo, destino e instrucción aplicable.', pilar: 'calidad' },
      { id: 'emb_proteccion', label: 'Aisladores, accesorios, pintura y superficies sensibles están protegidos.', pilar: 'calidad' },
      { id: 'emb_base', label: 'Base, apoyos, tacos y bloqueo evitan desplazamientos y contacto inadecuado.', pilar: 'seguridad' },
      { id: 'emb_trincado', label: 'Trincas, cadenas o cinchas son adecuadas y no dañan el equipo.', pilar: 'seguridad' },
      { id: 'emb_camion', label: 'Piso del camión, capacidad declarada y condiciones generales son adecuadas.', pilar: 'seguridad' },
      { id: 'emb_orientacion', label: 'Orientación, centro de gravedad y distribución de la carga son razonables.', pilar: 'seguridad' },
      { id: 'emb_identificacion', label: 'Serie, destino y señalización permanecen visibles.', pilar: 'entrega' },
      { id: 'emb_arriba', label: 'Nicolás verificó arriba del camión que el transformador quedó sin daños y correctamente sujeto.', pilar: 'calidad' },
      { id: 'emb_fotos', label: 'Se tomaron fotos finales de los cuatro lados, sujeciones y patente.', pilar: 'calidad' },
    ],
  },
]

export function checklistDesdePlantilla(tipo: TipoAuditoriaLogistica): PuntoAuditoriaLogistica[] {
  const plantilla = PLANTILLAS_AUDITORIA_LOGISTICA.find((p) => p.id === tipo)!
  return plantilla.puntos.map((p) => ({ ...p, estado: 'pendiente' }))
}

export function calcularCumplimientoAuditoria(puntos: PuntoAuditoriaLogistica[]): number {
  const evaluados = puntos.filter((p) => p.estado === 'conforme' || p.estado === 'no_conforme')
  if (!evaluados.length) return 0
  return Math.round((evaluados.filter((p) => p.estado === 'conforme').length / evaluados.length) * 100)
}

export function puntosNoConformes(puntos: PuntoAuditoriaLogistica[]): PuntoAuditoriaLogistica[] {
  return puntos.filter((p) => p.estado === 'no_conforme')
}

export function auditoriaCompleta(puntos: PuntoAuditoriaLogistica[]): boolean {
  return puntos.every((p) => p.estado !== 'pendiente')
}

export type TarimaInelpaId = 'F1' | 'F2' | 'F3' | 'F4'

export interface TarimaInelpa {
  id: TarimaInelpaId
  nombre: string
  rangoTransformador: string
  largoM: number
  anchoM: number
  hojaPlano: number
}

// Fuente: PLANOS DE TARIMAS, Diseño y Desarrollo INELPA, 29/01/2026.
// Las dimensiones corresponden a la huella exterior usada para planificar la carga.
export const TARIMAS_INELPA: TarimaInelpa[] = [
  { id: 'F1', nombre: 'F1 - Chicos', rangoTransformador: 'TTD16 a TTD40', largoM: 1.2, anchoM: 0.6, hojaPlano: 1 },
  { id: 'F2', nombre: 'F2 - Chicos', rangoTransformador: 'TTD63 a TTD200', largoM: 1.3, anchoM: 0.8, hojaPlano: 2 },
  { id: 'F3', nombre: 'F3 - Chicos', rangoTransformador: 'TTD250 a TTD500', largoM: 1.5, anchoM: 1, hojaPlano: 3 },
  { id: 'F4', nombre: 'F4', rangoTransformador: 'TTD630 a TTD1000', largoM: 1.95, anchoM: 1.1, hojaPlano: 4 },
]

export interface ItemCarga {
  id: string
  descripcion: string
  tarimaId?: TarimaInelpaId | 'personalizada'
  cantidad: number
  largoM: number
  anchoM: number
  altoM: number
  pesoKg: number
  rotatable: boolean
  apilable: boolean
  color: string
}

export interface EspacioCarga {
  nombre: string
  largoM: number
  anchoM: number
  altoM: number
  cargaMaxKg: number
}

export interface PiezaUbicada {
  id: string
  itemId: string
  descripcion: string
  xM: number
  yM: number
  largoM: number
  anchoM: number
  altoM: number
  unidades: number
  color: string
}

export interface ResultadoCubicaje {
  volumenCargaM3: number
  volumenEspacioM3: number
  pesoTotalKg: number
  usoVolumenPct: number
  usoPesoPct: number
  usoPisoPct: number
  unidadesTotales: number
  unidadesNoUbicadas: number
  ubicaciones: PiezaUbicada[]
  pendientesUbicacion: PiezaUbicada[]
  advertencias: string[]
}

export interface EvaluacionDistribucion {
  valida: boolean
  fueraDeLimites: string[]
  superpuestos: string[]
}

const redondear = (valor: number, decimales = 2) => Number(valor.toFixed(decimales))
const numeroValido = (valor: number) => Number.isFinite(valor) && valor > 0

export function calcularCubicaje(items: ItemCarga[], espacio: EspacioCarga): ResultadoCubicaje {
  const validos = items.filter((i) => i.descripcion.trim() && i.cantidad > 0 && [i.largoM, i.anchoM].every(numeroValido))
  const volumenCarga = validos.reduce((t, i) => t + (numeroValido(i.altoM) ? i.cantidad * i.largoM * i.anchoM * i.altoM : 0), 0)
  const pesoTotal = validos.reduce((t, i) => t + (numeroValido(i.pesoKg) ? i.cantidad * i.pesoKg : 0), 0)
  const volumenEspacio = numeroValido(espacio.largoM) && numeroValido(espacio.anchoM) && numeroValido(espacio.altoM)
    ? espacio.largoM * espacio.anchoM * espacio.altoM : 0
  const piso = numeroValido(espacio.largoM) && numeroValido(espacio.anchoM) ? espacio.largoM * espacio.anchoM : 0
  const slots = validos.flatMap((item) => {
    const capas = item.apilable && numeroValido(item.altoM) ? Math.max(1, Math.floor(espacio.altoM / item.altoM)) : 1
    const resultado: { item: ItemCarga; unidades: number }[] = []
    let faltan = item.cantidad
    while (faltan > 0 && resultado.length < 500) {
      const unidades = Math.min(capas, faltan)
      resultado.push({ item, unidades })
      faltan -= unidades
    }
    return resultado
  }).sort((a, b) => (b.item.largoM * b.item.anchoM) - (a.item.largoM * a.item.anchoM))

  const ubicaciones: PiezaUbicada[] = []
  const pendientesUbicacion: PiezaUbicada[] = []
  let x = 0
  let y = 0
  let profundidadFila = 0
  let unidadesNoUbicadas = 0

  for (const slot of slots) {
    const i = slot.item
    const opciones = [{ largo: i.largoM, ancho: i.anchoM }]
    if (i.rotatable && i.largoM !== i.anchoM) opciones.push({ largo: i.anchoM, ancho: i.largoM })
    let orientacion = opciones.find((o) => x + o.largo <= espacio.largoM && y + o.ancho <= espacio.anchoM)
    if (!orientacion) {
      x = 0
      y += profundidadFila
      profundidadFila = 0
      orientacion = opciones.find((o) => o.largo <= espacio.largoM && y + o.ancho <= espacio.anchoM)
    }
    if (!orientacion || (numeroValido(i.altoM) && slot.unidades * i.altoM > espacio.altoM)) {
      unidadesNoUbicadas += slot.unidades
      const huella = opciones[0]
      pendientesUbicacion.push({
        id: `${i.id}-pendiente-${pendientesUbicacion.length}`, itemId: i.id, descripcion: i.descripcion,
        xM: 0, yM: 0, largoM: huella.largo, anchoM: huella.ancho,
        altoM: i.altoM, unidades: slot.unidades, color: i.color,
      })
      continue
    }
    ubicaciones.push({
      id: `${i.id}-${ubicaciones.length}`, itemId: i.id, descripcion: i.descripcion,
      xM: x, yM: y, largoM: orientacion.largo, anchoM: orientacion.ancho,
      altoM: i.altoM, unidades: slot.unidades, color: i.color,
    })
    x += orientacion.largo
    profundidadFila = Math.max(profundidadFila, orientacion.ancho)
  }

  const pisoUsado = ubicaciones.reduce((t, p) => t + p.largoM * p.anchoM, 0)
  const usoVolumen = volumenEspacio ? (volumenCarga / volumenEspacio) * 100 : 0
  const usoPeso = espacio.cargaMaxKg > 0 ? (pesoTotal / espacio.cargaMaxKg) * 100 : 0
  const advertencias: string[] = []
  if (items.length !== validos.length) advertencias.push('Hay renglones sin descripción o huella válida que no fueron incluidos.')
  if (validos.some((i) => !numeroValido(i.altoM) || !numeroValido(i.pesoKg))) advertencias.push('Completá altura y peso: los pallets ya se ubican, pero volumen y peso son parciales.')
  if (usoVolumen > 100) advertencias.push('El volumen total supera el volumen geométrico del vehículo.')
  if (usoPeso > 100) advertencias.push('El peso total supera la carga máxima informada.')
  if (unidadesNoUbicadas > 0) advertencias.push(`${unidadesNoUbicadas} unidad(es) no entran en la disposición orientativa.`)
  if (ubicaciones.length && validos.some((i) => i.apilable)) advertencias.push('El apilado es orientativo: verificar resistencia, estabilidad y restricciones del fabricante.')
  advertencias.push('Validar en campo centro de gravedad, cargas por eje, puntos de amarre y límites legales del transporte.')

  return {
    volumenCargaM3: redondear(volumenCarga), volumenEspacioM3: redondear(volumenEspacio), pesoTotalKg: redondear(pesoTotal, 0),
    usoVolumenPct: redondear(usoVolumen, 1), usoPesoPct: redondear(usoPeso, 1), usoPisoPct: redondear(piso ? (pisoUsado / piso) * 100 : 0, 1),
    unidadesTotales: validos.reduce((t, i) => t + i.cantidad, 0), unidadesNoUbicadas, ubicaciones, pendientesUbicacion, advertencias,
  }
}

export function evaluarDistribucion(ubicaciones: PiezaUbicada[], espacio: EspacioCarga): EvaluacionDistribucion {
  const tolerancia = 0.0001
  const fueraDeLimites = ubicaciones.filter((p) =>
    p.xM < -tolerancia || p.yM < -tolerancia ||
    p.xM + p.largoM > espacio.largoM + tolerancia || p.yM + p.anchoM > espacio.anchoM + tolerancia,
  ).map((p) => p.id)
  const superpuestos = new Set<string>()
  for (let i = 0; i < ubicaciones.length; i += 1) {
    for (let j = i + 1; j < ubicaciones.length; j += 1) {
      const a = ubicaciones[i]
      const b = ubicaciones[j]
      const seSuperponen = a.xM < b.xM + b.largoM - tolerancia &&
        a.xM + a.largoM > b.xM + tolerancia &&
        a.yM < b.yM + b.anchoM - tolerancia &&
        a.yM + a.anchoM > b.yM + tolerancia
      if (seSuperponen) {
        superpuestos.add(a.id)
        superpuestos.add(b.id)
      }
    }
  }
  return {
    valida: fueraDeLimites.length === 0 && superpuestos.size === 0,
    fueraDeLimites,
    superpuestos: [...superpuestos],
  }
}
