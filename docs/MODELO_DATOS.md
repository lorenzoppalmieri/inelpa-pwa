# Modelo de Datos

## Diagrama de relaciones

```
usuarios ──< usuario_sectores >── sectores
   │                                  │
   │ (operario_id)        (sector_id) │
   ▼                                  ▼
 tareas ──────────────────────────────
   │  (orden_id)        (1:N)
   ▼                      ▼
 ordenes               paradas
```

- **usuarios** N:N **sectores** (un encargado gestiona varios; un operario tiene 1).
- **ordenes** 1:N **tareas** (una orden genera tareas en varios sectores).
- **tareas** 1:N **paradas** (cada tarea puede tener varias demoras).

## Entidades

### Usuario (3 niveles)
`id, nombre, usuario, passwordHash, rol, sectores[], activo`
Rol ∈ {operario, encargado, planificador}. La matriz de permisos vive en `src/auth/roles.ts` y se replica como RLS en Postgres.

### Sector (los 13)
`id, nombre, linea, supervisor, operarios`. Línea ∈ {distribucion, rural, general}. Catálogo completo en `src/types/index.ts` (`SECTORES`).

### OrdenProduccion → SAP `ProductionOrders`
`id, nroOrden, nroContrato, modelo, linea, cantidad, fechaEntrega`.

### Tarea → SAP `ProductionOrders` + UDF
`id, ordenId, sectorId, operarioId, modelo, fase, nroTransformador, semana, prioridad, estado, tiempoEstandarMin, inicioReal, finReal, calidadOk, defecto, paradas[]`.
Estado ∈ {pendiente, en_proceso, pausada, finalizada}. `inicioReal`/`finReal` son los timestamps automáticos.

### Parada → SAP UDF/UDO
`id, tareaId, causa, inicio, fin, observacion`. Causa precargada ∈ 7 opciones (ver `CAUSAS_PARADA`). `fin` nulo = parada en curso.

### SyncOp (cola offline)
`id, entidad, entidadId, tipo, payload, ts, sincronizado`. No se persiste en SAP; es infraestructura de sync local.

## Mapeo SAP B1 (resumen, ver `src/sap/sapMapping.ts`)

**SAP → App (lectura):** Órdenes de fabricación, N° transformador/contrato (Orden de venta), modelo (Oferta), operarios (Empleados), estado y materiales de la orden.

**App → SAP (escritura, UDF a crear por el consultor):**
`U_INELPA_T_INI` (inicio), `U_INELPA_T_FIN` (fin), `U_INELPA_T_NETO` (tiempo neto), `U_INELPA_PARADA` (min parada), `U_INELPA_CAUSA`, `U_INELPA_QC` (calidad), `U_INELPA_DEFECTO`, `U_INELPA_AVANCE` (% avance).

Mecanismo: **Service Layer (REST)**, base TEST disponible (Seidor). URL base ejemplo: `https://sapint-inelpa:8443/b1s/v1`.

## KPIs derivados (calculados, no almacenados)

- **OEE** = Disponibilidad × Rendimiento × Calidad.
  - Disponibilidad = (bruto − paradas) / bruto
  - Rendimiento = tiempo estándar / tiempo neto
  - Calidad = piezas OK / piezas totales
- **Real vs Estándar** por modelo (% desvío).
- **Pareto de demoras** (minutos por causa + % acumulado).
- **Eficiencia por operario** (activo vs parada).

Fórmulas en `src/lib/kpi.ts`. En producción se materializan en la vista `v_tarea_metricas` (ver SQL).
