# SGO — Agenda ISO y Tareas · relevamiento previo a construir

**Fecha:** 12/08/2026 · **Entrevistado:** Lorenzo Palmieri (Gerente de Operaciones)
**Estado:** relevamiento cerrado, construcción NO iniciada.

---

## 1. Objetivo del proceso

Que el área de Sistema de Gestión Operacional llegue a la **reunión semanal** con el
estado ya cargado, en vez de gastar la reunión en ponerse al día. Dos pantallas con
propósitos distintos:

- **Agenda ISO** — el programa anual de compromisos de calidad (documento controlado
  R.I.T 6.2/05). Responde: *qué se me está por vencer*.
- **Tareas SGO** — el trabajo asignado al equipo. Responde: *en qué anda cada uno*.

Son **independientes**: no se vinculan entre sí.

---

## 2. Usuario o destinatario

| Persona | Rol | Qué hace en el módulo |
|---|---|---|
| **Lorenzo** | Gerente de Operaciones | **Da de alta** las tareas y la agenda. Lee. Verifica. |
| **Nicolás** (`nicolas.sgo`) | Auditor de Logística | Ejecuta y **actualiza** sus tareas |
| **Azul** (`azul`) | Auditora ISO y Administración | Ejecuta y actualiza. Emite la agenda (firma el documento) |
| **Lara** (`lara`) | Auditora de Producción | Ejecuta y actualiza |

> **Dato clave de diseño:** el usuario principal de la pantalla de Tareas **no es
> Lorenzo**, son los tres auditores. Si a ellos les resulta incómodo cargar, no se
> carga y el módulo no sirve. Lorenzo es lector.

---

## 3. Flujo paso a paso

1. Lorenzo **crea** la tarea y la asigna a Nicolás, Azul o Lara.
2. El asignado la **toma** y pasa a *en proceso*.
3. Durante la semana el asignado **actualiza**: estado, % de avance, qué hizo y qué
   sigue, y —si corresponde— que está trabado y qué necesita.
4. Si algo queda **7 días sin novedad**, aparece como problema.
5. **Lunes:** la reunión se recorre sobre lo ya cargado.
6. En paralelo, la **Agenda** avisa según criticidad qué compromiso ISO se acerca.

---

## 4. Inputs necesarios

**Agenda ISO** (la carga Lorenzo/Azul, una vez al año):
actividad · categoría (auditoría interna, informe, legal HyS, medición, reunión) ·
norma(s) · criticidad · frecuencia · **semana del año planificada**.

**Tareas SGO** (alta: Lorenzo · actualización: el asignado):
título · asignado · importancia · fecha de compromiso →
estado · % de avance · qué hizo / qué sigue · bloqueo + qué necesita.

**No se pidió:** evidencia adjunta en las tareas. Queda fuera del alcance.

---

## 5. Outputs esperados

- **Agenda:** matriz **año × semana** replicando el R.I.T 6.2/05, con las actividades
  agrupadas en sus tres bloques y las semanas marcadas.
- **Tareas:** vista con **las tres personas en paralelo** + **gráficos** (pedido
  explícito: *"un disparador de tareas con gráficos que sea bien funcional"*).
- Dos listas de excepción: **lo que vence** y **lo que está quieto hace 7 días**.

---

## 5 bis. Tono — condición de diseño

> *"Que sea una planilla amigable para el equipo, que no se sientan presionados,
> que sea una agenda para todos."* — Lorenzo

Esto **no es cosmético**, descarta decisiones concretas:

- **Sin ranking ni comparación entre personas.** La vista por persona existe para
  **repartir carga**, no para medir rendimiento.
- **Sin rojo agresivo ni lenguaje de vencimiento.** El aviso de 7 días se redacta como
  pedido de ayuda — *"esta tarea necesita una mano"* — no como señalamiento.
- **La agenda es de todos**, no el tablero de control del gerente. Los tres auditores
  la ven completa, no solo su parte.

---

## 6. Reglas principales

- **Solo Lorenzo da de alta** tareas y actividades de agenda. Los tres actualizan lo suyo.
- **Aviso de agenda según criticidad** (el campo ya existe): crítica/alta avisan con
  más anticipación que media/baja.
- **Tarea sin novedad 7 días = problema.** El umbral coincide con el ciclo de la reunión.
- Agenda y Tareas **no se cruzan**.

---

## 7. Excepciones y casos límite

- **La marca es el COLOR de la celda, no el texto.** Confirmado por Lorenzo: las letras
  `X` / `x` / `_` son irrelevantes; lo que vale es el casillero pintado. Al importar hay
  que leer `cell.fill`, no `cell.value`. *(Corrección: en una primera lectura solo por
  texto conté 8 actividades en 2026 y reporté que estaba casi vacía — era falso.
  Con el color son **32 en 2026** y **20 en 2025**.)*
- **Una actividad ocupa VARIAS semanas** (ej. *Auditoría interna SST*: Dic 1° y Dic 2°):
  las auditorías se hacen en días distintos. El modelo actual tiene una sola
  `fechaObjetivo` → **hay que pasarlo a varias semanas por actividad y por año** antes
  de importar, o se pierden marcas.
- **Las fechas se reprograman seguido**, y sobre todo lo hace **Azul**. La matriz tiene
  que ser **el editor** (click en la celda para mover la actividad), no una vista
  estática con un modal detrás. Los permisos ya lo permiten: `puedeGestionarAgendaISO`
  incluye a `lorenzo` y `azul`.
- **La agenda es anual y hay dos años vivos** (2025 y 2026, una hoja cada uno). El
  módulo tiene que poder mostrar el año anterior sin mezclarlo.
- **Frecuencia embebida en el nombre**: *"(anual)"*, *"(semestral)"*, *"(trimestral)"*.
  Conviene pasarla al campo `frecuencia` en vez de dejarla en el texto.
- **El SVCC vence el 1 de abril** por regla externa, no por criticidad. Hay reglas
  legales con fecha dura que no salen de la frecuencia.

---

## 8. Criterios de calidad

El módulo funciona si:

1. En **10 segundos** Lorenzo ve qué se vence y en qué anda cada uno.
2. Los tres auditores cargan su avance **sin que haya que perseguirlos** — la prueba
   real es si la reunión del lunes arranca con todo cargado.
3. La agenda en pantalla es **reconocible** contra el R.I.T 6.2/05 en papel.
4. Ninguna actividad ISO llega vencida sin haber avisado antes.

---

## 9. Riesgos y ambigüedades pendientes

| # | Tema | Estado |
|---|---|---|
| 1 | **El módulo SGO no compila.** 14 errores en `ControlesCampoView.tsx` y `evidenciasCampo.ts` (`.document` vs `.documento`, `supabase` posiblemente null, `plantilla_campo_id` a medio agregar en el mapper). **Bloquea el deploy de todo.** | Sin resolver — necesito saber si esa función se termina o se revierte |
| 2 | **La Agenda actual no se parece a la real.** `AgendaISOView` muestra 12 tarjetas de mes con fechas sueltas; el documento real es una matriz de 52 semanas con marcas. | Definido qué hacer, falta hacerlo |
| 3 | *"La otra tiene que ser un disparador de tareas con gráficos"* — lo interpreto como **Tareas SGO**. Falta confirmar. | A confirmar |
| 4 | Qué gráficos exactamente: carga por persona, cumplimiento del programa anual, tareas vencidas por mes. | Sin definir |
| 5 | La agenda es un **documento controlado** (versión, emitido por Azul, aprobado por Palmieri Guillermo). ¿La app tiene que poder exportarlo con ese formato y esas firmas? | Sin definir |

---

## 10. Siguiente acción recomendada

**Orden propuesto** — el primer punto es innegociable, lo demás no llega a producción sin él:

1. **Destrabar la compilación del SGO.** Sin esto no se despliega nada.
2. **Agenda ISO → matriz año × semana.** Reescribir la vista para que replique el
   R.I.T 6.2/05: filas agrupadas en Generales / Documentación legal HyS / Mediciones,
   columnas por mes y semana, marcas clicables. Importar de una vez las ~35
   actividades del Excel para no cargarlas a mano.
3. **Tareas SGO → tablero de las tres personas + gráficos**, con los campos
   *qué hizo / qué sigue* y *bloqueo* como ciudadanos de primera, no escondidos en un
   comentario libre.
4. **Excepciones:** lista de vencimientos por criticidad y lista de tareas quietas 7 días.

---

### Anexo · la Agenda real (R.I.T 6.2/05 V01)

**Tres bloques de filas:**

- **GENERALES** — Auditoría ISO; Auditoría interna SGI; 12 auditorías internas por área
  (Compras, Ventas, Diseño, RRHH, Producción/Laboratorio, Mantenimiento/Automatismo,
  Contabilidad, ITS, Dirección, Logística, SST, SGA); Informe revisión por la dirección;
  Informe mejora continua y no conformidades; Informe transformadores en garantía
  (semestral); Reunión comité mixto (trimestral).
- **ACTUALIZACIÓN DE DOCUMENTACIÓN LEGAL HYS** — SVCC (antes del 1/4), RGL, NTEAR.
- **MEDICIONES** — Ruido, Iluminación, Vibraciones, Puesta a tierra, Calidad de aire,
  Puesto laboral, Agua bacteriológico (semestral), Agua físico-químico, Efluentes,
  Aparatos a presión, Carga térmica.

**Columnas:** 12 meses × semanas 1° a 5° (52 columnas).
**Marcas:** el **casillero pintado** indica la semana. El texto de la celda no importa.

**Programa 2026 (32 actividades) — observaciones de gestión:**

- Las **12 auditorías internas por área caen todas entre octubre y diciembre**
  (Oct 1°–4°, Nov 1°–5°, Dic 1°–4°): doce auditorías en doce semanas corridas, contra
  el cierre de año y para tres auditores. Es el pico de carga del área.
- La **auditoría ISO externa es en marzo (2ª semana)**, es decir *antes* de las internas
  del mismo año: las internas de 2026 preparan la externa de 2027.
- La **Auditoría 5S mensual** estaba en 2025 (12 marcas + 12 de informe) y **no figura
  en 2026**. Confirmar si se discontinuó o si falta cargarla.
