import { useMemo, useState } from 'react'
import {
  type AutorizacionSGO, type EstadoAutorizacionSGO, type PrioridadAutorizacionSGO,
  type TipoAutorizacionSGO,
} from '../../sgo/autorizaciones'

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

export default function AutorizacionesSGOView({ items, onAbrir }: {
  items: AutorizacionSGO[]
  onAbrir: (item: AutorizacionSGO) => void
}) {
  const [estado, setEstado] = useState<EstadoAutorizacionSGO>('pendiente')
  const [tipo, setTipo] = useState<TipoAutorizacionSGO | ''>('')
  const [prioridad, setPrioridad] = useState<PrioridadAutorizacionSGO | ''>('')
  const [buscar, setBuscar] = useState('')
  const pendientes = items.filter((item) => item.estado === 'pendiente')
  const resueltas = items.filter((item) => item.estado === 'resuelta')
  const q = buscar.trim().toLocaleLowerCase('es')
  const visibles = useMemo(() => items.filter((item) => item.estado === estado && (!tipo || item.tipo === tipo) &&
    (!prioridad || item.prioridad === prioridad) && (!q || `${item.titulo} ${item.detalle} ${item.solicitadoPor} ${item.area ?? ''}`.toLocaleLowerCase('es').includes(q)))
    .slice(0, estado === 'resuelta' ? 100 : undefined), [items, estado, tipo, prioridad, q])
  const criticas = pendientes.filter((item) => item.prioridad === 'critica').length
  const altas = pendientes.filter((item) => item.prioridad === 'alta').length
  const masAntigua = pendientes.length ? [...pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))[0] : undefined

  return <div className="sgo-autorizaciones">
    <div className="card sgo-autorizaciones-cabecera">
      <div><div className="section-title">AUTORIZACIONES DE LORENZO</div><div className="meta">Bandeja privada para revisar decisiones pendientes sin perder la trazabilidad de cada expediente.</div></div>
      <span className="sgo-autorizaciones-privada">Vista privada</span>
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
      <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoAutorizacionSGO | '')}><option value="">Todos los tipos</option>{Object.entries(TIPOS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      <select className="input" value={prioridad} onChange={(e) => setPrioridad(e.target.value as PrioridadAutorizacionSGO | '')}><option value="">Todas las prioridades</option>{PRIORIDADES.map((item) => <option value={item} key={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select>
    </div>

    {!visibles.length ? <div className="card sgo-autorizaciones-vacio"><strong>{estado === 'pendiente' ? 'No tenés autorizaciones pendientes.' : 'No hay decisiones resueltas con estos filtros.'}</strong><span>{estado === 'pendiente' ? 'La bandeja está al día.' : 'Probá cambiar los filtros.'}</span></div>
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

