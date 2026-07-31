import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { esSuperAdmin } from '../auth/roles'
import { fechaCorta } from '../lib/time'
import type { MantActivo, MantAviso, MantOT, OtEstado } from './types'
import { OT_ABIERTAS } from './types'

// ============================================================
// TABLERO DE ÓRDENES DE TRABAJO — MANTENIMIENTO
// El backlog operativo: avisos de falla nuevos (para convertir en OT) y
// OT abiertas agrupadas por estado, con cierre (causa/repuestos/horas) y
// LOTO. Botón para generar OT preventivas desde las gamas (RPC).
// Escritura: equipo de mantenimiento (jefe + técnicos) o super admin.
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
  const [generando, setGenerando] = useState(false)

  // Cierre de OT
  const [cerrando, setCerrando] = useState<MantOT | null>(null)
  const [cierre, setCierre] = useState<CierreForm>(CIERRE_VACIO)
  const [guardando, setGuardando] = useState(false)

  const nombrePorId = useMemo(() => new Map(activos.map((a) => [a.id, a.nombre])), [activos])

  const cargar = useCallback(async () => {
    if (!supabase) { setCargando(false); return }
    const [{ data: av }, { data: ot }, { data: ac }] = await Promise.all([
      supabase.from('mant_avisos').select('*').in('estado', ['nuevo', 'en_ot']).order('creado_en', { ascending: false }),
      supabase.from('mant_ordenes_trabajo').select('*').order('creado_en', { ascending: false }).limit(200),
      supabase.from('mant_activos').select('id, nombre'),
    ])
    setAvisos((av ?? []) as MantAviso[])
    setOts((ot ?? []) as MantOT[])
    setActivos((ac ?? []) as Pick<MantActivo, 'id' | 'nombre'>[])
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  useEffect(() => {
    const sb = supabase
    if (!sb) return
    const canal = sb.channel('mant-tablero')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mant_avisos' }, () => { void cargar() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mant_ordenes_trabajo' }, () => { void cargar() })
      .subscribe()
    return () => { void sb.removeChannel(canal) }
  }, [cargar])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  const avisosNuevos = useMemo(() => avisos.filter((a) => a.estado === 'nuevo'), [avisos])
  const abiertas = useMemo(() => ots.filter((o) => OT_ABIERTAS.includes(o.estado)), [ots])
  const cerradas = useMemo(() => ots.filter((o) => o.estado === 'cerrada').slice(0, 12), [ots])

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

  async function avanzar(ot: MantOT, nuevo: OtEstado) {
    if (!supabase) return
    const patch: Record<string, unknown> = { estado: nuevo, actualizado_en: new Date().toISOString() }
    if (nuevo === 'en_ejecucion' && !ot.fecha_inicio) patch.fecha_inicio = new Date().toISOString()
    const { error: e } = await supabase.from('mant_ordenes_trabajo').update(patch).eq('id', ot.id)
    if (e) { setError(`No se pudo actualizar la OT ${ot.numero}.`); return }
    void cargar()
  }

  async function asignar(ot: MantOT) {
    if (!supabase) return
    const r = window.prompt('Técnico responsable (usuario):', ot.responsable ?? usuario?.usuario ?? '')
    if (r == null) return
    await supabase.from('mant_ordenes_trabajo').update({ responsable: r.trim() || null, actualizado_en: new Date().toISOString() }).eq('id', ot.id)
    void cargar()
  }

  function abrirCierre(ot: MantOT) {
    setCierre(CIERRE_VACIO)
    setCerrando(ot)
  }

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
    // Si venía de un aviso, marcar el aviso como resuelto.
    if (cerrando.aviso_id) {
      await supabase.from('mant_avisos').update({ estado: 'resuelto', atendido_en: new Date().toISOString() }).eq('id', cerrando.aviso_id)
    }
    setAviso(`OT ${cerrando.numero} cerrada.`)
    setCerrando(null)
    void cargar()
  }

  async function generarPreventivas() {
    if (!supabase) return
    setGenerando(true)
    setError('')
    const { data, error: e } = await supabase.rpc('mant_generar_ot_preventivas')
    setGenerando(false)
    if (e) { setError(`No se pudieron generar las OT preventivas: ${e.message}`); return }
    setAviso(`${data ?? 0} OT preventiva(s) generada(s).`)
    void cargar()
  }

  if (!supabase) return <div className="empty">Supabase no está configurado (faltan credenciales en .env).</div>

  const label = (id: string) => nombrePorId.get(id) ?? id

  return (
    <div className="mant-tablero">
      <div className="mant-mapa-top no-print">
        <div className="section-title" style={{ margin: 0 }}>📝 Tablero de órdenes de trabajo</div>
        {esAdmin && (
          <button className="btn btn-primary" style={{ minHeight: 44, padding: '0 14px' }} disabled={generando} onClick={() => void generarPreventivas()}>
            {generando ? 'Generando…' : '🔁 Generar OT preventivas'}
          </button>
        )}
        <span className="meta" style={{ marginLeft: 'auto' }}>
          {avisosNuevos.length} aviso(s) · {abiertas.length} OT abiertas
        </span>
      </div>

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
                      <span className="meta">{fechaCorta(av.creado_en)}</span>
                    </div>
                    <div className="mant-ot-desc">{av.sintoma}</div>
                    <div className="meta">{label(av.activo_id)} · avisó {av.emisor}</div>
                    {puedeEditar && (
                      <div className="row-actions" style={{ marginTop: 8 }}>
                        <button className="btn btn-verde" style={{ flex: 1, minHeight: 40 }} onClick={() => void convertirAviso(av)}>➕ Crear OT</button>
                        <button className="btn" style={{ minHeight: 40 }} onClick={() => void descartarAviso(av)}>Descartar</button>
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
                <div key={col} className="mant-kanban-col">
                  <div className="mant-kanban-cab">{OT_LABEL[col]} <span className="meta">({lista.length})</span></div>
                  {lista.length === 0 ? <div className="meta" style={{ padding: '4px 2px' }}>—</div> : lista.map((o) => (
                    <div key={o.id} className={'mant-ot-card mant-ot-' + o.tipo}>
                      <div className="mant-ot-cab">
                        <strong>OT {o.numero}</strong>
                        <span className={'mant-ot-tag t-' + o.tipo}>{o.tipo}</span>
                      </div>
                      <button className="mant-ot-activo" onClick={() => onVerFicha?.(o.activo_id)} title="Ver ficha">
                        {o.activo_id} · {label(o.activo_id)}
                      </button>
                      <div className="mant-ot-desc">{o.descripcion}</div>
                      <div className="meta">
                        prioridad {o.prioridad}
                        {o.fecha_objetivo ? ` · objetivo ${fechaCorta(o.fecha_objetivo)}` : ''}
                        {o.responsable ? ` · ${o.responsable}` : ' · sin asignar'}
                      </div>
                      {puedeEditar && (
                        <div className="mant-ot-acc">
                          {o.estado !== 'en_ejecucion' && <button className="btn" onClick={() => void avanzar(o, 'en_ejecucion')}>▶ Iniciar</button>}
                          {o.estado === 'creada' && <button className="btn" onClick={() => void avanzar(o, 'planificada')}>📅 Planificar</button>}
                          {o.estado !== 'en_espera' && <button className="btn" onClick={() => void avanzar(o, 'en_espera')}>⏸ Espera</button>}
                          <button className="btn" onClick={() => void asignar(o)}>👤 Asignar</button>
                          <button className="btn btn-verde" onClick={() => abrirCierre(o)}>✔ Cerrar</button>
                        </div>
                      )}
                    </div>
                  ))}
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

      {/* ---------- Modal de cierre ---------- */}
      {cerrando && (
        <div className="modal-overlay" onClick={() => setCerrando(null)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <h2>Cerrar OT {cerrando.numero} · {label(cerrando.activo_id)}</h2>
            <div className="field">
              <label>¿Qué se hizo? *</label>
              <textarea className="input" style={{ minHeight: 80, padding: '10px 14px' }} value={cierre.trabajo} onChange={(e) => setCierre({ ...cierre, trabajo: e.target.value })} placeholder="Trabajo realizado" />
            </div>
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
            {cerrando.loto_requerido && (
              <label className="mant-check" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={cierre.loto} onChange={(e) => setCierre({ ...cierre, loto: e.target.checked })} />
                🔒 Bloqueo LOTO aplicado y verificado
              </label>
            )}
            {error && <div className="error-msg" style={{ textAlign: 'left' }}>{error}</div>}
            <div className="row-actions" style={{ marginTop: 14 }}>
              <button className="btn btn-verde" style={{ flex: 1, minHeight: 44 }} disabled={guardando} onClick={() => void guardarCierre()}>💾 Cerrar OT</button>
              <button className="btn" onClick={() => setCerrando(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
