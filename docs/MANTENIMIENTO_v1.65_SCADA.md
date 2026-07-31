# Mantenimiento v1.65 — SCADA con layout editable (en la PWA)

Lleva el prototipo SCADA a la app real: nueva solapa **🛰️ SCADA** en el módulo
de Mantenimiento. El plano es 100% dato (bloques + anotaciones + pines), todo en
Supabase. La **edición es solo para admin** (rol `mantenimiento` o `lorenzo`);
el resto ve la operación en vivo.

## Qué se agregó
- **SQL** `docs/supabase_mantenimiento_scada_v1.65.sql`: tablas `mant_bloques`
  y `mant_anotaciones` (+ RLS solo-admin, realtime), seed de **38 bloques** de
  Nave 1 y posiciones (x_pct/y_pct) para 10 activos reales de Cerdán N1.
- **React** `src/mantenimiento/MapaScadaEditor.tsx` + solapa en `MantenimientoView`.
  - Operación: pines de estado (🔴 aviso / 🟡 preventivo / 🟢 OK) en vivo por realtime; clic → ficha/OT.
  - Edición (admin): 3 capas → **Bloques** (mover/redimensionar/renombrar/recolorear/crear/borrar),
    **Máquinas** (arrastrar pines, guarda x_pct/y_pct), **Dibujo** (líneas/círculos/texto de
    cualquier color; mover, cortar/pegar, borrar, tecla Supr).
- `types.ts`: `MantBloque`, `MantAnotacion`. CSS en `index.css`.
- `tsc --noEmit` pasa sin errores.

## Cómo desplegar (en orden)
1. **Supabase → SQL Editor** (ya deben estar corridos v1.62 y v1.63):
   - Pegá y ejecutá **`supabase_mantenimiento_scada_v1.65.sql`**.
   - (Opcional, si aún no los corriste: `..._gamas_v1.64.sql` y `..._kpis_v1.64.sql`.)
2. `npm run build` y push (GitHub → Vercel).
3. Entrá como **lorenzo** → Mantenimiento → solapa **🛰️ SCADA** → **✏️ Edición**.

> Importante: los `.sql` van en Supabase; los `.tsx/.css` se despliegan con el build.
> El SCADA arranca en la planta **Cerdán N1** (la que tiene el layout sembrado).

## Notas
- Si un usuario no-admin abre la solapa, solo ve Operación (sin botones de edición).
- El layout se guarda al soltar cada bloque/pin y al crear/mover/borrar dibujos.
- Para otras plantas (Lorenzatti), el layout arranca vacío: se arma con **＋ Bloque**.
