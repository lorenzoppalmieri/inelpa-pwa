# Arquitectura del Stack — PWA, Offline-First y Sincronización

## Capas

1. **Presentación (React + Vite + TS).** UI mobile-first para tablet, botones grandes y alto contraste. El componente raíz rutea por rol (`App.tsx`): operario → panel de planta; encargado/planificador → dashboard.

2. **Estado y persistencia local (Dexie / IndexedDB).** `src/db/dexie.ts` define el almacén local: `usuarios`, `ordenes`, `tareas`, `syncQueue`. **Es la fuente de verdad en la tablet.** Toda escritura ocurre aquí primero, por lo que la UI responde sin depender de la red. Las vistas se actualizan en vivo con `useLiveQuery` (dexie-react-hooks).

3. **Sincronización (`src/sync/syncEngine.ts`).** Patrón *outbox*:
   - cada cambio persiste en IndexedDB y encola un `SyncOp`;
   - el motor vacía la cola contra el backend cuando `navigator.onLine`;
   - reintentos automáticos al recuperar conexión (`online` event) y cada 30 s;
   - si no hay credenciales (`.env` vacío) opera en **modo demo** confirmando localmente.

4. **Service Worker (Workbox vía `vite-plugin-pwa`).** Precachea el shell de la app (offline-first real: la PWA abre sin red) y aplica `NetworkFirst` con timeout para las llamadas a la API (cae a cache si está offline). Configurado en `vite.config.ts`.

5. **Backend (Supabase / PostgreSQL).** API REST autogenerada, Auth y **RLS** que aplica la matriz de 3 niveles en la base. Ver `docs/supabase_schema.sql`.

6. **Integración SAP B1 (`src/sap/sapMapping.ts`).** Contrato de mapeo 1:1 y cliente del Service Layer (login `B1SESSION` + UDF), activable en el go-live.

## Decisiones técnicas

- **React+Vite+TS** sobre alternativas no-code: la app necesita Gantt y KPIs a medida, lógica de tiempos/paradas y un mapeo tipado contra SAP — fuera del alcance cómodo de AppSheet, pero conservando su agilidad de UX.
- **Dexie** sobre IndexedDB plano: API declarativa, transacciones, `liveQuery` reactivo.
- **Outbox + IndexedDB** sobre sincronización por framework: control total del orden, reintentos e idempotencia (upsert con `merge-duplicates`).
- **RLS en la BD** sobre seguridad solo en cliente: aunque el frontend oculte vistas, la base **rechaza** lecturas/escrituras fuera del alcance del rol.

## Flujos clave

**Operario inicia/pausa/finaliza una tarea:**
`TareaCard` → `guardarTarea()` → `db.tareas.put()` + `encolar(SyncOp)` → UI reactiva al instante → (con red) `procesarCola()` → backend.

**Registro de parada:** botón grande → `ModalParada` (causa precargada) → se agrega `Parada{inicio}` y la tarea pasa a `pausada`; al reanudar se cierra con `fin`. Duraciones estructuradas alimentan el Pareto.

**Dashboard:** `useLiveQuery` lee tareas de la semana → se filtran por alcance de rol y filtros UI → `lib/kpi.ts` calcula OEE/desvíos/Pareto/eficiencia → Gantt y panel se renderizan.

## Seguridad
- Autenticación obligatoria (Supabase Auth en producción; hash demo offline en este scaffold).
- Sesión persistida para soportar arranque offline de la tablet.
- RLS por rol y por sector en Postgres.
- Recomendado: tablets en MDM, HTTPS obligatorio, rotación de credenciales de API SAP.
