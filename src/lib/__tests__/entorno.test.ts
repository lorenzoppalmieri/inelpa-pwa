import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { esEntornoDePrueba } from '../entorno'

// ============================================================
// v2.42 — El aviso "ENTORNO DE PRUEBA" solo aparece cuando VITE_ENTORNO lo pide.
// Lo importante es el caso por defecto: en producción la variable no existe y
// la app NO puede mostrar nada distinto.
// ============================================================

describe('esEntornoDePrueba', () => {
  it('producción: variable ausente, vacía o con otro valor -> false', () => {
    for (const v of [undefined, null, '', '   ', 'production', 'prod', 'main']) {
      expect(esEntornoDePrueba(v), String(v)).toBe(false)
    }
  })

  it('prueba: test / prueba / staging, sin importar mayúsculas ni espacios', () => {
    for (const v of ['test', 'TEST', ' prueba ', 'Staging']) {
      expect(esEntornoDePrueba(v), v).toBe(true)
    }
  })
})

describe('<AvisoEntorno />', () => {
  // El flag se calcula al cargar el módulo: hay que recargarlo en cada caso.
  const montar = async () => {
    vi.resetModules()
    const { default: AvisoEntorno } = await import('../../components/AvisoEntorno')
    return renderToStaticMarkup(createElement(AvisoEntorno))
  }
  afterEach(() => vi.unstubAllEnvs())

  it('en producción no dibuja NADA (ni un nodo)', async () => {
    vi.stubEnv('VITE_ENTORNO', '')
    expect(await montar()).toBe('')
  })

  it('en el entorno de prueba dibuja la pestaña', async () => {
    vi.stubEnv('VITE_ENTORNO', 'test')
    const html = await montar()
    expect(html).toContain('ENTORNO DE PRUEBA')
    expect(html).toContain('class="aviso-entorno"')
  })
})
