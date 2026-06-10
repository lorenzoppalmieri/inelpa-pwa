// ============================================================
// Preparacion de integracion con SAP Business One (Service Layer REST).
// Go-live objetivo: agosto 2026 (junto con SAP B1, consultor Seidor).
//
// Este archivo define el mapeo 1:1 entre el modelo de la PWA y los objetos
// de SAP B1, segun la PLANTILLA 2 de relevamiento. Los campos marcados
// como UDF deben crearse en SAP por el consultor (Seidor) antes del go-live.
// ============================================================
import type { Tarea, OrdenProduccion, Semielaborado, SectorId } from '../types'

// ---- Flujo SAP -> APP (la app LEE de SAP) ----
// Orden de produccion activa  <- Orden de Fabricacion (ProductionOrders)
// N de transformador/contrato <- Orden de Venta (Orders)
// Modelo de transformador     <- Oferta de Ventas / Item
// Lista de operarios          <- Recursos / Empleados (EmployeesInfo)
// Estado de la orden          <- Partidas abiertas
// Materiales de la orden      <- BOM / Orden de Fabricacion

export interface SapProductionOrder {
  AbsoluteEntry: number
  DocumentNumber: number
  ItemNo: string          // modelo
  ProductionOrderStatus: string
  PlannedQuantity: number
  DueDate: string
  // v1.2: material del bobinado. En SAP se expone como UDF sobre la orden
  // (cobre / aluminio); el consultor (Seidor) lo define antes del go-live.
  U_INELPA_MATERIAL?: string
}

export function ordenDesdeSap(po: SapProductionOrder): OrdenProduccion {
  return {
    id: 'sap_' + po.AbsoluteEntry,
    nroOrden: String(po.DocumentNumber),
    modelo: po.ItemNo,
    material: (po.U_INELPA_MATERIAL ?? '').toLowerCase() === 'aluminio' ? 'aluminio' : 'cobre',
    linea: po.ItemNo.startsWith('TMR') || po.ItemNo.startsWith('TBR') || po.ItemNo.startsWith('TTR') ? 'rural' : 'distribucion',
    cantidad: po.PlannedQuantity,
    fechaEntrega: po.DueDate,
  }
}

// ---- Flujo APP -> SAP (la app ESCRIBE en SAP, via UDF/UDO) ----
// Estos UDF deben existir en SAP B1 (definidos por el consultor):
export const UDF = {
  inicioReal: 'U_INELPA_T_INI',
  finReal: 'U_INELPA_T_FIN',
  tiempoNetoMin: 'U_INELPA_T_NETO',
  minutosParada: 'U_INELPA_PARADA',
  causaParada: 'U_INELPA_CAUSA',
  calidadOk: 'U_INELPA_QC',
  defecto: 'U_INELPA_DEFECTO',
  avancePct: 'U_INELPA_AVANCE',
} as const

// Payload que la app enviaria al Service Layer para reportar una tarea.
export function tareaAPayloadSap(t: Tarea, netoMin: number, paradaMin: number) {
  return {
    [UDF.inicioReal]: t.inicioReal ?? null,
    [UDF.finReal]: t.finReal ?? null,
    [UDF.tiempoNetoMin]: netoMin,
    [UDF.minutosParada]: paradaMin,
    [UDF.calidadOk]: t.calidadOk ? 'Y' : 'N',
    [UDF.defecto]: t.defecto ?? '',
    OrderRef: t.ordenId,
    Sector: t.sectorId,
  }
}

// ============================================================
// SEMIELABORADOS  <->  SAP B1
//
// En SAP B1 un semielaborado (ej. una bobina terminada) vive como ARTICULO
// en la tabla OITM (objeto Service Layer: "Items"). Su estructura/arbol de
// fabricacion vive en la lista de materiales: OITT (cabecera) + ITT1 (lineas).
//
// Flujo de datos:
//   SAP (OITM/OITT) ---LEE---> PWA (cache local Dexie 'semielaborados')
//   PWA (alta/uso)  ---ESCRIBE-> SAP (UDF de estado/trazabilidad sobre OITM)
//
// La PWA NO es la fuente de verdad del maestro de articulos: solo mantiene
// un ESPEJO local para operar offline. El alta definitiva del articulo la
// hace SAP. La PWA reporta estado (en_proceso/disponible/consumido) y la
// trazabilidad (que tarea lo genero / que orden lo consume) via UDF.
// ============================================================

// Subconjunto de campos OITM (objeto "Items" del Service Layer) que usamos.
export interface SapItem {
  ItemCode: string          // = codigo del semielaborado
  ItemName: string          // = descripcion
  ItemsGroupCode?: number   // grupo de articulos (ej. "Semielaborados")
  // UDF de trazabilidad INELPA (los crea el consultor en OITM):
  U_INELPA_SECTOR?: string  // sector de origen
  U_INELPA_MODELO?: string  // modelo asociado
  U_INELPA_ESTADO?: string  // EN_PROCESO | DISPONIBLE | CONSUMIDO
}

// Linea de lista de materiales (ITT1) — el semielaborado como componente.
export interface SapBomLine {
  ParentItem: string        // articulo padre (OITT.Code) = modelo/transformador
  ItemCode: string          // componente = semielaborado (la bobina)
  Quantity: number
}

const SECTOR_DESDE_SAP: Record<string, SectorId> = {
  BOB_DIST_AT: 'bob_dist_at', BOB_DIST_BT: 'bob_dist_bt',
  BOB_RURAL_AT: 'bob_rural_at', BOB_RURAL_BT: 'bob_rural_bt',
}

// SAP (OITM) -> PWA: construir el espejo local de un semielaborado.
export function semielaboradoDesdeSap(it: SapItem): Semielaborado {
  const estado = (it.U_INELPA_ESTADO ?? 'EN_PROCESO').toUpperCase()
  return {
    id: 'sap_' + it.ItemCode,
    codigo: it.ItemCode,
    descripcion: it.ItemName,
    sectorOrigen: SECTOR_DESDE_SAP[(it.U_INELPA_SECTOR ?? '').toUpperCase()] ?? 'bob_dist_at',
    modelo: it.U_INELPA_MODELO ?? '',
    estado: estado === 'DISPONIBLE' ? 'disponible' : estado === 'CONSUMIDO' ? 'consumido' : 'en_proceso',
    sapItemCode: it.ItemCode,
    actualizado: new Date().toISOString(),
  }
}

// PWA -> SAP: payload PATCH sobre OITM(ItemCode) para reportar estado/trazabilidad.
export function semielaboradoAPayloadSap(s: Semielaborado) {
  return {
    U_INELPA_SECTOR: s.sectorOrigen.toUpperCase(),
    U_INELPA_MODELO: s.modelo,
    U_INELPA_ESTADO: s.estado.toUpperCase(),
    U_INELPA_TAREA_ORIGEN: s.tareaOrigenId ?? '',
    U_INELPA_ORDEN_DESTINO: s.ordenDestinoId ?? '',
  }
}

// Esqueleto de cliente del Service Layer (login por sesion + cookie B1SESSION).
// Se activa en la fase de go-live; hoy queda como contrato.
export class SapServiceLayer {
  constructor(private baseUrl = import.meta.env.VITE_SAP_SERVICE_LAYER_URL) {}

  async login(_company: string, _user: string, _pass: string): Promise<boolean> {
    // POST {baseUrl}/Login  { CompanyDB, UserName, Password }
    // SAP responde Set-Cookie: B1SESSION=... que se reutiliza en cada request.
    return false // pendiente go-live
  }

  async upsertReporteTarea(_payload: ReturnType<typeof tareaAPayloadSap>): Promise<boolean> {
    // PATCH {baseUrl}/ProductionOrders(AbsoluteEntry)  con UDF, o UDO dedicada.
    return false // pendiente go-live
  }

  // LEE el maestro de articulos (OITM) filtrando el grupo de semielaborados.
  async leerSemielaborados(_grupoCode?: number): Promise<SapItem[]> {
    // GET {baseUrl}/Items?$filter=ItemsGroupCode eq {grupo}&$select=ItemCode,ItemName,U_INELPA_*
    return [] // pendiente go-live
  }

  // LEE la lista de materiales (OITT/ITT1) de un modelo padre.
  async leerBom(_parentItem: string): Promise<SapBomLine[]> {
    // GET {baseUrl}/ProductTrees('{parentItem}')  -> ProductTreeLines
    return [] // pendiente go-live
  }

  // ESCRIBE estado/trazabilidad del semielaborado sobre su articulo OITM.
  async upsertSemielaborado(_payload: ReturnType<typeof semielaboradoAPayloadSap>): Promise<boolean> {
    // PATCH {baseUrl}/Items('{ItemCode}')  con los UDF U_INELPA_*.
    return false // pendiente go-live
  }
}
