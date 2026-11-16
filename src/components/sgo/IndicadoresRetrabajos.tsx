import type { AreaSGOId } from '../../sgo/types'
import type {
  FilaPareto, KpisRetrabajos, PuntoTendencia, RangoPeriodo, TipoPeriodoRetrabajo, TramoAntiguedad,
} from '../../sgo/kpiRetrabajos'
import { variacion } from '../../sgo/kpiRetrabajos'

// ============================================================
// INDICADORES DE RETRABAJOS (v2.51)
//
// Todo número sale de `sgo/kpiRetrabajos.ts` (una sola función por cálculo).
// Esta pantalla solo los dibuja. Cada tarjeta explica su fórmula en el tooltip
// y compara contra el período anterior. Las barras de área y modelo son
// clickeables: llevan al tablero de Retrabajos ya filtrado.
// ============================================================

const pesos = (v = 0) => `$${Math.round(v).toLocaleString('es-AR')}`
const porc = (v?: number) => (v === undefined ? '—' : `${v.toLocaleString('es-AR')}%`)
const num = (v?: number) => (v === undefined ? '—' : v.toLocaleString('es-AR'))

/** Selector compartido por el tablero y los indicadores. */
export function SelectorPeriodo({ tipo, rango, onTipo, onMover, onHoy }: {
  tipo: TipoPeriodoRetrabajo
  rango: RangoPeriodo
  onTipo: (t: TipoPeriodoRetrabajo) => void
  onMover: (delta: number) => void
  onHoy: () => void
}) {
  return <div className="card sgo-periodo">
    <div className="tabs sgo-periodo-tipos" role="tablist" aria-label="Período">
      {(['semana', 'mes', 'todo'] as const).map((t) => <button key={t} className={`tab ${tipo === t ? 'active' : ''}`} onClick={() => onTipo(t)}>{t === 'semana' ? 'Semana' : t === 'mes' ? 'Mes' : 'Todo'}</button>)}
    </div>
    {tipo !== 'todo' && <div className="sgo-periodo-nav">
      <button className="btn" onClick={() => onMover(-1)} aria-label="Período anterior">‹</button>
      <strong>{rango.etiqueta}</strong>
      <button className="btn" onClick={() => onMover(1)} aria-label="Período siguiente">›</button>
      <button className="btn" onClick={onHoy}>Hoy</button>
    </div>}
    {tipo === 'todo' && <strong className="sgo-periodo-nav">{rango.etiqueta}</strong>}
  </div>
}

/** ▲▼ contra el período anterior. `mejorSi` define el color (verde = mejora). */
function Delta({ actual, anterior, mejorSi, unidad = '' }: { actual?: number; anterior?: number; mejorSi: 'sube' | 'baja'; unidad?: string }) {
  const v = variacion(actual, anterior)
  if (v === undefined) return null
  if (v === 0) return <em className="sgo-delta neutro">= igual que el anterior</em>
  const mejora = mejorSi === 'sube' ? v > 0 : v < 0
  return <em className={`sgo-delta ${mejora ? 'mejora' : 'empeora'}`}>{v > 0 ? '▲' : '▼'} {Math.abs(v).toLocaleString('es-AR')}{unidad} vs. anterior</em>
}

function Tarjeta({ valor, label, tono, ayuda, sub, children }: { valor: string; label: string; tono: string; ayuda: string; sub?: string; children?: React.ReactNode }) {
  return <div className={`card sgo-retrabajo-kpi sgo-rt-kpi tono-${tono}`} title={ayuda}>
    <strong>{valor}</strong><span>{label}</span>
    {sub && <small>{sub}</small>}
    {children}
  </div>
}

function Barras({ titulo, filas, onClick, ayuda }: {
  titulo: string
  filas: { clave: string; label: string; valor: number; texto: string; tono?: string }[]
  onClick?: (clave: string) => void
  ayuda?: string
}) {
  const max = Math.max(1, ...filas.map((f) => f.valor))
  return <div className="card"><div className="section-title">{titulo}</div>
    {ayuda && <div className="meta" style={{ marginBottom: 8 }}>{ayuda}</div>}
    <div className="sgo-mejoras-barras">
      {filas.map((f) => {
        const clickable = Boolean(onClick) && !f.clave.startsWith('__')
        return <div key={f.clave} className={clickable ? 'sgo-barra-click' : undefined} onClick={clickable ? () => onClick!(f.clave) : undefined}
          role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
          onKeyDown={clickable ? (e) => { if (e.key === 'Enter') onClick!(f.clave) } : undefined}>
          <div><span>{f.label}</span><strong>{f.texto}</strong></div>
          <i><span className={f.tono ? `sgo-barra-${f.tono}` : undefined} style={{ width: `${(f.valor / max) * 100}%` }} /></i>
        </div>
      })}
      {!filas.length && <div className="empty">Sin datos en este período.</div>}
    </div>
  </div>
}

function filasPareto(filas: FilaPareto[]) {
  return filas.map((f) => ({ clave: f.clave, label: f.label, valor: f.n, texto: `${f.n} · ${porc(f.pct)} (acum. ${porc(f.acumulado)})` }))
}

export default function IndicadoresRetrabajos({ kpis, anterior, antiguedad, paretoCausa, paretoArea, paretoModelo, tendencia, tipo, onVerArea, onVerModelo, onVerAbiertos }: {
  kpis: KpisRetrabajos
  anterior?: KpisRetrabajos
  antiguedad: TramoAntiguedad[]
  paretoCausa: FilaPareto[]
  paretoArea: FilaPareto[]
  paretoModelo: FilaPareto[]
  tendencia: PuntoTendencia[]
  tipo: TipoPeriodoRetrabajo
  onVerArea: (area: AreaSGOId) => void
  onVerModelo: (modelo: string) => void
  onVerAbiertos: () => void
}) {
  const sinClasificar = paretoCausa.find((f) => f.clave === '__sin__')?.n ?? 0
  const maxTend = Math.max(1, ...tendencia.map((p) => p.casos))
  const tonoToma = kpis.toma.pct === undefined ? 'azul' : kpis.toma.pct >= 90 ? 'verde' : kpis.toma.pct >= 75 ? 'amarillo' : 'rojo'
  const tonoCierre = kpis.cierre.pct === undefined ? 'azul' : kpis.cierre.pct >= 90 ? 'verde' : kpis.cierre.pct >= 75 ? 'amarillo' : 'rojo'
  const mas7 = antiguedad.find((t) => t.id === 'mas7')?.n ?? 0

  return <div className="sgo-rt-indicadores">
    <div className="sgo-rt-kpis">
      <Tarjeta valor={porc(kpis.fpy)} label="Bien a la primera (FPY)" tono="azul"
        ayuda="De las tareas de fabricación terminadas en el período, % que no tuvo ningún retrabajo. Laboratorio se mide aparte (aprobación de ensayos en la Matriz)."
        sub={`${kpis.fpyPorArea.reduce((s, a) => s + a.finalizadas, 0)} tareas terminadas`}>
        <Delta actual={kpis.fpy} anterior={anterior?.fpy} mejorSi="sube" unidad=" pts" />
      </Tarjeta>
      <Tarjeta valor={pesos(kpis.costo.total)} label="Costo de no calidad" tono={kpis.costoValorizadoPct !== undefined && kpis.costoValorizadoPct < 80 ? 'amarillo' : 'rojo'}
        ayuda="Suma del costo registrado en los casos ocurridos en el período. 'Valorizado' = casos con costo definido y material con valor cargado."
        sub={`Valorizado: ${porc(kpis.costoValorizadoPct)} de los casos`}>
        <Delta actual={kpis.costo.total} anterior={anterior?.costo.total} mejorSi="baja" />
      </Tarjeta>
      <Tarjeta valor={`${num(kpis.horasPerdidas)} h`} label="Horas perdidas" tono="amarillo"
        ayuda="Tiempo de retrabajo medido en la tablet, en horas de planta (sin noches ni fines de semana).">
        <Delta actual={kpis.horasPerdidas} anterior={anterior?.horasPerdidas} mejorSi="baja" unidad=" h" />
      </Tarjeta>
      <Tarjeta valor={num(kpis.casos)} label="Casos de retrabajo" tono="azul"
        ayuda="Expedientes de retrabajo ocurridos en el período (por fecha de detección)."
        sub={`Paradas ${kpis.porOrigen.parada_calidad} · Defecto final ${kpis.porOrigen.defecto_final} · Laboratorio ${kpis.porOrigen.laboratorio}`}>
        <Delta actual={kpis.casos} anterior={anterior?.casos} mejorSi="baja" />
      </Tarjeta>
      <Tarjeta valor={porc(kpis.escapeLabPct)} label="Escape a laboratorio" tono={(kpis.escapeLabPct ?? 0) > 0 ? 'rojo' : 'verde'}
        ayuda="Casos detectados recién en Laboratorio ÷ total. Son defectos que pasaron todo el proceso: los más caros.">
        <Delta actual={kpis.escapeLabPct} anterior={anterior?.escapeLabPct} mejorSi="baja" unidad=" pts" />
      </Tarjeta>
      <Tarjeta valor={porc(kpis.reincidenciaPct)} label="Reincidencia" tono={kpis.reincidentes ? 'rojo' : 'verde'}
        ayuda="Casos marcados como reincidentes ÷ total. Mide si las acciones correctivas funcionan."
        sub={`${kpis.reincidentes} caso(s)`}>
        <Delta actual={kpis.reincidenciaPct} anterior={anterior?.reincidenciaPct} mejorSi="baja" unidad=" pts" />
      </Tarjeta>
      <Tarjeta valor={porc(kpis.toma.pct)} label="Tomados en 24 h" tono={tonoToma}
        ayuda="Casos del período tomados dentro del plazo de 24 h. Un caso sin tomar con el plazo vencido cuenta como incumplido. Meta: 90 %."
        sub={kpis.toma.medianaHoras !== undefined ? `Mediana: ${num(kpis.toma.medianaHoras)} h` : undefined}>
        <Delta actual={kpis.toma.pct} anterior={anterior?.toma.pct} mejorSi="sube" unidad=" pts" />
      </Tarjeta>
      <Tarjeta valor={porc(kpis.cierre.pct)} label="Cerrados en plazo (72 h)" tono={tonoCierre}
        ayuda="Casos CERRADOS en el período que se cerraron dentro de las 72 h desde la detección."
        sub={kpis.cierre.medianaDias !== undefined ? `${kpis.cierre.cerrados} cerrados · mediana ${num(kpis.cierre.medianaDias)} días` : `${kpis.cierre.cerrados} cerrados`}>
        <Delta actual={kpis.cierre.pct} anterior={anterior?.cierre.pct} mejorSi="sube" unidad=" pts" />
      </Tarjeta>
      <Tarjeta valor={num(kpis.acciones.vencidas)} label="Acciones vencidas" tono={kpis.acciones.vencidas ? 'rojo' : 'verde'}
        ayuda="Acciones de los casos del período, no verificadas, con fecha de compromiso vencida. Eficacia = verificadas eficaces ÷ verificadas."
        sub={`${kpis.acciones.total} acciones · eficacia ${porc(kpis.acciones.eficaciaPct)}`} />
    </div>

    {mas7 > 0 && <div className="card sgo-rt-alerta" role="button" tabIndex={0} onClick={onVerAbiertos} onKeyDown={(e) => { if (e.key === 'Enter') onVerAbiertos() }}>
      <strong>{mas7} caso(s) abiertos hace más de 7 días.</strong> <span>Tocá para verlos en el tablero.</span>
    </div>}

    <div className="sgo-mejoras-tablero">
      <Barras titulo="Bien a la primera por área" ayuda="Tocá un área para ver sus casos."
        onClick={(clave) => onVerArea(clave as AreaSGOId)}
        filas={kpis.fpyPorArea.map((a) => ({ clave: a.area, label: a.label, valor: a.fpy ?? 0, texto: `${porc(a.fpy)} · ${a.conRetrabajo} de ${a.finalizadas}`, tono: (a.fpy ?? 100) >= 95 ? 'verde' : (a.fpy ?? 100) >= 90 ? 'amarillo' : 'rojo' }))} />
      <Barras titulo="Costo por concepto"
        ayuda={kpis.costoValorizadoPct !== undefined && kpis.costoValorizadoPct < 100 ? `Ojo: ${kpis.casos - kpis.casosValorizados} caso(s) sin costo completo. El total real es mayor.` : undefined}
        filas={[
          { clave: 'mo', label: 'Mano de obra', valor: kpis.costo.manoObra, texto: pesos(kpis.costo.manoObra) },
          { clave: 'mat', label: 'Material', valor: kpis.costo.material, texto: pesos(kpis.costo.material) },
          { clave: 'maq', label: 'Máquina y repuestos', valor: kpis.costo.maquina, texto: pesos(kpis.costo.maquina) },
          { clave: 'otr', label: 'Ensayos, logística y terceros', valor: kpis.costo.otros, texto: pesos(kpis.costo.otros) },
          { clave: 'sd', label: 'Total estimado (sin desglose)', valor: kpis.costo.sinDesglose, texto: pesos(kpis.costo.sinDesglose) },
        ].filter((f) => f.valor > 0)} />
      <Barras titulo="Pareto por causa (6M)"
        ayuda={sinClasificar ? `${sinClasificar} caso(s) sin clasificar todavía (casos abiertos o anteriores a la v2.51).` : 'Las primeras barras explican la mayoría de los casos: atacar esas primero.'}
        filas={filasPareto(paretoCausa)} />
      <Barras titulo="Pareto por área de origen" ayuda="Tocá un área para ver sus casos." onClick={(clave) => onVerArea(clave as AreaSGOId)} filas={filasPareto(paretoArea)} />
      <Barras titulo="Pareto por modelo" ayuda="Tocá un modelo para ver sus casos." onClick={onVerModelo} filas={filasPareto(paretoModelo)} />
      <Barras titulo="Antigüedad de los casos abiertos (hoy)" ayuda="No depende del período: muestra todo lo abierto."
        filas={antiguedad.map((t) => ({ clave: t.id, label: t.label, valor: t.n, texto: String(t.n), tono: t.id === 'mas7' ? 'rojo' : t.id === 'hasta7' ? 'amarillo' : 'verde' }))} />
    </div>

    <div className="card">
      <div className="section-title">Tendencia · últimos {tendencia.length} {tipo === 'semana' ? 'semanas' : 'meses'}</div>
      <div className="sgo-tendencia">
        {tendencia.map((p) => <div key={p.etiqueta} className={p.actual ? 'actual' : undefined} title={`${p.etiqueta}: ${p.casos} caso(s) · ${pesos(p.costo)} · ${p.horas} h perdidas`}>
          <b>{p.casos}</b>
          <i style={{ height: `${(p.casos / maxTend) * 100}%` }} />
          <span>{p.etiqueta}</span>
        </div>)}
      </div>
      <div className="meta">Barras: cantidad de casos. Pasá el mouse para ver costo y horas.</div>
    </div>
  </div>
}
