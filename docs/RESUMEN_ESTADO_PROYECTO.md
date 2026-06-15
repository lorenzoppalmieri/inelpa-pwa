# INELPA PWA — Resumen de estado del proyecto (handoff para Gemini)

> Pegá este documento en Gemini como contexto. Al final hay una sección con lo que
> falta, pensada para que Gemini te genere prompts de calidad para continuar.

## 1. Qué es el proyecto

PWA de **planificación y control de producción** para la planta de transformadores de
INELPA. Es offline-first y mobile-first (pensada para tablets industriales en planta).
Tres roles: **operario** (registra avance y paradas), **encargado** y **planificador**
(programan órdenes, ven Gantt y KPIs).

## 2. Stack técnico

- **Frontend:** React 18 + Vite 5 + TypeScript. CSS plano con variables (NO Tailwind).
- **Offline:** Dexie (IndexedDB) como espejo reactivo; `dexie-react-hooks` (`useLiveQuery`).
- **Backend / fuente de verdad:** Supabase (Auth + PostgreSQL + Realtime + RLS).
- **Sync:** bidireccional. Dexie refleja Supabase; los cambios locales se encolan y
  se empujan (`syncEngine`). Mappers traducen snake_case (DB) ↔ camelCase (app).
- **Deploy:** Vercel (auto-build al hacer `git push`). El build corre `tsc -b && vite build`
  (estricto). Las env vars de Vite se hornean en build time.
- **Semana:** formato ISO "YYYY-Www" (helper `isoWeek`).

## 3. Estado funcional (qué ya funciona)

- Login por PIN, ruteo por rol, 3 niveles de permisos.
- Vista operario: selección de máquina, cola de tareas por máquina, estados
  (pendiente → en proceso → pausada → finalizada), registro de paradas con buscador
  (~40 causas en categorías).
- Vista planificación: crear/asignar órdenes (operario + máquina + modelo + material),
  semielaborados.
- Dashboard: Gantt operativo + panel de KPIs/OEE.
- Catálogo de planta sembrado (máquinas, causas de parada).
- Nómina real de operarios por sector + scripts de cuentas Auth.
- Seguridad revisada (RLS + auth). El `service_role key` es secreto (nunca en git ni
  en el bundle); el `anon key` sí viaja en el cliente (lo protege RLS).

## 4. Lo que se hizo en esta tanda (v1.4)

**Motor de calendario laboral** (`src/lib/calendario.ts`) — define el horario productivo y
todo el resto (Gantt, auto-shift, capacidad, base del OEE) deriva de él:

- Horario productivo (la **recuperación de horas cuenta como tiempo estándar**):
  - **Lun–Jue:** 07:00–16:00 normal + 16:00–17:00 recuperación.
  - **Viernes:** 07:00–15:00 normal + 15:00–16:00 recuperación.
  - Sáb/Dom: no laborable.
- **Almuerzo** 12:00–13:00: pausa programada, NO penaliza el OEE.
- **Limpieza** (últimos 15 min del cierre normal, hueco no productivo):
  Lun–Jue **15:45–16:00**, Vie **14:45–15:00**. La recuperación va *después* de la limpieza.
- Cada día tiene 3 tramos productivos: mañana, tarde y recuperación.

**Gantt operativo — vista multi-día / semanal real** (`GanttOperativo.tsx`):

- Eje X por **días** (Lun–Vie de la semana activa); cada barra se ubica por **fecha + hora**.
- Toggle **Semana / Día**. En modo Día hay un **selector de fecha libre** (`input date`):
  se puede ir a cualquier día anterior o posterior, no solo la semana actual.
- El Gantt recibe **toda la tabla** de tareas (filtrada por rol/línea/sector) y recorta
  internamente por los días visibles → por eso el modo Día puede mostrar cualquier fecha.
- Eje horario 07:00–17:00. Bandas "sin producción" (rayadas) para almuerzo, limpieza y
  franjas cerradas. Línea "Ahora".
- **Auto-shift por máquina:** las tareas en curso quedan fijas; si una se pasa de su
  estimado, ocupa la máquina hasta "ahora" y empuja las siguientes. Las pendientes
  arrancan en su `inicioPlanificado` y se corren hacia adelante si colisionan,
  respetando turno + almuerzo + limpieza (cruza días).

**Planificación:**

- El planificador asigna **día + hora exactos** de arranque (`inicioPlanificado`).
- **Borrado de tareas** planificadas (solo las que aún no arrancaron): UI + Supabase + local.

**KPIs / OEE:**

- El almuerzo y demás pausas programadas se **excluyen** del cálculo (no penalizan).
- Filtro global de período: **Mes actual / Mes anterior / Acumulado anual** (solo cambia el
  rango visual, no borra datos).

## 5. Modelo de datos / DB (cambios v1.4)

- `tareas.inicio_planificado timestamptz` (día+hora de arranque planificado).
- Causa de parada **"almuerzo"** (categoría `no_productiva`, no penaliza OEE).
- Migración idempotente lista: `docs/supabase_migracion_v1.4.sql`.

## 6. Pendiente de ACCIÓN del usuario (Lorenzo)

1. **Correr la migración** `docs/supabase_migracion_v1.4.sql` en Supabase → SQL Editor
   (agrega `inicio_planificado` y la causa `almuerzo`). Una sola vez.
2. **`git push`** para que Vercel reconstruya y despliegue v1.4.
3. **Verificar local** con `npm run dev` antes de pushear.
4. **Carga del roster** (quedó pendiente): correr `supabase_roster_seed.sql` +
   `crear_cuentas_auth.mjs` con el `service_role key` real (47 operarios +
   104 usuario_sectores + cuentas Auth).

## 7. Lo que FALTA construir (para que Gemini arme prompts)

- **Ingesta real de órdenes de fabricación** (hoy se cargan a mano / demo). Definir origen.
- **Integración SAP Business One** (semielaborados OITM/OITT ya mapeados; falta el puente real).
- **Autenticación productiva** robusta (hoy MVP por PIN).
- Posibles mejoras de Gantt: zoom, drag&drop de barras para replanificar, vista por máquina/operario.
- Reportes/exports (PDF/Excel) de KPIs y programación.

## 8. Restricciones a recordar (importantes)

- `service_role key` = **ADMIN/secreto**: nunca en git, nunca en el bundle, solo en
  variables de entorno de terminal.
- `.env` jamás se commitea (protegido por `.gitignore`).
- Build de Vercel es estricto (`tsc -b`): puede fallar por errores que `npm run dev`
  no muestra. Vercel es el verificador real.

---

### Cómo usar esto con Gemini

Pegá todo lo de arriba y pedile, por ejemplo:

> "Con este contexto, generá 3 prompts detallados y autocontenidos para [TAREA del punto 7],
> cada uno con objetivo, archivos probables a tocar, criterios de aceptación y casos borde."
