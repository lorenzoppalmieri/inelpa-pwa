# Lista de pruebas por rol — antes de cada pase a producción

**Cuándo:** en **staging** (https://inelpa-pwa-staging.vercel.app), después del push a `staging` y **antes** de pasar a `main`.
**Tiempo:** 10–15 minutos. Si un paso falla, **no se pasa a producción**: se anota qué falló y se corrige.
**Regla:** solo se prueban los roles que toca el cambio + **siempre** Operario y Planificador (son los que paran la planta si fallan).

Antes de empezar, en cada equipo de prueba: **recargar forzado** (Ctrl+Shift+R) y abrir el diagnóstico al pie de "Mi trabajo": la versión tiene que ser la nueva.

---

## 1. Operario (siempre) — tablet o PC con un usuario de bobinado
- [ ] Inicia sesión y elige su estación. Si tiene tareas en otra estación, aparece el aviso 📌.
- [ ] Si no tiene nada en curso, la pantalla abre en **Pendientes** y se ven sus tareas.
- [ ] **Iniciar** una tarea: pide confirmación y pasa a "En curso".
- [ ] **Cargar una parada** con un motivo: la tarea queda pausada. **Reanudar**: vuelve a "En curso".
- [ ] **Finalizar**: pide confirmación y pasa a "Finalizadas".
- [ ] **Sin Wi-Fi** (modo avión): iniciar y finalizar otra tarea. Volver a conectar: en 1 minuto se sube sola y no queda aviso rojo de sincronización.
- [ ] Diagnóstico al pie → "Buscar mis tareas en el servidor ahora": **sin error**.

## 2. Planificador (siempre)
- [ ] Asignar una tarea nueva a un operario **sin fecha**: en el Gantt queda al final de su cola. El tooltip "¿Por qué arranca acá?" tiene sentido.
- [ ] Esa tarea **aparece en la tablet del operario** en menos de 1 minuto, sin recargar.
- [ ] Editar la tarea (estación u observación) y ver el cambio en la tablet.
- [ ] Eliminar una tarea de prueba: desaparece del Gantt y de la tablet.
- [ ] En el Gantt, con la tarea pausada desde la tablet: la barra crece con la pausa y la pendiente siguiente se corre.
- [ ] El desplegable de OF muestra una OF que ya tiene tareas.
- [ ] Tablero de KPIs carga con el filtro de período (semana / mes).

## 3. SGO (Lara) — si el cambio toca SGO
- [ ] Retrabajos: tomar un caso, completar clasificación de causa, **evidencias con espacios y renglones**, y cerrarlo.
- [ ] Rechazo de laboratorio: pide el área de origen para cerrar.
- [ ] Indicadores: cambiar Semana / Mes con las flechas; tocar un área del Pareto lleva al tablero filtrado.
- [ ] Mejora continua: poner una mejora "En proceso" y guardar sin error.

## 4. Logística / Pañol — si el cambio toca logística o materiales
- [ ] Una solicitud de material desde la tablet aparece en el tablero de logística.
- [ ] Marcarla "en camino" y "entregado": el operario lo ve.

## 5. Laboratorio y Despacho — si el cambio toca ensayos o despacho
- [ ] Una Montaje PO finalizada genera su ficha de ensayo (una sola).
- [ ] Aprobar el ensayo crea el despacho **una sola vez** (reabrir y volver a aprobar no lo duplica).

## 6. Diseño (Martín) — si el cambio toca permisos o planos
- [ ] Ve Producción y SGO, pero **no puede editar** nada.
- [ ] Carga un plano PDF y el visor abre con zoom sin agrandarse solo.

## 7. Encargado — si el cambio toca reparaciones
- [ ] Carga una reparación y aparece en "Reparaciones" (no suma a Fabricación).

---

## Después del pase a producción (2 minutos)
- [ ] Recargar producción y verificar la versión en el diagnóstico de "Mi trabajo".
- [ ] Entrar como un operario real y ver sus pendientes.
- [ ] En el SQL Editor de producción, correr la consulta **A** de `docs/supabase_errores_app_v2.67.sql` (errores de las últimas 24 h). Si aparece algo nuevo con la versión recién subida, avisar.

## Reglas de trabajo
1. **Una sola línea de trabajo por vez en staging.** Lo que no esté listo (ej. SAP) va en su propia rama.
2. **El SQL siempre primero en INELPA-TEST**, después en producción, y verificando el proyecto abierto en el editor.
3. **Pases a producción agrupados**: una o dos veces por semana, no todos los días, salvo urgencias.
4. **Refrescar INELPA-TEST con una copia actual de producción una vez por mes**, para que los problemas de volumen aparezcan en las pruebas.
5. Cada pase queda anotado abajo.

| Fecha | Versión | Probó | Roles probados | Resultado |
|---|---|---|---|---|
| | | | | |
