// v2.38 — Red de seguridad para el import dinámico de pdf.js (lib/pdfjs.ts).
// Si el paquete trae sus propios tipos para esta ruta, TypeScript usa esos; si
// no, cae acá y el módulo queda como `any`. En los dos casos lib/pdfjs.ts lo
// convierte a sus tipos mínimos, así que la versión exacta del paquete no rompe
// la compilación.
declare module 'pdfjs-dist/legacy/build/pdf.mjs'
