import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { esSuperAdmin } from '../auth/roles'
import { cronometro, fechaCorta, fmtDur, minutosEntre } from '../lib/time'
import { cargarAlertasTempranas, textoAlerta, type AlertaTemprana } from './alertas'
import LeyendaSemaforo from './LeyendaSemaforo'
import type { MantActivo, MantAviso, MantGama, MantOT, OtEstado } from './types'
import { OT_ABIERTAS } from './types'

// ============================================================
// TABLERO DE ORDENES DE TRABAJO — MANTENIMIENTO (Sprint 2: P3 + P4)
// Kanban tactil para tablet de planta (guantes, WiFi irregular):
//  - cambio de estado por TAP con boton primario grande (>= 52 px);
//  - P3: stamps automaticos (fecha_inicio al tomar, solo si vacia;
//    fecha_cierre al cerrar) y cronometro vivo en la OT en curso;
//  - feedback optimista: la tarjeta cambia al instante con overlay
//    "Actualizando..." y rollback por refetch si la red falla;
//  - cierre rapido en 2-3 taps (texto + boton grande; extras plegados).
// Realtime: se refresca solo cuando entra un aviso o cambia una OT.
// ============================================================

const OT_LABEL: Record<OtEstado, string> = {
  creada: 'Creada', planificada: 'Planificada', en_ejecucion: 'En ejecución',
  en_espera: 'En espera', cerrada: 'Cerrada', cancelada: 'Cancelada',
}
const COLUMNAS: OtEstado[] = ['creada', 'planificada', 'en_ejecucion', 'en_espera']

interface CierreForm { trabajo: string; causa: string; horas: string; parada: string; loto: boolean }
const CIERRE_VACIO: CierreForm = { trabajo: '', causa: '', horas: '', parada: '', loto: false }

export default function TableroOT({ onVerFicha }: { onVerFicha?: (id: string) => void }) {
  const { usuario } = useAuth()
  const puedeEditar = !!usuario && (usuario.rol === 'mantenimiento' || usuario.rol === 'mant_tecnico' || esSuperAdmin(usuario))
  const esAdmin = !!usuario && (usuario.rol === 'mantenimiento' || esSuperAdmin(usuario))

  const [avisos, setAvisos] = useState<MantAviso[]>([])
  const [ots, setOts] = useState<MantOT[]>([])
  const [activos, setActivos] = useState<Pick<MantActivo, 'id' | 'nombre'>[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  // P6: alertas tempranas por activo (badge chico en la tarjeta de la OT).
  const [alertas, setAlertas] = useState<Map<string, AlertaTemprana>>(new Map())

  // Generacion de OT preventivas desde gamas (RPC v1.64).
  const [gamas, setGamas] = useState<MantGama[]>([])
  const [pendientes, setPendientes] = useState<MantGama[] | null>(null) // modal
  const [generando, setGenerando] = useState(false)

  // Reloj vivo: alimenta el cronometro de las OT en ejecucion (P3).
  const [ahora, setAhora] = useState(() => Date.now())

  // OT con una accion en vuelo (feedback tactil: overlay + botones off).
  const [ocupadas, setOcupadas] = useState<ReadonlySet<string>>(new Set())

  // Cierre rapido de OT
  const [cerrando, setCerrando] = useState<MantOT | null>(null)
  const [cierre, setCierre] = useState<CierreForm>(CIERRE_VACIO)
  const [verMasCierre, setVerMasCierre] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const nombrePorId = useMemo(() => new Map(activos.map((a) => [a.id, a.nombre])), [activos])

  const cargar = useCallback(async () => {
    if (!supabase) { setCargando(false); return }
    const [{ data: av }, { data: ot }, { data: ac }, { data: gs }] = await Promise.all([
      supabase.from('mant_avisos').select('*').in('estado', ['nuevo', 'en_ot']).order('creado_en', { ascending: false }),
      supabase.from('mant_ordenes_trabajo').select('*').order('creado_en', { ascending: false }).limit(200),
      supabase.from('mant_activos').select('id, nombre'),
      supabase.from('mant_gamas').select('*').eq('activa', true).not('activo_id', 'is', null),
    ])
    setAvisos((av ?? []) as MantAviso[])
    setOts((ot ?? []) as MantOT[])
    setActivos((ac ?? []) as Pick<MantActivo, 'id' | 'nombre'>[])
    setGamas((gs ?? []) as MantGama[])
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  // P6: una sola query plant-wide de alertas (compartida por todas las
  // tarjetas); se refresca al montar y cuando cambian las paradas.
  const cargarAlertas = useCallback(async () => {
    setAlertas(await cargarAlertasTempranas())
  }, [])
  useEffect(() => { void cargarAlertas() }, [cargarAlertas])

  useEffect(() => {
    const sb = supabase
    if (!sb) return
    const canal = sb.channel('mant-tablero')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mant_avisos' }, () => { void cargar() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mant_ordenes_trabajo' }, () => { void cargar() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paradas' }, () => { void cargarAlertas() })
      .subscribe()
    return () => { void sb.removeChannel(canal) }
  }, [cargar, cargarAlertas])

  // Tick del reloj: 1 s si hay alguna OT en ejecucion (cronometro vivo);
  // si no, 30 s (alcanza para el "hace X min" y ahorra bateria en tablet).
  const hayEnCurso = useMemo(() => ots.some((o) => o.estado === 'en_ejecucion'), [ots])
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), hayEnCurso ? 1000 : 30000)
    return () => clearInterval(t)
  }, [hayEnCurso])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  const avisosNuevos = useMemo(() => avisos.filter((a) => a.estado === 'nuevo'), [avisos])
  const abiertas = useMemo(() => ots.filter((o) => OT_ABIERTAS.includes(o.estado)), [ots])
  const cerradas = useMemo(() => ots.filter((o) => o.estado === 'cerrada').slice(0, 12), [ots])

  function marcar(id: string, on: boolean) {
    setOcupadas((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })
  }

  // ------------------------------------------------------------
  // Acciones
  // ------------------------------------------------------------
  async function convertirAviso(av: MantAviso) {
    if (!supabase) return
    const nombre = nombrePorId.get(av.activo_id) ?? av.activo_id
    const { data, error: e } = await supabase.from('mant_ordenes_trabajo').insert({
      tipo: 'correctiva', estado: 'creada', prioridad: 'alta',
      activo_id: av.activo_id, origen: 'aviso', aviso_id: av.id,
      descripcion: `${av.sintoma} (aviso de ${av.emisor})`, creado_por: usuario?.usuario ?? null,
    }).select('id').single()
    if (e || !data) { setError(`No se pudo crear la OT: ${e?.message ?? ''}`); return }
    // P3: stamp de atencion del aviso (tiempo de respuesta = atendido_en - creado_en).
    await supabase.from('mant_avisos').update({ estado: 'en_ot', ot_id: data.id, atendido_en: new Date().toISOString() }).eq('id', av.id)
    setAviso(`OT creada para ${nombre} desde el aviso.`)
    void cargar()
  }

  async function descartarAviso(av: MantAviso) {
    if (!supabase) return
    if (!window.confirm('¿Descartar este aviso? (falsa alarma / ya resuelto)')) return
    await supabase.from('mant_avisos').update({ estado: 'cancelado', atendido_en: new Date().toISOString() }).eq('id', av.id)
    void cargar()
  }

  // Cambio de estado por TAP con update optimista: la tarjeta salta de
  // columna al instante; si la red falla se revierte (refetch) y se avisa.
  async function avanzar(ot: MantOT, nuevo: OtEstado, autoAsignar = false) {
    const sb = supabase
    if (!sb || ocupadas.has(ot.id)) return
    const ahoraIso = new Date().toISOString()
    const patch: Record<string, unknown> = { estado: nuevo, actualizado_en: ahoraIso }
    // P3: stamp de inicio de intervencion, solo si esta vacio (no pisa reaperturas).
    if (nuevo === 'en_ejecucion' && !ot.fecha_inicio) patch.fecha_inicio = ahoraIso
    // "Tomar" tambien asigna la OT al tecnico que la toco, si no tenia responsable.
    if (autoAsignar && !ot.responsable && usuario) patch.responsable = usuario.usuario
    marcar(ot.id, true)
    setError('')
    setOts((prev) => prev.map((o) => (o.id === ot.id ? ({ ...o, ...patch } as MantOT) : o)))
    const { error: e } = await sb.from('mant_ordenes_trabajo').update(patch).eq('id', ot.id)
    marcar(ot.id, false)
    if (e) {
      setError(`La OT ${ot.numero} no cambió de estado (sin señal o sin permiso). Reintentá.`)
      void cargar() // rollback del optimista
      return
    }
    void cargar()
  }

  // Asignar: si esta sin responsable, un tap se la asigna al usuario actual;
  // si ya tiene, pide el nombre (reasignacion puntual).
  async function asignar(ot: MantOT) {
    const sb = supabase
    if (!sb || ocupadas.has(ot.id)) return
    let destino: string | null
    if (!ot.responsable && usuario) {
      destino = usuario.usuario
    } else {
      const r = window.prompt('Técnico responsable (vacío = sin asignar):', ot.responsable ?? usuario?.usuario ?? '')
      if (r == null) return
      destino = r.trim() || null
    }
    marcar(ot.id, true)
    setOts((prev) => prev.map((o) => (o.id === ot.id ? { ...o, responsable: destino } : o)))
    const { error: e } = await sb.from('mant_ordenes_trabajo')
      .update({ responsable: destino, actualizado_en: new Date().toISOString() }).eq('id', ot.id)
    marcar(ot.id, false)
    if (e) { setError(`No se pudo asignar la OT ${ot.numero}.`); void cargar(); return }
    void cargar()
  }

  function abrirCierre(ot: MantOT) {
    setCierre(CIERRE_VACIO)
    setVerMasCierre(false)
    setCerrando(ot)
  }

  // Cierre rapido (P3): "que se hizo" + un boton grande. Causa/horas/parada
  // quedan plegadas como opcionales; LOTO solo si la OT lo requiere.
  async function guardarCierre() {
    if (!supabase || !cerrando) return
    if (!cierre.trabajo.trim()) { setError('Describí qué se hizo antes de cerrar.'); return }
    if (cerrando.loto_requerido && !cierre.loto) { setError('Esta OT requiere confirmar el bloqueo LOTO.'); return }
    const horasN = cierre.horas.trim() ? Number(cierre.horas) : null
    const paradaN = cierre.parada.trim() ? Number(cierre.parada) : null
    if (horasN != null && (isNaN(horasN) || horasN < 0)) { setError('Horas-hombre inválidas.'); return }
    if (paradaN != null && (isNaN(paradaN) || paradaN < 0)) { setError('Tiempo de parada inválido.'); return }
    setGuardando(true)
    setError('')
    const { error: e } = await supabase.from('mant_ordenes_trabajo').update({
      estado: 'cerrada', fecha_cierre: new Date().toISOString(),
      cierre_trabajo: cierre.trabajo.trim(),
      cierre_causa: cierre.causa.trim() || null,
      horas_hombre: horasN, tiempo_parada_min: paradaN,
      loto_checklist: cerrando.loto_requerido ? [{ punto: 'LOTO aplicado y verificado', ok: true }] : [],
      actualizado_en: new Date().toISOString(),
    }).eq('id', cerrando.id)
    setGuardando(false)
    if (e) { setError(`No se pudo cerrar la OT: ${e.message}`); return }
    // Si venia de un aviso, marcar el aviso como resuelto (stamp atendido_en).
    if (cerrando.aviso_id) {
      await supabase.from('mant_avisos').update({ estado: 'resuelto', atendido_en: new Date().toISOString() }).eq('id', cerrando.aviso_id)
    }
    setAviso(`OT ${cerrando.numero} cerrada.`)
    setCerrando(null)
    void cargar()
  }

  // Generacion de OT preventivas (RPC v1.64). Primero se listan las gamas
  // pendientes calculadas en cliente (misma regla del RPC: gama activa con
  // activo y SIN OT preventiva abierta para ese activo+gama) y despues se
  // confirma. Si el RPC no existe, degrada con mensaje claro.
  function abrirGenerarPreventivas() {
    const gamaConOtAbierta = new Set(
      ots.filter((o) => o.gama_id && OT_ABIERTAS.includes(o.estado)).map((o) => o.gama_id),
    )
    setPendientes(gamas.filter((g) => g.activo_id && !gamaConOtAbierta.has(g.id)))
  }

  async function confirmarGenerarPreventivas() {
    if (!supabase) return
    setGenerando(true)
    setError('')
    const { data, error: e } = await supabase.rpc('mant_generar_ot_preventivas')
    setGenerando(false)
    if (e) {
      setError(/could not find|schema cache|does not exist|404/i.test(e.message)
        ? 'No se encontró el generador en la base: falta correr el SQL v1.64 (RPC mant_generar_ot_preventivas).'
        : `No se pudieron generar las OT preventivas: ${e.message}`)
      setPendientes(null)
      return
    }
    setAviso(`${data ?? 0} OT preventiva(s) generada(s).`)
    setPendientes(null)
    void cargar()
  }

  if (!supabase) return <div className="empty">Supabase no está configurado (faltan credenciales en .env).</div>

  const label = (id: string) => nombrePorId.get(id) ?? id
  const transcurrido = (iso: string) => fmtDur(Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 60000)))

  // ------------------------------------------------------------
  // Tarjeta de OT (info critica + accion principal por tap)
  // ------------------------------------------------------------
  function renderOT(o: MantOT) {
    const ocupada = ocupadas.has(o.id)
    const enCurso = o.estado === 'en_ejecucion'
    return (
      <div key={o.id} className={`mant-ot-card mant-ot-${o.tipo}${ocupada ? ' ocupada' : ''}`}>
        <div className="mant-ot-cab">
          <strong>OT {o.numero}</strong>
          {alertas.has(o.activo_id) && (
            <span className="mant-ot-alerta" title={`⚠️ Alerta temprana: ${textoAlerta(alertas.get(o.activo_id)!)}`}>⚠️</span>
          )}
          <span className={'mant-ot-prio-chip p-' + o.prioridad}>{o.prioridad}</span>
          <span className={'mant-ot-tag t-' + o.tipo}>{o.tipo}</span>
        </div>
        <button className="mant-ot-activo" onClick={() => onVerFicha?.(o.activo_id)} title="Ver ficha del activo">
          {o.activo_id} · {label(o.activo_id)}
        </button>
        <div className="mant-ot-desc">{o.descripcion}</div>
        {/* P3: cronometro vivo de la intervencion en curso */}
        {enCurso && o.fecha_inicio ? (
          <div className="mant-ot-crono">⏱ {cronometro(o.fecha_inicio, ahora)}</div>
        ) : (
          <div className="meta">
            hace {transcurrido(o.creado_en)}
            {o.fecha_objetivo ? ` · objetivo ${fechaCorta(o.fecha_objetivo)}` : ''}
          </div>
        )}
        <div className="mant-ot-tec">{o.responsable ? `👤 ${o.responsable}` : '👤 sin asignar'}</div>
        {puedeEditar && (
          <div className="mant-ot-acciones">
            {!enCurso && (
              <button className="btn btn-primary mant-ot-btn-main" disabled={ocupada}
                onClick={() => void avanzar(o, 'en_ejecucion', true)}>
                {o.estado === 'en_espera' ? '▶ REANUDAR' : '▶ TOMAR'}
              </button>
            )}
            {enCurso && (
              <button className="btn btn-verde mant-ot-btn-main" disabled={ocupada} onClick={() => abrirCierre(o)}>
                ✔ CERRAR OT
              </button>
            )}
            <div className="mant-ot-sec">
              {o.estado === 'creada' && (
                <button className="btn" disabled={ocupada} onClick={() => void avanzar(o, 'planificada')}>📅 Planificar</button>
              )}
              {o.estado !== 'en_espera' && (
                <button className="btn" disabled={ocupada} onClick={() => void avanzar(o, 'en_espera')}>⏸ Espera</button>
              )}
              {!enCurso && (
                <button className="btn" disabled={ocupada} onClick={() => abrirCierre(o)}>✔ Cerrar</button>
              )}
              <button className="btn" disabled={ocupada} title={o.responsable ? 'Reasignar técnico' : 'Asignármela'}
                onClick={() => void asignar(o)}>
                👤 {o.responsable ? 'Reasignar' : 'Yo'}
              </button>
            </div>
          </div>
        )}
        {ocupada && <div className="mant-ot-overlay">Actualizando…</div>}
      </div>
    )
  }

  return (
    <div className="mant-tablero">
      <div className="mant-mapa-top no-print">
        <div className="section-title" style={{ margin: 0 }}>📝 Tablero de órdenes de trabajo</div>
        {esAdmin && (
          <button className="btn btn-primary" style={{ minHeight: 44, padding: '0 14px' }} disabled={generando} onClick={abrirGenerarPreventivas}>
            ⚙️ Generar OT preventivas
          </button>
        )}
        <span className="meta" style={{ marginLeft: 'auto' }}>
          {avisosNuevos.length} aviso(s) · {abiertas.length} OT abiertas
        </span>
      </div>

      <LeyendaSemaforo />

      {error && <div className="error-msg" style={{ textAlign: 'left', margin: '0 0 8px' }}>{error}</div>}
      {aviso && <div className="mant-aviso no-print">{aviso}</div>}

      {cargando ? <div className="empty">Cargando tablero…</div> : (
        <>
          {/* ---------- Avisos nuevos ---------- */}
          {avisosNuevos.length > 0 && (
            <div className="card mant-avisos-bloque">
              <div className="section-title" style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>🔴 Avisos de falla sin atender</div>
              <div className="mant-ot-grid">
                {avisosNuevos.map((av) => (
                  <div key={av.id} className="mant-ot-card mant-ot-aviso">
                    <div className="mant-ot-cab">
                      <strong>{av.activo_id}</strong>
                      <span className="meta">{fechaCorta(av.creado_en)} · hace {transcurrido(av.creado_en)}</span>
                    </div>
                    <div className="mant-ot-desc">{av.sintoma}</div>
                    <div className="meta">{label(av.activo_id)} · avisó {av.emisor}</div>
                    {puedeEditar && (
                      <div className="row-actions" style={{ marginTop: 8 }}>
                        <button className="btn btn-verde" style={{ flex: 1, minHeight: 48 }} onClick={() => void convertirAviso(av)}>➕ Crear OT</button>
                        <button className="btn" style={{ minHeight: 48 }} onClick={() => void descartarAviso(av)}>Descartar</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ---------- Columnas de OT abiertas ---------- */}
          <div className="mant-kanban">
            {COLUMNAS.map((col) => {
              const lista = abiertas.filter((o) => o.estado === col)
              return (
                <div key={col} className={`mant-kanban-col col-${col}`}>
                  <div className="mant-kanban-cab">{OT_LABEL[col]} <span className="meta">({lista.length})</span></div>
                  {lista.length === 0 ? <div className="meta" style={{ padding: '4px 2px' }}>—</div> : lista.map(renderOT)}
                </div>
              )
            })}
          </div>

          {/* ---------- Cerradas recientes ---------- */}
          <div className="card">
            <div className="section-title" style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>✅ Cerradas recientes</div>
            {cerradas.length === 0 ? <div className="meta">Todavía no hay OT cerradas.</div> : cerradas.map((o) => (
              <div key={o.id} className="mant-hist-item">
                <div className="mant-hist-top">
                  <span className="estado-chip e-finalizado">OT {o.numero} · {o.tipo}</span>
                  <span className="meta">
                    {label(o.activo_id)}
                    {o.fecha_cierre ? ` · ${fechaCorta(o.fecha_cierre)}` : ''}
                    {o.fecha_inicio && o.fecha_cierre ? ` · duró ${fmtDur(minutosEntre(o.fecha_inicio, o.fecha_cierre))}` : ''}
                    {o.horas_hombre != null ? ` · ${o.horas_hombre} h` : ''}
                  </span>
                </div>
                {o.cierre_trabajo && <div className="mant-hist-trabajo">{o.cierre_trabajo}</div>}
                {o.cierre_causa && <div className="meta">Causa: {o.cierre_causa}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---------- Modal: generar OT preventivas desde gamas ---------- */}
      {pendientes && (
        <div className="modal-overlay" onClick={() => { if (!generando) setPendientes(null) }}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <h2>⚙️ Generar OT preventivas</h2>
            {pendientes.length === 0 ? (
              <div className="meta" style={{ marginBottom: 6 }}>
                <strong>No hay gamas pendientes:</strong> todas tienen una OT preventiva abierta. No se creará nada.
              </div>
            ) : (
              <>
                <div className="meta" style={{ marginBottom: 8 }}>
                  Se crearán <strong>{pendientes.length}</strong> OT (una por gama activa sin OT preventiva abierta):
                </div>
                <div style={{ maxHeight: 280, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pendientes.map((g) => (
                    <div key={g.id} className="mant-hist-item" style={{ marginBottom: 0 }}>
                      <strong>{g.activo_id} · {label(g.activo_id as string)}</strong>
                      <div className="meta">{g.tarea} · {g.frecuencia}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="row-actions" style={{ marginTop: 14 }}>
              {pendientes.length > 0 && (
                <button className="btn btn-verde mant-btn-cierre" disabled={generando} onClick={() => void confirmarGenerarPreventivas()}>
                  {generando ? 'Generando…' : `⚙️ Generar ${pendientes.length} OT`}
                </button>
              )}
              <button className="btn" style={{ minHeight: 48 }} disabled={generando} onClick={() => setPendientes(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal de cierre rapido (2-3 taps) ---------- */}
      {cerrando && (
        <div className="modal-overlay" onClick={() => { if (!guardando) setCerrando(null) }}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span>Cerrar OT {cerrando.numero}</span>
              {cerrando.fecha_inicio && <span className="mant-ot-crono" style={{ fontSize: '1rem' }}>⏱ {cronometro(cerrando.fecha_inicio, ahora)}</span>}
            </h2>
            <div className="meta" style={{ marginBottom: 10 }}>{label(cerrando.activo_id)} · {cerrando.descripcion}</div>
            <div className="field">
              <label>¿Qué se hizo? *</label>
              <textarea className="input mant-cierre-texto" autoFocus value={cierre.trabajo}
                onChange={(e) => setCierre({ ...cierre, trabajo: e.target.value })}
                placeholder="Ej.: cambio de rodamiento y ajuste de correa" />
            </div>
            {cerrando.loto_requerido && (
              <label className="mant-check" style={{ marginTop: 4 }}>
                <input type="checkbox" checked={cierre.loto} onChange={(e) => setCierre({ ...cierre, loto: e.target.checked })} />
                🔒 Bloqueo LOTO aplicado y verificado
              </label>
            )}
            <button type="button" className="mant-cierre-mas" onClick={() => setVerMasCierre(!verMasCierre)}>
              {verMasCierre ? '▾ Ocultar datos extra' : '▸ Agregar causa / horas / parada (opcional)'}
            </button>
            {verMasCierre && (
              <>
                <div className="field">
                  <label>Causa / modo de falla</label>
                  <input className="input" value={cierre.causa} onChange={(e) => setCierre({ ...cierre, causa: e.target.value })} placeholder="Ej.: rodamiento gastado" />
                </div>
                <div className="form-grid">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Horas-hombre</label>
                    <input className="input" inputMode="decimal" value={cierre.horas} onChange={(e) => setCierre({ ...cierre, horas: e.target.value })} placeholder="2" />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Tiempo de parada (min)</label>
                    <input className="input" inputMode="numeric" value={cierre.parada} onChange={(e) => setCierre({ ...cierre, parada: e.target.value })} placeholder="45" />
                  </div>
                </div>
              </>
            )}
            {error && <div className="error-msg" style={{ textAlign: 'left' }}>{error}</div>}
            <div className="row-actions" style={{ marginTop: 14 }}>
              <button className="btn btn-verde mant-btn-cierre" disabled={guardando} onClick={() => void guardarCierre()}>
                {guardando ? 'Guardando…' : '✔ CERRAR OT'}
              </button>
              <button className="btn" style={{ minHeight: 48 }} disabled={guardando} onClick={() => setCerrando(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
