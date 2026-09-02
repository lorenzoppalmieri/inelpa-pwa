import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { SECTORES, causaLabel, type Parada, type Tarea } from '../../types'
import { areaSGODesdeSector, noConformidadDesdeParada } from '../../sgo/integraciones'
import {
  duracionParadaCalidad, esParadaDeCalidad, esRetrabajoExplicito, estadoRevisionParadaCalidad,
  mesAnteriorISO, nivelRecurrencia, variacionPorcentual, type EstadoRevisionParadaCalidad,
} from '../../sgo/paradasCalidad'
import { usuarioPuedeInvestigarRetrabajo } from '../../sgo/permisos'
import { AREAS_SGO, areaSGOLabel, type AreaSGOId, type EventoSGO } from '../../sgo/types'
import { guardarDecisionParadaCalidad, guardarEventoSGO } from '../../sync/syncEngine'

interface FilaParadaCalidad {
  tarea: Tarea
  parada: Parada
  evento?: EventoSGO
  areaId?: AreaSGOId
  minutos: number
  estado: EstadoRevisionParadaCalidad
  recurrencia: number
}

const fechaHora = (iso: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))

export default function ParadasCalidadSGOView({ usuario, onInvestigar }: { usuario: string; onInvestigar: (evento: EventoSGO) => void }) {
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const eventos = useLiveQuery(() => db.eventosSGO.toArray(), []) ?? []
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), []) ?? []
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const hoy = new Date().toISOString()
  const [periodo, setPeriodo] = useState(hoy.slice(0, 7))
  const [area, setArea] = useState<AreaSGOId | ''>('')
  const [estado, setEstado] = useState<EstadoRevisionParadaCalidad | ''>('pendiente')
  const [buscar, setBuscar] = useState('')
  const [metrica, setMetrica] = useState<'cantidad' | 'tiempo'>('cantidad')
  const [descartando, setDescartando] = useState<FilaParadaCalidad>()
  const [motivo, setMotivo] = useState('')
  const [guardandoId, setGuardandoId] = useState<string>()
  const [error, setError] = useState('')
  const puedeDecidir = usuarioPuedeInvestigarRetrabajo(usuario)

  const filas = useMemo(() => {
    const porParada = new Map(eventos.filter((evento) => evento.paradaId).map((evento) => [evento.paradaId!, evento]))
    const base = tareas.flatMap((tarea) => tarea.paradas.filter(esParadaDeCalidad).map((parada) => ({
      tarea,
      parada,
      evento: porParada.get(parada.id),
      areaId: areaSGODesdeSector(tarea.sectorId),
      minutos: duracionParadaCalidad(parada, tarea.finReal, hoy),
    })))
    return base.map((fila) => ({
      ...fila,
      estado: estadoRevisionParadaCalidad(fila.parada, fila.evento),
      recurrencia: base.filter((otra) => otra.parada.causa === fila.parada.causa && otra.areaId === fila.areaId && Math.abs(new Date(fila.parada.inicio).getTime() - new Date(otra.parada.inicio).getTime()) <= 30 * 86400000).length,
    }))
  }, [eventos, tareas, hoy])

  const delPeriodo = filas.filter((fila) => fila.parada.inicio.slice(0, 7) === periodo && (!area || fila.areaId === area))
  const anterior = filas.filter((fila) => fila.parada.inicio.slice(0, 7) === mesAnteriorISO(periodo) && (!area || fila.areaId === area))
  const paradasARevisar = delPeriodo.filter((fila) => !esRetrabajoExplicito(fila.parada))
  const pendientesTotales = filas.filter((fila) => !esRetrabajoExplicito(fila.parada) && fila.estado === 'pendiente' && (!area || fila.areaId === area))
  const investigando = paradasARevisar.filter((fila) => fila.estado === 'investigando')
  const descartadas = paradasARevisar.filter((fila) => fila.estado === 'descartada')
  const minutos = delPeriodo.reduce((total, fila) => total + fila.minutos, 0)
  const variacion = variacionPorcentual(delPeriodo.length, anterior.length)
  const q = buscar.trim().toLocaleLowerCase('es')
  const baseListado = estado === 'pendiente' ? pendientesTotales : paradasARevisar
  const visibles = baseListado.filter((fila) => {
    const texto = `${causaLabel(fila.parada.causa)} ${fila.parada.observacion ?? ''} ${fila.tarea.modelo} ${fila.tarea.nroTransformador ?? ''} ${fila.tarea.ordenId ?? ''}`.toLocaleLowerCase('es')
    return (!estado || fila.estado === estado) && (!q || texto.includes(q))
  }).sort((a, b) => estado === 'pendiente' ? a.parada.inicio.localeCompare(b.parada.inicio) : b.parada.inicio.localeCompare(a.parada.inicio))

  const pareto = useMemo(() => {
    const grupos = new Map<string, { causa: string; cantidad: number; minutos: number }>()
    for (const fila of delPeriodo) {
      const actual = grupos.get(fila.parada.causa) ?? { causa: causaLabel(fila.parada.causa), cantidad: 0, minutos: 0 }
      actual.cantidad += 1
      actual.minutos += fila.minutos
      grupos.set(fila.parada.causa, actual)
    }
    return [...grupos.values()].sort((a, b) => metrica === 'cantidad' ? b.cantidad - a.cantidad : b.minutos - a.minutos).slice(0, 8)
  }, [delPeriodo, metrica])
  const maxPareto = Math.max(1, ...pareto.map((item) => metrica === 'cantidad' ? item.cantidad : item.minutos))

  async function investigar(fila: FilaParadaCalidad) {
    if (!puedeDecidir || guardandoId) return
    setGuardandoId(fila.parada.id); setError('')
    try {
      const parada = fila.parada.ncDescartada ? { ...fila.parada, ncDescartada: undefined, ncDescartadaPor: undefined, ncDescartadaEn: undefined, ncMotivoDescarte: undefined } : fila.parada
      if (parada !== fila.parada) await guardarDecisionParadaCalidad(parada)
      const resultado = await noConformidadDesdeParada(fila.tarea, parada, usuario)
      const ahora = new Date().toISOString()
      const evento: EventoSGO = {
        ...resultado.evento,
        estado: 'en_analisis', responsable: 'Lara',
        retrabajo: {
          ...resultado.evento.retrabajo!, causaId: parada.causa,
          decisionCalidad: 'investigar', decisionCalidadEn: ahora, decisionCalidadPor: usuario,
          decisionCalidadMotivo: undefined, tomadoEn: resultado.evento.retrabajo?.tomadoEn ?? ahora,
          tomadoPor: resultado.evento.retrabajo?.tomadoPor ?? usuario,
        },
        actualizadoEn: ahora,
      }
      await guardarEventoSGO(evento)
      onInvestigar(evento)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la investigación.')
    } finally { setGuardandoId(undefined) }
  }

  async function confirmarDescarte() {
    const fila = descartando
    if (!fila || !puedeDecidir || !motivo.trim() || guardandoId) return
    setGuardandoId(fila.parada.id); setError('')
    try {
      const ahora = new Date().toISOString()
      await guardarDecisionParadaCalidad({ ...fila.parada, ncDescartada: true, ncDescartadaPor: usuario, ncDescartadaEn: ahora, ncMotivoDescarte: motivo.trim() })
      if (fila.evento?.retrabajo) {
        await guardarEventoSGO({
          ...fila.evento,
          retrabajo: { ...fila.evento.retrabajo, decisionCalidad: 'descartada', decisionCalidadEn: ahora, decisionCalidadPor: usuario, decisionCalidadMotivo: motivo.trim() },
          actualizadoEn: ahora,
        })
      }
      setDescartando(undefined); setMotivo('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descartar la parada.')
    } finally { setGuardandoId(undefined) }
  }

  async function reactivar(fila: FilaParadaCalidad) {
    if (!puedeDecidir || guardandoId) return
    setGuardandoId(fila.parada.id); setError('')
    try {
      const ahora = new Date().toISOString()
      await guardarDecisionParadaCalidad({ ...fila.parada, ncDescartada: undefined, ncDescartadaPor: undefined, ncDescartadaEn: undefined, ncMotivoDescarte: undefined })
      if (fila.evento?.retrabajo) await guardarEventoSGO({
        ...fila.evento,
        retrabajo: { ...fila.evento.retrabajo, decisionCalidad: 'pendiente', decisionCalidadEn: ahora, decisionCalidadPor: usuario, decisionCalidadMotivo: undefined },
        actualizadoEn: ahora,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reactivar la parada.')
    } finally { setGuardandoId(undefined) }
  }

  return <div className="sgo-calidad-productiva">
    <div className="card sgo-calidad-cabecera"><div><div className="section-title">PARADAS POR PROBLEMAS DE CALIDAD</div><div className="meta">Lara revisa la recurrencia y decide cuáles casos requieren una investigación completa. Descartar no borra la parada de Producción ni altera sus tiempos.</div></div><div className="row-actions"><input className="input" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /><select className="input" value={area} onChange={(e) => setArea(e.target.value as AreaSGOId | '')}><option value="">Todas las áreas</option>{AREAS_SGO.filter((item) => delPeriodo.some((fila) => fila.areaId === item.id) || filas.some((fila) => fila.areaId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div></div>
    {!puedeDecidir && <div className="sgo-retrabajos-aviso">Vista de consulta. Las decisiones sobre estas paradas corresponden a Lara y Lorenzo.</div>}
    <div className="sgo-retrabajos-kpis">
      <Kpi valor={delPeriodo.length} label="Paradas del mes" tono="azul" />
      <Kpi valor={`${Math.round(minutos / 60 * 10) / 10} h`} label="Tiempo perdido" tono="rojo" />
      <Kpi valor={pendientesTotales.length} label="Pendientes totales" tono={pendientesTotales.length ? 'amarillo' : 'verde'} />
      <Kpi valor={investigando.length} label="Pasaron a investigación" tono="azul" />
      <Kpi valor={descartadas.length} label="Descartadas con motivo" tono="gris" />
      <Kpi valor={variacion === undefined ? 'Sin base' : `${variacion > 0 ? '+' : ''}${variacion}%`} label="Variación vs mes anterior" tono={variacion === undefined ? 'gris' : variacion <= 0 ? 'verde' : 'rojo'} />
    </div>
    <div className="sgo-calidad-paneles">
      <section className="card sgo-calidad-pareto"><div className="card-header"><div><strong>Pareto de causas</strong><div className="meta">Las causas más repetidas quedan arriba.</div></div><div className="tabs"><button className={`tab ${metrica === 'cantidad' ? 'active' : ''}`} onClick={() => setMetrica('cantidad')}>Cantidad</button><button className={`tab ${metrica === 'tiempo' ? 'active' : ''}`} onClick={() => setMetrica('tiempo')}>Tiempo</button></div></div>{pareto.length ? <div className="sgo-calidad-barras">{pareto.map((item) => { const valor = metrica === 'cantidad' ? item.cantidad : item.minutos; const nivel = nivelRecurrencia(item.cantidad, item.minutos); return <div key={item.causa}><div><span title={item.causa}>{item.causa}</span><strong>{metrica === 'cantidad' ? `${item.cantidad} parada(s)` : `${item.minutos} min`}</strong></div><i><span className={`recurrencia-${nivel}`} style={{ width: `${Math.max(4, valor / maxPareto * 100)}%` }} /></i></div> })}</div> : <div className="empty">No hay paradas de calidad en el período.</div>}</section>
      <section className="card sgo-calidad-criterio"><strong>Criterio de atención</strong><div><span className="estado-chip calidad-prioritaria">Prioritaria</span><p>3 o más repeticiones en 30 días, o 60 minutos acumulados.</p></div><div><span className="estado-chip calidad-atencion">Atención</span><p>2 repeticiones o 30 minutos acumulados.</p></div><div><span className="estado-chip calidad-normal">Normal</span><p>Caso aislado. Lara decide si corresponde investigar.</p></div></section>
    </div>
    <div className="card sgo-calidad-filtros"><div><input className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar causa, observación, modelo, serie u orden…" />{estado === 'pendiente' && <div className="meta" style={{ marginTop: 5 }}>La bandeja pendiente incluye todos los meses, del caso más antiguo al más reciente.</div>}</div><select className="input" value={estado} onChange={(e) => setEstado(e.target.value as EstadoRevisionParadaCalidad | '')}><option value="">Todos los estados del mes</option><option value="pendiente">Pendientes de revisar · todos los meses</option><option value="investigando">En investigación</option><option value="descartada">Descartadas</option></select></div>
    {error && <div className="card sgo-calidad-error">{error}</div>}
    <div className="sgo-calidad-lista">{visibles.length ? visibles.map((fila) => {
      const maquina = maquinas.find((item) => item.id === fila.tarea.maquinaId)?.nombre ?? fila.tarea.maquinaId
      const operario = usuarios.find((item) => item.id === fila.tarea.operarioId)?.nombre ?? (fila.tarea.operarioId || 'No identificado')
      const sector = SECTORES.find((item) => item.id === fila.tarea.sectorId)?.nombre ?? fila.tarea.sectorId
      const nivel = nivelRecurrencia(fila.recurrencia, fila.minutos)
      return <article className={`card sgo-calidad-card calidad-${fila.estado}`} key={fila.parada.id}><div className="sgo-calidad-card-top"><div><span className={`estado-chip calidad-${fila.estado}`}>{fila.estado === 'pendiente' ? 'Pendiente' : fila.estado === 'investigando' ? 'En investigación' : 'Descartada'}</span><span className={`estado-chip calidad-${nivel}`}>{nivel === 'prioritaria' ? 'Investigación recomendada' : nivel === 'atencion' ? 'Atención' : 'Caso aislado'}</span></div><strong>{fila.recurrencia} vez/veces en 30 días</strong></div><h4>{causaLabel(fila.parada.causa)}</h4><div className="sgo-calidad-trazabilidad"><span><b>Área:</b> {areaSGOLabel(fila.areaId)}</span><span><b>Sector:</b> {sector}</span><span><b>Máquina:</b> {maquina}</span><span><b>Operario:</b> {operario}</span><span><b>Modelo / serie:</b> {fila.tarea.modelo}{fila.tarea.nroTransformador ? ` · ${fila.tarea.nroTransformador}` : ''}</span><span><b>Ocurrió:</b> {fechaHora(fila.parada.inicio)} · {fila.minutos} min</span></div><div className="sgo-retrabajo-causa">{fila.parada.observacion?.trim() || 'El operario no agregó una observación.'}</div>{fila.estado === 'descartada' && <div className="sgo-calidad-descarte"><b>Motivo:</b> {fila.parada.ncMotivoDescarte || fila.evento?.retrabajo?.decisionCalidadMotivo || 'Sin motivo informado'} · {fila.parada.ncDescartadaPor || fila.evento?.retrabajo?.decisionCalidadPor}</div>}<div className="row-actions">{fila.estado === 'pendiente' && puedeDecidir && <><button className="btn btn-primary" disabled={guardandoId === fila.parada.id} onClick={() => void investigar(fila)}>Tomar e investigar</button><button className="btn" disabled={guardandoId === fila.parada.id} onClick={() => { setDescartando(fila); setMotivo('') }}>Descartar parada</button></>}{fila.estado === 'investigando' && fila.evento && <button className="btn btn-primary" onClick={() => onInvestigar(fila.evento!)}>Abrir investigación</button>}{fila.estado === 'descartada' && puedeDecidir && <button className="btn" disabled={guardandoId === fila.parada.id} onClick={() => void reactivar(fila)}>Reactivar revisión</button>}</div></article>
    }) : <div className="empty">No hay paradas para los filtros seleccionados.</div>}</div>
    {descartando && <div className="modal-overlay"><div className="modal sgo-calidad-modal" role="dialog" aria-modal="true" aria-label="Descartar parada de calidad"><div className="card-header"><div><div className="section-title">Descartar parada del circuito SGO</div><div className="meta">La parada seguirá visible en Producción y continuará formando parte de los gráficos.</div></div><button className="btn" onClick={() => setDescartando(undefined)}>×</button></div><div className="card sgo-retrabajo-deteccion"><strong>{causaLabel(descartando.parada.causa)}</strong><div>{descartando.parada.observacion || 'Sin observación del operario.'}</div></div><label className="field"><span>Motivo de la decisión *</span><textarea className="input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: caso aislado ya corregido en el puesto, sin producto afectado." /></label><div className="row-actions"><button className="btn" onClick={() => setDescartando(undefined)}>Cancelar</button><button className="btn btn-primary" disabled={!motivo.trim() || Boolean(guardandoId)} onClick={() => void confirmarDescarte()}>{guardandoId ? 'Guardando…' : 'Confirmar descarte'}</button></div></div></div>}
  </div>
}

function Kpi({ valor, label, tono }: { valor: string | number; label: string; tono: string }) {
  return <div className={`card sgo-retrabajo-kpi tono-${tono}`}><strong>{valor}</strong><span>{label}</span></div>
}
