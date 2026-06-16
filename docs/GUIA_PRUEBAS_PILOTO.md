# Guía de prueba en planta — App de Producción INELPA

**Para:** encargados y operarios de las máquinas elegidas para la prueba.
**Duración de la prueba:** _(completar)_ · **Responsable:** _(completar)_

---

## 1. ¿Para qué es esta prueba?

Vamos a usar la app en unas pocas máquinas, en el trabajo real de todos los días, **antes** de instalarla en toda la planta. La idea es simple: que la usen como la usarían siempre y nos digan **qué funciona bien y qué molesta**. No hay forma de "romperla": es una prueba, para eso está.

> Importante: la tablet **guarda todo aunque te quedes sin Wi-Fi**. Podés seguir trabajando tranquilo; cuando vuelve la señal, sube solo.

---

## 2. El semáforo de conexión (mirá arriba a la derecha)

En la esquina superior de la pantalla hay una luz de color. Te dice cómo está la tablet:

| Color | Qué significa | ¿Puedo seguir trabajando? |
|-------|---------------|---------------------------|
| 🟢 Verde — "En línea" | Todo conectado y al día | Sí |
| 🟡 Amarillo — "Sincronizando" | Está subiendo cambios | Sí |
| 🟠 Naranja — "Sin conexión" + un número | Sin Wi-Fi, pero tus cambios están **guardados** (el número es cuántos faltan subir) | **Sí, tranquilo** |
| 🔴 Rojo — "Sin conexión" | Sin Wi-Fi y sin nada pendiente | Sí |

**Regla de oro:** si ves 🟠 naranja, **seguí trabajando igual**. Nada se pierde.

---

## 3. Paso a paso para el OPERARIO

### 3.1. Entrar a la app
1. Abrí la app en la tablet.
2. **Usuario:** tu nombre de usuario (formato `apellido.nombre`, por ejemplo `carruega.roberto`).
3. **Contraseña:** la que te dieron _(inicial: `inelpa2026`, salvo que ya la hayas cambiado)_.
4. Tocá **Ingresar**.

### 3.2. Elegir tu máquina / estación
1. Al entrar vas a ver las **estaciones de tu sector**.
2. Tocá la **máquina en la que vas a trabajar** (ej. "Máquina 03").
3. Te aparece la **lista de tareas de esa máquina** (tu cola de trabajo).

### 3.3. Trabajar una tarea (los botones)
Cada tarea pasa por estados. Usá los botones grandes:

1. **▶ Empezar** → la tarea pasa de *Pendiente* a **En proceso**. (Tocalo cuando arrancás de verdad.)
2. **⏸ Pausar** → si tenés que frenar (falta material, avería, almuerzo). La tarea queda **Pausada** y te pide el motivo (ver punto 3.4).
3. **▶ Reanudar** → cuando volvés de la pausa.
4. **✓ Finalizar** → cuando terminaste la pieza. La tarea queda **Finalizada**.

> Tocá los botones **en el momento real** en que pasa cada cosa. De eso salen los tiempos y la eficiencia.

### 3.4. Registrar una parada (almuerzo o avería)
Cuando pausás, se abre una ventana para decir **por qué**:

1. En el **buscador** escribí una palabra. Ejemplos:
   - Para el almuerzo: escribí **`almuerzo`**.
   - Para una rotura: escribí **`mantenimiento`**, **`herramienta`** o **`avería`**.
   - Por falta de material: **`alambre`**, **`canales`**, etc.
2. Tocá la causa correcta de la lista.
3. (Opcional) Escribí una observación corta.
4. Confirmá. La parada queda registrada con su hora automáticamente.

> El **almuerzo** es una pausa normal y **no te baja la eficiencia**. Registralo igual, así el tiempo queda bien.

---

## 4. Paso a paso para el ENCARGADO / PLANIFICADOR

Entrás igual (usuario y contraseña). Vas a ver el **Tablero de control** con tres pestañas arriba: **Gantt operativo**, **Eficiencia / KPIs** y **Planificación**.

### 4.1. Ver el Gantt por carriles
1. Entrá a **Gantt operativo**.
2. Arriba elegí **"Agrupar por"**: **Máquina** o **Colaborador**. Cada fila es un **carril** (una máquina o una persona).
3. Cambiá entre **Semana** y **Día** con el botón. En **Día** podés elegir la fecha y el **zoom** (1h / 2h / 4h).
4. Las zonas rayadas son **sin producción** (almuerzo, limpieza, fuera de turno). La línea roja es **"ahora"**.

### 4.2. Mover tareas (arrastrar y soltar)
1. Buscá una barra **gris (pendiente)** — solo esas se pueden mover.
2. **Mantené apretado y arrastrala**:
   - Hacia los **costados** → cambia el **día y la hora** de arranque.
   - Hacia **arriba o abajo** (otro carril) → la pasás a **otra máquina u otro colaborador**.
3. Soltala donde quieras.
4. Fijate qué pasa con las **otras tareas de ese carril**: se reacomodan solas para no pisarse (eso es el "auto-shift"). Respeta almuerzo y limpieza.

> Esto es lo más importante de probar. Mové varias y miramos juntos si quedan **donde las soltaste** y si el reacomodo tiene sentido.

### 4.3. Ver los KPIs / OEE
1. Entrá a **Eficiencia / KPIs**.
2. Arriba cambiá el **período**: **Mes actual / Mes anterior / Acumulado anual** y mirá cómo cambian Disponibilidad, Rendimiento, Calidad y OEE.
3. Probá **Exportar** (baja un Excel) e **Imprimir reporte**.

### 4.4. Planificar (opcional en la prueba)
En **Planificación** podés crear órdenes, **asignar tareas** (elegís orden, sector, **semielaborado**, colaborador, máquina, día y hora) y ver los semielaborados de cada modelo.

---

## 5. Qué mirar y cómo avisarnos (devolución)

Tu opinión es lo más valioso de la prueba. Anotá cualquier cosa rara. Guía de qué observar:

**Funcionamiento**
- ¿Algún botón no responde o hace algo raro?
- Al arrastrar una tarea en el Gantt, ¿**se quedó donde la soltaste** o **"saltó" sola** a otro lado?
- ¿Se reacomodaron bien las demás tareas o quedó algo encimado?

**Conexión (lo más importante en planta)**
- ¿En qué **zonas/máquinas** se pone 🟠 naranja o 🔴 rojo?
- Cuando volviste a tener Wi-Fi, ¿el número de pendientes **bajó a cero** solo?
- ¿Alguna vez **se perdió** algo que habías cargado? (anotá qué y cuándo)

**Comodidad en la tablet**
- ¿Los botones son **lo bastante grandes** para tocar con la mano/guante?
- ¿Se lee bien con la **luz de la planta**?
- ¿La pantalla es cómoda o hay que hacer mucho scroll?

### Cómo reportar
Para cada problema, decinos:
1. **Quién** sos y en **qué máquina/sector** estabas.
2. **Qué hiciste** (los pasos) y **qué esperabas** que pasara.
3. **Qué pasó** en realidad. Si podés, **sacá una foto** de la pantalla.
4. **Hora aproximada** y **color del semáforo** en ese momento.

Mandá todo a: _(WhatsApp / correo / a quién — completar)_

> No hace falta usar términos técnicos. "La barra de la máquina 3 saltó al lunes sola a las 10am" ya nos sirve muchísimo.

¡Gracias por probarla! Con su uso real la dejamos lista para toda la planta.
