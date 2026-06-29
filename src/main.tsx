import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { purgarDemo, ensureCatalogo } from './db/seed'
import { recargarFeriadosCalendario } from './sync/syncEngine'
import './index.css'

// Service Worker (Offline-First). registerType 'autoUpdate' -> aplica la nueva
// version automaticamente; immediate registra al cargar para que la tablet quede
// lista para abrir sin red cuanto antes. No bloquea el arranque de la app.
registerSW({ immediate: true })

// HOTFIX lunes: NO se siembran datos demo (causaban "tareas fantasma"). El sistema
// muestra SOLO datos reales de Supabase (fetch inicial + Realtime). Ademas se
// purgan los registros demo que hayan quedado en tablets de versiones anteriores.
// El catalogo MAESTRO (modelos + componentes) se siembra SIEMPRE: es data estatica
// standalone que no viene del fetch inicial.
// v1.17: cargar feriados (de Dexie) al motor de calendario antes de renderizar,
// para que el Gantt/planificacion respeten dias no laborables incluso offline.
const arranque = purgarDemo().then(ensureCatalogo).then(recargarFeriadosCalendario)

arranque.then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>,
  )
})
