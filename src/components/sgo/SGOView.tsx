import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import { eliminarEventoSGO, guardarAccionSGO, guardarEventoSGO, guardarIndicadorSGO } from '../../sync/syncEngine'
import { fechaLocalISO, sumarDiasLocalISO } from '../../lib/time'
import MatrizSGO from './MatrizSGO'
import IndicadoresSGO from './IndicadoresSGO'
import FichaCeldaSGO from './FichaCeldaSGO'
import AuditoriaLogisticaView from './AuditoriaLogisticaView'
import ControlesSGOView from './ControlesSGOView'
import AgendaISOView from './AgendaISOView'
import CuellosView from '../dashboard/CuellosView'
import TareasSGOView from './TareasSGOView'
import MejorasSGOView from './MejorasSGOView'
import AutorizacionesSGOView from './AutorizacionesSGOView'
import { defectoSGOLabel, defectosParaArea } from '../../sgo/defectos'
import { resolverKPIAutomaticos } from '../../sgo/kpiAutomaticos'
import { aplicarMedicionesIndicadores, type IndicadorSGO } from '../../sgo/indicadores'
import { validarCierreEvento } from '../../sgo/cierre'
import { datosMejoraDesdeEvento } from '../../sgo/mejoras'
import { usuarioEsLorenzo } from '../../sgo/permisos'
import { construirAutorizacionesSGO, type AutorizacionSGO } from '../../sgo/autorizaciones'
import { obtenerLimiteAutorizacionMejora, UMBRAL_AUTORIZACION_MEJORAS_BASE } from '../../sgo/limitesAutorizacion'
import { resolverTrazabilidadProductiva, type TrazabilidadProductivaSGO } from '../../sgo/trazabilidad'
import {
  ID_DIAS_SIN_ACCIDENTES, ID_DIAS_SIN_INCIDENTES, IDS_CONTADORES_SEGURIDAD,
  estadoContadorSeguridad, type TipoContadorSeguridad,
} from '../../sgo/contadoresSeguridad'
import {
  AREAS_SGO, PILARES_SGO, TIPOS_EVENTO_SGO, areaSGOLabel, codigoEventoSGO, costoNoCalidadTotal,
  type AccionSGO, type AuditoriaSGO, type EstadoEventoSGO, type EventoSGO,
  type AreaSGOId, type CostoNoCalidad, type DatosSeguridadSGO, type PilarSGO, type SeveridadSGO, type TipoAccionSGO, type TipoEventoSGO,
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

const ahoraLocal = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
function fechaHora(iso: string) {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

function vencida(a: AccionSGO) {
  return !['verificada', 'cancelada'].includes(a.estado) && a.fechaCompromiso < fechaLocalISO()
}

export default function SGOView() {
  const { usuario } = useAuth()
  const eventos = useLiveQuery(() => db.eventosSGO.toArray(), []) ?? []
  const acciones = useLiveQuery(() => db.accionesSGO.toArray(), []) ?? []
  const indicadores = useLiveQuery(() => db.indicadoresSGO.toArray(), []) ?? []
  const mediciones = useLiveQuery(() => db.medicionesIndicadoresSGO.toArray(), []) ?? []
  const auditoria = useLiveQuery(() => db.auditoriaSGO.toArray(), []) ?? []
  const controles = useLiveQuery(() => db.controlesProgramadosSGO.toArray(), []) ?? []
  const tareas = useLiveQuery(() => db.tareas.toArray(), []) ?? []
  const maquinas = useLiveQuery(() => db.maquinas.toArray(), []) ?? []
  const usuariosPlanta = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const laboratorio = useLiveQuery(() => db.laboratorio.toArray(), []) ?? []
  const tareasLogistica = useLiveQuery(() => db.tareasLogistica.toArray(), []) ?? []
  const tareasSGO = useLiveQuery(() => db.tareasSGO.toArray(), []) ?? []
  const agendaISO = useLiveQuery(() => db.agendaISO.toArray(), []) ?? []
  const ejecucionesControles = useLiveQuery(() => db.ejecucionesControlesSGO.toArray(), []) ?? []
  const [nuevo, setNuevo] = useState(false)
  const [configIndicadores, setConfigIndicadores] = useState(false)
  const [seleccionadoId, setSeleccionadoId] = useState<string>()
  const [controlInicialId, setControlInicialId] = useState<string>()
  const [ejecucionInicialId, setEjecucionInicialId] = useState<string>()
  const [tareaInicialId, setTareaInicialId] = useState<string>()
  const [actividadInicialId, setActividadInicialId] = useState<string>()
  const [mejoraInicial, setMejoraInicial] = useState<{ id: string; vista: 'seguimiento' | 'retrabajos' }>()
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{ area: AreaSGOId; pilar: PilarSGO }>()
  const [filtroArea, setFiltroArea] = useState('')
  const [filtroPilar, setFiltroPilar] = useState('')
  const [umbralAutorizacion, setUmbralAutorizacion] = useState(UMBRAL_AUTORIZACION_MEJORAS_BASE)
  // v1.97: 'cuellos' — la MISMA pantalla que se ve en Producción. Se monta el
  // mismo componente en los dos lados: si fueran dos copias, se desincronizarían.
  const [pestana, setPestana] = useState<'tablero' | 'autorizaciones' | 'mejoras' | 'controles' | 'agenda_iso' | 'tareas_sgo' | 'logistica' | 'cuellos'>('tablero')
  const seleccionado = eventos.find((e) => e.id === seleccionadoId)
  const lorenzo = usuarioEsLorenzo(usuario?.usuario ?? '')
  useEffect(() => { void obtenerLimiteAutorizacionMejora().then((limite) => setUmbralAutorizacion(limite.monto)) }, [])
  const autorizaciones = useMemo(() => construirAutorizacionesSGO({
    tareas: tareasSGO, agenda: agendaISO, ejecuciones: ejecucionesControles, eventos, acciones,
  }, umbralAutorizacion), [tareasSGO, agendaISO, ejecucionesControles, eventos, acciones, umbralAutorizacion])
  const autorizacionesPendientes = autorizaciones.filter((item) => item.clase === 'autorizacion_economica' && item.estado === 'pendiente').length
  const revisiones5SPendientes = autorizaciones.filter((item) => item.clase === 'revision_5s' && item.estado === 'pendiente').length

  const abiertos = eventos.filter((e) => e.estado !== 'cerrado')
  const retrabajosPendientes = abiertos.filter((e) => Boolean(e.retrabajo)).length
  const resumen = useMemo(() => PILARES_SGO.map((p) => ({
    ...p,
    abiertos: abiertos.filter((e) => e.pilar === p.id).length,
    criticos: abiertos.filter((e) => e.pilar === p.id && e.severidad === 'critica').length,
  })), [eventos])
  const vencidas = acciones.filter(vencida).length
  const ajusteDiasSinAccidentes = indicadores.find((i) => i.id === ID_DIAS_SIN_ACCIDENTES)
  const ajusteDiasSinIncidentes = indicadores.find((i) => i.id === ID_DIAS_SIN_INCIDENTES)
  const indicadoresResueltos = useMemo(() => resolverKPIAutomaticos(
    aplicarMedicionesIndicadores(indicadores.filter((i) => !IDS_CONTADORES_SEGURIDAD.has(i.id)), mediciones),
    { tareas, laboratorio, tareasLogistica, eventos, acciones, mediciones },
  ), [indicadores, mediciones, tareas, laboratorio, tareasLogistica, eventos, acciones])
  const abiertosFiltrados = abiertos.filter((e) =>
    (!filtroArea || (e.areaOrigenId ?? e.areaId) === filtroArea) && (!filtroPilar || e.pilar === filtroPilar))

  function abrirAutorizacion(item: AutorizacionSGO) {
    if (item.tipo === 'tarea_sgo') {
      setTareaInicialId(item.origenId); setPestana('tareas_sgo'); return
    }
    if (item.tipo === 'agenda_iso') {
      setActividadInicialId(item.origenId); setPestana('agenda_iso'); return
    }
    if (item.tipo === 'revision_5s') {
      setEjecucionInicialId(item.origenId); setPestana('controles'); return
    }
    if (item.tipo === 'mejora') {
      setMejoraInicial({ id: item.origenId, vista: 'seguimiento' }); setPestana('mejoras'); return
    }
    if (item.tipo === 'retrabajo') {
      setMejoraInicial({ id: item.origenId, vista: 'retrabajos' }); setPestana('mejoras'); return
    }
    if (item.eventoId) {
      setSeleccionadoId(item.eventoId); setPestana('tablero')
    }
  }

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Secciones SGO">
        <button className={`tab ${pestana === 'tablero' ? 'active' : ''}`} onClick={() => setPestana('tablero')}>Tablero integral</button>
        <button className={`tab ${pestana === 'cuellos' ? 'active' : ''}`} onClick={() => setPestana('cuellos')}>Cuellos / OEE</button>
        {lorenzo && <button className={`tab sgo-tab-autorizaciones ${pestana === 'autorizaciones' ? 'active' : ''}`} onClick={() => setPestana('autorizaciones')}>Autorizaciones{autorizacionesPendientes ? <span>{autorizacionesPendientes}</span> : null}{revisiones5SPendientes ? <small>5S: {revisiones5SPendientes}</small> : null}</button>}
        <button className={`tab ${pestana === 'mejoras' ? 'active' : ''}`} onClick={() => setPestana('mejoras')}>Mejora continua{retrabajosPendientes ? ` (${retrabajosPendientes})` : ''}</button>
        <button className={`tab ${pestana === 'controles' ? 'active' : ''}`} onClick={() => setPestana('controles')}>Controles SGO</button>
        <button className={`tab ${pestana === 'logistica' ? 'active' : ''}`} onClick={() => setPestana('logistica')}>Auditoría logística</button>
        <button className={`tab ${pestana === 'agenda_iso' ? 'active' : ''}`} onClick={() => setPestana('agenda_iso')}>Agenda ISO</button>
        <button className={`tab ${pestana === 'tareas_sgo' ? 'active' : ''}`} onClick={() => setPestana('tareas_sgo')}>Tareas SGO</button>
      </div>
      {pestana === 'cuellos' ? <CuellosView />
        : pestana === 'autorizaciones' && lorenzo ? <AutorizacionesSGOView items={autorizaciones} onAbrir={abrirAutorizacion} umbral={umbralAutorizacion} usuario={usuario?.usuario ?? ''} onUmbralActualizado={setUmbralAutorizacion} />
        : pestana === 'mejoras' ? <MejorasSGOView usuario={usuario?.usuario ?? 'sin_usuario'} umbralAutorizacion={umbralAutorizacion} registroInicialId={mejoraInicial?.id} vistaInicial={mejoraInicial?.vista} onRegistroInicialConsumido={() => setMejoraInicial(undefined)} onOpenEvento={(id) => { setPestana('tablero'); setSeleccionadoId(id) }} />
        : pestana === 'agenda_iso' ? <AgendaISOView usuario={usuario?.usuario ?? 'sin_usuario'} actividadInicialId={actividadInicialId} onActividadInicialConsumida={() => setActividadInicialId(undefined)} />
        : pestana === 'tareas_sgo' ? <TareasSGOView usuario={usuario?.usuario ?? 'sin_usuario'} tareaInicialId={tareaInicialId} onTareaInicialConsumida={() => setTareaInicialId(undefined)} />
        : pestana === 'controles' ? <ControlesSGOView usuario={usuario?.usuario ?? 'sin_usuario'} controlInicialId={controlInicialId} onControlInicialConsumido={() => setControlInicialId(undefined)} ejecucionInicialId={ejecucionInicialId} onEjecucionInicialConsumida={() => setEjecucionInicialId(undefined)} onOpenEvento={(id) => { setPestana('tablero'); setSeleccionadoId(id) }} />
        : pestana === 'logistica' ? <AuditoriaLogisticaView usuario={usuario?.usuario ?? 'sin_usuario'} onOpenEvento={(id) => { setPestana('tablero'); setSeleccionadoId(id) }} /> : <>
      <div className="card" style={{ marginBottom: 14, borderLeft: '5px solid #2563eb' }}>
        <div className="card-header">
          <div>
            <div className="section-title" style={{ margin: 0 }}>🛡️ SGO INTEGRAL</div>
            <div className="meta">Eventos, no conformidades y acciones de los seis pilares.</div>
          </div>
          <div className="row-actions"><button className="btn" onClick={() => setConfigIndicadores(true)}>⚙ Indicadores y metas</button><button className="btn btn-primary" onClick={() => setNuevo(true)}>+ Registrar evento</button></div>
        </div>
      </div>

      <div className="sgo-dias-grid">
        <ContadorDiasSeguridad tipo="accidentes" eventos={eventos} ajuste={ajusteDiasSinAccidentes} usuario={usuario?.usuario ?? 'sin_usuario'} />
        <ContadorDiasSeguridad tipo="incidentes" eventos={eventos} ajuste={ajusteDiasSinIncidentes} usuario={usuario?.usuario ?? 'sin_usuario'} />
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

      <MatrizSGO eventos={eventos} acciones={acciones} indicadores={indicadoresResueltos} controles={controles} onSelect={(area, pilar) => setCeldaSeleccionada({ area, pilar })} />

      <div className="card" style={{ marginTop: 18, marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          <div className="field" style={{ margin: 0 }}><label>Área de origen</label><select className="input" value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)}><option value="">Todas las áreas</option>{AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
          <div className="field" style={{ margin: 0 }}><label>Pilar</label><select className="input" value={filtroPilar} onChange={(e) => setFiltroPilar(e.target.value)}><option value="">Todos los pilares</option>{PILARES_SGO.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
        </div>
      </div>
      <div className="section-title">Eventos abiertos ({abiertosFiltrados.length}{filtroArea ? ` de ${abiertos.length}` : ''})</div>
      {abiertosFiltrados.length === 0 ? <div className="empty">No hay eventos abiertos para el área seleccionada.</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {[...abiertosFiltrados].sort((a, b) => b.detectadoEn.localeCompare(a.detectadoEn)).map((e) => {
            const p = PILARES_SGO.find((x) => x.id === e.pilar)
            const acc = acciones.filter((a) => a.eventoId === e.id)
            const trazabilidad = resolverTrazabilidadProductiva(e, tareas, maquinas, usuariosPlanta)
            return (
              <button key={e.id} className="card sgo-evento-card" onClick={() => setSeleccionadoId(e.id)}
                style={{ textAlign: 'left', cursor: 'pointer', borderLeft: `5px solid ${p?.color ?? '#64748b'}`, width: '100%' }}>
                <div className="card-header">
                  <div>
                    <strong>{e.codigo} · {e.titulo}</strong>
                    <div className="meta">Origen: {areaSGOLabel(e.areaOrigenId ?? e.areaId)} · Detectó: {areaSGOLabel(e.areaId)} · {p?.label} · {SEVERIDADES.find((s) => s.id === e.severidad)?.label} · {fechaHora(e.detectadoEn)}</div>
                    {trazabilidad.aplica && <ResumenTrazabilidad trazabilidad={trazabilidad} compacto />}
                    {e.defectoCodigo && <div className="meta">Defecto: <strong>{defectoSGOLabel(e.defectoCodigo)}</strong>{e.costoEstimado ? ` · Costo estimado $${e.costoEstimado.toLocaleString('es-AR')}` : ''}</div>}
                    <div className="sgo-evento-descripcion" style={{ marginTop: 5 }}>{e.descripcion}</div>
                  </div>
                  <span className={`estado-chip sgo-estado-${e.estado}`}>{ESTADOS_EVENTO.find((s) => s.id === e.estado)?.label}</span>
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
              <button key={e.id} className="card sgo-evento-card" onClick={() => setSeleccionadoId(e.id)} style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                <strong>{e.codigo} · {e.titulo}</strong>
                <div className="meta">{areaSGOLabel(e.areaId)} · {PILARES_SGO.find((p) => p.id === e.pilar)?.label} · cerrado {e.cerradoEn ? fechaHora(e.cerradoEn) : ''}</div>
              </button>
            ))}
          </div>
        </details>
      )}

      {nuevo && <NuevoEvento usuario={usuario?.usuario ?? 'sin_usuario'} onClose={() => setNuevo(false)} onCreado={(id) => { setNuevo(false); setSeleccionadoId(id) }} />}
      {configIndicadores && <IndicadoresSGO indicadores={indicadoresResueltos} mediciones={mediciones} usuario={usuario?.usuario ?? 'sin_usuario'} onClose={() => setConfigIndicadores(false)} />}
      {celdaSeleccionada && <FichaCeldaSGO
        areaId={celdaSeleccionada.area} pilarId={celdaSeleccionada.pilar}
        indicadores={indicadoresResueltos} eventos={eventos} acciones={acciones}
        controles={controles}
        datos={{ tareas, laboratorio, tareasLogistica, eventos, acciones, mediciones }}
        usuario={usuario?.usuario ?? 'sin_usuario'}
        onClose={() => setCeldaSeleccionada(undefined)}
        onFiltrarEventos={() => { setFiltroArea(celdaSeleccionada.area); setFiltroPilar(celdaSeleccionada.pilar); setCeldaSeleccionada(undefined) }}
        onOpenEvento={(id) => { setCeldaSeleccionada(undefined); setSeleccionadoId(id) }}
        onOpenControl={(id) => { setCeldaSeleccionada(undefined); setControlInicialId(id); setPestana('controles') }}
      />}
      {seleccionado && <DetalleEvento evento={seleccionado} acciones={acciones.filter((a) => a.eventoId === seleccionado.id)} auditoria={auditoria.filter((r) => r.entidadId === seleccionado.id || acciones.some((a) => a.eventoId === seleccionado.id && a.id === r.entidadId))} usuario={usuario?.usuario ?? 'sin_usuario'} trazabilidad={resolverTrazabilidadProductiva(seleccionado, tareas, maquinas, usuariosPlanta)} onClose={() => setSeleccionadoId(undefined)} />}
      </>}
    </div>
  )
}

const CONFIG_CONTADORES_SEGURIDAD = {
  accidentes: {
    id: ID_DIAS_SIN_ACCIDENTES,
    nombre: 'Días sin accidentes',
    etiqueta: 'DÍAS SIN ACCIDENTES',
    recordatorio: 'La seguridad depende del control diario de nuestros procesos.',
  },
  incidentes: {
    id: ID_DIAS_SIN_INCIDENTES,
    nombre: 'Días sin incidentes',
    etiqueta: 'DÍAS SIN INCIDENTES',
    recordatorio: 'Cada incidente y cuasi accidente es una oportunidad para prevenir lesiones.',
  },
} as const

function ContadorDiasSeguridad({ tipo, eventos, ajuste, usuario }: { tipo: TipoContadorSeguridad; eventos: EventoSGO[]; ajuste?: IndicadorSGO; usuario: string }) {
  const [editando, setEditando] = useState(false)
  const config = CONFIG_CONTADORES_SEGURIDAD[tipo]
  const estado = estadoContadorSeguridad(eventos, ajuste, tipo)
  const [valor, setValor] = useState(String(estado.dias))
  const [guardando, setGuardando] = useState(false)
  const puedeEditar = usuarioEsLorenzo(usuario)

  async function guardar() {
    if (!puedeEditar) return
    const numero = Number(valor)
    if (!Number.isInteger(numero) || numero < 0) return
    const ahora = new Date().toISOString()
    setGuardando(true)
    await guardarIndicadorSGO({
      id: config.id, areaId: 'gerencia_directorio', pilar: 'seguridad',
      nombre: config.nombre, unidad: 'días', direccion: 'mayor_mejor',
      meta: 365, umbralAmarillo: 30, valorActual: numero, origen: 'manual',
      periodo: ahora.slice(0, 7), frecuencia: 'anual', activo: true,
      actualizadoEn: ahora, actualizadoPor: usuario,
    })
    setGuardando(false)
    setEditando(false)
  }

  return <section className={`sgo-dias-cartel sgo-dias-${tipo} ${estado.dias === 0 ? 'reiniciado' : ''}`} aria-label={`${estado.dias} ${config.nombre.toLowerCase()}`}>
    <div>
      <div className="sgo-dias-etiqueta">{config.etiqueta}</div>
      <div className="sgo-dias-recordatorio">{config.recordatorio}</div>
      <div className="sgo-dias-meta">{estado.motivo}{estado.referencia ? ` · ${fechaHora(estado.referencia)}` : ''}</div>
    </div>
    {editando ? <div className="sgo-dias-edicion">
      <input className="input" type="number" min="0" step="1" value={valor} onChange={(e) => setValor(e.target.value)} aria-label={config.nombre} />
      <button className="btn" onClick={() => setEditando(false)}>Cancelar</button>
      <button className="btn btn-primary" disabled={guardando || !Number.isInteger(Number(valor)) || Number(valor) < 0} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar'}</button>
    </div> : <div className="sgo-dias-valor-wrap">
      <div className="sgo-dias-valor">{estado.dias}</div>
      <div className="sgo-dias-unidad">DÍAS</div>
      {puedeEditar && <button className="btn sgo-dias-editar" onClick={() => { setValor(String(estado.dias)); setEditando(true) }}>Editar</button>}
    </div>}
  </section>
}

function NuevoEvento({ usuario, onClose, onCreado }: { usuario: string; onClose: () => void; onCreado: (id: string) => void }) {
  const [tipo, setTipo] = useState<TipoEventoSGO>('no_conformidad')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [severidad, setSeveridad] = useState<SeveridadSGO>('media')
  const [areaId, setAreaId] = useState<AreaSGOId | ''>('')
  const [areaOrigenId, setAreaOrigenId] = useState<AreaSGOId | ''>('')
  const [responsable, setResponsable] = useState('')
  const [nroSerie, setNroSerie] = useState('')
  const [modelo, setModelo] = useState('')
  const [defectoCodigo, setDefectoCodigo] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [costos, setCostos] = useState<CostoNoCalidad>({ material: 0, manoObra: 0, maquina: 0, ensayos: 0, logistica: 0, terceros: 0 })
  const [seguridad, setSeguridad] = useState<DatosSeguridadSGO>({ fechaHoraHecho: ahoraLocal(), lugarExacto: '', tareaActividad: '' })
  const [guardando, setGuardando] = useState(false)
  const tipoDef = TIPOS_EVENTO_SGO.find((t) => t.id === tipo)!
  const esNC = tipo === 'no_conformidad'
  const esSeguridad = tipoDef.pilar === 'seguridad'
  const seguridadValida = !esSeguridad || (
    Boolean(seguridad.fechaHoraHecho && seguridad.lugarExacto.trim() && seguridad.tareaActividad.trim()) &&
    (tipo !== 'incidente_seguridad' || Boolean(seguridad.personaAfectada?.trim() && seguridad.resultadoPersona)) &&
    (tipo !== 'cuasi_accidente' || Boolean(seguridad.consecuenciaPotencial?.trim())) &&
    (tipo !== 'observacion_preventiva' || Boolean(seguridad.tipoObservacion && seguridad.condicionObservada?.trim()))
  )
  const defectos = defectosParaArea(areaOrigenId || undefined)

  async function guardar() {
    if (!titulo.trim() || !descripcion.trim() || !areaId || !seguridadValida || (esNC && (!areaOrigenId || !defectoCodigo))) return
    setGuardando(true)
    const id = crypto.randomUUID(), now = new Date().toISOString()
    const e: EventoSGO = {
      id, codigo: codigoEventoSGO(new Date(), id), tipo, pilar: tipoDef.pilar,
      titulo: titulo.trim(), descripcion: descripcion.trim(), severidad, estado: 'abierto',
      areaId: areaId || undefined, areaOrigenId: esNC ? areaOrigenId || undefined : undefined,
      nroSerie: nroSerie.trim() || undefined, modelo: modelo.trim() || undefined,
      defectoCodigo: esNC ? defectoCodigo || undefined : undefined,
      cantidadAfectada: esNC ? Number(cantidad) || 1 : undefined,
      costoDetalle: esNC ? costos : undefined, costoEstimado: esNC ? costoNoCalidadTotal(costos) : undefined,
      seguridad: esSeguridad ? seguridad : undefined,
      mejora: ['oportunidad_mejora', 'hallazgo_auditoria'].includes(tipo)
        ? datosMejoraDesdeEvento({ tipo, pilar: tipoDef.pilar, severidad }, { fuente: 'evento_sgo', origenEntidad: 'evento_manual' })
        : undefined,
      detectadoEn: esSeguridad && seguridad.fechaHoraHecho ? new Date(seguridad.fechaHoraHecho).toISOString() : now,
      detectadoPor: usuario, responsable: responsable.trim() || undefined,
      creadoEn: now, actualizadoEn: now,
    }
    await guardarEventoSGO(e)
    setGuardando(false); onCreado(id)
  }

  return <Modal titulo="Registrar evento SGO" onClose={onClose}>
    <div className="field"><label>Tipo de evento *</label><select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEventoSGO)}>{TIPOS_EVENTO_SGO.map((t) => <option key={t.id} value={t.id}>{t.label} · {PILARES_SGO.find((p) => p.id === t.pilar)?.label}</option>)}</select></div>
    <div className="field"><label>Título *</label><input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={esSeguridad ? 'Ej. Caída al mismo nivel en sector Pintura' : 'Ej. Diámetro exterior fuera de tolerancia'} /></div>
    <div className="field"><label>{esSeguridad ? 'Relato objetivo del hecho *' : 'Descripción del hecho *'}</label><textarea className="input" rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={esSeguridad ? 'Describir hechos comprobables: qué ocurrió, cómo y en qué secuencia, sin asignar culpas' : 'Qué ocurrió, dónde se detectó y qué producto o proceso está afectado'} /></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
      <div className="field"><label>{esSeguridad ? 'Gravedad real / potencial' : 'Severidad'}</label><select className="input" value={severidad} onChange={(e) => setSeveridad(e.target.value as SeveridadSGO)}>{SEVERIDADES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
      <div className="field"><label>{esNC ? 'Área donde se detectó *' : 'Área *'}</label><select className="input" value={areaId} onChange={(e) => setAreaId(e.target.value as AreaSGOId | '')}><option value="">Seleccionar área</option>{AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
      {!esSeguridad && <div className="field"><label>N° serie / identificación</label><input className="input" value={nroSerie} onChange={(e) => setNroSerie(e.target.value)} /></div>}
      <div className="field"><label>Responsable inicial</label><input className="input" value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Nico, Azul, supervisor…" /></div>
    </div>
    {esSeguridad && <FichaAltaSeguridad tipo={tipo} datos={seguridad} onChange={setSeguridad} />}
    {esNC && <div className="card" style={{ marginTop: 10, borderLeft: '4px solid #2563eb' }}>
      <div className="section-title" style={{ marginTop: 0 }}>Datos de la no conformidad</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
        <div className="field"><label>Área de origen *</label><select className="input" value={areaOrigenId} onChange={(e) => { setAreaOrigenId(e.target.value as AreaSGOId | ''); setDefectoCodigo('') }}><option value="">Determinar origen</option>{AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
        <div className="field"><label>Defecto *</label><select className="input" value={defectoCodigo} onChange={(e) => setDefectoCodigo(e.target.value)}><option value="">Seleccionar defecto</option>{defectos.map((d) => <option key={d.codigo} value={d.codigo}>{d.label}</option>)}</select></div>
        <div className="field"><label>Modelo / producto</label><input className="input" value={modelo} onChange={(e) => setModelo(e.target.value)} /></div>
        <div className="field"><label>Cantidad afectada</label><input className="input" type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></div>
      </div>
      <CostosEditor costos={costos} onChange={setCostos} />
    </div>}
    <div className="row-actions" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={guardando || !titulo.trim() || !descripcion.trim() || !areaId || !seguridadValida || (esNC && (!areaOrigenId || !defectoCodigo))} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Registrar'}</button></div>
  </Modal>
}

function FichaAltaSeguridad({ tipo, datos, onChange }: { tipo: TipoEventoSGO; datos: DatosSeguridadSGO; onChange: (d: DatosSeguridadSGO) => void }) {
  const set = <K extends keyof DatosSeguridadSGO>(campo: K, valor: DatosSeguridadSGO[K]) => onChange({ ...datos, [campo]: valor })
  return <>
    <div className="card" style={{ marginTop: 10, borderLeft: '4px solid #dc2626' }}>
      <div className="section-title" style={{ marginTop: 0 }}>1. Datos del hecho</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
        <div className="field"><label>Fecha y hora del hecho *</label><input className="input" type="datetime-local" value={datos.fechaHoraHecho} onChange={(e) => set('fechaHoraHecho', e.target.value)} /></div>
        <div className="field"><label>Lugar exacto *</label><input className="input" value={datos.lugarExacto} onChange={(e) => set('lugarExacto', e.target.value)} placeholder="Máquina, línea, pasillo o puesto" /></div>
        <div className="field"><label>Turno</label><select className="input" value={datos.turno ?? ''} onChange={(e) => set('turno', (e.target.value || undefined) as DatosSeguridadSGO['turno'])}><option value="">Sin indicar</option><option value="manana">Mañana</option><option value="tarde">Tarde</option><option value="noche">Noche</option><option value="otro">Otro</option></select></div>
      </div>
      <div className="field"><label>Tarea / actividad que se realizaba *</label><input className="input" value={datos.tareaActividad} onChange={(e) => set('tareaActividad', e.target.value)} placeholder="Operación concreta en curso al momento del hecho" /></div>
      <div className="field"><label>Máquina, equipo, herramienta o sustancia involucrada</label><input className="input" value={datos.equipoInvolucrado ?? ''} onChange={(e) => set('equipoInvolucrado', e.target.value)} /></div>
    </div>

    {tipo === 'incidente_seguridad' && <div className="card" style={{ marginTop: 10, borderLeft: '4px solid #ef4444' }}>
      <div className="section-title" style={{ marginTop: 0 }}>2. Persona afectada y consecuencia</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
        <div className="field"><label>Nombre del colaborador afectado *</label><input className="input" value={datos.personaAfectada ?? ''} onChange={(e) => set('personaAfectada', e.target.value)} /></div>
        <div className="field"><label>Legajo / DNI</label><input className="input" value={datos.legajoDni ?? ''} onChange={(e) => set('legajoDni', e.target.value)} /></div>
        <div className="field"><label>Puesto habitual</label><input className="input" value={datos.puesto ?? ''} onChange={(e) => set('puesto', e.target.value)} /></div>
        <div className="field"><label>Resultado para la persona *</label><select className="input" value={datos.resultadoPersona ?? ''} onChange={(e) => set('resultadoPersona', (e.target.value || undefined) as DatosSeguridadSGO['resultadoPersona'])}><option value="">Seleccionar</option><option value="sin_lesion">Sin lesión</option><option value="primeros_auxilios">Primeros auxilios</option><option value="atencion_medica">Atención médica</option><option value="baja">Baja / días perdidos</option></select></div>
        <div className="field"><label>Tipo de lesión</label><input className="input" value={datos.tipoLesion ?? ''} onChange={(e) => set('tipoLesion', e.target.value)} placeholder="Corte, golpe, quemadura…" /></div>
        <div className="field"><label>Parte del cuerpo afectada</label><input className="input" value={datos.parteCuerpo ?? ''} onChange={(e) => set('parteCuerpo', e.target.value)} /></div>
        <div className="field"><label>Atención brindada</label><input className="input" value={datos.atencionBrindada ?? ''} onChange={(e) => set('atencionBrindada', e.target.value)} /></div>
        <div className="field"><label>Derivado a</label><input className="input" value={datos.derivadoA ?? ''} onChange={(e) => set('derivadoA', e.target.value)} placeholder="Prestador / centro médico" /></div>
        <div className="field"><label>N° de siniestro ART</label><input className="input" value={datos.nroSiniestroART ?? ''} onChange={(e) => set('nroSiniestroART', e.target.value)} /></div>
        <div className="field"><label>Días perdidos</label><input className="input" type="number" min="0" value={datos.diasPerdidos ?? ''} onChange={(e) => set('diasPerdidos', e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)))} /></div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={datos.denunciaART ?? false} onChange={(e) => set('denunciaART', e.target.checked)} /> Denuncia a la ART realizada</label>
    </div>}

    {tipo === 'cuasi_accidente' && <div className="card" style={{ marginTop: 10, borderLeft: '4px solid #f59e0b' }}>
      <div className="section-title" style={{ marginTop: 0 }}>2. Exposición y consecuencia potencial</div>
      <div className="field"><label>Personas involucradas o expuestas</label><input className="input" value={datos.personasInvolucradas ?? ''} onChange={(e) => set('personasInvolucradas', e.target.value)} /></div>
      <div className="field"><label>Qué podría haber ocurrido *</label><textarea className="input" rows={2} value={datos.consecuenciaPotencial ?? ''} onChange={(e) => set('consecuenciaPotencial', e.target.value)} placeholder="Lesión o daño potencial si la secuencia hubiera continuado" /></div>
    </div>}

    {tipo === 'observacion_preventiva' && <div className="card" style={{ marginTop: 10, borderLeft: '4px solid #f59e0b' }}>
      <div className="section-title" style={{ marginTop: 0 }}>2. Observación preventiva</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
        <div className="field"><label>Tipo de observación *</label><select className="input" value={datos.tipoObservacion ?? ''} onChange={(e) => set('tipoObservacion', (e.target.value || undefined) as DatosSeguridadSGO['tipoObservacion'])}><option value="">Seleccionar</option><option value="segura">Práctica segura para reconocer</option><option value="insegura">Condición / práctica a corregir</option></select></div>
        <div className="field"><label>Colaborador / equipo observado</label><input className="input" value={datos.colaboradorObservado ?? ''} onChange={(e) => set('colaboradorObservado', e.target.value)} /></div>
      </div>
      <div className="field"><label>Condición o práctica observada *</label><textarea className="input" rows={2} value={datos.condicionObservada ?? ''} onChange={(e) => set('condicionObservada', e.target.value)} /></div>
      <div className="field"><label>Riesgo o beneficio potencial</label><textarea className="input" rows={2} value={datos.consecuenciaPotencial ?? ''} onChange={(e) => set('consecuenciaPotencial', e.target.value)} /></div>
    </div>}

    <div className="card" style={{ marginTop: 10, borderLeft: '4px solid #dc2626' }}>
      <div className="section-title" style={{ marginTop: 0 }}>3. Evidencias y control inmediato</div>
      <div className="field"><label>Testigos</label><input className="input" value={datos.testigos ?? ''} onChange={(e) => set('testigos', e.target.value)} placeholder="Nombre y contacto interno, si corresponde" /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
        <div className="field"><label>EPP requerido</label><input className="input" value={datos.eppRequerido ?? ''} onChange={(e) => set('eppRequerido', e.target.value)} /></div>
        <div className="field"><label>EPP efectivamente utilizado</label><input className="input" value={datos.eppUtilizado ?? ''} onChange={(e) => set('eppUtilizado', e.target.value)} /></div>
      </div>
      <div className="field"><label>Factores contribuyentes observados</label><textarea className="input" rows={2} value={datos.factoresContribuyentes ?? ''} onChange={(e) => set('factoresContribuyentes', e.target.value)} placeholder="Condiciones, organización, método, equipo o entorno; registrar hechos sin asignar culpas" /></div>
      <div className="field"><label>Acción inmediata adoptada</label><textarea className="input" rows={2} value={datos.accionInmediata ?? ''} onChange={(e) => set('accionInmediata', e.target.value)} placeholder="Atención, detención, aislamiento, señalización o corrección realizada" /></div>
      <div className="field"><label>Personas notificadas</label><input className="input" value={datos.notificadoA ?? ''} onChange={(e) => set('notificadoA', e.target.value)} placeholder="Supervisor, HyS, Gerencia, ART…" /></div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={datos.sectorAislado ?? false} onChange={(e) => set('sectorAislado', e.target.checked)} /> Sector / equipo aislado o puesto fuera de servicio</label>
    </div>
  </>
}

function ResumenTrazabilidad({ trazabilidad, compacto = false }: { trazabilidad: TrazabilidadProductivaSGO; compacto?: boolean }) {
  if (!trazabilidad.aplica) return null
  if (compacto) return <div className="sgo-trazabilidad-compacta">
    <span><b>Sector/línea:</b> {trazabilidad.sector}</span>
    <span><b>Máquina/puesto:</b> {trazabilidad.maquina}</span>
    <span><b>Operario:</b> {trazabilidad.operario}</span>
    <span><b>Ocurrió:</b> {fechaHora(trazabilidad.ocurridoEn)}</span>
  </div>
  return <div className="card sgo-trazabilidad-ficha">
    <div className="section-title" style={{ marginTop: 0 }}>Ubicación productiva del hallazgo</div>
    <div className="sgo-trazabilidad-datos">
      <DatoFicha label="Sector / línea" valor={trazabilidad.sector} />
      <DatoFicha label="Máquina / puesto" valor={trazabilidad.maquina} />
      <DatoFicha label="Operario que ejecutaba" valor={trazabilidad.operario} />
      <DatoFicha label="Fecha y hora del hecho" valor={fechaHora(trazabilidad.ocurridoEn)} />
    </div>
    <div className="meta sgo-trazabilidad-registro">Registro incorporado a SGO por <strong>{trazabilidad.registradoPor}</strong>. Este dato identifica a quien registró o concilió el expediente, no necesariamente al operario involucrado.</div>
  </div>
}

function DetalleEvento({ evento, acciones, auditoria, usuario, trazabilidad, onClose }: { evento: EventoSGO; acciones: AccionSGO[]; auditoria: AuditoriaSGO[]; usuario: string; trazabilidad: TrazabilidadProductivaSGO; onClose: () => void }) {
  const [contencion, setContencion] = useState(evento.contencion ?? '')
  const [causaRaiz, setCausaRaiz] = useState(evento.causaRaiz ?? '')
  const [responsable, setResponsable] = useState(evento.responsable ?? '')
  const [metodoAnalisis, setMetodoAnalisis] = useState<EventoSGO['metodoAnalisis']>(evento.metodoAnalisis)
  const [evidencias, setEvidencias] = useState((evento.evidenciaUrls ?? []).join('\n'))
  const [estado, setEstado] = useState(evento.estado)
  const [areaOrigenId, setAreaOrigenId] = useState<AreaSGOId | ''>(evento.areaOrigenId ?? '')
  const [areaDeteccionId, setAreaDeteccionId] = useState<AreaSGOId | ''>(evento.areaId ?? '')
  const [defectoCodigo, setDefectoCodigo] = useState(evento.defectoCodigo ?? '')
  const [disposicion, setDisposicion] = useState(evento.disposicion ?? 'pendiente')
  const [costos, setCostos] = useState<CostoNoCalidad>(evento.costoDetalle ?? { material: 0, manoObra: 0, maquina: 0, ensayos: 0, logistica: 0, terceros: 0 })
  const [nuevaAccion, setNuevaAccion] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const puedeEliminar = usuarioEsLorenzo(usuario)
  const vinculos = useLiveQuery(async () => ({
    controles: await db.ejecucionesControlesSGO.where('eventoId').equals(evento.id).count(),
  }), [evento.id]) ?? { controles: 0 }

  async function actualizar() {
    const now = new Date().toISOString()
    const actualizado: EventoSGO = { ...evento, areaId: areaDeteccionId || undefined, areaOrigenId: areaOrigenId || undefined,
      defectoCodigo: defectoCodigo || undefined, disposicion, costoDetalle: costos,
      costoEstimado: costoNoCalidadTotal(costos), contencion: contencion.trim() || undefined,
      causaRaiz: causaRaiz.trim() || undefined, responsable: responsable.trim() || undefined,
      metodoAnalisis, evidenciaUrls: evidencias.split(/\r?\n/).map((v) => v.trim()).filter(Boolean),
      estado, actualizadoEn: now,
      cerradoEn: estado === 'cerrado' ? (evento.cerradoEn ?? now) : undefined,
      cerradoPor: estado === 'cerrado' ? (evento.cerradoPor ?? usuario) : undefined }
    const errores = validarCierreEvento(actualizado, acciones)
    if (errores.length) {
      window.alert(`No se puede cerrar el expediente:\n\n• ${errores.join('\n• ')}`)
      return
    }
    await guardarEventoSGO(actualizado)
  }

  async function eliminar() {
    if (!puedeEliminar || eliminando) return
    const relaciones = [
      acciones.length ? `${acciones.length} acción(es) asociada(s)` : '',
      vinculos.controles ? `${vinculos.controles} control(es) ejecutado(s)` : '',
    ].filter(Boolean).join(', ')
    const detalle = relaciones ? `\n\nRegistros relacionados: ${relaciones}.` : ''
    if (!window.confirm(`¿Eliminar definitivamente el evento ${evento.codigo}?${detalle}\n\nLas acciones asociadas se eliminarán. Las auditorías se conservarán, pero quedarán desvinculadas. La bitácora de auditoría conservará la eliminación.\n\nEsta acción no se puede deshacer.`)) return
    setEliminando(true)
    try {
      await eliminarEventoSGO(evento, usuario)
      onClose()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo eliminar el evento.')
      setEliminando(false)
    }
  }

  return <Modal titulo={`${evento.codigo} · ${evento.titulo}`} onClose={onClose} ancho={780}>
    <div className="meta">{trazabilidad.aplica ? `Hecho ocurrido ${fechaHora(evento.detectadoEn)}` : <>Detectado {fechaHora(evento.detectadoEn)} por <strong>{evento.detectadoPor}</strong></>} · Pilar {PILARES_SGO.find((p) => p.id === evento.pilar)?.label}</div>
    <p>{evento.descripcion}</p>
    <ResumenTrazabilidad trazabilidad={trazabilidad} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
      <div className="field"><label>Estado</label><select className="input" value={estado} onChange={(e) => setEstado(e.target.value as EstadoEventoSGO)}>{ESTADOS_EVENTO.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
      <div className="field"><label>Responsable</label><input className="input" value={responsable} onChange={(e) => setResponsable(e.target.value)} /></div>
    </div>
    {evento.pilar === 'seguridad' && <FichaDetalleSeguridad tipo={evento.tipo} datos={evento.seguridad} />}
    {evento.tipo === 'no_conformidad' && <div className="card" style={{ marginBottom: 10, borderLeft: '4px solid #2563eb' }}>
      <div className="section-title" style={{ marginTop: 0 }}>Ficha de no conformidad</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
        <div className="field"><label>Área de origen</label><select className="input" value={areaOrigenId} onChange={(e) => { setAreaOrigenId(e.target.value as AreaSGOId | ''); setDefectoCodigo('') }}><option value="">Pendiente de determinar</option>{AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
        <div className="field"><label>Área que detectó</label><select className="input" value={areaDeteccionId} onChange={(e) => setAreaDeteccionId(e.target.value as AreaSGOId | '')}><option value="">Sin definir</option>{AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></div>
        <div className="field"><label>Defecto</label><select className="input" value={defectoCodigo} onChange={(e) => setDefectoCodigo(e.target.value)}><option value="">Sin clasificar</option>{defectosParaArea(areaOrigenId || undefined).map((d) => <option key={d.codigo} value={d.codigo}>{d.label}</option>)}</select></div>
        <div className="field"><label>Disposición</label><select className="input" value={disposicion} onChange={(e) => setDisposicion(e.target.value as NonNullable<EventoSGO['disposicion']>)}><option value="pendiente">Pendiente</option><option value="retrabajo">Retrabajo</option><option value="rechazo">Rechazo / scrap</option><option value="concesion">Concesión</option><option value="devolucion">Devolución</option><option value="no_aplica">No aplica</option></select></div>
      </div>
      <div className="meta">{evento.modelo ? `Modelo: ${evento.modelo} · ` : ''}{evento.nroSerie ? `Serie: ${evento.nroSerie} · ` : ''}Cantidad afectada: {evento.cantidadAfectada ?? 1}</div>
      <CostosEditor costos={costos} onChange={setCostos} />
    </div>}
    <div className="field"><label>Contención inmediata</label><textarea className="input" rows={3} value={contencion} onChange={(e) => setContencion(e.target.value)} placeholder="Qué se hizo para proteger personas, producto, cliente o ambiente" /></div>
    <div className="field"><label>Causa raíz</label><textarea className="input" rows={3} value={causaRaiz} onChange={(e) => setCausaRaiz(e.target.value)} placeholder="Completar después del análisis; no confundir con el síntoma" /></div>
    <div className="field"><label>Método de análisis</label><select className="input" value={metodoAnalisis ?? ''} onChange={(e) => setMetodoAnalisis((e.target.value || undefined) as EventoSGO['metodoAnalisis'])}><option value="">Sin seleccionar</option><option value="5_porques">5 porqués</option><option value="ishikawa">Ishikawa</option><option value="a3">A3</option><option value="8d">8D</option><option value="otro">Otro</option></select></div>
    <div className="field"><label>Evidencias / referencias</label><textarea className="input" rows={3} value={evidencias} onChange={(e) => setEvidencias(e.target.value)} placeholder="Una referencia o enlace por línea" /></div>
    <div className="row-actions" style={{ justifyContent: 'space-between' }}>
      {puedeEliminar && <button className="btn" disabled={eliminando} style={{ color: '#fca5a5', borderColor: '#ef4444' }} onClick={() => void eliminar()}>{eliminando ? 'Eliminando…' : 'Eliminar evento'}</button>}
      <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={eliminando} onClick={() => void actualizar()}>Guardar expediente</button>
    </div>

    <div className="section-title" style={{ marginTop: 18 }}>Acciones ({acciones.length})</div>
    {acciones.length === 0 ? <div className="empty">Sin acciones asignadas.</div> : acciones.map((a) => <AccionCard key={a.id} accion={a} usuario={usuario} />)}
    <button className="btn" style={{ marginTop: 10 }} onClick={() => setNuevaAccion(true)}>+ Agregar acción</button>
    {nuevaAccion && <NuevaAccion evento={evento} usuario={usuario} onClose={() => setNuevaAccion(false)} />}
    <HistorialAuditoria registros={auditoria} />
  </Modal>
}

function FichaDetalleSeguridad({ tipo, datos }: { tipo: TipoEventoSGO; datos?: DatosSeguridadSGO }) {
  if (!datos) return <div className="card" style={{ marginBottom: 10, borderLeft: '4px solid #f59e0b' }}>
    <strong>Evento histórico sin ficha HyS estructurada.</strong>
    <div className="meta">Fue creado antes de incorporar el nuevo formulario de Seguridad.</div>
  </div>
  const resultados: Record<string, string> = { sin_lesion: 'Sin lesión', primeros_auxilios: 'Primeros auxilios', atencion_medica: 'Atención médica', baja: 'Baja / días perdidos' }
  const turnos: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche', otro: 'Otro' }
  const resultado = datos.resultadoPersona ? resultados[datos.resultadoPersona] : undefined
  const turno = datos.turno ? turnos[datos.turno] : undefined
  const tipoObs = datos.tipoObservacion === 'segura' ? 'Práctica segura' : datos.tipoObservacion === 'insegura' ? 'Condición / práctica a corregir' : undefined
  return <div className="card" style={{ marginBottom: 10, borderLeft: '4px solid #dc2626' }}>
    <div className="section-title" style={{ marginTop: 0 }}>Ficha de Higiene y Seguridad</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8 }}>
      <DatoFicha label="Fecha y hora del hecho" valor={datos.fechaHoraHecho ? fechaHora(datos.fechaHoraHecho) : undefined} />
      <DatoFicha label="Lugar exacto" valor={datos.lugarExacto} />
      <DatoFicha label="Turno" valor={turno} />
      <DatoFicha label="Tarea / actividad" valor={datos.tareaActividad} />
      <DatoFicha label="Equipo / herramienta / sustancia" valor={datos.equipoInvolucrado} />
      {tipo === 'incidente_seguridad' && <>
        <DatoFicha label="Colaborador afectado" valor={datos.personaAfectada} />
        <DatoFicha label="Legajo / DNI" valor={datos.legajoDni} />
        <DatoFicha label="Puesto habitual" valor={datos.puesto} />
        <DatoFicha label="Resultado" valor={resultado} />
        <DatoFicha label="Tipo de lesión" valor={datos.tipoLesion} />
        <DatoFicha label="Parte del cuerpo" valor={datos.parteCuerpo} />
        <DatoFicha label="Atención brindada" valor={datos.atencionBrindada} />
        <DatoFicha label="Derivado a" valor={datos.derivadoA} />
        <DatoFicha label="Denuncia ART" valor={datos.denunciaART ? 'Sí' : 'No'} />
        <DatoFicha label="N° siniestro ART" valor={datos.nroSiniestroART} />
        <DatoFicha label="Días perdidos" valor={datos.diasPerdidos?.toString()} />
      </>}
      {tipo === 'cuasi_accidente' && <DatoFicha label="Personas expuestas" valor={datos.personasInvolucradas} />}
      {tipo === 'observacion_preventiva' && <>
        <DatoFicha label="Tipo de observación" valor={tipoObs} />
        <DatoFicha label="Colaborador / equipo observado" valor={datos.colaboradorObservado} />
        <DatoFicha label="Condición o práctica" valor={datos.condicionObservada} />
      </>}
      <DatoFicha label={tipo === 'observacion_preventiva' ? 'Riesgo / beneficio potencial' : 'Consecuencia potencial'} valor={datos.consecuenciaPotencial} />
      <DatoFicha label="Testigos" valor={datos.testigos} />
      <DatoFicha label="EPP requerido" valor={datos.eppRequerido} />
      <DatoFicha label="EPP utilizado" valor={datos.eppUtilizado} />
      <DatoFicha label="Factores contribuyentes" valor={datos.factoresContribuyentes} />
      <DatoFicha label="Acción inmediata" valor={datos.accionInmediata} />
      <DatoFicha label="Personas notificadas" valor={datos.notificadoA} />
      <DatoFicha label="Sector / equipo aislado" valor={datos.sectorAislado ? 'Sí' : 'No'} />
    </div>
  </div>
}

function DatoFicha({ label, valor }: { label: string; valor?: string }) {
  return <div style={{ padding: 9, border: '1px solid var(--borde)', borderRadius: 8 }}>
    <div className="meta">{label}</div>
    <div style={{ fontWeight: 750, whiteSpace: 'pre-wrap' }}>{valor?.trim() || 'No informado'}</div>
  </div>
}

const CAMPOS_COSTO: { key: keyof CostoNoCalidad; label: string }[] = [
  { key: 'material', label: 'Material / scrap' }, { key: 'manoObra', label: 'Mano de obra' },
  { key: 'maquina', label: 'Máquina' }, { key: 'ensayos', label: 'Ensayos repetidos' },
  { key: 'logistica', label: 'Logística / flete' }, { key: 'terceros', label: 'Terceros / otros' },
]

function CostosEditor({ costos, onChange }: { costos: CostoNoCalidad; onChange: (c: CostoNoCalidad) => void }) {
  return <div style={{ marginTop: 10 }}>
    <div className="meta" style={{ fontWeight: 800, marginBottom: 6 }}>Costo de no calidad</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 8 }}>
      {CAMPOS_COSTO.map((c) => <div className="field" key={c.key}><label>{c.label}</label><input className="input" type="number" min="0" step="0.01" value={costos[c.key] || ''} onChange={(e) => onChange({ ...costos, [c.key]: Math.max(0, Number(e.target.value) || 0) })} placeholder="$ 0" /></div>)}
    </div>
    <div style={{ textAlign: 'right', fontWeight: 900 }}>Total estimado: ${costoNoCalidadTotal(costos).toLocaleString('es-AR')}</div>
  </div>
}

function NuevaAccion({ evento, usuario, onClose }: { evento: EventoSGO; usuario: string; onClose: () => void }) {
  const [tipo, setTipo] = useState<TipoAccionSGO>('correctiva')
  const [descripcion, setDescripcion] = useState('')
  const [responsable, setResponsable] = useState(evento.responsable ?? '')
  const [fecha, setFecha] = useState(sumarDiasLocalISO(7))
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
  const [evidencia, setEvidencia] = useState(a.evidencia ?? '')
  const [comentario, setComentario] = useState(a.comentarioVerificacion ?? '')
  async function completar() {
    if (!evidencia.trim()) { window.alert('Indicá la evidencia o referencia de implementación.'); return }
    const now = new Date().toISOString()
    await guardarAccionSGO({ ...a, evidencia: evidencia.trim(), estado: 'completada', completadaEn: now, completadaPor: usuario, actualizadoEn: now })
  }
  async function verificar(eficaz: boolean) {
    if (!comentario.trim()) { window.alert('Documentá el resultado de la verificación.'); return }
    const now = new Date().toISOString()
    await guardarAccionSGO({ ...a, evidencia: evidencia.trim() || a.evidencia, comentarioVerificacion: comentario.trim(),
      estado: eficaz ? 'verificada' : 'en_curso', verificadaEn: now, verificadaPor: usuario, eficaz, actualizadoEn: now })
  }
  return <div className="card" style={{ marginBottom: 8, borderLeft: vencida(a) ? '4px solid var(--rojo)' : undefined }}>
    <strong>{a.descripcion}</strong><div className="meta">{a.tipo} · {a.responsable} · vence {a.fechaCompromiso} · {a.estado}{vencida(a) ? ' · VENCIDA' : ''}</div>
    <div className="sgo-accion-seguimiento">
      <div className="field"><label>Evidencia / referencia</label><input className="input" value={evidencia} disabled={a.estado === 'verificada'} onChange={(e) => setEvidencia(e.target.value)} placeholder="Acta, foto, documento o enlace" /></div>
      {a.estado === 'completada' && <div className="field"><label>Resultado de la verificación</label><input className="input" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Cómo se comprobó la eficacia" /></div>}
    </div>
    <div className="row-actions" style={{ marginTop: 7 }}>
      {['pendiente', 'en_curso'].includes(a.estado) && <button className="btn" onClick={() => void completar()}>Marcar completada</button>}
      {a.estado === 'completada' && <><button className="btn btn-verde" onClick={() => void verificar(true)}>Verificar eficaz</button><button className="btn btn-rojo" onClick={() => void verificar(false)}>No eficaz</button></>}
    </div>
  </div>
}

function HistorialAuditoria({ registros }: { registros: AuditoriaSGO[] }) {
  if (!registros.length) return null
  const etiquetaOperacion = { INSERT: 'Creación', UPDATE: 'Actualización', DELETE: 'Eliminación' }
  const cambios = (r: AuditoriaSGO) => {
    if (r.operacion !== 'UPDATE') return []
    const anterior = r.datosAnteriores ?? {}
    const nuevo = r.datosNuevos ?? {}
    return [...new Set([...Object.keys(anterior), ...Object.keys(nuevo)])]
      .filter((campo) => JSON.stringify(anterior[campo]) !== JSON.stringify(nuevo[campo]))
      .filter((campo) => !['actualizado_en'].includes(campo))
  }
  return <details className="sgo-auditoria">
    <summary>Historial de auditoría ({registros.length})</summary>
    <div className="sgo-auditoria-lista">{[...registros].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).slice(0, 50).map((r) => {
      const campos = cambios(r)
      return <div key={r.id} className="sgo-auditoria-item">
        <strong>{etiquetaOperacion[r.operacion]}</strong>
        <span>{fechaHora(r.creadoEn)} · {r.usuario}</span>
        {campos.length > 0 && <span>Campos: {campos.join(', ')}</span>}
      </div>
    })}</div>
  </details>
}

function Modal({ titulo, onClose, ancho = 680, children }: { titulo: string; onClose: () => void; ancho?: number; children: React.ReactNode }) {
  return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: ancho, width: '96%', maxHeight: '92vh', overflow: 'auto' }}><div className="card-header" style={{ marginBottom: 12 }}><div className="section-title" style={{ margin: 0 }}>{titulo}</div><button className="btn" onClick={onClose}>×</button></div>{children}</div></div>
}
