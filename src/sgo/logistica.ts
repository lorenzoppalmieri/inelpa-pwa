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

export interface ItemCarga {
  id: string
  descripcion: string
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
  advertencias: string[]
}

const redondear = (valor: number, decimales = 2) => Number(valor.toFixed(decimales))
const numeroValido = (valor: number) => Number.isFinite(valor) && valor > 0

export function calcularCubicaje(items: ItemCarga[], espacio: EspacioCarga): ResultadoCubicaje {
  const validos = items.filter((i) => i.descripcion.trim() && i.cantidad > 0 && [i.largoM, i.anchoM, i.altoM, i.pesoKg].every(numeroValido))
  const volumenCarga = validos.reduce((t, i) => t + i.cantidad * i.largoM * i.anchoM * i.altoM, 0)
  const pesoTotal = validos.reduce((t, i) => t + i.cantidad * i.pesoKg, 0)
  const volumenEspacio = numeroValido(espacio.largoM) && numeroValido(espacio.anchoM) && numeroValido(espacio.altoM)
    ? espacio.largoM * espacio.anchoM * espacio.altoM : 0
  const piso = numeroValido(espacio.largoM) && numeroValido(espacio.anchoM) ? espacio.largoM * espacio.anchoM : 0
  const slots = validos.flatMap((item) => {
    const capas = item.apilable ? Math.max(1, Math.floor(espacio.altoM / item.altoM)) : 1
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
    if (!orientacion || slot.unidades * i.altoM > espacio.altoM) {
      unidadesNoUbicadas += slot.unidades
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
  if (items.length !== validos.length) advertencias.push('Hay renglones incompletos que no fueron incluidos.')
  if (usoVolumen > 100) advertencias.push('El volumen total supera el volumen geométrico del vehículo.')
  if (usoPeso > 100) advertencias.push('El peso total supera la carga máxima informada.')
  if (unidadesNoUbicadas > 0) advertencias.push(`${unidadesNoUbicadas} unidad(es) no entran en la disposición orientativa.`)
  if (ubicaciones.length && validos.some((i) => i.apilable)) advertencias.push('El apilado es orientativo: verificar resistencia, estabilidad y restricciones del fabricante.')
  advertencias.push('Validar en campo centro de gravedad, cargas por eje, puntos de amarre y límites legales del transporte.')

  return {
    volumenCargaM3: redondear(volumenCarga), volumenEspacioM3: redondear(volumenEspacio), pesoTotalKg: redondear(pesoTotal, 0),
    usoVolumenPct: redondear(usoVolumen, 1), usoPesoPct: redondear(usoPeso, 1), usoPisoPct: redondear(piso ? (pisoUsado / piso) * 100 : 0, 1),
    unidadesTotales: validos.reduce((t, i) => t + i.cantidad, 0), unidadesNoUbicadas, ubicaciones, advertencias,
  }
}
