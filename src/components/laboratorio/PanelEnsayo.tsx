import { useEffect, useMemo, useState } from 'react'
import type { TareaLaboratorio } from '../../types'
import {
  buscarDatosTecnicos, campoNum, codigoCorto,
  NOMINALES_TENSION, NOMINALES_PERDIDAS, NOMINALES_TODOS, NOMINALES_CONTEXTO, NOMINALES_FICHA, campo,
  type DatoTecnico, type CampoNominal,
} from '../../lib/datosTecnicos'

// ============================================================
// PANEL DE ENSAYO DE LABORATORIO (v1.54)
//
// La tarea ya viene de Montaje con el MODELO y el N° DE SERIE, así que el
// laboratorista no vuelve a cargarlos. El panel:
//   1. busca los parámetros garantizados del modelo en `datos_tecnicos`,
//   2. los muestra como referencia de solo lectura,
//   3. toma los valores REALES medidos y los compara contra el nominal.
//
// La lectura sale del espejo local (Dexie) y solo va a Supabase si el modelo
// todavía no está descargado — así el laboratorio sigue trabajando sin señal.
// ============================================================

// Campos que carga el laboratorista, agrupados por ensayo.
interface CampoMedido { key: string; label: string; unidad: string; nominal?: string; paso?: string }

const ENSAYO_VACIO: CampoMedido[] = [
  { key: 'u0', label: 'Tensión aplicada (U0)', unidad: 'V', paso: '0.1' },
  { key: 'po', label: 'Pérdidas en vacío (Po)', unidad: 'W', nominal: 'po', paso: '0.1' },
  { key: 'io', label: 'Corriente de vacío (Io)', unidad: '%', nominal: 'io', paso: '0.01' },
]

const ENSAYO_CORTOCIRCUITO: CampoMedido[] = [
  { key: 'ucc', label: 'Tensión de cortocircuito (Ucc)', unidad: '%', nominal: 'ucc', paso: '0.01' },
  { key: 'pcc', label: 'Pérdidas en carga (Pcc)', unidad: 'W', nominal: 'pcc', paso: '0.1' },
  { key: 'icc', label: 'Corriente de ensayo (Icc)', unidad: 'A', nominal: 'i1n', paso: '0.01' },
  { key: 'tamb', label: 'Temperatura ambiente', unidad: '°C', paso: '0.1' },
]

const MEDIDOS_TODOS = [...ENSAYO_VACIO, ...ENSAYO_CORTOCIRCUITO]

// Formatea un número para mostrar (sin decimales de más).
function fmt(n?: number): string {
  if (n === undefined) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

export default function PanelEnsayo({ tarea, soloLectura = false }: {
  tarea: TareaLaboratorio
  soloLectura?: boolean
}) {
  const [fila, setFila] = useState<DatoTecnico | undefined>()
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [origen, setOrigen] = useState<'local' | 'nube' | 'ninguno'>('ninguno')
  const [medidos, setMedidos] = useState<Record<string, string>>({})

  // Busca los parámetros del modelo al montar (y si cambia el modelo).
  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    void (async () => {
      const r = await buscarDatosTecnicos(tarea.modelo)
      if (!vivo) return
      setFila(r.fila); setOrigen(r.origen); setError(r.error ?? '')
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [tarea.modelo])

  // Valor nominal de un campo (ya normalizado a número).
  const nominal = useMemo(() => {
    const out: Record<string, number | undefined> = {}
    for (const c of NOMINALES_FICHA) out[c.key] = campoNum(fila, ...c.alias)
    return out
  }, [fila])

  // Desvío % del valor medido contra el garantizado.
  function desvio(m: CampoMedido): { pct: number; alto: boolean } | null {
    if (!m.nominal) return null
    const nom = nominal[m.nominal]
    const med = Number(String(medidos[m.key] ?? '').replace(',', '.'))
    if (!nom || !Number.isFinite(med) || med === 0) return null
    const pct = ((med - nom) / nom) * 100
    // Referencia habitual de tolerancia en ensayos de rutina.
    return { pct: Math.round(pct * 10) / 10, alto: Math.abs(pct) > 10 }
  }

  function guardar() {
    const valores = Object.fromEntries(
      MEDIDOS_TODOS.map((m) => [m.key, medidos[m.key] ? Number(String(medidos[m.key]).replace(',', '.')) : null]),
    )
    // Por ahora solo se registra en consola (pendiente: persistir el ensayo).
    console.log('[Ensayo de laboratorio]', {
      laboratorioId: tarea.id,
      modelo: tarea.modelo,
      nroSerie: tarea.nroSerie,
      nominales: nominal,
      medidos: valores,
    })
  }

  const celda = (c: CampoNominal) => (
    <div key={c.key} className="tot-card">
      <div className="l">{c.label} ({c.unidad})</div>
      <div className="n">{fmt(nominal[c.key])}</div>
    </div>
  )

  const inputs = (titulo: string, campos: CampoMedido[]) => (
    <>
      <div className="section-title" style={{ margin: '14px 0 8px' }}>{titulo}</div>
      <div className="form-grid">
        {campos.map((m) => {
          const d = desvio(m)
          const nom = m.nominal ? nominal[m.nominal] : undefined
          return (
            <div className="field" key={m.key}>
              <label>{m.label} [{m.unidad}]</label>
              <input
                className="input" type="number" inputMode="decimal" step={m.paso ?? 'any'}
                value={medidos[m.key] ?? ''}
                disabled={soloLectura}
                onChange={(e) => setMedidos((v) => ({ ...v, [m.key]: e.target.value }))}
                placeholder={nom !== undefined ? `garantizado ${fmt(nom)}` : ''}
              />
              {d && (
                <div className="meta" style={{ marginTop: 4, color: d.alto ? 'var(--rojo)' : 'var(--estado-fin)' }}>
                  {d.pct > 0 ? '+' : ''}{d.pct}% vs garantizado{d.alto ? ' · fuera de tolerancia' : ''}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )

  return (
    <div>
      {/* --- Cabecera: lo que ya trae la tarea desde Montaje --- */}
      <div className="card" style={{ borderLeft: '5px solid var(--azul-claro)' }}>
        <div className="meta">Modelo en ensayo</div>
        <h3 style={{ margin: '2px 0 6px' }}>{tarea.modelo || '—'}</h3>
        <div className="meta">
          N° de serie <strong style={{ color: 'var(--azul-claro)', fontSize: '1.05rem' }}>{tarea.nroSerie || '— sin asignar —'}</strong>
          {tarea.ot ? <> · OT {tarea.ot}</> : null}
          {tarea.cliente ? <> · {tarea.cliente}</> : <> · Stock</>}
        </div>
        {fila && (
          <div className="meta" style={{ marginTop: 6 }}>
            Código técnico <strong>{codigoCorto(tarea.modelo)}</strong>
            {nominal.sn !== undefined ? <> · {fmt(nominal.sn)} kVA</> : null}
            {campo(fila, 'iram', 'IRAM') ? <> · IRAM {String(campo(fila, 'iram', 'IRAM'))}</> : null}
          </div>
        )}
      </div>

      {/* --- Valores nominales garantizados (solo lectura) --- */}
      <div className="section-title" style={{ margin: '14px 0 8px' }}>
        Valores nominales garantizados
        {origen === 'local' && <span className="rol-badge" style={{ marginLeft: 8 }}>base local</span>}
        {origen === 'nube' && <span className="rol-badge" style={{ marginLeft: 8 }}>desde la nube</span>}
      </div>

      {cargando ? (
        <div className="meta">Buscando parámetros de {codigoCorto(tarea.modelo)}…</div>
      ) : error ? (
        <div className="card" style={{ borderLeft: '4px solid var(--rojo)' }}>
          <div className="meta" style={{ color: 'var(--rojo)', fontWeight: 700 }}>⚠ {error}</div>
          <div className="meta" style={{ marginTop: 4 }}>
            Podés cargar igual los valores medidos; lo que no se muestra es la referencia garantizada.
          </div>
        </div>
      ) : (
        <>
          <div className="meta" style={{ marginBottom: 6 }}>Tensiones y corrientes</div>
          <div className="tot-cards">{NOMINALES_TENSION.map(celda)}</div>
          <div className="meta" style={{ margin: '10px 0 6px' }}>Pérdidas y porcentajes</div>
          <div className="tot-cards">{NOMINALES_PERDIDAS.map(celda)}</div>

          <div className="meta" style={{ margin: '10px 0 6px' }}>Otros valores de referencia</div>
          <div className="tot-cards">{NOMINALES_CONTEXTO.filter((c) => c.key !== 'sn').map(celda)}</div>

          {/* Diagnóstico: si algún parámetro quedó vacío, es que la columna de la
              planilla se llama distinto. Se listan las columnas reales recibidas. */}
          {fila && NOMINALES_TODOS.some((c) => nominal[c.key] === undefined) && (
            <details style={{ marginTop: 10 }}>
              <summary className="meta" style={{ cursor: 'pointer', color: 'var(--naranja)' }}>
                ⚠ Hay parámetros sin valor — ver columnas disponibles
              </summary>
              <div className="meta" style={{ marginTop: 6 }}>
                Columnas de <code>datos_tecnicos</code>: {Object.keys(fila).join(' · ')}
              </div>
            </details>
          )}
        </>
      )}

      {/* --- Valores medidos --- */}
      {inputs('Ensayo de vacío', ENSAYO_VACIO)}
      {inputs('Ensayo de cortocircuito', ENSAYO_CORTOCIRCUITO)}

      {!soloLectura && (
        <button className="btn btn-primary btn-bloque" style={{ marginTop: 12 }} onClick={guardar}>
          💾 Guardar ensayo
        </button>
      )}
    </div>
  )
}
