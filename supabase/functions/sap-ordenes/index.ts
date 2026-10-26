// ============================================================
// EDGE FUNCTION · sap-ordenes                                 (v2.40)
//
// SAP B1 -> PWA: alta de ordenes de fabricacion LIBERADAS.
//   POST /functions/v1/sap-ordenes
//   Authorization: Bearer <SAP_INTEGRATION_TOKEN>
//   { "ordenes": [ { docEntry, docNum, parentDocEntry, itemCode, plannedQty, dueDate, status, ... } ] }
//
// Reglas acordadas con ALAMO (reunion 22/10/2026):
//   * Solo ordenes liberadas. Las OF no se reenvian con cambios: si hay que
//     cambiar algo se cancela y se emite otra.
//   * docEntry es la clave de idempotencia (no la PK de la tabla).
//   * Lote en un solo POST; el padre puede llegar despues que las hijas.
//   * El articulo tiene que existir antes (sap-articulos); si no, la orden
//     vuelve 'rechazada' con reintentable=true.
//
// Contrato:   docs/ALAMO_plan_endpoints_fase1.md (rev. 2)
// Validacion: ../_shared/sapContrato.ts
// Escritura:  funcion SQL sap_alta_ordenes (docs/supabase_integracion_sap_v2.40.sql)
//
// ---- DESPLIEGUE (en el proyecto de TEST, no en produccion) ----
//   npx supabase link --project-ref <REF_DEL_PROYECTO_DE_TEST>
//   npx supabase secrets set SAP_INTEGRATION_TOKEN=<token de 48+ caracteres>   (el mismo que sap-articulos)
//   npx supabase functions deploy sap-ordenes --no-verify-jwt
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validarOrden, type OrdenSap } from '../_shared/sapContrato.ts'
import { crearHandler, type ResultadoItem } from '../_shared/sapHandler.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

Deno.serve(
  crearHandler<OrdenSap>(
    {
      nombre: 'sap-ordenes',
      claveLista: 'ordenes',
      claveId: 'docEntry',
      palabraRechazo: 'rechazada',
      validar: validarOrden,
      idDe: (o) => o.docEntry,
    },
    {
      tokenEsperado: Deno.env.get('SAP_INTEGRATION_TOKEN'),
      escribir: async (validos) => {
        const { data, error } = await supabase.rpc('sap_alta_ordenes', { p_ordenes: validos })
        if (error) throw new Error(error.message)
        return data as ResultadoItem[]
      },
      log: (linea) => console.log(linea),
    },
  ),
)
