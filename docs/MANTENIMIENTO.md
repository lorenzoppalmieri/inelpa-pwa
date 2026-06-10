# Guía de Mantenimiento — PWA Control de Producción INELPA

**Para:** equipo de IT / técnico-administrativo de INELPA.
**Qué resuelve esta guía:** las tareas de mantenimiento rutinarias del sistema (altas de personal, modelos, causas de parada y limpieza de datos) **sin necesidad de saber programar**.

> **Regla de oro #1:** antes de tocar cualquier archivo, hacé una copia de seguridad de la carpeta `inelpa-pwa` completa (copiar y pegar la carpeta en otro lado). Si algo sale mal, restaurás la copia y listo.
>
> **Regla de oro #2:** los archivos de código se editan con el **Bloc de notas** o, mejor, con **Visual Studio Code** (gratis). Nunca con Word.
>
> **Regla de oro #3:** respetá SIEMPRE las comas, las comillas `'` y los corchetes `[ ]`. Si borrás una coma o una comilla, la app deja de arrancar. Copiá una línea que ya exista y modificá solo el texto de adentro.

---

## 0. Dos etapas del sistema (leer primero)

El sistema tiene dos momentos y el lugar donde se hacen los cambios es distinto en cada uno:

**ETAPA ACTUAL — modo demo / prueba (hoy).**
Los datos (operarios, modelos, causas) viven dentro del **código**, en archivos de texto. Para cambiarlos se editan esos archivos. Esta guía se enfoca en esto.

**ETAPA FUTURA — producción con Supabase (go-live agosto 2026).**
Una vez conectada la base de datos en la nube (Supabase), los operarios y órdenes se cargarán desde una **tabla** (como una planilla) sin tocar código. Al final de cada sección indico también dónde se hará el cambio en esa etapa, para que quede preparado.

> Mientras estemos en modo demo: **después de cualquier cambio en el código, hay que reiniciar la app** (ver sección 5) y, en muchos casos, **vaciar los datos del navegador** (ver sección 4) para que el cambio se vea.

---

## 1. Colaboradores (Alta, Baja y Modificación)

**Archivo a editar:** `src/db/seed.ts`
**Bloque:** lista `NOMINA`, que **empieza en la línea 42**.

Cada colaborador es UNA línea con este formato exacto:

```ts
  ['Apellido Nombre Segundo', 'grupo'],
```

- El **primer texto** (entre comillas) es el nombre que se muestra en pantalla.
- El **segundo texto** es el **grupo** al que pertenece. Determina en qué sectores aparece para que el planificador le asigne tareas.
- El **usuario de login se genera solo** a partir del nombre, con el formato `apellido.nombre` y sin acentos. Ejemplo: `Carruega Roberto Hector` → login `carruega.roberto`. **No hay que escribir el usuario a mano.**

### Grupos válidos (copiar EXACTO uno de estos)

| Grupo a escribir | Sectores donde queda asignable |
|---|---|
| `herreria` | Corte y conformado, Soldadura Dist., Soldadura Rural, Lavado y Pintura |
| `bobinado_dist` | Bobinado Distribución AT y BT |
| `bobinado_rural` | Bobinado Rural AT y BT |
| `montaje_dist` | Montaje PA Dist. y PO Dist. |
| `montaje_rural` | Montaje PA Rural y PO Rural |
| `carpinteria` | (todavía sin sector asignable — ver nota) |
| `corte_aislacion` | (todavía sin sector asignable — ver nota) |
| `pintura` | (todavía sin sector asignable — ver nota) |

> **Nota sobre `carpinteria`, `corte_aislacion`, `pintura`:** estos tres grupos existen en la nómina real pero todavía NO están mapeados a un sector del tablero, así que esas personas se cargan pero aún no se pueden asignar en Planificación. Es una decisión tomada con gerencia. Cuando se decida mapearlos, se ajusta la tabla `SECTORES_POR_GRUPO` (línea 29 del mismo archivo).

### A) Dar de ALTA un colaborador nuevo (un ingreso)

1. Abrí `src/db/seed.ts`.
2. Buscá la lista `NOMINA` (línea 42). Verás muchas líneas como las del ejemplo.
3. Copiá una línea existente del grupo que corresponda y pegala justo debajo.
4. Cambiá el nombre y, si hace falta, el grupo. Ejemplo, ingreso a bobinado distribución:

   ```ts
   ['Pérez Juan Carlos', 'bobinado_dist'],
   ```
5. Guardá el archivo. Reiniciá la app (sección 5) y vaciá los datos del navegador (sección 4).
6. El nuevo colaborador ya aparece en el desplegable de Planificación y puede iniciar sesión con `perez.juan` y la contraseña demo `1234`.

### B) Dar de BAJA un colaborador (egreso)

**Opción recomendada (reversible):** dejá la persona en la lista pero marcala inactiva, así no se pierde su historial. Para esto NO alcanza con `NOMINA`; el campo `activo` se arma automáticamente en `true`. La forma más simple y segura de una baja en modo demo es **borrar su línea** de `NOMINA`:

1. En `NOMINA`, ubicá la línea de la persona.
2. Borrá la línea completa (incluida la coma del final).
3. Guardá, reiniciá (sección 5) y vaciá datos del navegador (sección 4).

> En producción (Supabase) la baja NO borra a la persona: se pone su columna `activo` en `false` en la tabla `usuarios`. Así conserva el historial de tareas. Ver sección 6.

### C) MODIFICAR un colaborador (cambio de sector / corregir nombre)

- **Cambiar de sector/grupo:** en su línea, cambiá solo el segundo texto (el grupo) por otro de la tabla de grupos válidos. Ejemplo, pasa de bobinado a montaje:

  ```ts
  ['Pérez Juan Carlos', 'montaje_dist'],
  ```
- **Corregir el nombre:** cambiá el primer texto. **Ojo:** si cambia el apellido/nombre, también cambia el login generado.

Guardá, reiniciá y vaciá datos del navegador.

---

## 2. Modelos de Transformadores

**Archivo a editar:** `src/types/index.ts`
**Bloque:** lista `MODELOS_TRANSFORMADOR`, que **empieza en la línea 25**.

Es una lista de textos separados por comas. Cada modelo va entre comillas:

```ts
export const MODELOS_TRANSFORMADOR: string[] = [
  'TTD 16/13', 'TTD 25/13', 'TTD 40/13', ...
]
```

> **Importante — la línea se deduce sola del prefijo del modelo.** No hay que indicar si es Distribución o Rural: el sistema lo infiere del prefijo. `TTD` = Distribución; `TMR`, `TBR`, `TTR` = Rural. Si agregás un modelo con prefijo nuevo, avisá a IT para revisar esa regla (función `lineaDesdeModelo`, debajo de la lista).

### Agregar un modelo

1. Abrí `src/types/index.ts`, lista `MODELOS_TRANSFORMADOR` (línea 25).
2. Agregá el modelo nuevo entre comillas, con su coma. Ejemplo:

   ```ts
   'TTD 1250/13',
   ```
3. Respetá el formato visible (sigla en mayúsculas, espacio, potencia, barra, tensión). Guardá y reiniciá (sección 5). Los modelos NO requieren vaciar el navegador: aparecen al recargar la pantalla de Planificación.

### Quitar un modelo

Borrá su texto (incluida la coma). No borres modelos que ya estén usados en órdenes activas.

---

## 3. Causas de Parada (lo que ven los operarios en la tablet)

**Archivo a editar:** `src/types/index.ts`
**Bloque:** lista `CAUSAS_PARADA`, que **empieza en la línea 287**.

Cada causa es una línea con este formato:

```ts
  { id: 'espera_alambre', label: 'Espera de alambre (cobre o aluminio)', categoria: 'material', codigo: 30 },
```

Significado de cada parte:

- `id`: identificador interno **sin espacios ni acentos**, con guion bajo. Tiene que ser **único**. Es lo que se guarda en la base; no se muestra al operario.
- `label`: el **texto que ve el operario** en la tablet. Acá sí podés usar mayúsculas, espacios y paréntesis.
- `categoria`: agrupa la causa en el buscador. Usá EXACTO una de estas seis: `material`, `logistica`, `maquina`, `personal`, `calidad`, `otra`.
- `codigo`: el número de esa causa en la **planilla maestra de planta** (para reportes/SAP). Si no tiene número, omití `, codigo: ...`.

### Agregar una causa nueva

1. Abrí `src/types/index.ts`, lista `CAUSAS_PARADA` (línea 287).
2. Copiá una línea existente de la categoría que corresponda y pegala debajo.
3. Cambiá `id` (único, sin espacios), `label` (texto visible), `categoria` y `codigo`. Ejemplo:

   ```ts
   { id: 'espera_grua', label: 'Espera de grúa / autoelevador', categoria: 'logistica', codigo: 41 },
   ```
4. Guardá y reiniciá (sección 5). No hace falta tocar ningún componente: el buscador de la tablet las agrupa solo por categoría.

### Modificar o quitar una causa

- **Cambiar el texto que ve el operario:** modificá solo el `label`. **No cambies el `id`** de una causa que ya se usó (se perdería el vínculo con las paradas ya registradas).
- **Quitar una causa:** borrá su línea completa. Mejor no eliminar causas históricas; si ya no se usa, dejala y simplemente no se elegirá.

> No borres la última línea `{ id: 'otra', label: 'Otra', categoria: 'otra' }`: es el comodín para casos no listados.

---

## 3.bis Gestión de Contraseñas (Seguridad de accesos)

Hoy **todos los usuarios comparten la contraseña demo `1234`**. Eso sirve para probar, pero **NO para producción**: cualquiera puede entrar como cualquiera. Esta sección explica cómo poner contraseñas individuales.

### Cómo funciona la contraseña hoy (para entender)

- Cada usuario tiene un campo `passwordHash`. No se guarda la contraseña en texto plano, sino un “hash” (una huella) generada por la función `demoHash(...)`.
- En `src/db/seed.ts`, **línea 19**, hay un atajo: `const PWD = demoHash('1234')`. Casi todos los usuarios usan `PWD`, por eso todos tienen `1234`.
- Al iniciar sesión, la app compara el hash de lo que se tipeó contra el `passwordHash` guardado (archivo `src/auth/AuthContext.tsx`).

> **Importante:** `demoHash` es un hash **simple, solo para la demo**. No es seguro de verdad. La seguridad real llega con Supabase Auth (más abajo). Mientras tanto, poné al menos contraseñas distintas para que no todos compartan `1234`.

### A) Cambiar la contraseña de UN usuario (modo demo / código)

La forma más simple y a prueba de errores es darle a ese usuario su propio `passwordHash` con `demoHash('su-clave')`.

**Ejemplo — ponerle a Lorenzo la clave `Gerencia2026`:**

1. Abrí `src/db/seed.ts`.
2. Buscá la lista `usuarios` (línea 108). Ahí están los planificadores y encargados, uno por línea.
3. En la línea de Lorenzo (línea 110), reemplazá `passwordHash: PWD` por `passwordHash: demoHash('Gerencia2026')`. Queda así:

   ```ts
   { id: 'u_plan', nombre: 'Lorenzo Palmieri', usuario: 'lorenzo', passwordHash: demoHash('Gerencia2026'), rol: 'planificador', sectores: [], activo: true },
   ```
4. Guardá. Reiniciá la app (sección 5) y vaciá los datos del navegador (sección 4) para que se vuelva a sembrar con la clave nueva.

> `demoHash` ya está disponible en ese archivo, no hay que importar nada. Solo cuidá las comillas: `demoHash('TuClave')`.

### B) Cambiar la contraseña genérica de TODOS de un saque

Si solo querés que la clave compartida deje de ser `1234`:

1. En `src/db/seed.ts`, **línea 19**, cambiá el texto entre comillas:

   ```ts
   const PWD = demoHash('InelpaPlanta2026')
   ```
2. Todos los que usan `PWD` pasan a esa clave nueva. Guardá, reiniciá y vaciá el navegador.

> Esto sigue siendo una clave compartida. Mejor que `1234`, pero lo ideal es B) para áreas + A) para jefaturas.

### C) Contraseñas individuales para los operarios

Los operarios se generan en bloque (línea 100, `operarios = NOMINA.map(...)`) y todos toman `PWD`. Para darle a UN operario su propia clave sin romper el bloque, agregá una excepción justo después de generarlos. Ejemplo: clave propia para `carruega.roberto`:

```ts
// despues del bloque operarios (linea 106), antes de const usuarios:
const claveDe: Record<string, string> = {
  'carruega.roberto': 'Roberto2026',
  'alegre.hugo': 'Hugo2026',
}
for (const o of operarios) {
  if (claveDe[o.usuario]) o.passwordHash = demoHash(claveDe[o.usuario])
}
```

Agregás un renglón por persona en `claveDe`. Guardá, reiniciá y vaciá el navegador.

> Si esto te parece mucho para el día a día, **es justo lo que resuelve Supabase**: ahí cada usuario se administra desde un panel, sin tocar código (abajo).

### D) Gestión de contraseñas en PRODUCCIÓN (Supabase Auth)

Cuando se conecte Supabase (go-live), las contraseñas **dejan de estar en el código**. Pasan a manejarse con **Supabase Auth**, que ya guarda las claves cifradas de forma segura (bcrypt) y nunca las muestra. Desde el panel de Supabase, IT puede:

1. Entrar a **Authentication → Users**.
2. **Crear un usuario nuevo** (botón *Add user*): se carga email + contraseña inicial.
3. **Resetear la contraseña** de alguien: abrir el usuario → *Reset password* (o enviar un mail de recuperación).
4. **Dar de baja un acceso:** eliminar o deshabilitar el usuario en esa misma pantalla.

La tabla `usuarios` del esquema (`docs/supabase_schema.sql`) ya tiene la columna `auth_id` que vincula cada perfil de planta con su cuenta de Auth. El campo `passwordHash` del código **desaparece** en esta etapa: la verificación la hace Supabase del lado del servidor, que es lo seguro.

> **Recomendación de seguridad para el go-live:** una clave distinta por persona, mínimo 8 caracteres, y obligar el cambio en el primer ingreso. Las jefaturas (planificador/encargado) con claves más fuertes porque ven todos los sectores.

---

## 4. Limpieza de Datos Ficticios (Purga para arrancar limpio)

Los datos demo (operarios de prueba, órdenes y tareas inventadas) viven en la **memoria del navegador** de cada dispositivo (tecnología IndexedDB). Para empezar “de cero” con datos reales hay que vaciar esa memoria **en cada dispositivo** (la PC del planificador y cada tablet).

### Cómo se siembran los datos (para entender)

Al abrir la app por primera vez, el sistema revisa si hay usuarios cargados. Si la memoria está **vacía**, siembra los datos demo automáticamente (función `ensureSeed`, archivo `src/db/seed.ts`, línea 205). Si ya hay datos, **no toca nada**. Por eso, para que un cambio de nómina/modelos/causas se refleje, hay que vaciar primero.

### Método recomendado (sin tocar código) — vaciar IndexedDB desde el navegador

Hacelo en cada dispositivo, con la app abierta en Chrome o Edge:

1. Presioná **F12** (abre las Herramientas de desarrollador).
2. Andá a la pestaña **Application** (o **Aplicación**).
3. En el panel izquierdo, abrí **Storage → IndexedDB**.
4. Hacé clic derecho sobre la base de la app y elegí **Delete database** (Eliminar base de datos). Si hay dudas, usá el botón **Clear site data** (Borrar datos del sitio) que está en **Application → Storage**.
5. Cerrá F12 y **recargá la página** (F5). La app vuelve a sembrar los datos según como esté el código en ese momento.

> Cuando ya estén cargados los **datos reales** (no demo) y NO quieras que se vuelvan a sembrar los de prueba, IT debe vaciar la lista de datos demo en `src/db/seed.ts` (dejar las listas de órdenes y tareas vacías). Coordinarlo con quien programa antes del go-live.

### Método para IT con consola (avanzado, opcional)

Existe una función `resetDemo()` (`src/db/seed.ts`, línea 218) que borra y vuelve a sembrar de un saque. Hoy no está conectada a ningún botón. Si IT quiere un botón de “Reiniciar demo” en pantalla, pedírselo al desarrollador; es un cambio chico.

> En producción (Supabase) la purga se hace vaciando las tablas (`tareas`, `ordenes`, etc.) desde el panel de Supabase, no desde el navegador.

---

## 5. Cómo reiniciar la app después de un cambio

Cada vez que editás y guardás un archivo `.ts`:

1. Si la app está corriendo (`npm run dev`), Vite normalmente **recarga solo** la pantalla en unos segundos. Mirá el navegador: debería actualizarse.
2. Si no se actualiza o ves un error, en la ventana donde corre la app presioná **Ctrl + C** para detenerla, y volvé a ejecutarla:

   ```bash
   npm run dev
   ```
3. Si el cambio es de nómina, abrí también el navegador y vaciá IndexedDB (sección 4) para que se vuelva a sembrar.

> Si después de un cambio la app muestra pantalla en blanco o un error rojo, casi siempre es una **coma o una comilla faltante**. Revisá la última línea que tocaste o restaurá la copia de seguridad (Regla de oro #1).

---

## 6. Referencia rápida — etapa producción (Supabase, futuro)

Cuando esté conectada la base en la nube, los cambios de datos NO se harán en archivos de código sino en tablas (esquema en `docs/supabase_schema.sql`):

| Tarea | Hoy (modo demo) | Mañana (Supabase) |
|---|---|---|
| Alta/baja/mod colaborador | `NOMINA` en `src/db/seed.ts` (l. 42) | Tabla `usuarios` (columna `activo` para baja, `grupo_nomina` para sector) |
| Modelos de transformador | `MODELOS_TRANSFORMADOR` en `src/types/index.ts` (l. 25) | Maestro de artículos (OITM en SAP B1) |
| Causas de parada | `CAUSAS_PARADA` en `src/types/index.ts` (l. 287) | Tabla-catálogo `causas_parada` |
| Purga de datos | Vaciar IndexedDB del navegador | Vaciar tablas desde panel Supabase |

---

## 7. Tabla resumen — “¿qué archivo toco?”

| Quiero… | Archivo | Línea | Bloque |
|---|---|---|---|
| Agregar/quitar/mover un colaborador | `src/db/seed.ts` | 42 | `NOMINA` |
| Ver/cambiar a qué sectores va cada grupo | `src/db/seed.ts` | 29 | `SECTORES_POR_GRUPO` |
| Agregar/quitar un modelo | `src/types/index.ts` | 25 | `MODELOS_TRANSFORMADOR` |
| Agregar/cambiar una causa de parada | `src/types/index.ts` | 287 | `CAUSAS_PARADA` |
| Cambiar la clave compartida de todos | `src/db/seed.ts` | 19 | `const PWD = demoHash('...')` |
| Dar clave propia a jefaturas/encargados | `src/db/seed.ts` | 108 | `usuarios` (campo `passwordHash`) |
| Entender la siembra de datos demo | `src/db/seed.ts` | 205 | `ensureSeed` |
| Borrar y resembrar todo (avanzado) | `src/db/seed.ts` | 218 | `resetDemo` |

> Los números de línea son aproximados: si agregás o quitás líneas, todo lo de abajo se corre. Guiate siempre por el **nombre del bloque** (la palabra en mayúsculas), no solo por el número.
