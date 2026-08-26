import { useMemo, useState } from 'react'
import {
  type AutorizacionSGO, type ClaseAutorizacionSGO, type EstadoAutorizacionSGO, type PrioridadAutorizacionSGO,
  type TipoAutorizacionSGO,
} from '../../sgo/autorizaciones'
import { guardarLimiteAutorizacionMejora } from '../../sgo/limitesAutorizacion'

const TIPOS: Record<TipoAutorizacionSGO, string> = {
  revision_5s: 'Revisión 5S', tarea_sgo: 'Tarea SGO', agenda_iso: 'Agenda ISO',
  mejora: 'Mejora continua', retrabajo: 'Retrabajo crítico', accion: 'Acción correctiva',
}

const PRIORIDADES: PrioridadAutorizacionSGO[] = ['critica', 'alta', 'media', 'baja']

function fechaHora(iso: string) {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

function antiguedad(iso: string) {
  const dias = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Hace 1 día'
  return `Hace ${dias} días`
}

const CLASES: { id: ClaseAutorizacionSGO; label: string; ayuda: string }[] = [
  { id: 'autorizacion_economica', label: 'Autorizaciones económicas', ayuda: 'Solo mejoras que superan el límite vigente.' },
  { id: 'revision_5s', label: 'Revisión de puntaje 5S', ayuda: 'Validación exclusiva de Lorenzo por su impacto en el premio mensual.' },
  { id: 'seguimiento', label: 'Seguimientos', ayuda: 'Información operativa; no bloquea el trabajo del equipo.' },
]

export default function AutorizacionesSGOView({ items, onAbrir, umbral, usuario, onUmbralActualizado }: {
  items: AutorizacionSGO[]
  onAbrir: (item: AutorizacionSGO) => void
  umbral: number
  usuario: string
  onUmbralActualizado: (monto: number) => void
}) {
  const [clase, setClase] = useState<ClaseAutorizacionSGO>('autorizacion_economica')
  const [estado, setEstado] = useState<EstadoAutorizacionSGO>('pendiente')
  const [tipo, setTipo] = useState<TipoAutorizacionSGO | ''>('')
  const [prioridad, setPrioridad] = useState<PrioridadAutorizacionSGO | ''>('')
  const [buscar, setBuscar] = useState('')
  const [editandoUmbral, setEditandoUmbral] = useState(false)
  const [nuevoUmbral, setNuevoUmbral] = useState(umbral)
  const [guardandoUmbral, setGuardandoUmbral] = useState(false)
  const deClase = items.filter((item) => item.clase === clase)
  const pendientes = deClase.filter((item) => item.estado === 'pendiente')
  const resueltas = deClase.filter((item) => item.estado === 'resuelta')
  const q = buscar.trim().toLocaleLowerCase('es')
  const visibles = useMemo(() => items.filter((item) => item.clase === clase && item.estado === estado && (!tipo || item.tipo === tipo) &&
    (!prioridad || item.prioridad === prioridad) && (!q || `${item.titulo} ${item.detalle} ${item.solicitadoPor} ${item.area ?? ''}`.toLocaleLowerCase('es').includes(q)))
    .slice(0, estado === 'resuelta' ? 100 : undefined), [items, clase, estado, tipo, prioridad, q])
  const criticas = pendientes.filter((item) => item.prioridad === 'critica').length
  const altas = pendientes.filter((item) => item.prioridad === 'alta').length
  const masAntigua = pendientes.length ? [...pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))[0] : undefined

  async function guardarUmbral() {
    setGuardandoUmbral(true)
    try {
      const guardado = await guardarLimiteAutorizacionMejora(nuevoUmbral, usuario)
      onUmbralActualizado(guardado.monto)
      setEditandoUmbral(false)
    } catch (error) { window.alert(error instanceof Error ? error.message : 'No se pudo guardar el límite.') }
    finally { setGuardandoUmbral(false) }
  }

  const tiposClase = Object.entries(TIPOS).filter(([id]) => items.some((item) => item.clase === clase && item.tipo === id))
  return <div className="sgo-autorizaciones">
    <div className="card sgo-autorizaciones-cabecera">
      <div><div className="section-title">DECISIONES Y SEGUIMIENTOS DE LORENZO</div><div className="meta">Las autorizaciones económicas, los puntajes 5S y los seguimientos están separados para no frenar al equipo.</div></div>
      <span className="sgo-autorizaciones-privada">Vista privada</span>
    </div>

    <div className="card sgo-autorizaciones-limite">
      <div><strong>Límite de autorización de mejoras</strong><div className="meta">Las mejoras de hasta {umbral.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} avanzan sin autorización de Lorenzo.</div></div>
      {!editandoUmbral ? <button className="btn" onClick={() => { setNuevoUmbral(umbral); setEditandoUmbral(true) }}>Editar límite</button> : <div className="row-actions"><input className="input" type="number" min="1" value={nuevoUmbral} onChange={(e) => setNuevoUmbral(Number(e.target.value))} /><button className="btn" onClick={() => setEditandoUmbral(false)}>Cancelar</button><button className="btn btn-primary" disabled={guardandoUmbral} onClick={() => void guardarUmbral()}>Guardar nueva vigencia</button></div>}
    </div>

    <div className="tabs sgo-autorizaciones-clases">
      {CLASES.map((opcion) => { const cantidad = items.filter((item) => item.clase === opcion.id && item.estado === 'pendiente').length; return <button className={`tab ${clase === opcion.id ? 'active' : ''}`} title={opcion.ayuda} key={opcion.id} onClick={() => { setClase(opcion.id); setEstado('pendiente'); setTipo('') }}>{opcion.label} ({cantidad})</button> })}
    </div>

    <div className="sgo-autorizaciones-kpis">
      <Resumen valor={pendientes.length} label="Pendientes" tono={pendientes.length ? 'amarillo' : 'verde'} />
      <Resumen valor={criticas} label="Críticas" tono={criticas ? 'rojo' : 'verde'} />
      <Resumen valor={altas} label="Prioridad alta" tono={altas ? 'naranja' : 'verde'} />
      <Resumen valor={resueltas.length} label="Resueltas" tono="azul" />
      <Resumen valor={masAntigua ? antiguedad(masAntigua.fecha) : 'Al día'} label="Pendiente más antigua" tono={masAntigua ? 'amarillo' : 'verde'} />
    </div>

    <div className="tabs sgo-autorizaciones-tabs">
      <button className={`tab ${estado === 'pendiente' ? 'active' : ''}`} onClick={() => setEstado('pendiente')}>Pendientes ({pendientes.length})</button>
      <button className={`tab ${estado === 'resuelta' ? 'active' : ''}`} onClick={() => setEstado('resuelta')}>Historial resuelto ({resueltas.length})</button>
    </div>

    <div className="card sgo-autorizaciones-filtros">
      <input className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar decisión, persona o área…" />
      <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoAutorizacionSGO | '')}><option value="">Todos los tipos</option>{tiposClase.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      <select className="input" value={prioridad} onChange={(e) => setPrioridad(e.target.value as PrioridadAutorizacionSGO | '')}><option value="">Todas las prioridades</option>{PRIORIDADES.map((item) => <option value={item} key={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select>
    </div>

    {!visibles.length ? <div className="card sgo-autorizaciones-vacio"><strong>{estado === 'pendiente' ? 'No hay pendientes en esta sección.' : 'No hay decisiones resueltas con estos filtros.'}</strong><span>{estado === 'pendiente' ? 'La bandeja está al día.' : 'Probá cambiar los filtros.'}</span></div>
      : <div className="sgo-autorizaciones-lista">{visibles.map((item) => <article className={`card sgo-autorizacion-card prioridad-${item.prioridad}`} key={item.id}>
        <div className="sgo-autorizacion-marca"><span>{TIPOS[item.tipo]}</span><b>{item.prioridad}</b></div>
        <div className="sgo-autorizacion-contenido">
          <div className="sgo-autorizacion-titulo"><strong>{item.titulo}</strong><span className={`estado-chip autorizacion-${item.estado}`}>{item.estado === 'pendiente' ? antiguedad(item.fecha) : 'Resuelta'}</span></div>
          <p>{item.detalle}</p>
          <div className="sgo-autorizacion-meta"><span>Solicitó: <b>{item.solicitadoPor}</b></span>{item.area && <span>Área: <b>{item.area}</b></span>}<span>{fechaHora(item.fecha)}</span></div>
          {item.resultado && <div className="sgo-autorizacion-resultado">{item.resultado}</div>}
        </div>
        <div className="sgo-autorizacion-acciones"><button className={`btn ${item.estado === 'pendiente' ? 'btn-primary' : ''}`} onClick={() => onAbrir(item)}>{item.estado === 'pendiente' ? 'Revisar y decidir' : 'Ver expediente'}</button></div>
      </article>)}</div>}
  </div>
}

function Resumen({ valor, label, tono }: { valor: number | string; label: string; tono: string }) {
  return <div className={`card sgo-autorizacion-kpi tono-${tono}`}><strong>{valor}</strong><span>{label}</span></div>
}
