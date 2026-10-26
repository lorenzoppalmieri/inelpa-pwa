// ============================================================
// EDGE FUNCTION · sap-articulos                               (v2.40)
//
// SAP B1 -> PWA: alta y actualizacion del maestro de articulos y su receta.
//   POST /functions/v1/sap-articulos
//   Authorization: Bearer <SAP_INTEGRATION_TOKEN>
//   { "articulos": [ { itemCode, itemName, itemType, active, hasBatch, ... , bom? } ] }
//
// Contrato:   docs/ALAMO_plan_endpoints_fase1.md (rev. 2)
// Validacion: ../_shared/sapContrato.ts
// Escritura:  funcion SQL sap_alta_articulos (docs/supabase_integracion_sap_v2.40.sql)
//
// ---- DESPLIEGUE (en el proyecto de TEST, no en produccion) ----
//   npx supabase link --project-ref <REF_DEL_PROYECTO_DE_TEST>
//   npx supabase secrets set SAP_INTEGRATION_TOKEN=<token de 48+ caracteres>
//   npx supabase functions deploy sap-articulos --no-verify-jwt
//
// --no-verify-jwt: SAP no tiene un JWT de Supabase. La autenticacion es el
// token propio, que valida el handler. SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
// las inyecta Supabase solo; la service_role nunca sale de este servidor.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validarArticulo, type ArticuloSap } from '../_shared/sapContrato.ts'
import { crearHandler, type ResultadoItem } from '../_shared/sapHandler.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

Deno.serve(
  crearHandler<ArticuloSap>(
    {
      nombre: 'sap-articulos',
      claveLista: 'articulos',
      claveId: 'itemCode',
      palabraRechazo: 'rechazado',
      validar: validarArticulo,
      idDe: (a) => a.itemCode,
    },
    {
      tokenEsperado: Deno.env.get('SAP_INTEGRATION_TOKEN'),
      escribir: async (validos) => {
        const { data, error } = await supabase.rpc('sap_alta_articulos', { p_articulos: validos })
        if (error) throw new Error(error.message)
        return data as ResultadoItem[]
      },
      log: (linea) => console.log(linea),
    },
  ),
)
