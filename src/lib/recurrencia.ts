import type { PlantillaRecurrente, TareaLogistica } from '../types'

// ============================================================
// MOTOR DE TAREAS RECURRENTES (v1.39 → corregido en v1.42) — anti-spam + anti-respawn.
//
// No hay cron de backend fiable en esta PWA offline-first, así que las instancias
// se generan de forma PEREZOSA en el cliente (al abrir la vista de tareas).
//
// PLANTILLA vs INSTANCIA
//   - PlantillaRecurrente (id propio) = la regla ("ronda de las 08:00, L a V").
//     No se ve en el tablero; la administra Giuliano.
//   - TareaLogistica con plantillaId + fechaInstancia = la INSTANCIA de un día.
//     Es la que ve y cierra el operario. Su id es determinístico:
//     `${plantillaId}_${YYYY-MM-DD}` → si dos tablets la crean a la vez es el
//     mismo id y el upsert no duplica.
//
// REGLAS DE GENERACIÓN (todas deben cumplirse para generar):
//   1. La plantilla está activa y hoy es uno de sus días.
//   2. Hoy no está en `salteos` (feriado / excepción).
//   3. La plantilla NO generó ya para hoy (`ultimaGeneracion < hoy`).  ← candado v1.42
//   4. NO existe ninguna instancia de esa plantilla con fecha de hoy,
//      CUALQUIERA SEA SU ESTADO — incluida `finalizada`.                ← candado v1.42
//   5. No hay una instancia anterior todavía abierta (si la de ayer quedó sin
//      cerrar, no se apila la de hoy).
//
// BUG QUE ESTO CORRIGE (v1.42)
//   Antes, el chequeo "ya existe" era `instancias.some(t => t.id === id)`. Como
//   `useLiveQuery` devuelve `undefined` en el primer render y el llamador hacía
//   `?? []`, el motor corría con la lista VACÍA: creaba la instancia de hoy con
//   el mismo id determinístico y el `put` PISABA la tarea ya finalizada,
//   devolviéndola a 'pendiente' (y sincronizando ese pisotón al resto). De ahí
//   que al finalizar la ronda de las 08:00 volviera a aparecer como pendiente.
//   Ahora: el llamador no corre el motor hasta tener los datos cargados, el
//   candado `ultimaGeneracion` corta aunque la lista llegue incompleta, y el
//   escritor nunca sobrescribe un id que ya existe.
// ============================================================

// 'YYYY-MM-DD' local de hoy.
export function hoyLocalISO(d = new Date()): string { return d.toLocaleDateString('en-CA') }

// getDay() de una fecha 'YYYY-MM-DD' interpretada en hora local (mediodía para
// evitar corrimientos por zona horaria).
export function dowDeFecha(fecha: string): number { return new Date(`${fecha}T12:00:00`).getDay() }

export function idInstancia(plantillaId: string, fecha: string): string {
  return `${plantillaId}_${fecha}`
}

// ¿Esta tarea es la instancia de `plantillaId` para el día `fecha`?
// Se mira por fechaInstancia, por fechaProgramada y por id determinístico: con
// cualquiera de las tres que coincida, la instancia del día YA existe.
export function esInstanciaDe(t: TareaLogistica, plantillaId: string, fecha: string): boolean {
  if (t.plantillaId !== plantillaId) return false
  return t.fechaInstancia === fecha
    || t.fechaProgramada === fecha
    || t.id === idInstancia(plantillaId, fecha)
}

// Próxima fecha (posterior a `desde`) en la que la plantilla vuelve a disparar.
// Sirve para mostrarle a Giuliano cuándo reaparece la tarea. Devuelve null si la
// plantilla no tiene días válidos.
export function proximaFecha(p: PlantillaRecurrente, desde = hoyLocalISO()): string | null {
  if (!p.dias?.length) return null
  const base = new Date(`${desde}T12:00:00`)
  for (let i = 1; i <= 14; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    const iso = hoyLocalISO(d)
    if (p.dias.includes(d.getDay()) && !p.salteos?.includes(iso)) return iso
  }
  return null
}

// Devuelve las instancias que faltan crear HOY (una por plantilla como mucho).
// `tareas` = todas las TareaLogistica locales YA CARGADAS (ver guardas en el llamador).
export function instanciasAGenerar(
  plantillas: PlantillaRecurrente[],
  tareas: TareaLogistica[],
  hoy = hoyLocalISO(),
): TareaLogistica[] {
  const dow = dowDeFecha(hoy)
  const ahora = new Date().toISOString()
  const out: TareaLogistica[] = []

  for (const p of plantillas) {
    if (!p.activa) continue
    if (!p.dias.includes(dow)) continue
    if (p.salteos?.includes(hoy)) continue          // feriado / excepción marcada por Giuliano

    // Candado 1 (plantilla): ya se generó para hoy (o para un día posterior).
    if (p.ultimaGeneracion && p.ultimaGeneracion >= hoy) continue

    const instancias = tareas.filter((t) => t.plantillaId === p.id)
    // Candado 2 (instancia): ya existe la de hoy, en el estado que sea.
    // Esto es lo que impide el respawn al finalizarla.
    if (instancias.some((t) => esInstanciaDe(t, p.id, hoy))) continue
    // Candado 3 (anti-apilado): quedó una instancia anterior sin cerrar.
    if (instancias.some((t) => t.estado !== 'finalizada')) continue

    const responsables = p.responsables ?? []
    out.push({
      id: idInstancia(p.id, hoy),
      origen: p.origen ?? 'logistica',
      titulo: p.titulo,
      detalle: p.detalle,
      responsable: responsables.join(', '),
      responsables: responsables.length ? responsables : undefined,
      prioridad: p.prioridad,
      fechaProgramada: hoy,
      estimadoMin: p.estimadoMin,
      estado: 'pendiente',
      creada: ahora,
      creadaPor: 'recurrencia',
      plantillaId: p.id,
      fechaInstancia: hoy,
    })
  }
  return out
}
