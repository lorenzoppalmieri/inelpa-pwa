# Módulo Mantenimiento — v1.64 (mejoras)

> Revisión y mejora del módulo sobre la base que dejó KIMI (v1.62/v1.63).
> Foco: **mapa de estado en vivo + aviso/OT**, **KPIs sobre historial real** y
> **preventivo digital**. La base (esquema, seed, migración, ficha, editor de
> mapa) se conservó; esto se suma encima.

## Qué cambió

**Plano.** El CAD denso (`cerdan_n1.png`) se atenuó a gris claro →
`public/mantenimiento/planos/cerdan_n1_faded.png`, para que los pins de estado
resalten. El mapa ya apunta ahí (fallback en `MapaEditor.tsx`). El original queda
por si se quiere volver atrás.

**Mapa de estado en vivo (`MapaEditor.tsx`).** Los pins ahora muestran un
semáforo por estado, no solo el color del sector:
- 🔴 aviso de falla nuevo u OT correctiva/emergencia abierta (aro rojo pulsante)
- 🟡 OT preventiva abierta ("le llegó la hora")
- ⚫ OT en ejecución (en intervención)
- 🟢 OK
Se suscribe por Realtime a `mant_avisos` y `mant_ordenes_trabajo`, así que el
mapa cambia solo. Leyenda de estados + botón **🔴 Avisar falla** en el pin.

**Aviso de falla (`AvisoFalla.tsx`, nuevo).** Modal simple (elegir máquina +
síntoma) que inserta en `mant_avisos`. Reutilizable: se le puede pasar un activo
ya elegido. *Pendiente de wiring:* embeberlo en la vista de Producción para que
el operario avise sin entrar al módulo (ver "Próximos pasos").

**Tablero de OT (`TableroOT.tsx`, nuevo).** Backlog operativo:
- Avisos nuevos → botón **Crear OT** (correctiva) o descartar.
- Kanban por estado (creada / planificada / en ejecución / en espera) con
  acciones: iniciar, planificar, poner en espera, asignar técnico, **cerrar**.
- Cierre de OT con trabajo, causa, horas-hombre, tiempo de parada y confirmación
  LOTO si la OT lo requiere. Si venía de un aviso, lo marca resuelto.
- Botón **🔁 Generar OT preventivas** (llama a la función RPC).

**Panel de KPIs (`PanelKPIs.tsx`, nuevo).** Lee las vistas nuevas sobre
`mant_registros` (3 años ya migrados): tarjetas de resumen, tendencia mensual
(correctivo vs preventivo) y ranking de máquinas con más correctivo + MTBF.

**Preventivo digital.** `mant_gamas` se carga desde el cronograma real RIT
7.1.3/51 (60 gamas). La función `mant_generar_ot_preventivas()` crea las OT
preventivas pendientes desde esas gamas.

## Archivos

Nuevos: `src/mantenimiento/{estado.ts, AvisoFalla.tsx, TableroOT.tsx, PanelKPIs.tsx}`,
`public/mantenimiento/planos/cerdan_n1_faded.png`,
`docs/supabase_mantenimiento_gamas_v1.64.sql`,
`docs/supabase_mantenimiento_kpis_v1.64.sql`.
Editados: `MapaEditor.tsx`, `MantenimientoView.tsx` (4 solapas: Mapa · Tablero OT ·
Activos · KPIs), `types.ts` (MantAviso + MantOT completo), `src/index.css`.

`tsc --noEmit` pasa sin errores.

## Despliegue (en orden)

1. **SQL en Supabase** (SQL Editor), *después* de haber corrido v1.62 + v1.63:
   1. `supabase_mantenimiento_gamas_v1.64.sql`  (gamas preventivas)
   2. `supabase_mantenimiento_kpis_v1.64.sql`   (vistas KPI + función generadora)
2. `npm run build` y push (pipeline GitHub → Vercel).
3. En la app, solapa **Tablero OT** → **Generar OT preventivas** para crear las
   primeras OT desde las gamas (aparecen 🟡 en el mapa).

## A validar / próximos pasos

- **Frecuencias de gamas**: se derivaron del texto del cronograma; revisar casos
  como "cada 15 días" (quedó trimestral, debería ser quincenal) y "cada 200 hs".
- **Aviso desde Producción**: embeber `<AvisoFalla>` en `OperarioView` con un
  botón grande, para que el operario avise sin entrar al módulo.
- **Plano de Lorenzatti**: hoy todo el historial vive ahí y no tiene plano; el
  mapa arranca en Cerdán N1 (sin historial). Conseguir el plano y ubicar los 43
  activos, o cambiar el default hasta la mudanza.
- **22 vs 30 bobinadoras**: la migración creó 22; producción maneja 30. Definir.
- **Vincular más historial**: ~1/3 de los 1.249 registros quedó con activo (el
  resto no aparece en fichas ni KPIs). Ampliar el diccionario de nombres.
