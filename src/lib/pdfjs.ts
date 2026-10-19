// ============================================================
// CARGA DIFERIDA DE pdf.js (v2.38) — el motor que dibuja los planos.
//
// Por qué pdf.js y no un <iframe>: en las tablets ANDROID, Chrome no muestra un
// PDF adentro de la página; en su lugar pone un botón de "Descargar". pdf.js
// (la librería de Mozilla, la misma que usa Firefox) dibuja cada página en un
// <canvas>, así que se ve igual en Android, iPad y PC, sin descargas.
//
// Se usa la build LEGACY a propósito: trae los "polyfills" para Chrome viejos.
// La build normal exige funciones que recién están en Chrome 119+ y las
// tablets de planta no siempre están actualizadas.
//
// Se importa con import() dinámico: Vite lo separa en su propio archivo y solo
// se baja la primera vez que alguien abre un plano. El arranque de la app no
// paga ese peso.
//
// Los tipos son mínimos y propios: solo lo que usa el visor. Así no dependemos
// de los .d.ts internos del paquete, que cambian entre versiones.
// ============================================================

export interface PdfViewport { width: number; height: number }

export interface PdfRenderTask { promise: Promise<void>; cancel(): void }

export interface PdfPagina {
  getViewport(o: { scale: number }): PdfViewport
  render(p: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport; canvas?: HTMLCanvasElement }): PdfRenderTask
  cleanup?(): void
}

export interface PdfDocumento {
  numPages: number
  getPage(n: number): Promise<PdfPagina>
  destroy(): Promise<void>
}

interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean }): { promise: Promise<PdfDocumento>; destroy(): Promise<void> }
}

let cargando: Promise<PdfJsLib> | null = null

export function cargarPdfJs(): Promise<PdfJsLib> {
  if (!cargando) {
    cargando = (async () => {
      const [lib, worker] = await Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        // `?url`: Vite copia el worker al build y devuelve su dirección.
        import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
      ])
      const pdfjs = lib as unknown as PdfJsLib
      pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default
      return pdfjs
    })()
    // Si falla (ej. se cortó la red justo al bajar el módulo), que el próximo
    // intento vuelva a probar en vez de quedarse con el error para siempre.
    cargando.catch(() => { cargando = null })
  }
  return cargando
}

/**
 * Abre un PDF a partir de sus bytes.
 * `isEvalSupported: false`: pdf.js no ejecuta código armado desde el PDF
 * (cierra la vía de ataque de fuentes maliciosas, CVE-2024-4367).
 */
export async function abrirPdf(bytes: ArrayBuffer): Promise<PdfDocumento> {
  const pdfjs = await cargarPdfJs()
  // Copia: pdf.js se queda con el buffer (lo pasa al worker) y la memoria de
  // planos.ts lo reutiliza si otra tarjeta muestra el mismo plano.
  return pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise
}
