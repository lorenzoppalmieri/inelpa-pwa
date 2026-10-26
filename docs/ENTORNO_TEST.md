# Entorno de test — PWA INELPA

**v2.42 · 26/10/2026**

La PWA organiza la producción todos los días. La integración con SAP va a llevar unos 3 meses de pruebas con ALAMO. Este documento arma un segundo entorno, separado del todo, para que nada de eso toque la planta.

---

## Regla de oro

> **Todo lo nuevo pasa primero por test.** SQL, Edge Functions, cambios riesgosos de la app y cualquier prueba de ALAMO. Producción solo recibe lo que ya funcionó en test.

---

## Cómo queda

```
PRODUCCIÓN (no se toca)                      TEST (nuevo)
─────────────────────────                    ─────────────────────────
Vercel · rama main                           Vercel · entorno "staging", rama staging
   │                                            │   VITE_ENTORNO=test → pestaña "ENTORNO DE PRUEBA"
   ▼                                            ▼
Supabase · proyecto actual                   Supabase · INELPA-TEST (clon de producción)
   ▲                                            ▲
Tablets de planta                            Lorenzo, Rocío (pruebas) y ALAMO (Postman)
```

- Las dos apps tienen URL distinta, así que en un mismo equipo no comparten la base local de la tablet ni el service worker.
- En test se ve una pestaña rayada **"ENTORNO DE PRUEBA"** arriba al centro, el título del navegador empieza con **[PRUEBA]** y, si alguien la instala, el ícono dice **"INELPA PRUEBA"**. En producción no cambia nada: verificado que el manifest y la pantalla quedan idénticos.
- ALAMO recibe **solo** la URL y el token de test.

## Costo

- **Supabase: unos US$10/mes extra.** Cada proyecto paga su cómputo. El plan Pro trae US$10 de crédito, que cubre un solo proyecto Micro. El clon copia el tamaño de producción: si producción está en algo más grande que Micro, la pantalla del clon te muestra el costo antes de confirmar, y después podés bajar test a Micro (Settings → Compute and Disk).
- **Vercel: US$0.** El plan Pro incluye un entorno personalizado por proyecto.
- Al terminar las pruebas, borrar el proyecto de test corta el cobro.

---

## Armado (una sola vez)

Cada paso dice **dónde** se hace. Antes de correr cualquier SQL, mirá arriba a la izquierda del dashboard de Supabase **qué proyecto tenés abierto**.

### Paso 0 · Producción — catálogo al día

Si todavía no corriste `docs/supabase_catalogo_sync_v2.41.sql` en producción, hacelo ahora: así el clon ya nace con el catálogo correcto. La grilla final tiene que dar `ok = true` en las 7 filas.

### Paso 1 · Supabase — clonar producción

1. Abrí el proyecto de **producción** → **Database → Backups** → pestaña **Restore to a New Project**.
2. Elegí el backup más reciente → **Restore**.
3. Revisá el costo que muestra y confirmá. Nombre del proyecto nuevo: **`INELPA-TEST`**.
4. Esperá a que termine (minutos, según el tamaño de la base).

El clon trae: tablas, datos, funciones, políticas RLS y **los usuarios con sus contraseñas** (cada uno entra a test con su misma clave).
**No** trae: archivos ni buckets de Storage, Edge Functions, configuración de Auth ni claves API (el proyecto nuevo tiene URL y claves propias).

> Requisito: plan pago y backups físicos. Todos los proyectos en Postgres 15.8.1.079 o más nuevo usan backups físicos. Si la pestaña no aparece, avisame: hay un camino alternativo con la CLI.

### Paso 2 · INELPA-TEST — apagar lo que dispara solo

El clon trae también los trabajos programados (pg_cron), y arrancan apenas termina. El de purga de fotos llama a **producción** con la clave de producción escrita adentro.

1. SQL Editor de **INELPA-TEST** → pegar `docs/test_post_clon_v2.42.sql` → Run. Solo lee.
2. Si aparecen filas `cron`, descomentá el bloque **B** y corrélo. Tiene que quedar en 0.
3. Si aparece alguna fila `trigger http`, pasame la grilla antes de seguir.
4. En la misma grilla: las filas `realtime` tienen que listar al menos `tareas`, `paradas`, `ordenes`, `semielaborados`, `maquinas` y `usuarios`. Si no aparece ninguna, corré `docs/supabase_realtime_rls.sql` en test.

### Paso 3 · INELPA-TEST — configuración de Auth

La configuración de Auth no se copia. Abrí **Authentication** en producción y en test, una al lado de la otra, y dejá test igual. Lo importante: **la opción de permitir registros nuevos tiene que quedar como en producción** (las cuentas se crean con el script, no por registro libre).

### Paso 4 · INELPA-TEST — buckets de Storage

SQL Editor de **INELPA-TEST** → `docs/test_storage_buckets_v2.42.sql` → Run. Crea los 5 buckets y las 15 políticas, copiados textualmente de los SQL originales. La grilla final tiene que listar 5 `bucket` y 15 `politica`.

Los archivos viejos (fotos de despacho, protocolos, planos) **no** se copian: en test, abrir uno histórico da "no encontrado". Todo lo que se suba en test funciona normal.

### Paso 5 · INELPA-TEST — integración SAP

1. SQL Editor de **INELPA-TEST** → `docs/supabase_integracion_sap_v2.40.sql` → Run.
2. Generá el token de integración en PowerShell (72 caracteres hexadecimales, aleatorio criptográfico):

   ```powershell
   $b = New-Object byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString('x2') }) -join ''
   ```

3. Desde la carpeta `inelpa-pwa`, igual que cuando subiste `purgar-fotos-despacho`:

   ```powershell
   npx supabase login
   npx supabase secrets set SAP_INTEGRATION_TOKEN=<el token> --project-ref <REF_DE_INELPA_TEST>
   npx supabase functions deploy sap-articulos --no-verify-jwt --project-ref <REF_DE_INELPA_TEST>
   npx supabase functions deploy sap-ordenes   --no-verify-jwt --project-ref <REF_DE_INELPA_TEST>
   ```

   El `REF` es lo que va entre `https://` y `.supabase.co` en la URL del proyecto. **Siempre `--project-ref` de test**: sin ese parámetro la CLI usa el proyecto que tengas vinculado, que puede ser producción.

### Paso 6 · Vercel — entorno "staging"

1. Proyecto de la PWA → **Settings → Environments → Create Environment** → nombre **`staging`**.
2. **Branch tracking**: rama `staging`.
3. **Environment Variables** de `staging` (las saca de INELPA-TEST → Settings → API):

   | Variable | Valor |
   | --- | --- |
   | `VITE_SUPABASE_URL` | URL de INELPA-TEST |
   | `VITE_SUPABASE_ANON_KEY` | anon key de INELPA-TEST |
   | `VITE_ENTORNO` | `test` |

4. Revisá también las variables del entorno **Preview**: si hoy apuntan al Supabase de producción, cualquier rama que no sea `main` que se suba habla con la base de planta. Conviene que Preview también apunte a INELPA-TEST.
5. **Production** no tiene que tener `VITE_ENTORNO`.
6. Crear la rama y subirla:

   ```powershell
   git checkout -b staging
   git push -u origin staging
   git checkout main
   ```

   Las variables `VITE_` se meten en el build: si las cambiás después, hay que redesplegar.

Si Vercel te pide iniciar sesión para ver la URL de staging, es la protección de despliegues que trae por defecto. Para vos está bien así; si Rocío tiene que probar desde una tablet, se ajusta en Settings → Deployment Protection.

### Paso 7 · Verificación de punta a punta

- [ ] La URL de staging muestra la pestaña **"ENTORNO DE PRUEBA"** y el título **[PRUEBA]**.
- [ ] Entrás con tu usuario y tu clave de siempre.
- [ ] Creás una orden llamada `PRUEBA-TEST-01`.
- [ ] En INELPA-TEST aparece; en **producción no**:
      `select nro_orden, creada_en from ordenes where nro_orden = 'PRUEBA-TEST-01';`
- [ ] La colección de Postman (`docs/postman/`) contra test: *Run collection*, todo en verde.

### Paso 8 · ALAMO

Mandales la URL de INELPA-TEST (`https://<REF>.supabase.co`) para `base_url`. **El token, por otro canal** (no en el mismo mail). Recordales que el `docEntry` de prueba va del 9001 al 9999.

---

## Reglas durante los 3 meses

1. **SQL nuevo: primero test, después producción.** Antes de Run, mirá qué proyecto tenés abierto.
2. **Cambios riesgosos de la app:** push a `staging`, probar en esa URL, recién después a `main`. Para llevar a staging lo que ya está en main: `git checkout staging && git merge main && git push`.
3. **ALAMO solo trabaja contra test.** No existe token de producción hasta el go-live.
4. **Las tablets de planta nunca abren la URL de staging.**
5. **Los datos de test se van alejando de producción.** Es lo esperado: es una base para romper.
6. **Refrescar test** (si hacen falta datos frescos): un clon no se puede volver a clonar, así que se hace un clon nuevo desde producción, se repiten los pasos 2 a 6 con la URL y las claves nuevas, se le reenvía el token a ALAMO y se borra el proyecto de test viejo.

---

## Archivos de este entorno

| Archivo | Dónde se corre | Para qué |
| --- | --- | --- |
| `docs/test_post_clon_v2.42.sql` | test | Diagnóstico después del clon y apagado de cron |
| `docs/test_storage_buckets_v2.42.sql` | test | 5 buckets + 15 políticas de Storage |
| `docs/supabase_integracion_sap_v2.40.sql` | test | Tablas y funciones de la integración SAP |
| `docs/supabase_catalogo_sync_v2.41.sql` | producción (antes del clon) | Catálogo de Supabase al día |
| `src/components/AvisoEntorno.tsx` | app | Pestaña "ENTORNO DE PRUEBA" |

---

## Fuentes

- Supabase — [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)
- Supabase — [Database Backups](https://supabase.com/docs/guides/platform/backups) (backups físicos desde Postgres 15.8.1.079)
- Supabase — [Manage Compute usage](https://supabase.com/docs/guides/platform/manage-your-usage/compute) (Micro ~US$10/mes, crédito de US$10 por organización)
- Supabase — [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) (camino alternativo)
- Vercel — [How to set up a staging environment](https://vercel.com/kb/guide/set-up-a-staging-environment-on-vercel) (entornos personalizados en Pro)
