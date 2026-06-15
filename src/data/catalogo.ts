import modelosJson from './catalogoModelos.json'
import componentesJson from './catalogoComponentes.json'
import type { ModeloTransformador, ComponenteSemielaborado } from '../types'

// ============================================================
// Catalogo maestro estatico (generado desde el export SAP B1 / OITM).
//  - catalogoModelos.json     : 255 modelos de transformador
//  - catalogoComponentes.json : ~1600 componentes (semielaborados)
// Cada modelo trae su BOM (codigos de componentes) en 'componentes'.
// La PWA funciona standalone con estos datos; tambien se siembran en Dexie/Supabase.
// ============================================================
export const MODELOS_CATALOGO = modelosJson as unknown as ModeloTransformador[]
export const COMPONENTES_CATALOGO = componentesJson as unknown as ComponenteSemielaborado[]

const _compByCodigo = new Map(COMPONENTES_CATALOGO.map((c) => [c.codigo, c]))
const _modeloByCodigo = new Map(MODELOS_CATALOGO.map((m) => [m.codigo, m]))
const _modeloByNombre = new Map(MODELOS_CATALOGO.map((m) => [m.nombre, m]))

export function modeloPorCodigo(codigo?: string): ModeloTransformador | undefined {
  return codigo ? _modeloByCodigo.get(codigo) : undefined
}
export function modeloPorNombre(nombre?: string): ModeloTransformador | undefined {
  return nombre ? _modeloByNombre.get(nombre) : undefined
}
export function componentePorCodigo(codigo?: string): ComponenteSemielaborado | undefined {
  return codigo ? _compByCodigo.get(codigo) : undefined
}

// Componentes (semielaborados) asociados a un modelo, en orden de su BOM.
export function componentesDeModelo(modelo?: ModeloTransformador): ComponenteSemielaborado[] {
  if (!modelo) return []
  return modelo.componentes
    .map((cod) => _compByCodigo.get(cod))
    .filter((c): c is ComponenteSemielaborado => Boolean(c))
}
