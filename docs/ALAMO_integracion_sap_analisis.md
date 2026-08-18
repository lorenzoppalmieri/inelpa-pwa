# Propuesta ALAMO — Integración SAP B1 ↔ PWA · qué mirar antes de firmar

**Propuesta:** 14/08/2026 · **Monto:** $6.500.000 + impuestos · **Plazo:** 90 días
**Vigencia:** 15 días corridos · **Pago:** 50% anticipo, saldo contra entregables, **ajustado por IPCBA**

---

## Lo primero: el alcance no es el que habíamos acordado

En las conversaciones previas con ALAMO el alcance eran **dos flujos**:

1. SAP emite la OF → aparece en la PWA
2. La PWA informa el semielaborado terminado → alta de stock en SAP

La propuesta trae **cinco frentes**: artículos/BOM, órdenes, **colaboradores**, **centros de trabajo**, y el modelado del recibo de fabricación. Los dos del medio no estaban y son los más riesgosos (ver abajo).

---

## Los 5 puntos que más pueden doler

### 1. La API que hay que construir NO está en el presupuesto — y no existe hoy

De la sección SUPUESTOS, textual:

> *"La PWA debe contar con su propia API desarrollada y disponible para recibir los datos que el addon le envíe. El addon no escribe directamente sobre la base Supabase. El desarrollo, exposición y mantenimiento de esa API es responsabilidad del equipo de desarrollo de la PWA y **queda fuera del alcance de este proyecto**."*

**Estado real:** la PWA es un front estático (React + Vite) sobre Vercel que habla directo con Supabase. **No hay backend.** Existe una sola Edge Function (`purgar-fotos-despacho`), así que la infraestructura está, pero la API de ingesta hay que escribirla entera: endpoints, autenticación del addon, validación, idempotencia, logs y manejo de errores.

**Es trabajo nuestro, no está en los $6.5M y no está en los 90 días.** Hay que estimarlo aparte antes de firmar, porque condiciona el cronograma completo: si la API no está lista, el addon de ALAMO no tiene contra qué probar.

### 2. La Fase 2 no es una implementación: es un documento y una capacitación

Textual del Módulo 2.2:

> *"No aplica desarrollo de código productivo por parte de este proyecto en este módulo: es transferencia de conocimiento."*
> *"Si se acuerda que además se entrega una implementación de referencia (prueba de concepto), debe explicitarse como alcance adicional."*

O sea: **de los dos flujos, ALAMO construye uno solo.** El de PWA → SAP —el que da de alta el stock, el que le interesa a Administración— lo entregan como mapeo en papel más sesiones de capacitación. El código lo escribimos nosotros.

No está mal en sí, pero hay que entrar sabiéndolo y no descubrirlo en el día 80.

### 3. Sincronizar `usuarios` desde SAP puede dejar la planta sin poder loguear

Es el riesgo más alto de toda la propuesta, y la propia propuesta lo deja **pendiente de definición** ("Manejo de conflictos … define la lógica de quién gana").

Lo que hay hoy en `usuarios` y **SAP no tiene**:

- usuario `apellido.nombre` + email sintético `@inelpa.local`
- `auth_id` → el vínculo con Supabase Auth. **Si se pisa, el login falla** con *"La cuenta no tiene un perfil de planta asignado"*. Ya nos pasó cuatro veces por otras causas.
- rol interno de la PWA (operario / encargado / planificador / laboratorio / mantenimiento)
- sectores asignados (`usuario_sectores`)
- **cuentas de equipo** (`montaje_linea2_par`, `montaje_linea2_por`) — no son personas, son tablets compartidas. En SAP no existen y una baja automática las borraría.

**Exigir por escrito:** la sincronización toca **solo** nombre y estado activo/inactivo; nunca `auth_id`, `rol`, `usuario`, ni `usuario_sectores`. Y que las cuentas que no existen en SAP **no se den de baja**.

Antes de aceptar este módulo conviene preguntarse algo más simple: **¿el maestro de empleados de SAP está realmente al día?** Si la nómina la manejamos en la PWA y en SAP está desactualizada, este módulo agrega riesgo sin agregar valor. **Se puede sacar del alcance y bajar el precio.**

### 4. `maquinas` y el catálogo tienen lógica nuestra que SAP no conoce

**Máquinas:** las 30 bobinadoras son un **pool** que la app genera sola (`m_bob_01..30`, `generarMaquinas()`), más boxes, líneas y estaciones. ¿SAP tiene centros de trabajo cargados con ese detalle? Si no los tiene, este módulo tampoco aporta.

**Catálogo:** hoy son dos JSON dentro del build — **255 modelos y 1600 componentes** — y cada componente tiene un `sectorId` que es **una asignación nuestra** (BOBALT → `bob_dist_at`, CUBRUR → `soldadura_rural`, etc.). SAP no sabe nada de nuestros sectores. La propuesta dice *"respetando el sector productivo asociado a cada componente"*: **hay que preguntar de dónde piensan sacar ese dato.** Si no está en SAP, la tabla de mapeo la mantenemos nosotros y el addon tiene que respetarla.

Además, mover el catálogo de un JSON del build a Supabase es un cambio nuestro, no de ALAMO.

**Un caso concreto:** el artículo **PROTOTIPO** no existe en SAP. El módulo 1.1 dice que va a *"reflejar bajas o discontinuaciones para que la PWA no siga ofreciendo artículos dados de baja"*. Hay que asegurarse de que eso **no lo elimine**.

### 5. La contradicción de la VPN sigue sin resolverse

Lo que nos dijeron antes: SAP está en la nube detrás de VPN, y por eso **ambos flujos los inicia SAP**. Pero la Fase 2 plantea que **la PWA llame al Service Layer**.

La PWA corre en el navegador de las tablets. **No puede entrar a una VPN.** Y las claves de un front son públicas por definición (`VITE_*`), así que las credenciales de SAP no pueden vivir ahí.

Conclusión: la llamada al Service Layer tiene que salir **del lado del servidor** — otra Edge Function, con las credenciales guardadas como secreto. **Más trabajo nuestro que la propuesta no contempla.** Esto tiene que quedar cerrado en el Discovery, no después.

---

## Lo que hay que llevar cerrado al Discovery

La propuesta lista las decisiones pendientes con honestidad, pero **el precio es fijo y las decisiones se toman después**. Ahí es donde aparece el *"eso es alcance adicional"*. Conviene entrar con estas respuestas ya escritas:

| # | Pregunta | Por qué importa |
|---|---|---|
| 1 | ¿Quién construye y cuándo la API de ingesta de la PWA? ¿Entra en los 90 días? | Sin ella el addon no tiene destino |
| 2 | ¿La Fase 2 incluye una PoC funcionando o solo el documento? ¿Cuánto costaría la PoC? | Define si el alta de stock funciona este año |
| 3 | ¿Desde dónde llama la PWA al Service Layer si SAP está detrás de VPN? | Puede obligar a otro componente server-side |
| 4 | ¿La sync de `usuarios` toca `auth_id`, `rol` o `usuario_sectores`? | Riesgo de dejar la planta sin login |
| 5 | ¿Qué pasa con usuarios de la PWA que no existen en SAP (cuentas de equipo)? | No se pueden dar de baja |
| 6 | ¿De dónde sale el `sectorId` de cada componente? | SAP no conoce nuestros sectores |
| 7 | ¿Cómo se evita que la baja automática elimine el artículo PROTOTIPO? | Lo usamos para desarrollos |
| 8 | Idempotencia del recibo: ¿SAP acepta una clave nuestra o devuelve el DocEntry? | **Sin esto se duplican recibos** — ya nos pasó con los despachos |
| 9 | ¿SAP acepta recibos con fecha pasada? | Las tablets finalizan **offline**; el envío puede salir horas después |
| 10 | ¿Hay entorno de QAS/sandbox para probar sin tocar producción? | Se preguntó antes y quedó sin respuesta |

---

## Puntos comerciales

- **Vigencia de 15 días.** Si se define después, hay que pedir revalidación.
- **Ajuste por IPCBA** del saldo desde la aprobación hasta la certificación. Sobre 90 días de plazo, no es menor: conviene estimar el monto final, no el de hoy.
- **Cláusula de aceptación automática:** *"transcurran 14 días desde la fecha de entrega para testing y no se cuente con feedback"*. Hay que **reservar gente para testear** en esa ventana o se aprueba solo.
- Los importes **no incluyen impuestos**.
- El plazo corre desde el **comprobante de pago del anticipo**, no desde la firma.
- El perfil pedido para el Líder de Proyecto del cliente menciona *"liquidación de jornales"* — parece copiado de otra propuesta. Vale confirmarlo, no vaya a ser que el alcance también tenga restos de otro proyecto.

---

## Recomendación

**El proyecto tiene sentido y el proveedor es honesto** — deja las decisiones pendientes escritas en vez de esconderlas.

Pero antes de firmar conviene:

1. **Estimar la API de ingesta y el componente server-side del Service Layer.** Es trabajo nuestro, es sustancial y hoy no está presupuestado en ningún lado. Sin ese número, el costo real del proyecto es desconocido.
2. **Evaluar sacar del alcance los módulos 1.3 (colaboradores y centros de trabajo).** Son los de mayor riesgo y menor valor: la nómina y las máquinas ya las gestionamos nosotros con lógica que SAP no tiene. Debería bajar el precio.
3. **Pedir que la Fase 2 incluya la PoC** o dejar por escrito que el alta de stock en SAP no queda operativa al terminar el proyecto.
