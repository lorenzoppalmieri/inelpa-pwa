# Integración SAP B1 ↔ PWA INELPA
## Fase 1 — Entrada de datos (SAP → PWA): contrato de API

**Rev. 2 · 26/10/2026**
**Autor:** INELPA (equipo PWA)
**Para:** ALAMO
**Estado:** contrato implementado y probado internamente. Listo para la prueba conjunta con Postman en cuanto esté el entorno de test.

---

## 0. Qué cambió desde la rev. 1

Esta revisión incorpora todo lo que respondieron en la reunión del 22/10. Gracias por la revisión detallada: varias respuestas simplificaron el diseño.

| Tema | Rev. 1 | Rev. 2 (acordado el 22/10) |
| --- | --- | --- |
| Nombres de los endpoints | `of-upsert`, `articulo-upsert` | **`sap-ordenes`, `sap-articulos`**. Las OF ya no se actualizan, así que "upsert" confundía. |
| `docEntry` | clave primaria derivada (`of_<docEntry>`) | **Clave de idempotencia, no PK.** La tabla conserva su propia clave. |
| Envío | a definir | **Lote** (array) en un POST. |
| Orden padre → hijas | a definir | **No garantizado.** El endpoint acepta hijas antes que el padre. |
| Cambios en una OF | se reenvía y se actualiza | **No se reenvía nunca.** Solo se mandan OF liberadas. Para cambiar algo se cancela y se emite otra. |
| Label para el operario | `comments` / `itemName` en la OF | **Lo compone la PWA** desde el maestro de artículos. Se quitan `itemName` y `comments` del payload de la OF. |
| Receta vs. artículo | ¿uno o dos endpoints? | **Un endpoint, un payload.** |
| Profundidad del árbol | a definir | **Un nivel por llamada.** |
| Líneas de receta | desactivar, nunca borrar | **Reemplazo completo** (SAP no guarda historial de una línea quitada). Los artículos siguen sin borrarse nunca. |
| Códigos HTTP | 422 por ítem | **200 por lote** con el resultado de cada ítem adentro. Ver §5. |
| Allowlist de IP | propuesta | **Desactivada durante las pruebas**, como pidieron. Se evalúa para producción. |

### Una corrección nuestra

En la rev. 1 dijimos que la tabla de órdenes tenía una restricción de unicidad por nombre de OF y que "rechazaría 6 de 7 órdenes". **Eso era incorrecto.** La validación de número repetido existe, pero solo en la pantalla de carga manual de la PWA; la base no tiene esa restricción. El endpoint escribe directo en la base, así que no le aplica. No hace falta ningún cambio por ese motivo. Pedimos disculpas por el ruido.

Los ejemplos de esta revisión usan **datos reales del catálogo** (`TTD13V0000001` = TTD 16/13 Tanque Expansión Plataforma Cu, con sus bobinas `BOBALT0000109`–`111` y `BOBBAJ0000109`–`111`). Los de la rev. 1 eran ilustrativos y no coincidían con el maestro.

---

## 1. Alcance

Cubre los dos pedidos de la reunión del 21/10:

1. **`sap-articulos`** — SAP da de alta o actualiza artículos y su receta.
2. **`sap-ordenes`** — SAP da de alta órdenes de fabricación liberadas.

**Fuera de este documento**, por acuerdo: recibos de fabricación y emisiones (PWA → SAP), cancelación de OF (PWA → SAP), tareas y asignaciones, stock, depósitos, logística, colaboradores y centros de trabajo. Ver §8 para lo que queda pendiente de cada lado.

---

## 2. Arquitectura

```
  SAP B1 (Service Layer)
     │
     │  HTTPS POST + Authorization: Bearer <token de integración>
     ▼
  Supabase Edge Function  (sap-articulos | sap-ordenes)
     │   1. autentica el token
     │   2. valida y normaliza cada ítem
     │   3. llama a una función SQL que escribe atómica POR ÍTEM
     ▼
  Postgres (Supabase)
     ├── sap_articulos / sap_articulo_bom   (espejo del maestro de SAP, tablas nuevas)
     └── ordenes                            (la tabla de órdenes que ya usa la planta)
           └── Realtime ──► tablets ──► planificación
```

- **Un ítem rechazado no frena al resto del lote.** Cada ítem se graba en su propia subtransacción.
- **El maestro de SAP va a tablas nuevas** (`sap_articulos`, `sap_articulo_bom`). No se toca el catálogo que hoy usa la PWA, que es destino de claves foráneas de las tareas en curso. Pasar la planificación a leer del maestro de SAP es trabajo nuestro de la fase siguiente.
- La `service_role key` de Supabase **nunca sale del servidor**. Las funciones SQL solo las puede ejecutar ese rol: no se pueden invocar con la clave pública de la app.

---

## 3. Endpoint `sap-articulos`

```http
POST {{base_url}}/functions/v1/sap-articulos
Authorization: Bearer {{service_token}}
Content-Type: application/json
```

### 3.1 Payload

```json
{
  "articulos": [
    {
      "itemCode": "TTD13V0000001",
      "itemName": "TTD 16/13 - Tanque Expansion - Plataforma - Cobre",
      "itemType": "PT",
      "uom": "UN",
      "active": true,
      "defaultWarehouse": "03",
      "hasBatch": false,
      "bom": [
        { "itemCode": "BOBBAJ0000109", "quantity": 1, "uom": "UN" },
        { "itemCode": "BOBBAJ0000110", "quantity": 1, "uom": "UN" },
        { "itemCode": "BOBBAJ0000111", "quantity": 1, "uom": "UN" },
        { "itemCode": "BOBALT0000109", "quantity": 1, "uom": "UN" },
        { "itemCode": "BOBALT0000110", "quantity": 1, "uom": "UN" },
        { "itemCode": "BOBALT0000111", "quantity": 1, "uom": "UN" },
        { "itemCode": "PARDIS0000001", "quantity": 1, "uom": "UN" },
        { "itemCode": "CUBDIS0000037", "quantity": 1, "uom": "UN" },
        { "itemCode": "TANDIS0000001", "quantity": 1, "uom": "UN" },
        { "itemCode": "TAPDIS0000001", "quantity": 1, "uom": "UN" }
      ]
    }
  ]
}
```

### 3.2 Campos

| Campo | Tipo | Req. | Nota |
| --- | --- | --- | --- |
| `itemCode` | string ≤ 50 | **sí** | Clave. |
| `itemName` | string ≤ 200 | **sí** | Es lo que va a ver el operario. |
| `itemType` | `PT` \| `SE` \| `MP` | **sí** | Producto terminado / semielaborado / materia prima. |
| `uom` | string | no | |
| `active` | boolean | **sí** | `false` = discontinuado. Ver §3.3. |
| `defaultWarehouse` | string | no | Depósito por defecto de la receta. Se guarda como dato. |
| `hasBatch` | boolean | **sí** | Si maneja lote. Lo vamos a necesitar para los recibos. |
| `bom` | array | no | Un nivel de receta. **Ver la regla de §3.3.** |
| `bom[].itemCode` | string | **sí** | No puede ser el mismo artículo. Puede no existir todavía. |
| `bom[].quantity` | number > 0 | **sí** | Acepta decimales (kilos, metros). |
| `bom[].uom` | string | no | |

Máximo **500 artículos por envío** y **500 líneas por receta**.

### 3.3 Reglas

**Los artículos nunca se borran.** Las tareas de producción guardan el código del semielaborado; borrar un artículo dejaría tareas históricas huérfanas. Un artículo discontinuado llega con `"active": false` y queda inactivo.

**La receta se rige por la presencia de `bom`:**

| El envío trae… | Efecto sobre la receta |
| --- | --- |
| sin la clave `bom` (o `null`) | **No se toca.** Sirve para actualizar datos del artículo sin reenviar la fórmula. |
| `"bom": [ … ]` | **Reemplazo completo.** Las líneas que no vengan se borran. |
| `"bom": []` | **Se vacía.** |

Esto cubre lo que propusieron: el producto puede llegar primero sin fórmula y después el mismo producto con fórmula. **Ojo con mandar `bom: []` cuando la intención es "no tengo la fórmula todavía"**: eso la borra. En ese caso, omitir la clave.

**Un nivel por llamada.** Si un componente de la receta todavía no se dio de alta, se acepta igual (no hay clave foránea) y se informa en `componentesSinAlta`. El árbol se completa con envíos sucesivos, en cualquier orden.

### 3.4 Respuesta por artículo

```jsonc
{ "itemCode": "TTD13V0000001", "resultado": "creado", "lineasReceta": 10, "componentesSinAlta": 10 }
```

| `resultado` | Significado |
| --- | --- |
| `creado` | No existía. |
| `actualizado` | Existía y cambió algún dato o la receta. |
| `sin_cambios` | Llegó igual a lo que ya estaba. Un reintento da esto. |
| `rechazado` | No se grabó. Trae `motivo` y `reintentable`. |

`lineasReceta` y `componentesSinAlta` vienen en `null` cuando el envío no traía `bom`.

---

## 4. Endpoint `sap-ordenes`

```http
POST {{base_url}}/functions/v1/sap-ordenes
Authorization: Bearer {{service_token}}
Content-Type: application/json
```

### 4.1 Payload

El transformador y sus bobinas en un solo envío. Las hijas pueden venir antes que el padre.

```json
{
  "ordenes": [
    {
      "docEntry": 9002,
      "docNum": "1002",
      "parentDocEntry": 9001,
      "itemCode": "BOBBAJ0000109",
      "plannedQty": 1,
      "uom": "UN",
      "dueDate": "2026-11-06",
      "startDate": "2026-10-29",
      "warehouse": "03",
      "batchNumber": null,
      "status": "R"
    },
    {
      "docEntry": 9001,
      "docNum": "1001",
      "parentDocEntry": null,
      "itemCode": "TTD13V0000001",
      "plannedQty": 1,
      "uom": "UN",
      "dueDate": "2026-11-06",
      "startDate": "2026-10-29",
      "warehouse": "03",
      "batchNumber": null,
      "status": "R"
    }
  ]
}
```

### 4.2 Campos

| Campo | Tipo | Req. | Nota |
| --- | --- | --- | --- |
| `docEntry` | int > 0 | **sí** | **Clave de idempotencia.** Inmutable en SAP. |
| `docNum` | string | no | Número visible. Si falta, se usa el `docEntry`. |
| `parentDocEntry` | int \| null | no | `docEntry` de la OF del transformador. `null` si es la OF padre o un semielaborado suelto. **Pendiente de confirmar de su lado, ver §8.** |
| `itemCode` | string | **sí** | Tiene que existir antes en `sap-articulos`. |
| `plannedQty` | int > 0 | **sí** | Entero: una OF de 2,5 bobinas no existe. |
| `uom` | string | no | |
| `dueDate` | fecha | **sí** | Fecha de entrega. Alimenta el Gantt. |
| `startDate` | fecha | no | Inicio planificado en SAP. |
| `warehouse` | string | no | Depósito de la OF. Se guarda; lo vamos a usar en los recibos. |
| `batchNumber` | string \| null | no | Lote, si corresponde. |
| `status` | string | **sí** | **Solo liberadas**: `"R"` o `"boposReleased"`. Cualquier otro valor se rechaza. |

Máximo **500 órdenes por envío**.

### 4.3 Reglas

**Idempotencia.** Un `docEntry` que ya existe es un reintento: vuelve `duplicada` y la orden **no se modifica**. Si el reenvío trae datos distintos (otra cantidad, otra fecha), igual vuelve `duplicada`, con un aviso. Coherente con lo acordado: las OF no se cambian, se cancelan y se emite otra.

**Padre e hijas, sin orden.** El vínculo se guarda como el `docEntry` del padre, sin clave foránea, y se resuelve al leer. Da igual si el padre llega antes, después o en el mismo lote.

**Artículos primero.** Una OF de un `itemCode` que no se dio de alta vuelve `rechazada` con `reintentable: true`. Sincronizar el artículo y reintentar la orden.

### 4.4 Respuesta por orden

```jsonc
{ "docEntry": 9002, "resultado": "creada", "id": "6f1c…", "padreRecibido": false, "avisos": [] }
```

| `resultado` | Significado |
| --- | --- |
| `creada` | Alta nueva. `id` es la clave interna de la PWA. |
| `duplicada` | Ya existía. No se tocó. |
| `rechazada` | No se grabó. Trae `motivo` y `reintentable`. |

- `padreRecibido`: informativo. `false` es normal cuando las hijas llegan antes o en el mismo lote.
- `avisos`: datos que la PWA tuvo que deducir (por ejemplo, la línea rural/distribución de un artículo que no estaba en su catálogo) o diferencias en un reenvío. No impiden el alta.

---

## 5. Semántica HTTP (igual para los dos)

| Código | Cuándo | Qué hacer |
| --- | --- | --- |
| `200` | El lote se procesó. | Mirar `resultados`: un elemento por ítem, **en el mismo orden en que se mandaron**. |
| `400` | Cuerpo no JSON, falta la lista o está vacía. | Corregir el armado. No se procesó nada. |
| `401` | Token ausente o inválido. | No reintentar. |
| `405` | Método distinto de POST. | |
| `413` | Más de 500 ítems. | Partir el lote. |
| `500` | Falló la base o falta configuración. | **Reintentar el envío completo.** Es seguro: todo es idempotente. |

Por qué 200 con resultados por ítem y no un código por ítem: en un lote de 7 órdenes pueden convivir 6 creadas y 1 rechazada. Un solo código HTTP no lo puede expresar; el detalle va adentro.

Sobre de la respuesta 200:

```jsonc
{
  "ok": false,          // true si no hubo ningún rechazo
  "recibidos": 3,
  "procesados": 2,      // creados/actualizados/sin cambios/duplicados
  "rechazados": 1,
  "reintentables": 0,   // de los rechazados, cuántos conviene reintentar
  "resultados": [ … ]
}
```

**Regla para el reintento automático del lado de SAP:** reintentar los ítems con `reintentable: true` y los `500`. Los `rechazado(a)` con `reintentable: false` necesitan corrección de datos o de mapeo.

### Formatos aceptados

Estrictos con el valor, flexibles con la representación, para no obligarlos a transformar lo que devuelve el Service Layer:

- Números como `7` o `"7"`.
- Booleanos como `true`/`false`, `"Y"`/`"N"` o `"tYES"`/`"tNO"`.
- Fechas como `"2026-11-06"` o `"2026-11-06T00:00:00Z"`. Se toma la fecha tal cual, sin convertir zona horaria.
- `itemType` y `status` sin distinguir mayúsculas.

Campos extra que no estén en el contrato se ignoran.

---

## 6. Autenticación

| Punto | Definición |
| --- | --- |
| Mecanismo | `Authorization: Bearer <token>`. Un token dedicado a la integración, de 48+ caracteres. |
| Dónde vive | Secret del proyecto Supabase. Se rota sin tocar código. |
| `service_role key` | **No se entrega.** La usan las funciones del lado del servidor. |
| Allowlist de IP | **Desactivada durante las pruebas**, para que puedan probar desde cualquier máquina. Para producción lo charlamos. |
| Logs | Cada request queda en el log de la Edge Function: endpoint, recibidos, rechazados, latencia. Sin el token ni el payload. |

---

## 7. Carga inicial (nos pidieron que la propongamos)

**Mecanismo: el mismo endpoint `sap-articulos`, en lotes.**

1. Volcado inicial del maestro de fabricables (productos terminados y semielaborados) en lotes de hasta 500. Hoy son unos 2.000 códigos: 4 o 5 envíos.
2. El orden entre lotes no importa: una receta puede referenciar componentes que todavía no llegaron.
3. Después, incremental por evento: cada alta o modificación en SAP, un envío de ese artículo.
4. Recién con el maestro cargado, empiezan las órdenes.

**La carga inicial no requiere borrar nada en la PWA.** El maestro de SAP se carga en tablas nuevas, y las órdenes que lleguen por el endpoint conviven con las cargadas a mano (se distinguen por un campo de origen).

Además verificamos los códigos en dos niveles:

- **Catálogo contra el export de SAP del 15/9:** los 1.692 códigos del export existen en la PWA, y los nombres coinciden exactamente (309 de 309 modelos, 1.383 de 1.383 semielaborados).
- **Histórico de producción contra SAP:** todas las órdenes y todas las tareas con semielaborado que tiene hoy la PWA se vinculan con códigos que existen en SAP. **No hay registros huérfanos.**

La decisión de conservar o depurar el histórico queda del lado de INELPA y no afecta el contrato.

Una consulta menor: la PWA tiene 342 códigos que no aparecen en ese export — **`PRESUP` (173), `PREINF` (152) y `VARANG` (17)**, prensayugos y varillas. Siguen el formato de SAP y ninguna tarea histórica los usa, así que no afectan el histórico. ¿Existen en el maestro completo? Lo necesitamos saber para las recetas que vengan de SAP.

---

## 8. Pendientes

### Del lado de ALAMO

- **Vínculo padre-hija.** Juan planteó que en SAP la OF del semielaborado no queda relacionada con la del producto final. Para la PWA es importante: es lo que permite ver un transformador como una unidad y saber cuándo están todas sus partes. Si no está nativo, una alternativa es un campo de usuario en la OF que se complete cuando el MRP la genera. El campo `parentDocEntry` ya está previsto y es opcional, así que el resto del contrato no se frena.
- **Cancelación de una OF desde la PWA.** Endpoint del Service Layer para pasar la OF a cerrada/cancelada. Cuando lo tengan, lo sumamos del lado nuestro.
- **Documento de recibos y emisiones** en limpio, como quedaron en mandar. Anticipamos una sola condición de diseño: la PWA **no va a bloquear al operario** si SAP rechaza un recibo (por ejemplo, por falta de stock en el depósito por defecto). El recibo queda en una cola visible para planificación y se reintenta con la misma clave.
- Confirmar si existen `PRESUP`, `PREINF` y `VARANG` en el maestro (§7).

### Del lado de INELPA

- **Entorno de test** (proyecto Supabase separado), como pidieron. URL y token se entregan con la convocatoria a la prueba.
- Revisión interna de depósitos (almacén fijo por artículo en la receta).
- Fase siguiente: que la planificación lea el maestro de SAP y trabaje con las órdenes de semielaborados.

---

## 9. Prueba conjunta

Material en `docs/postman/`:

```
INELPA_PWA_API.postman_collection.json     14 requests con tests automáticos
INELPA_PWA_API.postman_environment.json    {{base_url}}, {{service_token}}
```

| Carpeta | Qué prueba |
| --- | --- |
| 1. Artículos | Alta de un transformador con receta, lote de 10 semielaborados, reenvío idéntico, cambio de descripción sin tocar la receta, lote con un artículo inválido, discontinuar. |
| 2. Órdenes | Lote de 7 (las hijas antes que el padre), reenvío del mismo lote, reenvío con una cantidad distinta, semielaborado suelto, artículo no sincronizado, orden no liberada. |
| 3. Seguridad | Sin token, método GET. |

**Cómo correrla:** importar los dos archivos, completar el environment y usar *Run collection*. Cada request tiene sus asserts. La colección es idempotente: se puede correr varias veces y los tests aceptan tanto la primera corrida como las siguientes. Rango de prueba: `docEntry` 9001–9999.

**Qué ya probamos de nuestro lado:** la colección completa, dos corridas seguidas, contra el código real de los endpoints y las funciones SQL sobre Postgres: 68 de 68 asserts en verde.

**Secuencia propuesta para la sesión:**

1. Artículos (carpeta 1), mirando en la base de test que se dieron de alta.
2. Órdenes (carpeta 2), mirando que el transformador quede vinculado con sus bobinas.
3. Si está todo bien, arrancan su desarrollo contra el mismo contrato.

---

*Documento de trabajo. Cualquier punto es discutible: la idea es llegar a la prueba con el contrato cerrado y usar la reunión para verlo funcionar.*
