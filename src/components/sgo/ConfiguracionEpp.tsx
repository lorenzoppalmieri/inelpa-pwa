import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import type { ReglaEpp } from '../../types'
import { guardarReglaEpp, eliminarReglaEpp } from '../../sync/syncEngine'
import { fechaCorta } from '../../lib/time'
import {
  PUESTOS_EPP, puestoEppPorId, catalogoEfectivo, idReglaEpp, keyDesdeNombre, nombreEppConocido,
  eppsDePlanilla, ORIGEN_EPP_LABEL, type EppEfectivo,
} from '../../epp/catalogo'
import { puedeGestionarEpp } from '../../epp/types'

// ============================================================
// CATÁLOGO DE EPP — AJUSTES DE HIGIENE Y SEGURIDAD (v2.45)
//
// La planilla R.I.T 7.1.2 06 sigue siendo la base (vive en código). Acá HyS la
// ajusta sin depender de una versión nueva de la app:
//   · POR PUESTO: cambia para todos los de ese puesto.
//   · POR PERSONA: una excepción solo para alguien (p. ej. más guantes porque
//     trabaja con chapa, o un EPP que su puesto no tiene).
// Se puede cambiar el cupo anual, la frecuencia, quitar un EPP o agregar uno.
// Cada cambio guarda quién y cuándo. "Volver" borra el ajuste y vuelve a regir
// lo de la capa anterior (planilla → puesto → persona).
//
// La cuenta de qué le corresponde a cada uno la hace UNA sola función
// (catalogoEfectivo): la ficha de pañol, este editor y las autorizaciones
// muestran siempre el mismo cupo.
// ============================================================

type Modo = 'puesto' | 'colaborador'

interface Edicion {
  key: string
  nombre: string
  frecuencia: string
  frecuenciaOriginal: string
  cupo: string
  cupoOriginal: string
  sinTope: boolean
  sinTopeOriginal: boolean
  esNuevo: boolean
}

export default function ConfiguracionEpp() {
  const { usuario } = useAuth()
  const gestiona = puedeGestionarEpp(usuario)
  const reglas = useLiveQuery(() => db.reglasEpp.toArray(), []) ?? []
  const colaboradores = useLiveQuery(() => db.colaboradoresEpp.toArray(), []) ?? []
  const rechazadas = useLiveQuery(
    async () => (await db.syncQueue.where('entidad').anyOf(['regla_epp', 'entrega_epp']).toArray()).filter((o) => !!o.errorSync),
    [],
  ) ?? []

  const [abierto, setAbierto] = useState(false)
  const [modo, setModo] = useState<Modo>('puesto')
  const [puestoId, setPuestoId] = useState(PUESTOS_EPP[0].id)
  const [colId, setColId] = useState('')
  const [editando, setEditando] = useState<Edicion | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [elegido, setElegido] = useState('')        // key de la planilla o '__nuevo__'
  const [msg, setMsg] = useState('')

  const activos = useMemo(
    () => colaboradores.filter((c) => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [colaboradores],
  )
  const col = colaboradores.find((c) => c.id === colId)
  const ambitoId = modo === 'puesto' ? puestoId : colId
  const listo = modo === 'puesto' || !!col

  // Lo vigente para el ámbito elegido.
  const vigente: EppEfectivo[] = useMemo(() => {
    if (modo === 'puesto') return catalogoEfectivo(puestoId, undefined, reglas)
    return col ? catalogoEfectivo(col.puestoId, col.id, reglas) : []
  }, [modo, puestoId, col, reglas])

  // Reglas propias de ESTE ámbito (las que se pueden "volver").
  const propias = useMemo(
    () => reglas.filter((r) => r.ambito === modo && r.ambitoId === ambitoId),
    [reglas, modo, ambitoId],
  )
  const reglaDe = (key: string) => propias.find((r) => r.eppKey === key)
  const quitados = propias.filter((r) => r.quitado)

  const afectados = modo === 'puesto' ? activos.filter((c) => c.puestoId === puestoId).length : 1

  function abrirEdicion(d: EppEfectivo) {
    const cupo = d.limite === null ? '' : String(d.limite)
    setEditando({
      key: d.key, nombre: d.nombre,
      frecuencia: d.frecuencia, frecuenciaOriginal: d.frecuencia,
      cupo, cupoOriginal: cupo,
      sinTope: d.limite === null, sinTopeOriginal: d.limite === null,
      esNuevo: false,
    })
    setMsg('')
  }

  function empezarAgregado() {
    const k = elegido
    if (!k) { setMsg('Elegí qué EPP agregar.'); return }
    if (k === '__nuevo__') {
      setEditando({ key: '', nombre: '', frecuencia: '', frecuenciaOriginal: '', cupo: '1', cupoOriginal: '', sinTope: false, sinTopeOriginal: false, esNuevo: true })
    } else {
      const base = eppsDePlanilla().find((e) => e.key === k)
      const cupo = base?.limite == null ? '' : String(base.limite)
      setEditando({
        key: k, nombre: base?.nombre ?? nombreEppConocido(k, reglas),
        frecuencia: base?.frecuencia ?? '', frecuenciaOriginal: base?.frecuencia ?? '',
        cupo, cupoOriginal: cupo, sinTope: base?.limite == null, sinTopeOriginal: base?.limite == null,
        esNuevo: false,
      })
    }
    setAgregando(false); setElegido(''); setMsg('')
  }

  async function guardar() {
    if (!editando || !listo) return
    const nombre = editando.nombre.trim()
    const key = editando.esNuevo ? keyDesdeNombre(nombre) : editando.key
    if (!nombre || !key) { setMsg('Poné el nombre del EPP.'); return }
    if (editando.esNuevo && vigente.some((d) => d.key === key)) { setMsg(`"${nombre}" ya está en la lista.`); return }
    let limite: number | undefined
    if (!editando.sinTope) {
      const n = editando.cupo.trim() === '' ? NaN : Number(editando.cupo)
      if (!Number.isInteger(n) || n < 0 || n > 999) { setMsg('El cupo anual tiene que ser un número entero (0 a 999), o marcá "sin tope".'); return }
      limite = n
    }
    // Si cambió el cupo y no tocaron la frecuencia, se actualiza el texto para
    // que la ficha no diga "4 al año" con un cupo de 6.
    let frecuencia = editando.frecuencia.trim()
    const cambioCupo = editando.cupo !== editando.cupoOriginal || editando.sinTope !== editando.sinTopeOriginal
    if (!frecuencia || (cambioCupo && frecuencia === editando.frecuenciaOriginal.trim())) {
      frecuencia = editando.sinTope ? 'Según uso' : `${limite} al año`
    }
    const r: ReglaEpp = {
      id: idReglaEpp(modo, ambitoId, key),
      ambito: modo,
      ambitoId,
      eppKey: key,
      nombre,
      frecuencia,
      limite,
      sinTope: editando.sinTope,
      quitado: false,
      actualizadoEn: new Date().toISOString(),
      actualizadoPor: usuario?.usuario,
    }
    await guardarReglaEpp(r)
    setEditando(null); setMsg('')
  }

  async function quitar(d: EppEfectivo) {
    const quien = modo === 'puesto' ? `todo el puesto ${puestoEppPorId(puestoId)?.nombre}` : col?.nombre
    if (!window.confirm(`¿Quitar "${d.nombre}" de ${quien}?\n\nLas entregas que ya tuvo este año no se borran.`)) return
    await guardarReglaEpp({
      id: idReglaEpp(modo, ambitoId, d.key),
      ambito: modo, ambitoId, eppKey: d.key, nombre: d.nombre,
      quitado: true,
      actualizadoEn: new Date().toISOString(),
      actualizadoPor: usuario?.usuario,
    })
  }

  async function volver(r: ReglaEpp) {
    const a = modo === 'puesto' ? 'lo que dice la planilla' : 'lo que tiene su puesto'
    if (!window.confirm(`¿Deshacer el ajuste de "${r.nombre ?? r.eppKey}" y volver a ${a}?`)) return
    await eliminarReglaEpp(r)
  }

  const disponiblesParaAgregar = eppsDePlanilla().filter((e) => !vigente.some((d) => d.key === e.key))

  return (
    <div className="card" style={{ borderLeft: '5px solid var(--azul-claro)', marginBottom: 14 }}>
      <div className="card-header">
        <div>
          <div className="section-title" style={{ margin: 0 }}>⚙ Catálogo de EPP — ajustes de HyS</div>
          <div className="meta">
            Cupos y tipos de EPP por puesto o por persona. La planilla R.I.T 7.1.2 06 es la base; lo que se cambia acá rige desde ya.
            {!gestiona && ' Solo Higiene y Seguridad y gerencia pueden modificarlo.'}
          </div>
        </div>
        <div className="row-actions">
          <button className="btn" onClick={() => setAbierto((v) => !v)}>{abierto ? '▲ Cerrar' : '▼ Abrir catálogo'}</button>
        </div>
      </div>

      {gestiona && rechazadas.length > 0 && (
        <div className="card" style={{ borderLeft: '5px solid var(--rojo)', marginTop: 10 }}>
          <strong style={{ color: 'var(--rojo)' }}>⛔ {rechazadas.length} cambio(s) de EPP no se pudieron subir al servidor</strong>
          <div className="meta">
            En este equipo se ven, pero en los demás no. Lo más probable es que falte correr en Supabase el script
            docs/supabase_epp_ajustes_v2.45.sql. Avisá a gerencia antes de seguir cargando.
          </div>
        </div>
      )}

      {abierto && (
        <div style={{ marginTop: 12 }}>
          <div className="filtros">
            <button className={`btn ${modo === 'puesto' ? 'btn-primary' : ''}`} onClick={() => { setModo('puesto'); setEditando(null); setAgregando(false) }}>Por puesto</button>
            <button className={`btn ${modo === 'colaborador' ? 'btn-primary' : ''}`} onClick={() => { setModo('colaborador'); setEditando(null); setAgregando(false) }}>Por persona</button>
            {modo === 'puesto'
              ? (
                <select className="select" value={puestoId} onChange={(e) => { setPuestoId(e.target.value); setEditando(null) }} style={{ flex: 1, minWidth: 200 }}>
                  {PUESTOS_EPP.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              )
              : (
                <select className="select" value={colId} onChange={(e) => { setColId(e.target.value); setEditando(null) }} style={{ flex: 1, minWidth: 200 }}>
                  <option value="">— elegí a la persona —</option>
                  {activos.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {puestoEppPorId(c.puestoId)?.nombre ?? 'sin puesto'}</option>)}
                </select>
              )}
          </div>

          {!listo
            ? <div className="empty">Elegí a la persona para ver y ajustar sus EPP.</div>
            : (
              <>
                <div className="meta" style={{ marginBottom: 8 }}>
                  {modo === 'puesto'
                    ? <>Los cambios afectan a <strong>{afectados}</strong> persona(s) activa(s) de este puesto (salvo las que tengan una excepción propia).</>
                    : <>Excepciones solo para <strong>{col?.nombre}</strong>. Lo demás lo hereda de su puesto ({puestoEppPorId(col?.puestoId)?.nombre ?? 'sin puesto'}).</>}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--borde)' }}>
                        <th style={{ padding: '8px 6px' }}>EPP</th>
                        <th style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>Frecuencia</th>
                        <th style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>Cupo anual</th>
                        {gestiona && <th style={{ padding: '8px 6px' }}>Acción</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {vigente.map((d) => {
                        const r = reglaDe(d.key)
                        return (
                          <tr key={d.key} style={{ borderBottom: '1px solid var(--borde)' }}>
                            <td style={{ padding: '8px 6px' }}>
                              <strong>{d.nombre}</strong>
                              {d.origen !== 'catalogo' && (
                                <div className="meta" style={{ color: 'var(--azul-claro)' }}>
                                  ✎ {ORIGEN_EPP_LABEL[d.origen]}
                                  {r ? ` · ${r.actualizadoPor ?? '—'} ${fechaCorta(r.actualizadoEn)}` : ''}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '8px 6px' }} className="meta">{d.frecuencia || '—'}</td>
                            <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{d.limite === null ? 'sin tope' : d.limite}</td>
                            {gestiona && (
                              <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                                <button className="btn" onClick={() => abrirEdicion(d)}>✎ Cambiar</button>{' '}
                                <button className="btn" onClick={() => void quitar(d)}>✕ Quitar</button>{' '}
                                {r && <button className="btn" onClick={() => void volver(r)}>↺ Volver</button>}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                      {quitados.map((r) => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--borde)', opacity: 0.6 }}>
                          <td style={{ padding: '8px 6px' }}>
                            <s>{r.nombre ?? nombreEppConocido(r.eppKey, reglas)}</s>
                            <div className="meta">quitado por {r.actualizadoPor ?? '—'} · {fechaCorta(r.actualizadoEn)}</div>
                          </td>
                          <td style={{ padding: '8px 6px' }} className="meta">—</td>
                          <td style={{ padding: '8px 6px' }}>—</td>
                          {gestiona && (
                            <td style={{ padding: '8px 6px' }}>
                              <button className="btn" onClick={() => void volver(r)}>↺ Restaurar</button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {gestiona && !editando && (
                  agregando
                    ? (
                      <div className="filtros" style={{ marginTop: 10 }}>
                        <select className="select" value={elegido} onChange={(e) => setElegido(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
                          <option value="">— elegí el EPP —</option>
                          <option value="__nuevo__">＋ Otro (no está en la planilla)</option>
                          {disponiblesParaAgregar.map((e) => <option key={e.key} value={e.key}>{e.nombre}</option>)}
                        </select>
                        <button className="btn btn-primary" onClick={empezarAgregado}>Siguiente</button>
                        <button className="btn" onClick={() => { setAgregando(false); setElegido('') }}>Cancelar</button>
                      </div>
                    )
                    : <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => { setAgregando(true); setMsg('') }}>＋ Agregar EPP</button>
                )}

                {gestiona && editando && (
                  <div className="card" style={{ marginTop: 10, borderLeft: '4px solid var(--azul-claro)' }}>
                    <div className="section-title" style={{ marginTop: 0 }}>
                      {editando.esNuevo ? 'EPP nuevo' : editando.nombre}
                      {' · '}{modo === 'puesto' ? puestoEppPorId(puestoId)?.nombre : col?.nombre}
                    </div>
                    <div className="form-grid">
                      {editando.esNuevo && (
                        <div className="field" style={{ gridColumn: '1 / -1' }}>
                          <label>Nombre del EPP <span style={{ color: 'var(--rojo)' }}>*</span></label>
                          <input className="input" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="ej. Faja lumbar" />
                        </div>
                      )}
                      <div className="field">
                        <label>Cupo anual (unidades)</label>
                        <input className="input" type="number" min={0} max={999} disabled={editando.sinTope}
                          value={editando.sinTope ? '' : editando.cupo} onChange={(e) => setEditando({ ...editando, cupo: e.target.value })} />
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, fontWeight: 400 }}>
                          <input type="checkbox" checked={editando.sinTope} onChange={(e) => setEditando({ ...editando, sinTope: e.target.checked })} />
                          Sin tope (según uso)
                        </label>
                      </div>
                      <div className="field">
                        <label>Frecuencia (texto que ve pañol)</label>
                        <input className="input" value={editando.frecuencia} onChange={(e) => setEditando({ ...editando, frecuencia: e.target.value })} placeholder="ej. 1 al mes" />
                      </div>
                    </div>
                    <div className="meta" style={{ marginTop: 6 }}>
                      Si cambiás el cupo y dejás la frecuencia como estaba, se actualiza sola (ej. "6 al año").
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                      <button className="btn" onClick={() => { setEditando(null); setMsg('') }}>Cancelar</button>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => void guardar()}>Guardar ajuste</button>
                    </div>
                  </div>
                )}
                {msg && <div className="meta" style={{ marginTop: 8, color: 'var(--rojo)' }}>{msg}</div>}
              </>
            )}
        </div>
      )}
    </div>
  )
}
