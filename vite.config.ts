import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { esEntornoDePrueba } from './src/lib/entornoRegla'

// ============================================================
// PWA Offline-First para tablets industriales (nave de 7.000 m2 con zonas
// muertas de Wi-Fi). Objetivo: si el operario reinicia la tablet sin senal,
// la app abre al instante desde cache (nunca pantalla en blanco).
//
//  - registerType 'autoUpdate': siempre la ultima version estable, sin prompts.
//  - Precache TOTAL del shell (HTML/JS/CSS/manifest/iconos/fuentes).
//  - navigateFallback -> index.html: el ruteo interno (SPA) funciona offline
//    aunque se recargue en una ruta profunda.
//  - Supabase = NetworkOnly: los datos dinamicos los maneja SOLO Dexie + el
//    syncEngine; el SW NUNCA cachea la API (evita datos viejos y bucles).
// ============================================================
// v2.42: entorno de prueba. Vercel "staging" define VITE_ENTORNO=test en el
// build; produccion no la define y el manifest queda EXACTAMENTE como antes.
// Si alguien instala la PWA de prueba en una tablet, el icono dice "PRUEBA".
// (Se lee via globalThis porque el proyecto no tiene @types/node.)
const ENV_BUILD = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const PRUEBA = esEntornoDePrueba(ENV_BUILD.VITE_ENTORNO)

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registramos a mano en src/main.tsx (control explicito)
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: PRUEBA ? 'INELPA PRUEBA - Control de Produccion' : 'INELPA - Control de Produccion',
        short_name: PRUEBA ? 'INELPA PRUEBA' : 'INELPA Prod',
        description: 'Programacion, planificacion y control de eficiencia de planta',
        theme_color: PRUEBA ? '#b45309' : '#0b3d6b',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache absoluto de todo el build estatico (incluye fuentes).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2,ttf,eot,webmanifest,json}'],
        // El catalogo maestro se bundlea en JS; subimos el limite por las dudas.
        maximumFileSizeToCacheInBytes: 3_000_000,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,

        // SPA offline: cualquier navegacion cae al shell precacheado...
        navigateFallback: '/index.html',
        // ...salvo el trafico de API/Auth/Realtime (no deben recibir el HTML).
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/realtime\//, /^\/functions\//, /^\/storage\//],

        runtimeCaching: [
          {
            // SUPABASE (REST / Auth / Realtime / Storage): NUNCA por el SW.
            // Los datos dinamicos los gobierna Dexie + syncEngine.
            urlPattern: ({ url }) =>
              url.hostname.includes('supabase') ||
              url.pathname.startsWith('/rest/') ||
              url.pathname.startsWith('/auth/') ||
              url.pathname.startsWith('/realtime/') ||
              url.pathname.startsWith('/functions/'),
            handler: 'NetworkOnly',
            method: 'GET',
          },
          {
            // Assets estaticos del mismo origen (defensivo, ademas del precache):
            // se sirven al instante desde cache y se revalidan en segundo plano.
            urlPattern: ({ request, url, sameOrigin }) =>
              sameOrigin && (request.destination === 'style' ||
                request.destination === 'script' ||
                request.destination === 'image' ||
                request.destination === 'font') &&
              !url.hostname.includes('supabase'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'assets-estaticos',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
  server: { host: true, port: 5173 },
  // v2.38 — pdf.js (visor de planos) usa "top-level await", que el destino por
  // defecto de Vite (Chrome 87 / Safari 14) no acepta y corta el build. Se sube
  // el piso apenas a la primera versión que lo soporta: Chrome/Edge/Firefox 89 y
  // Safari 15 (todos de 2021). Las tablets de planta están muy por encima.
  build: { target: ['chrome89', 'edge89', 'firefox89', 'safari15'] },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
})
