import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import { guardarAccionSGO, guardarEventoSGO } from '../../sync/syncEngine'
import {
  AREAS_SGO, PILARES_SGO, TIPOS_EVENTO_SGO, areaSGOLabel, codigoEventoSGO,
  type AccionSGO, type EstadoEventoSGO, type EventoSGO,
  type AreaSGOId, type SeveridadSGO, type TipoAccionSGO, type TipoEventoSGO,
} from '../../sgo/types'

const ESTADOS_EVENTO: { id: EstadoEventoSGO; label: string }[] = [
  { id: 'abierto', label: 'Abierto' }, { id: 'contenido', label: 'Contenido' },
  { id: 'en_analisis', label: 'En análisis' }, { id: 'con_acciones', label: 'Con acciones' },
  { id: 'cerrado', label: 'Cerrado' },
]

const SEVERIDADES: { id: SeveridadSGO; label: string }[] = [
  { id: 'baja', label: 'Baja' }, { id: 'media', label: 'Media' },
  { id: 'alta', label: 'Alta' }, { id: 'critica', label: 'Crítica' },
]

const hoy = () => new Date().toISOString().slice(0, 10)
const fechaMasDias = (dias: number) => {
  const d = new Date(); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10)
}

function fechaHora(iso: string) {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

function vencida(a: AccionSGO) {
  return !['verificada', 'cancelada'].includes(a.estado) && a.fechaCompromiso < hoy()
}

export default function SGOView() {
  const { usuario } = useAuth()
  const eventos = useLiveQuery(() => db.eventosSGO.toArray(), []) ?? []
  const acciones = useLiveQuery(() => db.accionesSGO.toArray(), []) ?? []
  const [nuevo, setNuevo] = useState(false)
  const [seleccionadoId, setSeleccionadoId] = useState<string>()
  const [filtroArea, setFiltroArea] = useState('')
  const seleccionado = eventos.find((e) => e.id === seleccionadoId)

  const abiertos = eventos.filter((e) => e.estado !== 'cerrado')
  const resumen = useMemo(() => PILARES_SGO.map((p) => ({
    ...p,
    abiertos: abiertos.filter((e) => e.pilar === p.id).length,
    criticos: abiertos.filter((e) => e.pilar === p.id && e.severidad === 'critica').length,
  })), [eventos])
  const vencidas = acciones.filter(vencida).length
  const abiertosFiltrados = filtroArea ? abiertos.filter((e) => e.areaId === filtroArea) : abiertos

  return (
    <div>
      <div className="card" style={{ marginBottom: 14, borderLeft: '5px solid #2563eb' }}>
        <div className="card-header">
          <div>
            <div className="section-title" style={{ margin: 0 }}>🛡️ SGO INTEGRAL</div>
            <div className="meta">Eventos, no conformidades y acciones de los seis pilares.</div>
          </div>
          <button className="btn btn-primary" onClick={() => setNuevo(true)}>+ Registrar evento</button>
        </div>
      </div>

      <div className="logi-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))' }}>
        {resumen.map((p) => (
          <div className="logi-kpi" key={p.id} style={{ borderTop: `4px solid ${p.color}` }}>
            <div className="n">{p.abiertos}</div>
            <div className="l">{p.label}</div>
            {p.criticos > 0 && <div className="meta" style={{ color: 'var(--rojo)', fontWeight: 800 }}>{p.criticos} crítico(s)</div>}
          </div>
        ))}
        <div className="logi-kpi" style={{ borderTop: '4px solid var(--rojo)' }}>
          <div className="n">{vencidas}</div><div className="l">Acciones vencidas</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18, marginBottom: 10 }}>
        <div className="field" style={{ margin: 0, maxWidth: 420 }}>
          <label>Filtrar eventos por área</label>
          <select className="input" value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)}>
            <option value="">Todas las áreas</option>
            {AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
      </div>
      <div className="section-title">Eventos abiertos ({abiertosFiltrados.length}{filtroArea ? ` de ${abiertos.length}` : ''})</div>
      {abiertosFiltrados.length === 0 ? <div className="empty">No hay eventos abiertos para el área seleccionada.</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {[...abiertosFiltrados].sort((a, b) => b.detectadoEn.localeCompare(a.detectadoEn)).map((e) => {
            const p = PILARES_SGO.find((x) => x.id === e.pilar)
            const acc = acciones.filter((a) => a.eventoId === e.id)
            return (
              <button key={e.id} className="card" onClick={() => setSeleccionadoId(e.id)}
                style={{ textAlign: 'left', cursor: 'pointer', borderLeft: `5px solid ${p?.color ?? '#64748b'}`, width: '100%' }}>
                <div className="card-header">
                  <div>
                    <strong>{e.codigo} · {e.titulo}</strong>
                    <div className="meta">{areaSGOLabel(e.areaId)} · {p?.label} · {SEVERIDADES.find((s) => s.id === e.severidad)?.label} · {fechaHora(e.detectadoEn)}</div>
                    <div style={{ marginTop: 5 }}>{e.descripcion}</div>
                  </div>
                  <span className="estado-chip">{ESTADOS_EVENTO.find((s) => s.id === e.estado)?.label}</span>
                </div>
                <div className="meta" style={{ marginTop: 6 }}>
                  Responsable: <strong>{e.responsable || 'Sin asignar'}</strong> · Acciones: {acc.length} · Vencidas: {acc.filter(vencida).length}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {eventos.some((e) => e.estado === 'cerrado') && (
        <details style={{ marginTop: 16 }}>
          <summary className="section-title" style={{ cursor: 'pointer' }}>Historial cerrado ({eventos.filter((e) => e.estado === 'cerrado').length})</summary>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            {eventos.filter((e) => e.estado === 'cerrado').sort((a, b) => (b.cerradoEn ?? '').localeCompare(a.cerradoEn ?? '')).slice(0, 30).map((e) => (
              <button key={e.id} className="card" onClick={() => setSeleccionadoId(e.id)} style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                <strong>{e.codigo} · {e.titulo}</strong>
                <div className="meta">{areaSGOLabel(e.areaId)} · {PILARES_SGO.find((p) => p.id === e.pilar)?.label} · cerrado {e.cerradoEn ? fechaHora(e.cerradoEn) : ''}</div>
              </button>
            ))}
          </div>
        </details>
      )}

      {nuevo && <NuevoEvento usuario={usuario?.usuario ?? 'sin_usuario'} onClose={() => setNuevo(false)} onCreado={(id) => { setNuevo(false); setSeleccionadoId(id) }} />}
      {seleccionado && <DetalleEvento evento={seleccionado} acciones={acciones.filter((a) => a.eventoId === seleccionado.id)} usuario={usuario?.usuario ?? 'sin_usuario'} onClose={() => setSeleccionadoId(undefined)} />}
    </div>
  )
}

function NuevoEvento({ usuario, onClose, onCreado }: { usuario: string; onClose: () => void; onCreado: (id: string) => void }) {
  const [tipo, setTipo] = useState<TipoEventoSGO>('no_conformidad')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [severidad, setSeveridad] = useState<SeveridadSGO>('media')
  const [areaId, setAreaId] = useState<AreaSGOId | ''>('')
  const [responsable, setResponsable] = useState('')
  const [nroSerie, setNroSerie] = useState('')
  const [guardando, setGuardando] = useState(false)
  const tipoDef = TIPOS_EVENTO_SGO.find((t) => t.id === tipo)!

  async function guardar() {
    if (!titulo.trim() || !descripcion.trim() || !areaId) return
    setGuardando(true)
    const id = crypto.randomUUID(), now = new Date().toISOString()
    const e: EventoSGO = {
      id, codigo: codigoEventoSGO(new Date(), id), tipo, pilar: tipoDef.pilar,
      titulo: titulo.trim(), descripcion: descripcion.trim(), severidad, estado: 'abierto',
      areaId: areaId || undefined, nroSerie: nroSerie.trim() || undefined,
      detectadoEn: now, detectadoPor: usuario, responsable: responsable.trim() || undefined,
      creadoEn: now, actualizadoEn: now,
    }
    await guardarEventoSGO(e)
    setGuardando(false); onCreado(id)
  }

  return <Modal titulo="Registrar evento SGO" onClose={onClose}>
    <div className="field"><label>Tipo de evento *</label><select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEventoSGO)}>{TIPOS_EVENTO_SGO.map((t) => <option key={t.id} value={t.id}>{t.label} · {PILARES_SGO.find((p) => p.id === t.pilar)?.label}</option>)}</select></div>
    <div className="field"><label>Título *</label><input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Diámetro exterior fuera de tolerancia" /></div>
    <div className="field"><label>Descripción del hecho *</label><textarea className="input" rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué ocurrió, dónde se detectó y qué producto o proceso está afectado" /></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
      <div className="field"><label>Severidad</label><select className="input" value={severidad} onChange={(e) => setSeveridad(e.target.value as SeveridadSGO)}>{SEVERIDADES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
      <div className="field"><label>Área *</label><select className="input" value={areaId} onChange={(e) => setAreaId(e.target.value as AreaSGOId | '')}><option value="">Seleccionar área</option>{AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
      <div className="field"><label>N° serie / identificación</label><input className="input" value={nroSerie} onChange={(e) => setNroSerie(e.target.value)} /></div>
      <div className="field"><label>Responsable inicial</label><input className="input" value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Nico, Azul, supervisor…" /></div>
    </div>
    <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={guardando || !titulo.trim() || !descripcion.trim() || !areaId} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Registrar'}</button></div>
  </Modal>
}

function DetalleEvento({ evento, acciones, usuario, onClose }: { evento: EventoSGO; acciones: AccionSGO[]; usuario: string; onClose: () => void }) {
  const [contencion, setContencion] = useState(evento.contencion ?? '')
  const [causaRaiz, setCausaRaiz] = useState(evento.causaRaiz ?? '')
  const [estado, setEstado] = useState(evento.estado)
  const [nuevaAccion, setNuevaAccion] = useState(false)

  async function actualizar() {
    const pendientes = acciones.filter((a) => !['verificada', 'cancelada'].includes(a.estado))
    if (estado === 'cerrado' && pendientes.length > 0) {
      window.alert(`No se puede cerrar: quedan ${pendientes.length} acción(es) sin verificar.`)
      return
    }
    const now = new Date().toISOString()
    await guardarEventoSGO({ ...evento, contencion: contencion.trim() || undefined, causaRaiz: causaRaiz.trim() || undefined, estado, actualizadoEn: now, cerradoEn: estado === 'cerrado' ? now : undefined, cerradoPor: estado === 'cerrado' ? usuario : undefined })
  }

  return <Modal titulo={`${evento.codigo} · ${evento.titulo}`} onClose={onClose} ancho={780}>
    <div className="meta">Área <strong>{areaSGOLabel(evento.areaId)}</strong> · detectado {fechaHora(evento.detectadoEn)} por <strong>{evento.detectadoPor}</strong> · Pilar {PILARES_SGO.find((p) => p.id === evento.pilar)?.label}</div>
    <p>{evento.descripcion}</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
      <div className="field"><label>Estado</label><select className="input" value={estado} onChange={(e) => setEstado(e.target.value as EstadoEventoSGO)}>{ESTADOS_EVENTO.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
      <div className="field"><label>Responsable</label><input className="input" value={evento.responsable ?? ''} disabled /></div>
    </div>
    <div className="field"><label>Contención inmediata</label><textarea className="input" rows={3} value={contencion} onChange={(e) => setContencion(e.target.value)} placeholder="Qué se hizo para proteger personas, producto, cliente o ambiente" /></div>
    <div className="field"><label>Causa raíz</label><textarea className="input" rows={3} value={causaRaiz} onChange={(e) => setCausaRaiz(e.target.value)} placeholder="Completar después del análisis; no confundir con el síntoma" /></div>
    <div className="row-actions" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={() => void actualizar()}>Guardar expediente</button></div>

    <div className="section-title" style={{ marginTop: 18 }}>Acciones ({acciones.length})</div>
    {acciones.length === 0 ? <div className="empty">Sin acciones asignadas.</div> : acciones.map((a) => <AccionCard key={a.id} accion={a} usuario={usuario} />)}
    <button className="btn" style={{ marginTop: 10 }} onClick={() => setNuevaAccion(true)}>+ Agregar acción</button>
    {nuevaAccion && <NuevaAccion evento={evento} usuario={usuario} onClose={() => setNuevaAccion(false)} />}
  </Modal>
}

function NuevaAccion({ evento, usuario, onClose }: { evento: EventoSGO; usuario: string; onClose: () => void }) {
  const [tipo, setTipo] = useState<TipoAccionSGO>('correctiva')
  const [descripcion, setDescripcion] = useState('')
  const [responsable, setResponsable] = useState(evento.responsable ?? '')
  const [fecha, setFecha] = useState(fechaMasDias(7))
  async function guardar() {
    if (!descripcion.trim() || !responsable.trim() || !fecha) return
    const now = new Date().toISOString()
    await guardarAccionSGO({ id: crypto.randomUUID(), eventoId: evento.id, tipo, descripcion: descripcion.trim(), responsable: responsable.trim(), fechaCompromiso: fecha, estado: 'pendiente', creadoEn: now, creadoPor: usuario, actualizadoEn: now })
    if (evento.estado !== 'cerrado') await guardarEventoSGO({ ...evento, estado: 'con_acciones', actualizadoEn: now })
    onClose()
  }
  return <div className="card" style={{ marginTop: 10, background: 'var(--fondo)' }}>
    <div className="field"><label>Acción</label><textarea className="input" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 8 }}>
      <div className="field"><label>Tipo</label><select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoAccionSGO)}><option value="correccion">Corrección</option><option value="correctiva">Correctiva</option><option value="preventiva">Preventiva</option><option value="mejora">Mejora</option></select></div>
      <div className="field"><label>Responsable</label><input className="input" value={responsable} onChange={(e) => setResponsable(e.target.value)} /></div>
      <div className="field"><label>Fecha compromiso</label><input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
    </div>
    <div className="row-actions" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => void guardar()}>Asignar</button></div>
  </div>
}

function AccionCard({ accion: a, usuario }: { accion: AccionSGO; usuario: string }) {
  async function completar() {
    const now = new Date().toISOString(); await guardarAccionSGO({ ...a, estado: 'completada', completadaEn: now, completadaPor: usuario, actualizadoEn: now })
  }
  async function verificar(eficaz: boolean) {
    const now = new Date().toISOString(); await guardarAccionSGO({ ...a, estado: eficaz ? 'verificada' : 'en_curso', verificadaEn: now, verificadaPor: usuario, eficaz, actualizadoEn: now })
  }
  return <div className="card" style={{ marginBottom: 8, borderLeft: vencida(a) ? '4px solid var(--rojo)' : undefined }}>
    <strong>{a.descripcion}</strong><div className="meta">{a.tipo} · {a.responsable} · vence {a.fechaCompromiso} · {a.estado}{vencida(a) ? ' · VENCIDA' : ''}</div>
    <div className="row-actions" style={{ marginTop: 7 }}>
      {['pendiente', 'en_curso'].includes(a.estado) && <button className="btn" onClick={() => void completar()}>Marcar completada</button>}
      {a.estado === 'completada' && <><button className="btn btn-verde" onClick={() => void verificar(true)}>Verificar eficaz</button><button className="btn btn-rojo" onClick={() => void verificar(false)}>No eficaz</button></>}
    </div>
  </div>
}

function Modal({ titulo, onClose, ancho = 680, children }: { titulo: string; onClose: () => void; ancho?: number; children: React.ReactNode }) {
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: ancho, width: '96%', maxHeight: '92vh', overflow: 'auto' }}><div className="card-header" style={{ marginBottom: 12 }}><div className="section-title" style={{ margin: 0 }}>{titulo}</div><button className="btn" onClick={onClose}>×</button></div>{children}</div></div>
}
