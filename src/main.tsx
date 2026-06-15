import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { ensureSeed, ensureCatalogo } from './db/seed'
import { SUPABASE_HABILITADO } from './lib/supabaseClient'
import './index.css'

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
