# OEE por estación y cuellos de botella — plan antes de programar

## 1. El problema de fondo del OEE actual

`calcularOEE` suma `tiempoDisponible(t)` de cada **tarea** finalizada: todo el tiempo
hábil entre su inicio y su fin. Un montaje que arranca el lunes y termina el viernes
esperando bobinas aporta **35 horas de "tiempo bruto"** aunque nadie lo haya tocado
tres días.

Resultado: el OEE **no mide cuán bien trabajó Montaje**, mide **cuánto tardó el
transformador en atravesar la planta**. Son dos cosas distintas metidas en un número.

### Cómo queda

| Indicador | Base de cálculo | Pregunta que responde |
|---|---|---|
| **OEE** (nuevo) | Tiempo de turno de cada **estación** en el período | ¿Cuánto rinde esta bobinadora / esta línea? |
| **Lead time** (el actual, renombrado) | Duración del **transformador** de punta a punta | ¿Por qué esta entrega se atrasó? |

```
Tiempo de turno del período (525 min/día Lun-Jue · 465 Vie, por estación activa)
  − paradas registradas
  = Tiempo operativo

Disponibilidad = Operativo / Turno
Rendimiento    = (Σ tiempo estándar de lo producido) / Operativo
Calidad        = piezas OK / piezas totales
OEE            = D × R × C
```

Con esta base, el trafo que espera tres días **no castiga a Montaje**: durante esos
días la línea estuvo haciendo otros. Y si de verdad estuvo parada, baja la
disponibilidad — que es correcto y accionable.

### ⚠ La trampa a evitar: qué estaciones entran en el denominador

Hay **30 bobinadoras** en el catálogo pero solo ~16 bobinadores. Si el turno se
calcula sobre las 30, la disponibilidad da ~50% desde el día uno y el indicador nace
roto.

**Criterio propuesto:** solo entran al denominador las estaciones **con actividad en
el período** (al menos una tarea iniciada). Una bobinadora apagada toda la semana no
es "disponibilidad perdida", es capacidad ociosa — y eso se mide aparte, en la cola.

---

## 2. Cuellos de botella — las cuatro señales

### 2.1 Espera causada, cruzada por área ⭐

La más potente y la que hoy nadie usa. **Requiere validar el mapeo de abajo.**

Sale de las paradas ya registradas: cada causa de espera apunta a quién hizo esperar.
Salida: *"Este mes Bobinado le hizo perder 63 h a Montaje."*

### 2.2 Cola acumulada por estación

`Σ (tiempo estándar de las tareas pendientes)` delante de cada estación. Muestra el
cuello **antes** de que explote y dice a quién mandar refuerzo.

### 2.3 Utilización por estación

Sale del OEE nuevo. La estación cerca del 100% es la restricción real de la planta.

### 2.4 Lead time por etapa

Horas del trafo en cada etapa y **horas esperando entre etapas**. Es el que le explica
a Dirección por qué se atrasó una entrega.

---

## 3. Causa de espera → área responsable — ✅ VALIDADO POR LORENZO (20/08/2026)

### Correcciones respecto del borrador

| Causa | Yo proponía | **Lorenzo corrigió** |
|---|---|---|
| Espera de núcleo | Laminado | **Logística** |
| Espera para subir / bajar bobina | Logística | **Bobinado AT** |
| Espera de aislación (canales, pressphan) | Corte aislación | **Logística** |
| Espera soldadora | Mantenimiento | **Bobinado** |
| Espera cuba · falta tapa | Herrería (interno) | **Logística** |

Confirmado también: **Capacitación / reunión / retiro / accidente SÍ se imputan a
RRHH** (no quedan sin imputar), y **Corte de luz** es externo, sin responsable.

### ⚠ Tres cosas que salieron de la validación

**1. `diseno` ya existe** en `AREAS_SGO` (`{ id: 'diseno', label: 'DISEÑO' }`), aunque
no tenga módulo ni usuarios. *"Espera especificaciones técnicas"* se imputa ahí. No
hay que crear nada.

**2. No existe un área RRHH.** La más cercana es `administracion`. Hay que decidir
entre imputar ahí o agregar `rrhh` a `AREAS_SGO` — agregarla toca la matriz SGO, los
indicadores y los KPIs, así que no es gratis.

**3. Dos causas se auto-imputan y NO deben entrar al ranking de "quién me hace
esperar":**

- *Espera para subir / bajar bobina* → Bobinado AT, dentro de Bobinado.
- *Espera soldadora* → Bobinado, dentro de Bobinado (2 soldadoras compartidas).

Un indicador que diga *"Bobinado le hizo perder tiempo a Bobinado"* no sirve para
decidir nada. Las dos son **restricciones internas de recurso**, y como tales apuntan
a una solución concreta y no a un responsable:

- la soldadora es un **cuello de capacidad** (2 máquinas para todo el sector) → se ve
  mejor en la señal de *cola por estación*;
- subir/bajar bobina es una **limitación de manipulación** → la salida es un aparejo
  o una ayuda mecánica, no un reclamo a nadie.

**Propuesta:** van a un bucket aparte, *"Restricciones internas"*, con su tiempo
perdido medido igual pero sin imputación cruzada.

---

## 3 bis. Borrador original (referencia)

Corregí lo que esté mal. Si una causa no corresponde a ningún área (es una espera
externa o del propio sector), marcala como tal.

### Esperas de Montaje

| Causa | Área propuesta |
|---|---|
| Espera de bobina | **Bobinado** |
| Espera de núcleo | **Laminado** |
| Espera prensayugos / chapones / patas / chapa | **Herrería** |
| Espera de tacos / cartones | **Carpintería / Corte aislación** |
| Espera de aislador / tubo oxígeno / consumibles | **Logística (pañol)** |
| Error en entrega de insumos | **Logística (pañol)** |
| Espera ensayo laboratorio · prueba de tensión | **Laboratorio** |
| Falta / espera de aceite | **Logística (pañol)** |

### Esperas de Bobinado

| Causa | Área propuesta |
|---|---|
| Espera producción de BT | **Bobinado BT** |
| Espera producción de aislación | **Corte aislación** |
| Espera de alambre / planchuela / folio | **Logística (pañol)** |
| Espera de canales / consumibles / gas y oxígeno | **Logística (pañol)** |
| Espera para subir / bajar bobina | **Logística (pañol)** |
| Espera de aislación (canales, pressphan) | **Corte aislación** |
| Espera soldadora | **Mantenimiento** |
| Espera especificaciones técnicas / diseño | **Ingeniería / Diseño** ← *¿existe como área?* |

### Esperas de Herrería

| Causa | Área propuesta |
|---|---|
| Espera cuba · falta tapa | **Herrería (interno)** ← *¿o es un proveedor?* |
| Espera materia prima / materiales / consumibles / gas | **Logística (pañol)** |

### Esperas de Pintura

| Causa | Área propuesta |
|---|---|
| Falta de cubas | **Herrería** |
| Falta de material logístico | **Logística (pañol)** |

### Transversales

| Causa | Área propuesta |
|---|---|
| Mantenimiento correctivo / preventivo | **Mantenimiento** |
| Corte de luz | **Externo** (no se le imputa a nadie) |
| Pasillos obstruidos | **Logística (pañol)** |
| Capacitación / reunión / retiro / accidente | **RRHH** — *¿o no se imputa?* |

---

## 4. Orden de construcción propuesto

1. **Motor de cálculo** (`lib/oee.ts`): OEE por estación y período + agregación a
   sector y planta. Puro y testeable, como `ensayoPerdidas.ts`.
2. **Mapeo causa → área** en `types/index.ts`, una vez validado.
3. **Tablero de cuellos**: las cuatro señales en una sola pantalla.
4. **Lead time por etapa**, que necesita cruzar las tareas de un mismo transformador.

Los puntos 1 y 2 son independientes: se pueden hacer en paralelo.

---

## 5. Lo que NO se toca

- `metricasTarea` y las columnas de Detalle por tarea: son otra cosa y funcionan.
- El Gantt.
- El cálculo de demoras justificadas / sin justificar (recién corregido en v1.89).
