import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { COMPONENTES_CATALOGO } from '../../data/catalogo'
import { SECTORES, sectorById, type SectorId } from '../../types'
import { useAuth } from '../../auth/AuthContext'
import { puedeCargarPlanos } from '../../auth/roles'
import { fechaCorta } from '../../lib/time'
import { listarPlanos, publicarPlano, extraerRevision, validarPlano, type Plano } from '../../lib/planos'
import VisorPlano from './VisorPlano'

// ============================================================
// PANEL "PLANOS" (v2.38) — Super Admin. v2.39: también el rol Diseño.
//
// Mantenimiento del día a día: buscar un semielaborado, ver su plano vigente,
// subir una revisión nueva (la anterior queda en el historial) y ver qué
// semielaborados todavía no tienen plano. La CARGA INICIAL masiva va por
// scripts/cargar_planos.mjs, no por acá.
//
// La lista sale del catálogo de la app (COMPONENTES_CATALOGO), que es el mismo
// que usan las tareas para saber su semielaborado.
// ============================================================

const MAX_FILAS = 200

interface Pendiente { codigo: string; file: File; revision: string; extras: string }

export default function PlanosAdmin() {
  const { usuario } = useAuth()
  const [planos, setPlanos] = useState<Plano[]>([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [sector, setSector] = useState<'todos' | SectorId>('todos')
  const [soloSin, setSoloSin] = useState(false)
  const [viendo, setViendo] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setPlanos(await listarPlanos())
    setCargando(false)
  }, [])
  useEffect(() => { void recargar() }, [recargar])

  const vigentePorCodigo = useMemo(() => {
    const m = new Map<string, Plano>()
    for (const p of planos) if (p.vigente) m.set(p.componenteCodigo, p)
    return m
  }, [planos])
  const historialPorCodigo = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of planos) if (!p.vigente) m.set(p.componenteCodigo, (m.get(p.componenteCodigo) ?? 0) + 1)
    return m
  }, [planos])

  const codigosCatalogo = useMemo(() => new Set(COMPONENTES_CATALOGO.map((c) => c.codigo)), [])
  const total = COMPONENTES_CATALOGO.length
  const conPlano = COMPONENTES_CATALOGO.filter((c) => vigentePorCodigo.has(c.codigo)).length

  const filas = useMemo(() => {
    const txt = q.trim().toLowerCase()
    return COMPONENTES_CATALOGO.filter((c) =>
      (sector === 'todos' || c.sectorId === sector)
      && (!soloSin || !vigentePorCodigo.has(c.codigo))
      && (!txt || `${c.codigo} ${c.descripcion}`.toLowerCase().includes(txt)))
  }, [q, sector, soloSin, vigentePorCodigo])

  if (!puedeCargarPlanos(usuario)) return <div className="empty">Solo Diseño y Super Admin pueden administrar los planos.</div>

  function elegirArchivo(codigo: string, file: File | undefined) {
    if (!file) return
    const err = validarPlano(file)
    if (err) { setMsg({ ok: false, txt: err }); return }
    setMsg(null)
    setPendiente({ codigo, file, revision: extraerRevision(file.name) ?? '', extras: '' })
  }

  async function publicar() {
    if (!pendiente) return
    const extras = pendiente.extras.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)
    const desconocidos = extras.filter((c) => !codigosCatalogo.has(c))
    if (desconocidos.length) {
      setMsg({ ok: false, txt: `Estos códigos no están en el catálogo: ${desconocidos.join(', ')}` })
      return
    }
    setSubiendo(true)
    const r = await publicarPlano(pendiente.file, [pendiente.codigo, ...extras], {
      revision: pendiente.revision, usuario: usuario?.usuario,
    })
    setSubiendo(false)
    if (!r.ok) { setMsg({ ok: false, txt: r.error ?? 'No se pudo publicar el plano.' }); return }
    setMsg({ ok: true, txt: `Plano publicado para ${r.vinculados.join(', ')}.` })
    setPendiente(null)
    await recargar()
  }

  return (
    <div>
      <div className="section-title">📐 Planos de semielaborados</div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="meta" style={{ marginBottom: 8 }}>
          {cargando ? 'Cargando…' : <>
            <strong>{conPlano}</strong> de <strong>{total}</strong> semielaborados tienen plano vigente
            {' · '}<strong style={{ color: total - conPlano > 0 ? 'var(--naranja)' : 'var(--estado-fin)' }}>{total - conPlano}</strong> sin plano.
          </>}
          {' '}La carga inicial masiva se hace con <code>scripts/cargar_planos.mjs</code>.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="Buscar por código o descripción…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" value={sector} onChange={(e) => setSector(e.target.value as 'todos' | SectorId)}>
            <option value="todos">Todos los sectores</option>
            {SECTORES.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={soloSin} onChange={(e) => setSoloSin(e.target.checked)} /> Solo sin plano
          </label>
        </div>
        {msg && <div className="meta" style={{ marginTop: 8, color: msg.ok ? 'var(--estado-fin)' : 'var(--rojo)' }}>{msg.txt}</div>}
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="tabla-detalle">
          <thead>
            <tr><th>Código</th><th>Semielaborado</th><th>Sector</th><th>Plano vigente</th><th /></tr>
          </thead>
          <tbody>
            {filas.slice(0, MAX_FILAS).map((c) => {
              const p = vigentePorCodigo.get(c.codigo)
              const hist = historialPorCodigo.get(c.codigo) ?? 0
              const abierto = pendiente?.codigo === c.codigo
              return (
                <Fragment key={c.codigo}>
                  <tr>
                    <td><code>{c.codigo}</code></td>
                    <td>{c.descripcion}</td>
                    <td className="meta">{c.sectorId ? sectorById(c.sectorId).nombre : '—'}</td>
                    <td>
                      {p ? (
                        <span title={p.nombreArchivo}>
                          ✓ {p.revision ? `Rev ${p.revision} · ` : ''}{fechaCorta(p.subidoEn)}{p.subidoPor ? ` · ${p.subidoPor}` : ''}
                          {hist > 0 && <span className="meta"> · {hist} anterior(es)</span>}
                        </span>
                      ) : <span style={{ color: 'var(--naranja)' }}>Sin plano</span>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {p && (
                        <button className="btn" onClick={() => setViendo(viendo === c.codigo ? null : c.codigo)}>
                          {viendo === c.codigo ? 'Ocultar' : 'Ver'}
                        </button>
                      )}{' '}
                      <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
                        {p ? 'Nueva revisión' : 'Subir plano'}
                        <input type="file" accept="application/pdf,.pdf" hidden
                          onChange={(e) => { elegirArchivo(c.codigo, e.target.files?.[0]); e.target.value = '' }} />
                      </label>
                    </td>
                  </tr>
                  {abierto && pendiente && (
                    <tr>
                      <td colSpan={5}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          <div className="meta" style={{ flexBasis: '100%' }}>
                            Archivo: <strong>{pendiente.file.name}</strong> ({(pendiente.file.size / 1024 / 1024).toFixed(1)} MB)
                            {p && ' · el plano actual pasa al historial.'}
                          </div>
                          <div className="field" style={{ width: 110 }}>
                            <label>Revisión</label>
                            <input className="input" value={pendiente.revision} placeholder="A, B, 02…"
                              onChange={(e) => setPendiente({ ...pendiente, revision: e.target.value })} />
                          </div>
                          <div className="field" style={{ flex: 1, minWidth: 220 }}>
                            <label>Aplicar también a (otros códigos, opcional)</label>
                            <input className="input" value={pendiente.extras} placeholder="Ej. CUBDIS0000019, CUBDIS0000020"
                              onChange={(e) => setPendiente({ ...pendiente, extras: e.target.value })} />
                          </div>
                          <button className="btn" disabled={subiendo} onClick={() => setPendiente(null)}>Cancelar</button>
                          <button className="btn btn-verde" disabled={subiendo} onClick={() => void publicar()}>
                            {subiendo ? 'Subiendo…' : 'Publicar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {viendo === c.codigo && p && (
                    <tr><td colSpan={5}><VisorPlano componenteCodigo={c.codigo} /></td></tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {filas.length > MAX_FILAS && (
          <div className="meta" style={{ padding: 8 }}>
            Se muestran {MAX_FILAS} de {filas.length}. Afiná la búsqueda para ver el resto.
          </div>
        )}
        {filas.length === 0 && <div className="empty">Ningún semielaborado coincide con el filtro.</div>}
      </div>
    </div>
  )
}
