/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SAP_SERVICE_LAYER_URL: string
  /** v2.42: 'test' en el entorno de prueba (Vercel staging). Ausente en producción. */
  readonly VITE_ENTORNO?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
