# Validación de la integración con SAP Business One

Objetivo: comprobar, **antes del go-live (ago-2026)**, que el esquema de datos de la PWA
(`docs/supabase_schema.sql`) y el mapeo 1:1 (`src/sap/sapMapping.ts`) enganchan
correctamente con los campos nativos y los UDF de SAP B1.

Hoy la app corre en **modo demo offline** (sin backend). La integración SAP no se
puede probar contra producción; por eso la validación es por capas, de menor a
mayor riesgo, y se cierra con un piloto controlado.

---

## 1. Por qué se puede validar sin tener SAP conectado

La PWA nunca habla directo con SAP. El flujo es:

```
Tablet (IndexedDB)  ->  Cola de sync  ->  Supabase (Postgres)  ->  Middleware  ->  SAP B1 Service Layer
   offline-first         outbox            fuente intermedia        ETL/cron        OITM / ProductionOrders / OITT
```

Esto permite testear cada salto por separado. El contrato entre la PWA y SAP está
declarado en `src/sap/sapMapping.ts` (interfaces `SapProductionOrder`, `SapItem`,
`SapBomLine` y los UDF `U_INELPA_*`). Validar = confirmar que ese contrato
coincide con lo que SAP realmente expone.

---

## 2. Capa 1 — Validación estática del contrato (ahora, sin SAP)

Antes de tocar SAP, congelar el contrato y revisarlo con el consultor (Seidor):

1. **Lista de UDF requeridos.** Exportar de `sapMapping.ts` todos los `U_INELPA_*`
   (objeto `UDF` + payload de semielaborados) y entregarla a Seidor como
   especificación. Cada UDF debe definirse en su objeto:
   - `U_INELPA_T_INI/FIN/NETO/PARADA/CAUSA/QC/DEFECTO/AVANCE` → sobre **OPOR/ProductionOrders** (reporte de tarea).
   - `U_INELPA_SECTOR/MODELO/ESTADO/TAREA_ORIGEN/ORDEN_DESTINO` → sobre **OITM** (trazabilidad del semielaborado).
2. **Tabla de equivalencias.** Confeccionar una matriz campo-PWA ↔ campo-SAP
   (tabla, tipo, longitud, obligatoriedad). El tipo y la longitud del UDF deben
   tolerar el dato de la app (ej. timestamps ISO como `Datetime`, causa como
   cadena ≤ 100, estado como `Alpha` con valores `EN_PROCESO/DISPONIBLE/CONSUMIDO`).
3. **Revisión de grupos de artículos.** Confirmar el `ItemsGroupCode` que SAP usará
   para "Semielaborados", para que `leerSemielaborados()` filtre el grupo correcto.

Entregable: documento de mapeo firmado por Seidor. Sin esto, el resto no arranca.

---

## 3. Capa 2 — Validación contra el entorno TEST de SAP (Seidor)

Usar la **base TEST de Seidor** (no producción). Aquí se prueba el contrato vivo.

### 3.1 Autenticación
- `POST {ServiceLayer}/Login` con `{ CompanyDB, UserName, Password }`.
- Confirmar que devuelve `Set-Cookie: B1SESSION=...` y que se reutiliza.
- Probar expiración de sesión y re-login automático.

### 3.2 Lectura (SAP → PWA)
- `GET /ProductionOrders?$top=5` → pasar cada registro por `ordenDesdeSap()` y
  verificar que `nroOrden`, `modelo`, `cantidad`, `fechaEntrega` y `linea` quedan correctos.
- `GET /Items?$filter=ItemsGroupCode eq {grupo}` → pasar por `semielaboradoDesdeSap()`
  y verificar `codigo`, `descripcion`, `sectorOrigen`, `estado`.
- `GET /ProductTrees('{modelo}')` → confirmar que las líneas (ITT1) se leen con
  `leerBom()` y que el semielaborado aparece como componente del modelo.

Criterio de aceptación: el JSON real de SAP se deserializa sin campos faltantes
ni `undefined` en los campos obligatorios del contrato.

### 3.3 Escritura (PWA → SAP)
- `PATCH /ProductionOrders({AbsoluteEntry})` con `tareaAPayloadSap(...)` → verificar
  que los `U_INELPA_*` se persisten y son legibles con un `GET` posterior.
- `PATCH /Items('{ItemCode}')` con `semielaboradoAPayloadSap(...)` → ídem para
  estado/trazabilidad del semielaborado.

Criterio de aceptación: round-trip (escribir → leer) devuelve exactamente lo enviado.

### 3.4 Casos de error
- UDF inexistente → SAP responde 400; el middleware debe loguear y NO marcar la
  operación como sincronizada (reintento). Probarlo borrando un UDF a propósito.
- Concurrencia / locks de SAP, y `B1SESSION` expirada a mitad de lote.

---

## 4. Capa 3 — Validación de la cola offline-first (extremo a extremo)

Esto valida que el modelo offline no rompe nada al subir a SAP:

1. Tablet **sin red**: crear orden, asignar tarea, iniciar, registrar parada,
   finalizar con datos de bobinado. Todo debe quedar en la cola (`syncQueue`).
2. Restaurar red: la cola se vacía contra Supabase; el middleware empuja a SAP TEST.
3. Verificar en SAP TEST que cada `SyncOp` (tarea/parada/orden/semielaborado)
   produjo el `PATCH/POST` esperado, **en orden** y **sin duplicados**
   (idempotencia por `entidadId`; `Prefer: resolution=merge-duplicates`).
4. Probar conflicto: editar la misma orden en SAP y en la tablet offline →
   confirmar la política de resolución (gana SAP / gana última escritura).

---

## 5. Capa 4 — Piloto controlado (pre-go-live)

- **1 sector, 1 semana** (sugerido: Bobinado Distribución AT, ya tiene datos de
  bobinado capturados). Doble carga: tablet + planilla manual de control.
- Reconciliar diario tablet ↔ SAP TEST: tiempos, paradas, calidad, semielaborados.
- KPI de aceptación: ≥ 99 % de operaciones reflejadas en SAP sin intervención
  manual, y diferencia de tiempos reales < 1 min vs. el timestamp del dispositivo.

---

## 6. Checklist de go-live

- [ ] Documento de mapeo de UDF firmado por Seidor (Capa 1).
- [ ] UDF creados en OITM y ProductionOrders en base TEST.
- [ ] Lectura SAP→PWA validada (órdenes, ítems, BOM).
- [ ] Escritura PWA→SAP validada con round-trip.
- [ ] Manejo de errores y reintentos probado.
- [ ] E2E offline→online sin duplicados ni pérdida de orden.
- [ ] Piloto de 1 semana conciliado ≥ 99 %.
- [ ] Política de conflictos definida y probada.
- [ ] Credenciales de producción (Seidor) en variables de entorno, fuera del repo.

---

## 7. Notas de seguridad

- Las credenciales del Service Layer las custodia Seidor; nunca se hardcodean ni
  viajan a la tablet. El Service Layer se llama **solo desde el middleware/servidor**,
  no desde el navegador (evita exponer `B1SESSION` y CORS).
- La tablet autentica contra Supabase Auth (no contra SAP). El hash demo `1234`
  es solo para el modo offline y se elimina en producción.
