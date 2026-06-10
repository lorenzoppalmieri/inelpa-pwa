import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// PWA Offline-First: el service worker (Workbox) precachea el shell de la app
// y aplica estrategias de cache para que la tablet funcione sin red.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'INELPA - Control de Produccion',
        short_name: 'INELPA Prod',
        description: 'Programacion, planificacion y control de eficiencia de planta',
        theme_color: '#0b3d6b',
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // El shell se sirve siempre desde cache (offline-first).
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Llamadas a la API/Supabase: red primero, cae a cache si esta offline.
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/') || url.host.includes('supabase'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
  server: { host: true, port: 5173 },
})
