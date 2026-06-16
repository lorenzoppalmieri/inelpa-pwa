import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { ensureSeed, ensureCatalogo } from './db/seed'
import { SUPABASE_HABILITADO } from './lib/supabaseClient'
import './index.css'

// Service Worker (Offline-First). registerType 'autoUpdate' -> aplica la nueva
// version automaticamente; immediate registra al cargar para que la tablet quede
// lista para abrir sin red cuanto antes. No bloquea el arranque de la app.
registerSW({ immediate: true })

// Con backend real (Supabase) NO sembramos demo: Dexie se llena desde la nube
// (fetch inicial + Realtime). Sembrar demo aqui chocaria los ids text con los uuid
// de Supabase. Solo se siembra en modo offline/demo (sin .env).
// El catalogo MAESTRO (modelos + componentes) se siembra SIEMPRE: es data estatica
// standalone que no viene del fetch inicial.
const arranque = (SUPABASE_HABILITADO ? Promise.resolve() : ensureSeed()).then(ensureCatalogo)

arranque.then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>,
  )
})
