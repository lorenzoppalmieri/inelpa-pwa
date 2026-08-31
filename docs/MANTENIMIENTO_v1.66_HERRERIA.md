# Mantenimiento v1.66 — Plan preventivo + partes (Herrería)

Carga las 11 máquinas de Herrería con su **plan preventivo real** (86 tareas con
instructivo paso a paso) y su **catálogo de repuestos con foto** (61 componentes,
57 con imagen). Todo pensado para que el operario abra la ficha y entienda **qué
hacer, cómo, con qué herramienta y qué consumible** — sin capacitación previa.

## Qué se agregó
- **Gamas enriquecidas**: la gama ahora guarda tipo, propósito, componente,
  ejecución (paso a paso), herramienta y consumible. En la ficha aparece un
  desplegable **"📋 Cómo se hace"** en cada tarea preventiva.
- **Repuestos con foto**: tabla `mant_componentes` + tarjetas (cantidad + nombre +
  foto) en la ficha, sección **"🧩 Repuestos / partes"**. La foto vive en Storage
  (bucket privado `mantenimiento`), nunca en la tabla.
- UI nueva (self-contained, no toca lo del otro agente): `InstructivoGama.tsx`,
  `ComponentesActivo.tsx`, `fotos.ts` + 3 inserciones mínimas en `FichaEquipo`.
- `tsc -b --force` pasa limpio.

## Despliegue (en este orden)
1. **Supabase → SQL Editor**: ejecutá **`supabase_mantenimiento_herreria_v1.66.sql`**
   (después de v1.62/v1.63; v1.64/v1.65 opcionales). Crea columnas, tabla
   `mant_componentes`, el bucket `mantenimiento` y siembra todo.
2. **Subí las fotos** (una sola vez): Supabase → **Storage** → bucket
   `mantenimiento` → creá una carpeta **`componentes`** → subí ahí los 57 archivos
   del zip `fotos_componentes_herreria.zip`. Los nombres ya coinciden con las
   rutas del SQL (`componentes/<archivo>.jpg`), no hay que renombrar nada.
3. `npm run build` y push (GitHub → Vercel).
4. Entrá a una máquina de Herrería (ej. **Roladora**) → vas a ver el plan con
   "Cómo se hace" y los repuestos con foto.

## Mapeo de máquinas (revisalo)
Vinculé cada máquina de las planillas a un activo. Los que **creé nuevos**:
Malacate (`HER-MALA-01`), Transportador aéreo (`HER-TRAN-01`), Sierra hidráulica
(`HER-SIEH-01`), Box hermeticidad (`HER-BOXH-01`), Aire comprimido láser
(`SRV-AIRE-01`). Los que **reusé de tu catálogo**: Rack (`HER-RACK-01`), Roladora
(`HER-ROLA-01`), Soldadora cubas/automática (`HER-AUTO-R1`), Puente grúa
(`SRV-GRUA-01`), Robot soldador (`HER-ROBS-01`), Mesas Box 2 (`HER-MESB-M1`).
Si alguno no es el activo correcto, decime y lo reasigno (es un cambio de una línea).

## Lo que encontré / decisiones que tomé
- **Las fotos las tenés que subir vos**: yo no tengo acceso a tu Storage. Dejé el
  zip listo y el SQL con las rutas ya calzadas.
- **Frecuencias por horas**: "500 h" la mapeé a *trimestral* y "2000 h" a *anual*
  (no hay contador de horas de uso todavía). El texto original queda visible en el
  título de la tarea. Si querés mantenimiento por horas reales, es un módulo aparte.
- **Robot soldador**: el plan es uno solo pero tenés S1 y S2. Lo cargué en
  `HER-ROBS-01`. Si S2 usa el mismo plan, lo duplico a `HER-ROBS-02` en 1 minuto.
- **Otro agente está tocando el módulo en paralelo** (tablero, avisos offline,
  alertas). Por eso hice todo **aditivo y en componentes nuevos**, sin editar sus
  archivos. El instructivo hoy se ve en la **ficha**; si lo querés también dentro
  de la tarjeta de OT del tablero, lo sumo cuando el otro agente cierre sus cambios
  (para no chocar).

## Necesito de vos
- Confirmar el mapeo de máquinas de arriba.
- Subir el zip de fotos al bucket (paso 2). Sin eso, las tarjetas de repuesto
  muestran "sin foto" pero todo lo demás funciona.
