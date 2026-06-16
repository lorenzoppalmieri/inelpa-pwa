# Manual de autonomía del administrador — INELPA PWA

**Para:** Lorenzo (admin del sistema). Pensado para que puedas **resetear, cargar usuarios y cargar catálogo sin ayuda externa**.

**Conceptos rápidos para ubicarte:**
- **Supabase** = la base de datos en la nube (la "fuente de verdad"). Se opera desde el panel web → **SQL Editor**.
- **Dexie / IndexedDB** = la copia local que vive **dentro de cada tablet** (para trabajar sin Wi-Fi). Se limpia desde el navegador (F12).
- **`service_role key`** = llave de **administrador** de Supabase. **SECRETA**: nunca la subas a git, nunca la pegues en el código, nunca la compartas. Solo se usa un momento en la terminal.

> Antes de cualquier reseteo grande: **exportá un respaldo**. En Supabase → Table Editor → cada tabla → botón **Export** (CSV). O contale al equipo que vas a resetear.

---

## 1. REINICIO TOTAL A CERO (puesta en marcha)

Objetivo: borrar los **datos de producción** (órdenes, tareas, paradas, semielaborados) **sin tocar la estructura ni los catálogos** (máquinas, causas, modelos, componentes, usuarios).

### 1.1. Vaciar tablas de producción en Supabase

1. Entrá a Supabase → tu proyecto → **SQL Editor** → **New query**.
2. Pegá y ejecutá este bloque. Está ordenado para respetar las relaciones (primero las "hijas"):

```sql
-- ============ RESET DE PRODUCCION (mantiene estructura y catalogos) ============
-- TRUNCATE = vacia la tabla entera y es mas rapido que DELETE.
-- RESTART IDENTITY = reinicia contadores. CASCADE = arrastra dependencias.
truncate table
  paradas,
  tareas,
  semielaborados,
  ordenes
restart identity cascade;

-- Verificacion: deben dar 0
select 'ordenes' t, count(*) from ordenes
union all select 'tareas', count(*) from tareas
union all select 'paradas', count(*) from paradas
union all select 'semielaborados', count(*) from semielaborados;
```

> **Qué NO se toca** (a propósito): `usuarios`, `usuario_sectores`, `maquinas`, `causas_parada`, `modelos`, `componentes`, `modelo_componentes`. Esos son catálogo/configuración, no producción.

**Si además querés borrar usuarios** (reseteo de personal): ese caso se cubre en la sección 2. No uses TRUNCATE sobre `usuarios` sin antes leerla, porque tiene cuentas de Auth vinculadas.

### 1.2. Limpiar la copia local (Dexie) en cada tablet

Después de resetear la nube, **cada tablet tiene todavía datos viejos en memoria**. Hay que limpiarla para que vuelva a bajar todo limpio.

**Opción A — Rápida (recomendada):**
1. En la tablet, abrí la app en el navegador.
2. Apretá **F12** (o menú → "Más herramientas" → "Herramientas de desarrollador").
3. Pestaña **Application** (en Chrome/Edge) → menú izquierdo **Storage**.
4. Botón **"Clear site data"** (Borrar datos del sitio).
5. **Cerrá y reabrí** la app. Va a bajar los datos frescos de Supabase.

**Opción B — Solo la base local (más quirúrgica):**
1. F12 → **Application** → **IndexedDB** (menú izquierdo).
2. Buscá la base llamada **`inelpa_pwa`**.
3. Clic derecho → **Delete database** (o el botón **Delete database**).
4. Cerrá y reabrí la app.

> Tip: si la app no toma cambios nuevos del código, en esa misma pantalla (Application → Service Workers) tocá **Unregister** y recargá. Como la app es PWA con auto-actualización, normalmente no hace falta.

---

## 2. CARGA DE USUARIOS Y OPERARIOS

Son **dos pasos**: (A) crear el **perfil** en la base + sus sectores, y (B) crear la **cuenta de acceso** (Auth). El perfil define rol/sectores; la cuenta define usuario y contraseña.

### 2.1. Paso A — Perfil + sectores (archivo `docs/supabase_roster_seed.sql`)

Este archivo ya tiene los 47 operarios. Para **agregar uno nuevo**, copiás el patrón:

**1) Agregar el perfil** (en el primer `insert into usuarios ... values`):
```sql
-- (nombre completo, usuario_login, rol, grupo_nomina, activo)
('Perez Juan Carlos', 'perez.juan', 'operario', 'bobinado_dist', true)
```
- `usuario` = login, siempre **`apellido.nombre`** en minúsculas y **sin acentos**.
- `rol` = `operario` | `encargado` | `planificador`.
- `grupo_nomina` = uno de: `herreria`, `bobinado_dist`, `bobinado_rural`, `montaje_dist`, `montaje_rural`, `carpinteria`, `corte_aislacion`, `pintura`.
- Recordá poner **coma** entre filas y **no** dejar coma antes del `on conflict`.

**2) Asociar sus sectores** (en el bloque `insert into usuario_sectores ... values (...)`):
```sql
('perez.juan','bob_dist_at'),('perez.juan','bob_dist_bt')
```
- El segundo valor es el **sector_id** (uno de): `corte_conformado`, `soldadura_dist`, `soldadura_rural`, `lavado_pintura`, `bob_dist_at`, `bob_dist_bt`, `bob_rural_at`, `bob_rural_bt`, `montaje_pa_dist`, `montaje_po_dist`, `montaje_pa_rural`, `montaje_po_rural`, `laboratorio`.
- Un operario puede tener varios sectores (varias filas).

**3) Ejecutar el archivo:** copiá TODO el contenido de `supabase_roster_seed.sql` en el **SQL Editor** y dale **Run**. Es **re-ejecutable** (`on conflict do nothing`): correrlo de nuevo no duplica.

### 2.2. Paso B — Crear las cuentas de acceso (script `crear_cuentas_auth.mjs`)

Este script lee la tabla `usuarios` y, para cada uno que **todavía no tiene cuenta**, crea su login (`usuario@inelpa.local`) con una clave inicial, y vincula el `auth_id`. Es **idempotente** (lo corrés las veces que quieras).

**Pasos (desde la carpeta `inelpa-pwa`, en una terminal):**

1. Conseguí la **service_role key**: Supabase → **Project Settings → API → `service_role`** (la secreta, **no** la `anon`).

2. **Windows PowerShell** — cargá las variables y corré:
```powershell
$env:SUPABASE_URL="https://TU-ID.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="eyJ...la_service_role..."
$env:CLAVE_INICIAL="inelpa2026"      # opcional; si no la ponés usa inelpa2026
node scripts/crear_cuentas_auth.mjs
```
   (En **CMD** es igual pero con `set NOMBRE=valor` en vez de `$env:NOMBRE="valor"`.)

3. Vas a ver un resumen: cuántas cuentas creó, cuántas ya existían y cuántos `auth_id` vinculó.

4. **Cerrá la terminal** cuando termines (así la llave secreta no queda cargada en esa sesión).

**Seguridad — sí y no:**
- ✅ Usar la `service_role key` como variable de entorno en tu terminal, un momento.
- ❌ Pegarla en un archivo del proyecto, en `.env`, o subirla a git.
- ❌ Compartirla por chat/mail.

> Cada persona entra con su **usuario** (`apellido.nombre`) y la **CLAVE_INICIAL**. Conviene que después cada uno la cambie (ver `docs/MANTENIMIENTO.md`).

### 2.3. Dar de baja a alguien
No lo borres: marcá `activo = false`. Así conservás su historial:
```sql
update usuarios set activo = false where usuario = 'perez.juan';
```

---

## 3. CARGA DE NUEVOS MODELOS Y SEMIELABORADOS

El catálogo tiene **tres tablas vinculadas**:
- **`modelos`** — el transformador (PK = `codigo`, el ItemCode de SAP).
- **`componentes`** — los semielaborados/bobinas/etc. (PK = `codigo`).
- **`modelo_componentes`** — la lista de materiales (BOM): qué componentes lleva cada modelo. Tiene **claves foráneas** a las dos anteriores.

### 3.1. Estructura exacta de un INSERT (orden obligatorio)

> **Regla de oro de las claves:** primero insertá `modelos` y `componentes`; **recién después** `modelo_componentes`. Si insertás el vínculo antes de que existan las dos puntas, falla por la clave foránea.

```sql
-- 1) MODELO (codigo unico). linea: rural|distribucion | fase: monofasico|bifasico|trifasico
insert into modelos (codigo, nombre, linea, fase, material, potencia, tension, montaje, tanque, activo) values
  ('TTD13V0000999', 'TTD 30/13 - Tanque Expansion - Monoposte - Cobre',
   'distribucion', 'trifasico', 'cobre', 30, 13, 'Monoposte', 'Tanque Expansion', true)
on conflict (codigo) do update set nombre = excluded.nombre, activo = true;

-- 2) COMPONENTES (cada uno con codigo unico). sector_id = sector que lo fabrica.
insert into componentes (codigo, descripcion, categoria, sector_id, nivel, linea, fase, material, potencia, tension, activo) values
  ('BOBALT0000999', 'Bobina AT Distribucion Trifasica 30/13 Cu', 'bobina_at', 'bob_dist_at', 'AT', 'distribucion', 'trifasico', 'cobre', 30, 13, true),
  ('BOBBAJ0000999', 'Bobina BT Distribucion Trifasica 30/13 Cu', 'bobina_bt', 'bob_dist_bt', 'BT', 'distribucion', 'trifasico', 'cobre', 30, 13, true)
on conflict (codigo) do update set descripcion = excluded.descripcion, activo = true;

-- 3) BOM: vincular el modelo con sus componentes (las dos puntas YA existen).
insert into modelo_componentes (modelo_codigo, componente_codigo) values
  ('TTD13V0000999', 'BOBALT0000999'),
  ('TTD13V0000999', 'BOBBAJ0000999')
on conflict do nothing;

-- Verificacion
select m.nombre, count(mc.*) as componentes
from modelos m left join modelo_componentes mc on mc.modelo_codigo = m.codigo
where m.codigo = 'TTD13V0000999' group by m.nombre;
```

**Precauciones con las claves (PK/FK):**
- `codigo` de `modelos` y de `componentes` es **único**. Si repetís un código, el `on conflict (codigo) do update` lo **actualiza** en vez de romper (es seguro re-ejecutar).
- En `modelo_componentes`, **ambos** códigos deben existir antes. Si ves el error `violates foreign key constraint`, es que insertaste el vínculo antes que la `modelos`/`componentes`.
- `sector_id` en `componentes` debe ser un sector **válido** (lista de la sección 2.1), si no, la app no lo mostrará en el carril correcto.
- Mantené la convención de prefijos del catálogo SAP (`TTD/TMR/TBR/TTR` para modelos; `BOBALT/BOBBAJ/PRESUP/PREINF/PARDIS/PARRUR/CUBDIS/...` para componentes). La app usa la **categoría** y el **sector** para clasificarlos.

### 3.2. ⚠️ Importante — para que aparezcan EN LA APP (no solo en Supabase)

Hoy el **desplegable de modelos del planificador** se alimenta del **catálogo estático que viene dentro de la app** (archivos `src/data/catalogoModelos.json`, `catalogoComponentes.json`), que además se siembra en cada tablet (Dexie). **El SQL de arriba actualiza Supabase (el registro maestro), pero la app no lee esa tabla para el desplegable.**

Entonces, para que un modelo nuevo **se vea en Planificación**, hay que actualizar también el catálogo de la app:

1. **Editar los JSON** en `src/data/`:
   - En `catalogoModelos.json`, agregá el objeto del modelo (mismas claves: `codigo, nombre, linea, fase, material, potencia, tension, montaje, tanque, componentes`). En `componentes` poné el **array de códigos** de sus semielaborados.
   - En `catalogoComponentes.json`, agregá cada componente nuevo (`codigo, descripcion, categoria, sectorId, nivel, linea, fase, material, potencia, tension`).
2. **Reconstruir y desplegar:** `git add . && git commit -m "Catalogo: +modelo TTD 30/13" && git push`. Vercel reconstruye solo.
3. En las tablets, al abrir la nueva versión, la app **re-siembra el catálogo automáticamente** cuando detecta que cambió la cantidad de modelos/componentes (función `ensureCatalogo`). Si no, limpiá Dexie (sección 1.2).

> **Atajo cuando es mucha carga:** si te pasan un Excel nuevo de SAP con muchos modelos, **no lo cargues a mano**. Avisame y regeneramos los JSON + el SQL automáticamente desde el Excel (es como se generó `supabase_catalogo_modelos_v1.5.sql`). Para 1 o 2 modelos sueltos, el paso manual de arriba alcanza.

---

## Anexo — Orden de ejecución en una instalación desde cero

Si alguna vez armás el proyecto en un Supabase nuevo, corré los `.sql` de `docs/` en este orden:

1. `supabase_schema.sql` — crea las tablas.
2. `supabase_auth_setup.sql` — usuarios de gestión (lorenzo, rocio, ulises, santiago, omar).
3. `supabase_realtime_rls.sql` — seguridad (RLS) y tiempo real.
4. `supabase_catalogo_seed.sql` — máquinas + causas de parada.
5. `supabase_catalogo_modelos_v1.5.sql` — modelos + componentes + BOM.
6. `supabase_migracion_v1.4.sql` y `supabase_migracion_v1.5.sql` — columnas nuevas (si la base venía de antes; en una base nueva ya están en el schema).
7. `supabase_roster_seed.sql` — los 47 operarios + sectores.
8. Terminal: `node scripts/crear_cuentas_auth.mjs` — las cuentas de acceso.

Listo: base poblada y todos pueden entrar.
