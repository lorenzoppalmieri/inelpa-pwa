# INELPA Transformadores — PWA de Control de Producción

Sistema de Programación, Planificación y Control de la Eficiencia de Producción. PWA mobile-first para tablets industriales, **offline-first**, con vistas dinámicas por rol y modelo de datos preparado para SAP Business One.

Estado: **scaffold funcional v1.0** — corre en modo demo 100% offline (datos semilla en IndexedDB) sin necesidad de backend. Go-live objetivo: **agosto 2026** junto con SAP B1.

---

## Cómo correrlo

```bash
npm install
npm run dev        # abre en http://localhost:5173 (accesible desde la tablet en la LAN)
npm run build      # build de producción (genera service worker / PWA instalable)
npm run preview    # sirve el build
```

Sin configurar `.env` la app funciona en **modo demo offline**. Para conectar el backend en la nube, copiar `.env.example` a `.env.local` y completar las claves de Supabase.

### Accesos demo (contraseña `1234`)

| Usuario | Rol | Alcance |
|---|---|---|
| `lorenzo` | Planificador / Gerencia | Planta completa (13 sectores) |
| `ulises` | Encargado | Bobinado (4 sectores) |
| `santiago` | Encargado | Corte, soldadura, pintura |
| `omar` | Encargado | Montaje |
| `carlos` | Operario | Bobinado Dist. A.T. |

---

## 1. Recomendación de infraestructura — **Nube**

Recomendación: **infraestructura Cloud** con tablets operando offline-first contra una cache local. Detalle y justificación en [`docs/INFRAESTRUCTURA.md`](docs/INFRAESTRUCTURA.md).

Resumen de la decisión:

- **SAP B1 ya está en la nube** (acceso vía Seidor). Poner la PWA en la nube evita una arquitectura híbrida frágil y deja la integración Service Layer dentro de la misma red lógica.
- El requisito **offline-first** ya resuelve la latencia y los cortes de internet en planta: la tablet **nunca depende de la red para operar**, sincroniza cuando hay conexión. Esto elimina el argumento principal a favor de on-premise.
- Menor costo de mantenimiento (sin servidor físico, backups y parches a cargo del proveedor).

**Stack de despliegue recomendado:**

- **Backend + DB:** **Supabase** (PostgreSQL gestionado + Auth + API REST + Realtime). Región São Paulo (`sa-east-1`) por cercanía a Argentina. Alternativa self-managed: contenedor **Docker** (Postgres + PostgREST) en **DigitalOcean** (droplet en region NYC/SFO) o **AWS Lightsail**.
- **Frontend PWA:** hosting estático en **Vercel** / **Cloudflare Pages** / **Netlify** (HTTPS automático, requisito para service workers).
- **Integración SAP:** un microservicio en Docker (Node) que habla con el **Service Layer de SAP B1** y expone endpoints a la PWA; despliega junto al backend.

---

## 2. Arquitectura del stack — PWA + Offline-First + Sync

Detalle en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

```
┌─────────────────────────── TABLET (PWA) ───────────────────────────┐
│  React + Vite + TypeScript                                          │
│  ├─ UI por rol (Operario / Encargado / Planificador)               │
│  ├─ IndexedDB (Dexie)  ←─ fuente de verdad local, escritura inmediata│
│  ├─ Cola de sync       ─→ empuja cambios al backend cuando hay red  │
│  └─ Service Worker (Workbox) ─ precache del shell + NetworkFirst API│
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS (cuando hay red)
                ┌──────────────▼───────────────┐
                │  Backend Cloud (Supabase)     │
                │  PostgreSQL + Auth + REST + RLS│
                └──────────────┬───────────────┘
                               │ Service Layer (REST)
                ┌──────────────▼───────────────┐
                │  SAP Business One (nube)       │  ← go-live ago-2026
                └───────────────────────────────┘
```

**Por qué este stack:** React+Vite+TS da una PWA instalable, rápida y tipada (clave para mapear contra SAP sin errores). Dexie sobre IndexedDB es el estándar para offline-first robusto. Workbox (vía `vite-plugin-pwa`) gestiona el service worker sin configuración manual. Supabase aporta Postgres + Auth + API + seguridad por filas (RLS) que replica la matriz de 3 niveles **en la base de datos**, no solo en el cliente.

**Flujo offline-first:** toda acción del operario (iniciar, pausar, finalizar) escribe primero en IndexedDB → la UI responde al instante → se encola un `SyncOp` → cuando vuelve la red, el motor (`src/sync/syncEngine.ts`) vacía la cola contra el backend con reintentos.

---

## 3. Modelo de datos

Detalle y diagrama en [`docs/MODELO_DATOS.md`](docs/MODELO_DATOS.md). Esquema SQL listo para Supabase en [`docs/supabase_schema.sql`](docs/supabase_schema.sql). Tipos TypeScript en [`src/types/index.ts`](src/types/index.ts).

Entidades núcleo: `Usuario` (con `rol` y `sectores`), `Sector` (los 13), `OrdenProduccion`, `Tarea` (operación de un sector sobre una orden, con timestamps reales y resultado de calidad), `Parada` (demora estructurada con causa precargada) y `SyncOp` (cola offline). La seguridad de 3 niveles se aplica con RLS en Postgres. El mapeo a SAP B1 está en [`src/sap/sapMapping.ts`](src/sap/sapMapping.ts).

---

## 4. Frontend implementado

- **Vista Operario** (`src/components/operario/`): tareas de su sector y semana, flujo táctil Pendiente → En Proceso → Finalizado con timestamp automático, cronómetro en vivo y módulo de paradas con causas precargadas (registro estructurado de inicio/fin).
- **Dashboard Encargado/Planificador** (`src/components/dashboard/`): **Gantt operativo** interactivo (agrupar por sector/colaborador, filtros por línea y sector, colores por estado, línea "ahora") y **panel de KPIs** (OEE Disponibilidad/Rendimiento/Calidad, real vs estándar por modelo, Pareto de demoras, eficiencia por colaborador). El alcance se limita automáticamente a los sectores del encargado.

---

## Estructura

```
src/
  types/         Modelo de dominio (tipos + 13 sectores + causas)
  db/            Dexie (IndexedDB) + datos semilla
  sync/          Motor de sincronización offline-first
  auth/          Contexto de auth + matriz de permisos (3 roles)
  lib/           Cálculo de KPIs (OEE/Pareto) y utilidades de tiempo
  sap/           Mapeo 1:1 con SAP Business One (Service Layer)
  components/
    operario/    Pantalla táctil de planta
    dashboard/   Gantt + KPIs
docs/            Infra, arquitectura, modelo de datos, SQL
```

## Próximos pasos hacia el go-live

1. Crear proyecto Supabase y aplicar `docs/supabase_schema.sql`; migrar `seed.ts` a registros reales.
2. Sustituir el hash demo por **Supabase Auth** (usuario/contraseña server-side).
3. Conectar el repositorio de **ingesta de órdenes** (Google Sheets/Excel → backend) como paso intermedio.
4. Implementar el cliente del **Service Layer SAP B1** (login B1SESSION + UDF) con la base TEST de Seidor.
5. Generar íconos PWA (`public/icons/icon-192.png`, `icon-512.png`) e instalar en las tablets.
