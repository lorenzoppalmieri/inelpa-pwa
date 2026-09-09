import { opcionesPeriodo, pidefechas, type Periodo } from '../../lib/periodos'

// ============================================================
// FILTRO DE PERÍODO — UN SOLO COMPONENTE PARA TODA LA APP (v2.07)
//
// Lo usan "Eficiencia / KPIs" y "Asignar tareas". Antes cada pantalla tenía su
// propio filtro y no se parecían: la de KPIs permitía rango personalizado y la
// de tareas no, y esta última tenía además un input de fecha suelto al costado
// que hacía de "día específico" sin decirlo.
//
// Los selectores de fecha aparecen SOLO cuando el período los necesita: si están
// siempre visibles, el usuario no sabe si el que manda es el desplegable o la
// fecha suelta. Ese era exactamente el problema reportado.
// ============================================================
export default function FiltroPeriodo({
  periodo, setPeriodo,
  dia, setDia,
  desde, setDesde,
  hasta, setHasta,
  conTodas = false,
}: {
  periodo: Periodo
  setPeriodo: (p: Periodo) => void
  dia: string
  setDia: (v: string) => void
  desde: string
  setDesde: (v: string) => void
  hasta: string
  setHasta: (v: string) => void
  /** 'Todas' solo tiene sentido en listados de trabajo, no en KPIs. */
  conTodas?: boolean
}) {
  const { dia: pideDia, rango: pideRango } = pidefechas(periodo)

  return (
    <>
      <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)}>
        {opcionesPeriodo(conTodas).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>

      {pideDia && (
        <input
          type="date" className="select" value={dia}
          onChange={(e) => setDia(e.target.value)}
          title="Día a mostrar"
        />
      )}

      {pideRango && (
        <>
          <input
            type="date" className="select" value={desde}
            onChange={(e) => setDesde(e.target.value)}
            title="Desde (inclusive)"
          />
          <input
            type="date" className="select" value={hasta} min={desde}
            onChange={(e) => setHasta(e.target.value)}
            title="Hasta (inclusive)"
          />
        </>
      )}
    </>
  )
}
