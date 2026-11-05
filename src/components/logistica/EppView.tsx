import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import type { ColaboradorEpp, EntregaEpp, SolicitudEpp } from '../../types'
import { guardarColaboradorEpp, guardarEntregaEpp, guardarSolicitudEpp } from '../../sync/syncEngine'
import { fechaCorta, hhmm } from '../../lib/time'
import { PUESTOS_EPP, puestoEppPorId, etiquetaConsumo, catalogoEfectivo, eppEfectivo, nombreEppConocido, ORIGEN_EPP_LABEL, type EppEfectivo } from '../../epp/catalogo'
import { anioActual, estadoEntrega, estadoSolicitudEppLabel, entregaReciente, puedeGestionarEpp } from '../../epp/types'

// ============================================================
// EPP — ENTREGA DE ELEMENTOS DE PROTECCIÓN PERSONAL (v1.83)
//
// Reemplaza la planilla "R.I.T 7.1.2 06 Tickets de EPP": una ficha por persona
// y por año, con un casillero por cada unidad que le corresponde. El de pañol
// tilda cuando entrega.
//
// Regla dura: al agotarse el cupo anual la entrega queda BLOQUEADA hasta que
// HyS autorice la reposición extraordinaria. Es el equivalente a la firma del
// controlador de HyS al pie de la planilla.
//
// El año se maneja explícito y no "ahora": si alguien abre la ficha el 2 de
// enero para registrar algo de diciembre, tiene que poder elegir el año.
//
// v2.45 — CORRECCIONES. Un doble toque en "Entregar" dejaba dos casilleros por
// una sola unidad. Ahora:
//   · el botón se traba mientras guarda y, si el mismo EPP a la misma persona
//     se registró hace menos de 2 minutos, pide confirmar que es OTRA unidad;
//   · las entregas NO se borran: gerencia o HyS las ANULAN con motivo. La
//     anulada deja de contar para el cupo pero queda a la vista (quién, cuándo
//     y por qué). Pañol ya no puede deshacer: si pudiera, anulando entregas
//     reales liberaría cupo sin pasar por HyS.
//   · el cupo sale del catálogo EFECTIVO (planilla + ajustes de HyS).
// ============================================================

export default function EppView() {
  const { usuario } = useAuth()
  const colaboradores = useLiveQuery(() => db.colaboradoresEpp.toArray(), []) ?? []
  const entregas = useLiveQuery(() => db.entregasEpp.toArray(), []) ?? []
  const solicitudes = useLiveQuery(() => db.solicitudesEpp.toArray(), []) ?? []
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const reglas = useLiveQuery(() => db.reglasEpp.toArray(), []) ?? []
  const gestiona = puedeGestionarEpp(usuario)

  const [anio, setAnio] = useState(anioActual())
  const [buscar, setBuscar] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)   // colaborador abierto
  const [alta, setAlta] = useState(false)
  const [verBaja, setVerBaja] = useState(false)

  // --- alta de colaborador ---
  const [nombre, setNombre] = useState('')
  const [puestoId, setPuestoId] = useState(PUESTOS_EPP[0].id)
  const [dni, setDni] = useState('')
  const [usuarioId, setUsuarioId] = useState('')
  const [msg, setMsg] = useState('')

  // --- pedido de reposición extraordinaria ---
  const [pidiendo, setPidiendo] = useState<{ col: ColaboradorEpp; eppKey: string } | null>(null)
  const [motivo, setMotivo] = useState('')

  // --- anulación (solo gerencia / HyS) ---
  const [anulando, setAnulando] = useState<{ e: EntregaEpp; col: ColaboradorEpp } | null>(null)
  const [motivoAnul, setMotivoAnul] = useState('')
  const [verAnuladas, setVerAnuladas] = useState<string | null>(null)

  // --- anti doble toque ---
  // El ref traba el segundo toque aunque React todavía no haya re-renderizado;
  // el state es solo para que el botón se vea deshabilitado.
  const enCurso = useRef(new Set<string>())
  const [guardando, setGuardando] = useState<Set<string>>(new Set())

  const anios = useMemo(() => {
    const actual = anioActual()
    const vistos = new Set<number>([actual, ...entregas.map((e) => e.anio)])
    return [...vistos].sort((a, b) => b - a)
  }, [entregas])

  const lista = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return colaboradores
      .filter((c) => (verBaja ? true : c.activo))
      .filter((c) => !q || `${c.nombre} ${c.dni ?? ''} ${puestoEppPorId(c.puestoId)?.nombre ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [colaboradores, buscar, verBaja])

  // Nómina disponible: usuarios que todavía no tienen ficha de EPP.
  const nominaLibre = useMemo(() => {
    const yaCargados = new Set(colaboradores.map((c) => c.usuarioId).filter(Boolean))
    return usuarios.filter((u) => u.activo && !yaCargados.has(u.id)).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [usuarios, colaboradores])

  const pendientesHys = solicitudes.filter((s) => s.estado === 'pendiente')

  async function crearColaborador() {
    const nom = (usuarioId ? (usuarios.find((u) => u.id === usuarioId)?.nombre ?? '') : nombre).trim()
    if (!nom) { setMsg('Elegí a alguien de la nómina o escribí el nombre.'); return }
    // Un mismo nombre dos veces es el error clásico de la planilla de papel.
    if (colaboradores.some((c) => c.nombre.trim().toLowerCase() === nom.toLowerCase())) {
      setMsg(`${nom} ya tiene ficha de EPP.`); return
    }
    const c: ColaboradorEpp = {
      id: crypto.randomUUID(),
      nombre: nom,
      puestoId,
      dni: dni.trim() || undefined,
      usuarioId: usuarioId || undefined,
      activo: true,
      creada: new Date().toISOString(),
      creadaPor: usuario?.usuario,
    }
    await guardarColaboradorEpp(c)
    setNombre(''); setDni(''); setUsuarioId(''); setAlta(false); setMsg('')
    setAbierto(c.id)
  }

  async function entregar(c: ColaboradorEpp, def: EppEfectivo) {
    const llave = `${c.id}:${def.key}`
    if (enCurso.current.has(llave)) return          // segundo toque mientras guarda
    enCurso.current.add(llave)
    setGuardando(new Set(enCurso.current))
    try {
      const est = estadoEntrega(def, def.key, c.id, anio, entregas, solicitudes)
      if (est.motivo !== 'ok') return
      const reciente = entregaReciente(entregas, c.id, def.key)
      if (reciente) {
        const seg = Math.max(1, Math.round((Date.now() - Date.parse(reciente.fecha)) / 1000))
        const ok = window.confirm(
          `Hace ${seg} segundos ya se registró "${def.nombre}" para ${c.nombre}.\n\n` +
          '¿Es OTRA unidad más? (Aceptar = registrar otra · Cancelar = no, fue un doble toque)')
        if (!ok) return
      }
      const e: EntregaEpp = {
        id: crypto.randomUUID(),
        colaboradorId: c.id,
        eppKey: def.key,
        anio,
        fecha: new Date().toISOString(),
        entregadaPor: usuario?.usuario,
        solicitudId: est.aprobacion?.id,
      }
      await guardarEntregaEpp(e)
      // Una aprobación de HyS habilita UNA unidad: al usarla se marca consumida.
      if (est.aprobacion) {
        await guardarSolicitudEpp({ ...est.aprobacion, estado: 'usada' })
      }
    } finally {
      // Se libera un instante después: da tiempo a que la lista en vivo ya
      // muestre la entrega nueva y el aviso de "hace X segundos" funcione.
      window.setTimeout(() => {
        enCurso.current.delete(llave)
        setGuardando(new Set(enCurso.current))
      }, 1200)
    }
  }

  /** Clic en un casillero tildado: gerencia/HyS lo pueden anular; el resto solo ve el detalle. */
  function tocarEntrega(e: EntregaEpp, col: ColaboradorEpp) {
    if (gestiona) { setAnulando({ e, col }); setMotivoAnul(''); return }
    window.alert(
      `Entregado el ${fechaCorta(e.fecha)} a las ${hhmm(e.fecha)}${e.entregadaPor ? ` por ${e.entregadaPor}` : ''}` +
      `${e.solicitudId ? ' (reposición extraordinaria)' : ''}.\n\n` +
      'Si se cargó por error, pedile a Higiene y Seguridad o a gerencia que lo anulen.')
  }

  async function anular() {
    if (!anulando || !motivoAnul.trim()) return
    const { e } = anulando
    await guardarEntregaEpp({
      ...e,
      anulada: true,
      anuladaEn: new Date().toISOString(),
      anuladaPor: usuario?.usuario,
      motivoAnulacion: motivoAnul.trim(),
    })
    // Si esa entrega había consumido una autorización de HyS, la autorización
    // vuelve a quedar disponible: la unidad en realidad no se entregó.
    if (e.solicitudId) {
      const s = solicitudes.find((x) => x.id === e.solicitudId)
      if (s && s.estado === 'usada') await guardarSolicitudEpp({ ...s, estado: 'aprobada' })
    }
    setAnulando(null); setMotivoAnul('')
  }

  async function pedirReposicion() {
    if (!pidiendo || !motivo.trim()) return
    const s: SolicitudEpp = {
      id: crypto.randomUUID(),
      colaboradorId: pidiendo.col.id,
      eppKey: pidiendo.eppKey,
      anio,
      motivo: motivo.trim(),
      estado: 'pendiente',
      pedidaEn: new Date().toISOString(),
      pedidaPor: usuario?.usuario,
    }
    await guardarSolicitudEpp(s)
    setPidiendo(null); setMotivo('')
  }

  async function toggleBaja(c: ColaboradorEpp) {
    await guardarColaboradorEpp({ ...c, activo: !c.activo })
  }

  return (
    <>
      <div className="section-title" style={{ marginTop: 0 }}>
        🦺 Entrega de EPP · ficha {anio}
      </div>
      <div className="meta" style={{ marginBottom: 12 }}>
        Una ficha por persona y por año, igual que la planilla R.I.T 7.1.2 06. Cada casillero es una unidad entregada.
        Al agotarse el cupo hay que pedir autorización a Higiene y Seguridad.
        {gestiona
          ? ' Tocando un casillero tildado lo podés anular (por ejemplo, un doble toque).'
          : ' Si una entrega se cargó por error, la anula HyS o gerencia.'}
      </div>

      {pendientesHys.length > 0 && (
        <div className="card" style={{ borderLeft: '5px solid var(--naranja)', marginBottom: 12 }}>
          <strong style={{ color: 'var(--naranja)' }}>⏳ {pendientesHys.length} pedido(s) esperando a HyS</strong>
          <div className="meta">Hasta que los autoricen no se puede entregar ese EPP.</div>
        </div>
      )}

      <div className="filtros">
        <input className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)}
          placeholder="🔍 Buscar por nombre, DNI o puesto…" style={{ flex: 1, minWidth: 200 }} />
        <select className="select" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
          {anios.map((a) => <option key={a} value={a}>Ficha {a}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => { setAlta(true); setMsg('') }}>＋ Nuevo colaborador</button>
        <button className="btn" onClick={() => setVerBaja((v) => !v)}>{verBaja ? 'Ocultar bajas' : 'Ver bajas'}</button>
      </div>

      {/* ---------- ALTA ---------- */}
      {alta && (
        <div className="card" style={{ borderLeft: '4px solid var(--azul-claro)' }}>
          <div className="section-title" style={{ marginTop: 0 }}>Nuevo colaborador</div>
          <div className="form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Elegir de la nómina</label>
              <select className="input" value={usuarioId} onChange={(e) => { setUsuarioId(e.target.value); setNombre('') }}>
                <option value="">— cargar a mano —</option>
                {nominaLibre.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
            {!usuarioId && (
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Nombre y apellido</label>
                <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="para quien no está en la nómina" />
              </div>
            )}
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Puesto / sección <span style={{ color: 'var(--rojo)' }}>*</span></label>
              <select className="input" value={puestoId} onChange={(e) => setPuestoId(e.target.value)}>
                {PUESTOS_EPP.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.epps.length} EPP)</option>)}
              </select>
            </div>
            <div className="field"><label>DNI / legajo (opcional)</label><input className="input" value={dni} onChange={(e) => setDni(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button className="btn" onClick={() => { setAlta(false); setMsg('') }}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => void crearColaborador()}>＋ Crear ficha</button>
          </div>
          {msg && <div className="meta" style={{ marginTop: 8, color: 'var(--rojo)' }}>{msg}</div>}
        </div>
      )}

      {/* ---------- LISTA ---------- */}
      <div className="section-title">Colaboradores ({lista.length})</div>
      {lista.length === 0
        ? <div className="empty">{colaboradores.length === 0 ? 'Todavía no hay fichas de EPP. Creá la primera con "Nuevo colaborador".' : 'Nadie coincide con la búsqueda.'}</div>
        : lista.map((c) => {
          const puesto = puestoEppPorId(c.puestoId)
          const deLaPersona = entregas.filter((e) => e.colaboradorId === c.id && e.anio === anio)
          const delAnio = deLaPersona.filter((e) => !e.anulada)
          const anuladas = deLaPersona.filter((e) => e.anulada)
          const abierta = abierto === c.id
          // Lo que le corresponde HOY (planilla + ajustes de HyS) y, aparte, lo
          // que ya no le corresponde pero se le entregó este año: esas entregas
          // no pueden desaparecer de la ficha.
          const defs = catalogoEfectivo(c.puestoId, c.id, reglas)
          const asignadas = new Set(defs.map((d) => d.key))
          const huerfanas = [...new Set(delAnio.map((e) => e.eppKey))].filter((k) => !asignadas.has(k))
          const filas: (EppEfectivo & { yaNoAsignado?: boolean })[] = [
            ...defs,
            ...huerfanas.map((k) => ({ key: k, nombre: nombreEppConocido(k, reglas), frecuencia: '—', limite: null, origen: 'catalogo' as const, yaNoAsignado: true })),
          ]
          return (
            <div className="card" key={c.id} style={{ opacity: c.activo ? 1 : 0.6 }}>
              <div className="card-header">
                <div>
                  <h3>{c.nombre}{!c.activo ? ' · (baja)' : ''}</h3>
                  <div className="meta">
                    {puesto?.nombre ?? '— sin puesto —'}{c.dni ? ` · DNI/legajo ${c.dni}` : ''}
                    {' · '}{delAnio.length} entrega(s) en {anio}
                    {anuladas.length > 0 ? ` · ${anuladas.length} anulada(s)` : ''}
                    {c.usuarioId ? ' · de la nómina' : ' · cargado a mano'}
                  </div>
                </div>
              </div>
              <div className="row-actions">
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setAbierto(abierta ? null : c.id)}>
                  {abierta ? '▲ Cerrar ficha' : '📋 Abrir ficha de EPP'}
                </button>
                <button className="btn" onClick={() => void toggleBaja(c)}>{c.activo ? '↓ Dar de baja' : '↑ Reactivar'}</button>
              </div>

              {abierta && filas.length === 0 && (
                <div className="empty" style={{ marginTop: 12 }}>Este puesto no tiene EPP asignados.</div>
              )}
              {abierta && filas.length > 0 && (
                <div style={{ marginTop: 12, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.9rem' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--borde)' }}>
                        <th style={{ padding: '8px 6px' }}>EPP</th>
                        <th style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>Frecuencia</th>
                        <th style={{ padding: '8px 6px' }}>Entregas del año</th>
                        <th style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((def) => {
                        const est = estadoEntrega(def.yaNoAsignado ? undefined : def, def.key, c.id, anio, entregas, solicitudes)
                        const trabado = guardando.has(`${c.id}:${def.key}`)
                        const propias = delAnio.filter((e) => e.eppKey === def.key)
                          .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
                        return (
                          <tr key={def.key} style={{ borderBottom: '1px solid var(--borde)' }}>
                            <td style={{ padding: '8px 6px' }}>
                              <strong>{def.nombre}</strong>
                              {def.yaNoAsignado && <div className="meta" style={{ color: 'var(--naranja)' }}>ya no asignado · se muestran las entregas del año</div>}
                              {!def.yaNoAsignado && def.origen !== 'catalogo' && (
                                <div className="meta" style={{ color: 'var(--azul-claro)' }}>✎ {ORIGEN_EPP_LABEL[def.origen]}</div>
                              )}
                            </td>
                            <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }} className="meta">{def.frecuencia}</td>
                            <td style={{ padding: '8px 6px' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                {propias.map((e) => (
                                  <button
                                    key={e.id} className="btn" title={`Entregado ${fechaCorta(e.fecha)} ${hhmm(e.fecha)}${e.entregadaPor ? ` por ${e.entregadaPor}` : ''}${e.solicitudId ? ' · reposición extraordinaria' : ''}${gestiona ? ' — clic para anular' : ''}`}
                                    onClick={() => tocarEntrega(e, c)}
                                    style={{
                                      padding: '2px 8px', minHeight: 0, fontSize: '.8rem',
                                      background: e.solicitudId ? 'var(--naranja)' : 'var(--estado-fin)',
                                      color: '#fff', border: 'none',
                                    }}
                                  >✓ {fechaCorta(e.fecha)}</button>
                                ))}
                                {/* Casilleros vacíos que todavía quedan del cupo. */}
                                {def.limite !== null && Array.from({ length: Math.max(0, def.limite - propias.length) }).map((_, i) => (
                                  <span key={i} style={{ width: 22, height: 22, borderRadius: 4, border: '1px dashed var(--borde)', display: 'inline-block' }} />
                                ))}
                                <span className="meta" style={{ marginLeft: 4 }}>{etiquetaConsumo(est.entregadas, est.limite)}</span>
                              </div>
                            </td>
                            <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                              {def.yaNoAsignado && <span className="meta">—</span>}
                              {!def.yaNoAsignado && est.motivo === 'ok' && (
                                <button className="btn btn-verde" disabled={trabado} onClick={() => void entregar(c, def)}>
                                  {trabado ? 'Guardando…' : est.aprobacion ? '✓ Entregar (autorizado)' : '✓ Entregar'}
                                </button>
                              )}
                              {!def.yaNoAsignado && est.motivo === 'sin_cupo' && (
                                <button className="btn btn-rojo" onClick={() => { setPidiendo({ col: c, eppKey: def.key }); setMotivo('') }}>
                                  🔒 Sin cupo · pedir a HyS
                                </button>
                              )}
                              {!def.yaNoAsignado && est.motivo === 'esperando_hys' && (
                                <span className="estado-chip" style={{ background: 'var(--naranja)' }}>⏳ Esperando a HyS</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* Historial de pedidos extraordinarios de esta persona */}
                  {solicitudes.filter((s) => s.colaboradorId === c.id && s.anio === anio).length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="meta" style={{ fontWeight: 800 }}>Reposiciones extraordinarias</div>
                      {solicitudes.filter((s) => s.colaboradorId === c.id && s.anio === anio)
                        .sort((a, b) => (a.pedidaEn < b.pedidaEn ? 1 : -1))
                        .map((s) => {
                          return (
                            <div className="meta" key={s.id} style={{ marginTop: 3 }}>
                              · <strong>{nombreEppConocido(s.eppKey, reglas)}</strong> — {estadoSolicitudEppLabel(s.estado)}
                              {' · '}pedida {fechaCorta(s.pedidaEn)}{s.pedidaPor ? ` por ${s.pedidaPor}` : ''}
                              {s.resueltaPor ? ` · resuelta por ${s.resueltaPor}` : ''}
                              <div className="texto-libre" style={{ fontStyle: 'italic' }}>📝 {s.motivo}</div>
                              {s.comentarioHys ? <div className="texto-libre">HyS: {s.comentarioHys}</div> : null}
                            </div>
                          )
                        })}
                    </div>
                  )}

                  {/* Entregas anuladas: no cuentan, pero quedan a la vista */}
                  {anuladas.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <button className="btn" onClick={() => setVerAnuladas(verAnuladas === c.id ? null : c.id)}>
                        {verAnuladas === c.id ? '▲ Ocultar anuladas' : `▼ Entregas anuladas (${anuladas.length})`}
                      </button>
                      {verAnuladas === c.id && anuladas
                        .sort((a, b) => ((a.anuladaEn ?? '') < (b.anuladaEn ?? '') ? 1 : -1))
                        .map((e) => (
                          <div className="meta" key={e.id} style={{ marginTop: 6 }}>
                            · <s>{nombreEppConocido(e.eppKey, reglas)} · {fechaCorta(e.fecha)} {hhmm(e.fecha)}</s>
                            {e.entregadaPor ? ` (cargó ${e.entregadaPor})` : ''}
                            {' — '}anulada{e.anuladaPor ? ` por ${e.anuladaPor}` : ''}{e.anuladaEn ? ` el ${fechaCorta(e.anuladaEn)} ${hhmm(e.anuladaEn)}` : ''}
                            {e.motivoAnulacion ? <div className="texto-libre" style={{ fontStyle: 'italic' }}>📝 {e.motivoAnulacion}</div> : null}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

      {/* ---------- MODAL: anular una entrega (gerencia / HyS) ---------- */}
      {anulando && (
        <div className="modal-overlay" onClick={() => setAnulando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-title" style={{ marginTop: 0 }}>✕ Anular entrega de EPP</div>
            <div className="meta" style={{ marginBottom: 12 }}>
              <strong>{anulando.col.nombre}</strong> · {nombreEppConocido(anulando.e.eppKey, reglas)}
              {' · '}entregado el {fechaCorta(anulando.e.fecha)} a las {hhmm(anulando.e.fecha)}
              {anulando.e.entregadaPor ? ` por ${anulando.e.entregadaPor}` : ''}.
              <div style={{ marginTop: 6 }}>
                Deja de contar para el cupo {anulando.e.anio} pero no se borra: queda registrado quién la anuló, cuándo y por qué.
                {anulando.e.solicitudId ? ' Como había usado una autorización de HyS, esa autorización vuelve a quedar disponible.' : ''}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Motivo <span style={{ color: 'var(--rojo)' }}>*</span></label>
              <textarea className="input" rows={2} value={motivoAnul} onChange={(e) => setMotivoAnul(e.target.value)}
                placeholder="ej. doble toque: se entregó una sola unidad" style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setAnulando(null)}>Cancelar</button>
              <button className="btn btn-rojo" disabled={!motivoAnul.trim()} onClick={() => void anular()}>✕ Anular entrega</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- MODAL: pedir reposición extraordinaria ---------- */}
      {pidiendo && (() => {
        const def = eppEfectivo(pidiendo.col.puestoId, pidiendo.col.id, pidiendo.eppKey, reglas)
        return (
          <div className="modal-overlay" onClick={() => setPidiendo(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="section-title" style={{ marginTop: 0 }}>🔒 Pedir reposición extraordinaria</div>
              <div className="meta" style={{ marginBottom: 12 }}>
                <strong>{pidiendo.col.nombre}</strong> ya consumió el cupo {anio} de <strong>{def?.nombre}</strong> ({def?.frecuencia}).
                HyS tiene que autorizar la unidad extra antes de poder entregarla.
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>¿Por qué necesita otra? <span style={{ color: 'var(--rojo)' }}>*</span></label>
                <textarea className="input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="ej. se le rompió el guante cortando chapa, quedó inutilizable" style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setPidiendo(null)}>Cancelar</button>
                <button className="btn btn-primary" disabled={!motivo.trim()} onClick={() => void pedirReposicion()}>Enviar a HyS</button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
