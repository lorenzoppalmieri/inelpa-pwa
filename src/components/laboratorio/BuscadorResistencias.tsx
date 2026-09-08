import { useEffect, useState } from 'react'
import { buscarResistencias, type RegistroLab, type NominalesRegistro } from '../../lib/registroLab'

// ============================================================
// BUSCADOR DE RESISTENCIAS DE ARROLLAMIENTO (v1.101)
//
// Del documento de Laboratorio:
//   "se dispondrá de una herramienta que permita buscar todas las resistencias
//    medidas sobre transformadores de igual modelo y versión de diseño que el
//    espécimen que se esté ensayando (...) indicando a que número de fabricación
//    corresponden y la fecha de la medición; entonces el laboratorista
//    seleccionará el más adecuado (o si estos valores son muy antiguos, tomará
//    la decisión de realizar la medición.) Es importante que este buscador solo
//    trabaje sobre valores que efectivamente fueron medidos."
//
// El filtro de "sólo medidos" lo aplica la consulta (`res_origen = 'medido'`).
// Acá se agrega lo que el documento pide para DECIDIR: número de fabricación,
// fecha y, sobre todo, la ANTIGÜEDAD en claro. Una lista de fechas sueltas
// obliga a hacer la cuenta mentalmente; "hace 2 años y 3 meses" no.
// ============================================================

/** A partir de cuántos días una medición se marca como vieja. */
const DIAS_VIEJO = 365

function antiguedad(fecha: string): { dias: number; texto: string } {
  const t = Date.parse(fecha)
  if (!Number.isFinite(t)) return { dias: 0, texto: '—' }
  const dias = Math.max(0, Math.floor((Date.now() - t) / 86400000))
  if (dias < 31) return { dias, texto: `hace ${dias} día${dias === 1 ? '' : 's'}` }
  const meses = Math.floor(dias / 30.44)
  if (meses < 12) return { dias, texto: `hace ${meses} mes${meses === 1 ? '' : 'es'}` }
  const anios = Math.floor(meses / 12)
  const resto = meses % 12
  return { dias, texto: `hace ${anios} año${anios === 1 ? '' : 's'}${resto ? ` y ${resto} m` : ''}` }
}

function f(v?: number, d = 4): string {
  return v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ',')
}

export interface ResistenciasCopiadas {
  rUV?: number; rVW?: number; rWU?: number; rUN?: number
  rUn?: number; rVn?: number; rWn?: number
  tR?: number
}

export default function BuscadorResistencias({
  modelo, versionDiseno, material, nom, excluirId, nf, onCopiar, onCerrar,
}: {
  modelo: string
  versionDiseno: string
  material?: string
  nom?: NominalesRegistro
  excluirId?: string
  nf: 1 | 3
  onCopiar: (r: ResistenciasCopiadas, origen: RegistroLab) => void
  onCerrar: () => void
}) {
  const [filas, setFilas] = useState<RegistroLab[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  // Por defecto se exige que coincidan también las tensiones y la potencia: es
  // la definición de "equivalente" del documento. Se puede aflojar, pero
  // conscientemente y con el aviso a la vista.
  const [estricto, setEstricto] = useState(true)

  // OJO CON LAS DEPENDENCIAS: `nom` llega como objeto literal desde el panel, o
  // sea que es una referencia NUEVA en cada render del padre. Ponerlo tal cual
  // en el array haría que el efecto se dispare siempre, y como el efecto llama a
  // setState, el componente entraría en un bucle de consultas a Supabase. Por
  // eso se depende de los tres números sueltos y el objeto se arma adentro.
  const { snKVA, un1KV, un2KV } = nom ?? {}
  useEffect(() => {
    let vivo = true
    setCargando(true); setError('')
    void (async () => {
      try {
        if (!navigator.onLine) {
          if (vivo) { setError('Sin conexión: el buscador consulta el Registro General en la nube.'); setFilas([]) }
          return
        }
        const r = await buscarResistencias({
          modelo, versionDiseno, material,
          nom: estricto ? { snKVA, un1KV, un2KV } : undefined,
          excluirId,
        })
        if (vivo) setFilas(r)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => { vivo = false }
  }, [modelo, versionDiseno, material, snKVA, un1KV, un2KV, excluirId, estricto])

  const copiar = (r: RegistroLab) => {
    onCopiar({
      rUV: r.rUV, rVW: r.rVW, rWU: r.rWU, rUN: r.rUN,
      rUn: r.rUn, rVn: r.rVn, rWn: r.rWn, tR: r.resTemp,
    }, r)
  }

  return (
    <div className="card" style={{ borderLeft: '4px solid var(--azul-claro)', marginTop: 10 }}>
      <div className="card-header">
        <div>
          <h3 style={{ margin: 0 }}>Resistencias medidas en máquinas equivalentes</h3>
          <div className="meta">
            {modelo} · versión <strong>{versionDiseno}</strong>
            {material ? ` · ${material}` : ''}
          </div>
        </div>
        <button className="btn" onClick={onCerrar}>Cerrar</button>
      </div>

      <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: '8px 0' }}>
        <input type="checkbox" checked={estricto} onChange={(e) => setEstricto(e.target.checked)} />
        Exigir además iguales potencia y tensiones nominales
      </label>
      {!estricto && (
        <div className="meta" style={{ color: 'var(--naranja)', marginBottom: 8 }}>
          ⚠ Estás viendo unidades del mismo modelo y versión pero sin verificar que coincidan
          la potencia y las tensiones. Revisá que sea realmente la misma máquina antes de copiar.
        </div>
      )}

      {error && (
        <div className="meta" style={{ color: 'var(--rojo)', fontWeight: 700 }}>⚠ {error}</div>
      )}

      {cargando ? (
        <div className="meta">Buscando…</div>
      ) : filas.length === 0 && !error ? (
        <div className="meta">
          No hay ninguna medición registrada para esta combinación. Va a haber que
          <strong> medir las resistencias sobre esta máquina</strong>.
          {estricto ? ' También podés destildar la coincidencia de potencia y tensiones para ampliar la búsqueda.' : ''}
        </div>
      ) : (
        <>
          <div className="meta" style={{ marginBottom: 6 }}>
            {filas.length} medición{filas.length === 1 ? '' : 'es'}, de la más reciente a la más vieja.
            Sólo aparecen valores <strong>efectivamente medidos</strong>.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tabla-detalle">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>N° de fabricación</th>
                  <th>Serie</th>
                  {nf === 3 ? (
                    <>
                      <th className="num">1U-1V [Ω]</th>
                      <th className="num">1V-1W [Ω]</th>
                      <th className="num">1W-1U [Ω]</th>
                      <th className="num">2u-2n [mΩ]</th>
                      <th className="num">2v-2n [mΩ]</th>
                      <th className="num">2w-2n [mΩ]</th>
                    </>
                  ) : (
                    <>
                      <th className="num">1U-1N [Ω]</th>
                      <th className="num">2u-2n [mΩ]</th>
                    </>
                  )}
                  <th className="num">Temp. [°C]</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r) => {
                  const a = antiguedad(r.fecha)
                  const viejo = a.dias > DIAS_VIEJO
                  return (
                    <tr key={r.id}>
                      <td>
                        {r.fecha}
                        <div className="meta" style={{ color: viejo ? 'var(--naranja)' : undefined }}>
                          {a.texto}{viejo ? ' ⚠' : ''}
                        </div>
                      </td>
                      <td>{r.nroFabricacion ?? '—'}</td>
                      <td>{r.nroSerie ?? '—'}</td>
                      {nf === 3 ? (
                        <>
                          <td className="num">{f(r.rUV)}</td>
                          <td className="num">{f(r.rVW)}</td>
                          <td className="num">{f(r.rWU)}</td>
                          <td className="num">{f(r.rUn, 3)}</td>
                          <td className="num">{f(r.rVn, 3)}</td>
                          <td className="num">{f(r.rWn, 3)}</td>
                        </>
                      ) : (
                        <>
                          <td className="num">{f(r.rUN)}</td>
                          <td className="num">{f(r.rUn, 3)}</td>
                        </>
                      )}
                      <td className="num">{f(r.resTemp, 1)}</td>
                      <td>
                        <button className="btn btn-primary" onClick={() => copiar(r)}>
                          Copiar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="meta" style={{ marginTop: 8 }}>
            Las mediciones de más de un año salen marcadas en naranja: no están mal, pero
            conviene decidir a conciencia si copiarlas o medir de nuevo.
          </div>
        </>
      )}
    </div>
  )
}
