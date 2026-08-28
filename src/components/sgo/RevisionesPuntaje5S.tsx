import { useMemo, useState } from 'react'
import {
  calcularPorcentajePremiableCampo, resolverRevisionPuntaje5S, revisionAprobadaPuntaje5S,
  revisionPendientePuntaje5S, solicitarRevisionPuntaje5S,
  type AuditoriaCampoSGO, type ItemPlantillaCampo, type RevisionPuntaje5S,
} from '../../sgo/controlesCampo'
import type { EjecucionControlSGO } from '../../sgo/controles'
import { datosMejoraDesdeEvento } from '../../sgo/mejoras'
import { actualizarIndicadoresMensuales5S } from '../../sgo/indicadoresMensuales5S'
import { usuarioPuedeResolverRevision5S, usuarioPuedeSolicitarRevision5S } from '../../sgo/permisos'
import { actualizarRevisionAuditoriaCampo } from '../../sgo/revisionesCampo'
import { AREAS_SGO, areaSGOLabel, codigoEventoSGO, type AreaSGOId, type EventoSGO } from '../../sgo/types'
import { guardarEventoSGO } from '../../sync/syncEngine'

const fechaHora = (iso: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))

interface FormularioRevision {
  investigadaPor: string
  resultadoInvestigacion: string
  causaComprobada: string
  areaResponsableId: AreaSGOId
  responsableReal: string
  evidencia: string
  motivoAjuste: string
  puntajePropuesto: 1 | 2
}

export default function RevisionesPuntaje5S({ ejecucion, usuario, items, onUpdated }: {
  ejecucion: EjecucionControlSGO
  usuario: string
  items: ItemPlantillaCampo[]
  onUpdated: (ejecucion: EjecucionControlSGO) => void
}) {
  const auditoria = ejecucion.auditoriaCampo!
  const hallazgos = items.filter((item) => {
    const puntaje = auditoria.respuestas.find((respuesta) => respuesta.itemId === item.id)?.puntaje
    return puntaje === 0 || puntaje === 1
  })
  const [itemEditando, setItemEditando] = useState<ItemPlantillaCampo>()
  const [decision, setDecision] = useState<{ revision: RevisionPuntaje5S; estado: 'aprobada' | 'rechazada' }>()
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState<FormularioRevision>()
  const [comentarioDecision, setComentarioDecision] = useState('')
  const premiable = calcularPorcentajePremiableCampo(auditoria, items)
  const pendientes = auditoria.revisionesPuntaje?.filter((revision) => revision.estado === 'pendiente').length ?? 0
  const puedeSolicitar = usuarioPuedeSolicitarRevision5S(usuario)
  const puedeResolver = usuarioPuedeResolverRevision5S(usuario)

  const revisionesPorItem = useMemo(() => new Map(hallazgos.map((item) => [
    item.id,
    (auditoria.revisionesPuntaje ?? []).filter((revision) => revision.itemId === item.id),
  ])), [auditoria.revisionesPuntaje, hallazgos])

  function comenzar(item: ItemPlantillaCampo) {
    const original = auditoria.respuestas.find((respuesta) => respuesta.itemId === item.id)?.puntaje
    if (original !== 0 && original !== 1) return
    setDecision(undefined)
    setItemEditando(item)
    setForm({
      investigadaPor: auditoria.auditor,
      resultadoInvestigacion: '',
      causaComprobada: '',
      areaResponsableId: auditoria.areaId,
      responsableReal: '',
      evidencia: '',
      motivoAjuste: '',
      puntajePropuesto: original === 1 ? 2 : 1,
    })
  }

  async function solicitar() {
    if (!itemEditando || !form || !puedeSolicitar) return
    setGuardando(true)
    try {
      const propuesta = solicitarRevisionPuntaje5S(auditoria, { itemId: itemEditando.id, ...form }, usuario)
      const actualizada = await actualizarRevisionAuditoriaCampo(ejecucion, propuesta)
      onUpdated(actualizada)
      setItemEditando(undefined)
      setForm(undefined)
    } catch (error) { window.alert(error instanceof Error ? error.message : 'No se pudo solicitar la revisión.') }
    finally { setGuardando(false) }
  }

  function construirMejora(revision: RevisionPuntaje5S, item: ItemPlantillaCampo, id: string, ahora: string): EventoSGO {
    const severidad = revision.puntajeOriginal === 0 ? 'media' : 'baja'
    return {
      id,
      codigo: codigoEventoSGO(new Date(ahora), id),
      tipo: 'oportunidad_mejora',
      pilar: item.pilar,
      titulo: `Mejora desde 5S · ${item.punto} · ${areaSGOLabel(revision.areaResponsableId)}`,
      descripcion: `Origen: ${auditoria.documento.codigo} en ${areaSGOLabel(auditoria.areaId)}. Puntaje observado ${revision.puntajeOriginal}/2; puntaje premiable aprobado ${revision.puntajePropuesto}/2.\nInvestigación: ${revision.resultadoInvestigacion}\nCausa comprobada: ${revision.causaComprobada}\nEvidencia: ${revision.evidencia}\nMotivo del ajuste: ${revision.motivoAjuste}`,
      severidad,
      estado: 'abierto',
      areaId: revision.areaResponsableId,
      areaOrigenId: auditoria.areaId,
      controlId: ejecucion.controlId,
      responsable: revision.responsableReal,
      detectadoEn: auditoria.finalizadaEn,
      detectadoPor: revision.investigadaPor,
      mejora: datosMejoraDesdeEvento({ tipo: 'oportunidad_mejora', pilar: item.pilar, severidad }, {
        clase: 'mejora',
        fuente: '5s',
        origenEntidad: 'control_5s',
        origenId: `${ejecucion.id}:${item.id}`,
        beneficioEsperado: `Resolver la causa asignada a ${areaSGOLabel(revision.areaResponsableId)} sin penalizar injustamente a ${areaSGOLabel(auditoria.areaId)}.`,
      }),
      creadoEn: ahora,
      actualizadoEn: ahora,
    }
  }

  async function resolver() {
    if (!decision || !puedeResolver || !comentarioDecision.trim()) {
      window.alert('Documentá el fundamento de la decisión.')
      return
    }
    setGuardando(true)
    try {
      const ahora = new Date().toISOString()
      const mejoraId = decision.estado === 'aprobada' ? crypto.randomUUID() : undefined
      const propuesta = resolverRevisionPuntaje5S(
        auditoria, decision.revision.id, decision.estado, comentarioDecision, usuario, mejoraId, ahora,
      )
      const actualizada = await actualizarRevisionAuditoriaCampo(ejecucion, propuesta)
      if (decision.estado === 'aprobada' && mejoraId) {
        const item = items.find((candidato) => candidato.id === decision.revision.itemId)
        if (item) await guardarEventoSGO(construirMejora(decision.revision, item, mejoraId, ahora))
        const auditoriaActualizada = actualizada.auditoriaCampo!
        const periodo = auditoriaActualizada.finalizadaEn.slice(0, 7)
        await actualizarIndicadoresMensuales5S(
          auditoriaActualizada.areaId, periodo, usuario,
          `${auditoriaActualizada.documento.codigo} · ${ejecucion.id} · revisión ${decision.revision.id}`,
        )
      }
      onUpdated(actualizada)
      setDecision(undefined)
      setComentarioDecision('')
    } catch (error) { window.alert(error instanceof Error ? error.message : 'No se pudo resolver la revisión.') }
    finally { setGuardando(false) }
  }

  if (!hallazgos.length) return null

  return <section className="sgo-revisiones-5s">
    <div className="sgo-revisiones-cabecera">
      <div><h3>Revisión de puntaje y responsabilidad</h3><div className="meta">El resultado físico original no cambia. Solo las revisiones aprobadas impactan en el puntaje premiable.</div></div>
      <div className="sgo-revisiones-kpis"><span>Original <b>{auditoria.porcentajeCumplimiento}%</b></span><span>Premiable <b>{premiable}%</b></span><span className={pendientes ? 'pendiente' : ''}>Pendientes <b>{pendientes}</b></span></div>
    </div>

    <div className="sgo-revisiones-lista">{hallazgos.map((item) => {
      const respuesta = auditoria.respuestas.find((r) => r.itemId === item.id)!
      const aprobada = revisionAprobadaPuntaje5S(auditoria, item.id)
      const pendiente = revisionPendientePuntaje5S(auditoria, item.id)
      const historial = revisionesPorItem.get(item.id) ?? []
      return <article className="sgo-revision-card" key={item.id}>
        <div className="sgo-revision-score"><span>Observado</span><b>{respuesta.puntaje}/2</b>{aprobada && <><span>Premiable</span><b className="premiable">{aprobada.puntajePropuesto}/2</b></>}</div>
        <div className="sgo-revision-contenido">
          <strong>{item.pregunta}</strong>
          <div className="meta">{respuesta.observacion}</div>
          {aprobada && <div className="sgo-revision-aprobada"><b>Revisión aprobada:</b> responsabilidad asignada a {areaSGOLabel(aprobada.areaResponsableId)} · {aprobada.responsableReal}. Mejora vinculada: {aprobada.mejoraEventoId}</div>}
          {pendiente && <div className="sgo-revision-pendiente"><b>Revisión pendiente:</b> propone {pendiente.puntajePropuesto}/2 · {areaSGOLabel(pendiente.areaResponsableId)} · solicitada por {pendiente.solicitadaPor} el {fechaHora(pendiente.solicitadaEn)}.</div>}
          {historial.filter((revision) => revision.estado === 'rechazada').map((revision) => <div className="sgo-revision-rechazada" key={revision.id}>Rechazada el {fechaHora(revision.decididaEn!)}: {revision.decisionComentario}</div>)}
        </div>
        <div className="row-actions">
          {!pendiente && !aprobada && puedeSolicitar && <button className="btn" onClick={() => comenzar(item)}>Solicitar revisión</button>}
          {pendiente && puedeResolver && <><button type="button" className="btn btn-primary" disabled={guardando} onClick={() => { setItemEditando(undefined); setDecision({ revision: pendiente, estado: 'aprobada' }); setComentarioDecision('') }}>Aprobar y crear mejora</button><button type="button" className="btn" disabled={guardando} onClick={() => { setItemEditando(undefined); setDecision({ revision: pendiente, estado: 'rechazada' }); setComentarioDecision('') }}>Rechazar</button></>}
        </div>
      </article>
    })}</div>

    {itemEditando && form && <div className="card sgo-revision-form">
      <div><strong>Investigar y solicitar revisión</strong><div className="meta">{itemEditando.pregunta}</div></div>
      <div className="sgo-revision-form-grid">
        <Campo label="Investigación realizada por *"><input className="input" value={form.investigadaPor} onChange={(e) => setForm({ ...form, investigadaPor: e.target.value })} /></Campo>
        <Campo label="Puntaje premiable propuesto *"><select className="input" value={form.puntajePropuesto} onChange={(e) => setForm({ ...form, puntajePropuesto: Number(e.target.value) as 1 | 2 })}>{auditoria.respuestas.find((r) => r.itemId === itemEditando.id)?.puntaje === 0 && <option value={1}>1 · Cumplimiento parcial</option>}<option value={2}>2 · Cumple para el área auditada</option></select></Campo>
        <Campo label="Resultado de la investigación *" ancho><textarea className="input" rows={3} value={form.resultadoInvestigacion} onChange={(e) => setForm({ ...form, resultadoInvestigacion: e.target.value })} placeholder="Qué se comprobó y cómo se investigó" /></Campo>
        <Campo label="Causa comprobada *" ancho><textarea className="input" rows={3} value={form.causaComprobada} onChange={(e) => setForm({ ...form, causaComprobada: e.target.value })} /></Campo>
        <Campo label="Área responsable real *"><select className="input" value={form.areaResponsableId} onChange={(e) => setForm({ ...form, areaResponsableId: e.target.value as AreaSGOId })}>{AREAS_SGO.map((area) => <option value={area.id} key={area.id}>{area.label}</option>)}</select></Campo>
        <Campo label="Responsable de resolver *"><input className="input" value={form.responsableReal} onChange={(e) => setForm({ ...form, responsableReal: e.target.value })} placeholder="Mantenimiento, encargado o persona" /></Campo>
        <Campo label="Evidencia de respaldo *" ancho><textarea className="input" rows={2} value={form.evidencia} onChange={(e) => setForm({ ...form, evidencia: e.target.value })} placeholder="N° de pedido, SAP B1, correo, foto o referencia verificable" /></Campo>
        <Campo label="Motivo para no penalizar al área auditada *" ancho><textarea className="input" rows={2} value={form.motivoAjuste} onChange={(e) => setForm({ ...form, motivoAjuste: e.target.value })} /></Campo>
      </div>
      <div className="sgo-revision-aviso">Al aprobarse, el sistema conservará el puntaje original, ajustará solamente el premiable y abrirá una mejora continua para el área responsable.</div>
      <div className="row-actions"><button className="btn" disabled={guardando} onClick={() => { setItemEditando(undefined); setForm(undefined) }}>Cancelar</button><button className="btn btn-primary" disabled={guardando} onClick={() => void solicitar()}>{guardando ? 'Guardando…' : 'Enviar a revisión'}</button></div>
    </div>}

    {decision && <div className="sgo-revision-dialog-overlay" role="presentation">
      <div className="modal sgo-revision-dialog" role="dialog" aria-modal="true" aria-labelledby="sgo-revision-dialog-title">
        <div className="card-header">
          <div><div id="sgo-revision-dialog-title" className="section-title">{decision.estado === 'aprobada' ? 'Aprobar ajuste premiable' : 'Rechazar revisión'}</div><div className="meta">Puntaje observado {decision.revision.puntajeOriginal}/2 → propuesta {decision.revision.puntajePropuesto}/2 · {areaSGOLabel(decision.revision.areaResponsableId)}</div></div>
          <button type="button" className="btn" disabled={guardando} aria-label="Cerrar decisión" onClick={() => setDecision(undefined)}>×</button>
        </div>
        <Campo label="Fundamento de la decisión *"><textarea className="input" autoFocus rows={4} value={comentarioDecision} onChange={(e) => setComentarioDecision(e.target.value)} placeholder="Dejá documentado por qué se aprueba o rechaza" /></Campo>
        {decision.estado === 'aprobada' && <div className="sgo-revision-aviso">La aprobación ajustará el puntaje premiable y creará automáticamente una mejora continua asignada a {areaSGOLabel(decision.revision.areaResponsableId)}.</div>}
        <div className="row-actions"><button type="button" className="btn" disabled={guardando} onClick={() => setDecision(undefined)}>Cancelar</button><button type="button" className={`btn ${decision.estado === 'aprobada' ? 'btn-primary' : ''}`} disabled={guardando} onClick={() => void resolver()}>{guardando ? 'Guardando…' : decision.estado === 'aprobada' ? 'Confirmar aprobación' : 'Confirmar rechazo'}</button></div>
      </div>
    </div>}
  </section>
}

function Campo({ label, ancho, children }: { label: string; ancho?: boolean; children: React.ReactNode }) {
  return <div className={`field ${ancho ? 'sgo-revision-ancho' : ''}`}><label>{label}</label>{children}</div>
}
