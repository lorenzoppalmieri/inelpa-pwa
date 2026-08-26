import { useMemo, useState } from 'react'
import {
  type AutorizacionSGO, type ClaseAutorizacionSGO, type EstadoAutorizacionSGO, type PrioridadAutorizacionSGO,
  type TipoAutorizacionSGO,
} from '../../sgo/autorizaciones'

const TIPOS: Record<TipoAutorizacionSGO, string> = {
  revision_5s: 'Revisión 5S', tarea_sgo: 'Tarea SGO', agenda_iso: 'Agenda ISO',
  retrabajo: 'Retrabajo crítico', accion: 'Acción correctiva',
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
  { id: 'revision_5s', label: 'Revisión de puntaje 5S', ayuda: 'Validación exclusiva de Lorenzo por su impacto en el premio mensual.' },
  { id: 'seguimiento', label: 'Seguimientos informativos', ayuda: 'Información operativa; no requiere autorización ni bloquea el trabajo del equipo.' },
]

export default function AutorizacionesSGOView({ items, onAbrir }: {
  items: AutorizacionSGO[]
  onAbrir: (item: AutorizacionSGO) => void
}) {
  const [clase, setClase] = useState<ClaseAutorizacionSGO>('revision_5s')
  const [estado, setEstado] = useState<EstadoAutorizacionSGO>('pendiente')
  const [tipo, setTipo] = useState<TipoAutorizacionSGO | ''>('')
  const [prioridad, setPrioridad] = useState<PrioridadAutorizacionSGO | ''>('')
  const [buscar, setBuscar] = useState('')
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

  const tiposClase = Object.entries(TIPOS).filter(([id]) => items.some((item) => item.clase === clase && item.tipo === id))
  return <div className="sgo-autorizaciones">
    <div className="card sgo-autorizaciones-cabecera">
      <div><div className="section-title">REVISIONES 5S Y SEGUIMIENTOS</div><div className="meta">La mejora continua es gestionada por el equipo SGO. Esta vista conserva únicamente la revisión de puntajes y el seguimiento ejecutivo.</div></div>
      <span className="sgo-autorizaciones-privada">Vista privada</span>
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
        <div className="sgo-autorizacion-acciones"><button className={`btn ${item.estado === 'pendiente' && item.clase === 'revision_5s' ? 'btn-primary' : ''}`} onClick={() => onAbrir(item)}>{item.clase === 'revision_5s' && item.estado === 'pendiente' ? 'Revisar y decidir' : item.clase === 'seguimiento' ? 'Ver seguimiento' : 'Ver expediente'}</button></div>
      </article>)}</div>}
  </div>
}

function Resumen({ valor, label, tono }: { valor: number | string; label: string; tono: string }) {
  return <div className={`card sgo-autorizacion-kpi tono-${tono}`}><strong>{valor}</strong><span>{label}</span></div>
}
