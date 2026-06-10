# Recomendación de Infraestructura — Nube vs On-Premise

## Recomendación: **Nube (Cloud)** con operación offline-first en planta

### Análisis por factor

| Factor | Servidor Local (On-Premise) | Nube (Cloud) | Ganador |
|---|---|---|---|
| **Latencia en planta** | Mínima en LAN | Mitigada por offline-first: la tablet opera contra IndexedDB local, no contra el servidor | Empate (offline-first iguala) |
| **Cortes de internet** | App sigue si el server local está vivo | App sigue igual: sincroniza al volver la red | Empate (offline-first resuelve) |
| **Confiabilidad / uptime** | Depende de UPS, refrigeración, IT local | SLA del proveedor, redundancia gestionada | **Nube** |
| **Mantenimiento** | Parches, backups, hardware a cargo de INELPA | Gestionado por el proveedor | **Nube** |
| **Integración con SAP B1** | SAP ya está en la nube (Seidor) → híbrido frágil | Misma red lógica que SAP, Service Layer directo | **Nube** |
| **Costo inicial** | Alto (servidor, UPS, instalación) | Bajo (OPEX mensual) | **Nube** |
| **Escalabilidad** | Limitada al hardware comprado | Elástica | **Nube** |
| **Seguridad de datos** | Control físico total | Cifrado en tránsito/reposo + RLS; backups automáticos | Contextual |

### Por qué pesa el offline-first

El argumento histórico a favor de on-premise en planta es la **latencia** y la **dependencia de internet**. En esta arquitectura ambos quedan neutralizados: cada tablet tiene su copia local (IndexedDB) y **nunca bloquea la operación esperando a la red**. La nube solo interviene para consolidar y distribuir datos entre sectores y hacia gerencia. Por lo tanto, el factor decisivo pasa a ser el **costo de mantenimiento** y la **integración con SAP B1 (ya en nube)** — y ahí la nube gana con claridad.

## Stack de despliegue recomendado

### Opción A (recomendada) — Supabase gestionado
- **Base de datos + API + Auth:** Supabase (PostgreSQL gestionado, PostgREST, Supabase Auth, RLS, Realtime). Región **São Paulo (`sa-east-1`)**.
- **Frontend PWA:** Cloudflare Pages o Vercel (HTTPS automático, requisito de los service workers).
- **Microservicio SAP:** contenedor Docker (Node) que encapsula el Service Layer; desplegado en el mismo proveedor.
- **Ventaja:** time-to-market mínimo, sin DevOps de base de datos, RLS replica la matriz de 3 niveles.

### Opción B — Self-managed en Docker (mayor control)
- **Droplet DigitalOcean** (4 GB / 2 vCPU para arrancar) o **AWS Lightsail**.
- `docker-compose` con: `postgres`, `postgrest` (o API Node propia), `caddy`/`nginx` (TLS), microservicio SAP.
- **Ventaja:** control total y portabilidad; **costo:** requiere administración propia.

### Componente común — Repositorio intermedio
Mientras SAP B1 no esté en vivo, la ingesta de órdenes puede venir de **Google Sheets / Excel** sincronizada al backend (paso intermedio previsto en el relevamiento), reemplazable luego por el Service Layer sin tocar el frontend.

## Costos orientativos (USD/mes, estimado)
- Supabase Pro: ~25 + uso. Hosting PWA (Cloudflare/Vercel): 0–20. Microservicio (contenedor pequeño): ~5–12.
- Opción B (DigitalOcean droplet): ~24–48 según tamaño.

> Verificar precios vigentes al momento de contratar; los planes cambian.
