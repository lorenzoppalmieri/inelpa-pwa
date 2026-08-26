import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { eliminarEventoSGO, guardarEventoSGO } from '../../sync/syncEngine'
import { validarCierreEvento } from '../../sgo/cierre'
import {
  CLASES_MEJORA, DECISIONES_MEJORA, ESTADOS_GESTION_MEJORA, FUENTES_MEJORA, PRIORIDADES_MEJORA,
  accionMejoraVencida, crearDatosMejora, estadoGestionMejora, fechaHoyISO,
  seguimientoVencido, type EstadoGestionMejora,
} from '../../sgo/mejoras'
import { usuarioEsLorenzo } from '../../sgo/permisos'
import {
  AREAS_SGO, PILARES_SGO, areaSGOLabel, codigoEventoSGO,
  type AccionSGO, type AreaSGOId, type ClaseMejoraSGO, type DatosMejoraSGO,
  type DecisionMejoraSGO, type EventoSGO, type FuenteMejoraSGO, type PilarSGO,
  type PrioridadMejoraSGO, type SeveridadSGO,
} from '../../sgo/types'
import RetrabajosSGOView from './RetrabajosSGOView'

type VistaMejoras = 'seguimiento' | 'retrabajos' | 'resultados' | 'tablero'

const fechaHora = (iso: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
const fechaLabel = (iso?: string) => iso ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(`${iso.slice(0, 10)}T12:00:00`)) : 'Sin fecha'
const fuenteLabel = (id?: FuenteMejoraSGO) => FUENTES_MEJORA.find((f) => f.id === id)?.label ?? 'Sin fuente'
const claseLabel = (id?: ClaseMejoraSGO) => CLASES_MEJORA.find((c) => c.id === id)?.label ?? 'Mejora'
const estadoLabel = (id: EstadoGestionMejora) => ESTADOS_GESTION_MEJORA.find((e) => e.id === id)?.label ?? id

export default function MejorasSGOView({ usuario, umbralAutorizacion, onOpenEvento, registroInicialId, vistaInicial, onRegistroInicialConsumido }: {
  usuario: string
  umbralAutorizacion: number
  onOpenEvento: (id: string) => void
  registroInicialId?: string
  vistaInicial?: 'seguimiento' | 'retrabajos'
  onRegistroInicialConsumido?: () => void
}) {
  const eventos = useLiveQuery(() => db.eventosSGO.toArray(), []) ?? []
  const acciones = useLiveQuery(() => db.accionesSGO.toArray(), []) ?? []
  const [vista, setVista] = useState<VistaMejoras>('seguimiento')
  const [editor, setEditor] = useState<EventoSGO | null | undefined>()
  const [buscar, setBuscar] = useState('')
  const [fuente, setFuente] = useState<FuenteMejoraSGO | ''>('')
  const [area, setArea] = useState<AreaSGOId | ''>('')
  const [estado, setEstado] = useState<EstadoGestionMejora | ''>('')
  useEffect(() => {
    if (!registroInicialId) return
    if (vistaInicial === 'retrabajos') {
      setVista('retrabajos')
      return
    }
    const registro = eventos.find((item) => item.id === registroInicialId && item.mejora)
    if (!registro) return
    setVista('seguimiento')
    setEditor(registro)
    onRegistroInicialConsumido?.()
  }, [registroInicialId, vistaInicial, eventos, onRegistroInicialConsumido])
  const hoy = fechaHoyISO()
  const registros = useMemo(() => eventos.filter((evento) => Boolean(evento.mejora)), [eventos])
  const retrabajosPendientes = eventos.filter((evento) => evento.retrabajo && evento.estado !== 'cerrado').length
  const accionesDe = (id: string) => acciones.filter((accion) => accion.eventoId === id)
  const abiertos = registros.filter((evento) => evento.estado !== 'cerrado')
  const cerrados = registros.filter((evento) => evento.estado === 'cerrado')
  const vencidas = acciones.filter((accion) => registros.some((evento) => evento.id === accion.eventoId) && accionMejoraVencida(accion, hoy)).length
  const pendientesSeguimiento = cerrados.filter((evento) => seguimientoVencido(evento, hoy)).length
  const verificadas = acciones.filter((accion) => registros.some((evento) => evento.id === accion.eventoId) && accion.estado === 'verificada')
  const eficacia = verificadas.length ? Math.round(verificadas.filter((accion) => accion.eficaz).length / verificadas.length * 100) : 0
  const cerradasMes = cerrados.filter((evento) => evento.cerradoEn?.slice(0, 7) === hoy.slice(0, 7)).length
  const pendientesEvaluacion = abiertos.filter((evento) => ['detectada', 'en_evaluacion'].includes(estadoGestionMejora(evento, accionesDe(evento.id)))).length

  const base = vista === 'resultados' ? cerrados : abiertos
  const visibles = base.filter((evento) => {
    const texto = `${evento.codigo} ${evento.titulo} ${evento.descripcion} ${evento.responsable ?? ''} ${evento.mejora?.colaborador ?? ''}`.toLowerCase()
    const estadoActual = estadoGestionMejora(evento, accionesDe(evento.id))
    return (!buscar || texto.includes(buscar.toLowerCase())) && (!fuente || evento.mejora?.fuente === fuente) &&
      (!area || evento.areaId === area) && (!estado || estadoActual === estado)
  }).sort((a, b) => b.detectadoEn.localeCompare(a.detectadoEn))

  function exportar() {
    const cabecera = ['Código', 'Fecha', 'Clase', 'Fuente', 'Área', 'Título', 'Estado', 'Decisión', 'Prioridad', 'Responsable', 'Acciones', 'Acciones vencidas', 'Resultado', 'Seguimiento']
    const filas = registros.map((evento) => {
      const acc = accionesDe(evento.id)
      return [evento.codigo, evento.detectadoEn.slice(0, 10), claseLabel(evento.mejora?.clase), fuenteLabel(evento.mejora?.fuente), areaSGOLabel(evento.areaId), evento.titulo,
        estadoLabel(estadoGestionMejora(evento, acc)), evento.mejora?.decision ?? '', evento.mejora?.prioridad ?? '', evento.responsable ?? '', acc.length,
        acc.filter((accion) => accionMejoraVencida(accion, hoy)).length, evento.mejora?.resultado ?? '', evento.mejora?.seguimientoResultado ?? '']
    })
    const escapar = (valor: unknown) => `"${String(valor ?? '').replace(/"/g, '""')}"`
    const contenido = '\ufeff' + [cabecera, ...filas].map((fila) => fila.map(escapar).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
    const enlace = document.createElement('a'); enlace.href = url; enlace.download = `SGO_mejora_continua_${hoy}.csv`; enlace.click(); URL.revokeObjectURL(url)
  }

  return <div>
    <div className="card sgo-mejoras-cabecera">
      <div><div className="section-title">MEJORA CONTINUA</div><div className="meta">Ideas, hallazgos y acciones desde su detección hasta comprobar que la mejora se sostiene.</div></div>
      <div className="row-actions"><button className="btn" onClick={exportar}>Exportar registro</button><button className="btn btn-primary" onClick={() => setEditor(null)}>+ Nueva detección</button></div>
    </div>
    <div className="sgo-mejoras-kpis">
      <Kpi valor={abiertos.length} label="Mejoras activas" tono="azul" />
      <Kpi valor={pendientesEvaluacion} label="Pendientes de evaluar" tono="amarillo" />
      <Kpi valor={vencidas} label="Acciones vencidas" tono={vencidas ? 'rojo' : 'verde'} />
      <Kpi valor={pendientesSeguimiento} label="Seguimientos vencidos" tono={pendientesSeguimiento ? 'rojo' : 'verde'} />
      <Kpi valor={cerradasMes} label="Cerradas este mes" tono="verde" />
      <Kpi valor={`${eficacia}%`} label="Eficacia de acciones" tono={eficacia >= 90 ? 'verde' : eficacia >= 70 ? 'amarillo' : 'rojo'} />
    </div>
    <div className="tabs sgo-mejoras-tabs">
      <button className={`tab ${vista === 'seguimiento' ? 'active' : ''}`} onClick={() => setVista('seguimiento')}>Seguimiento activo</button>
      <button className={`tab ${vista === 'retrabajos' ? 'active' : ''}`} onClick={() => setVista('retrabajos')}>Retrabajos{retrabajosPendientes ? ` (${retrabajosPendientes})` : ''}</button>
      <button className={`tab ${vista === 'resultados' ? 'active' : ''}`} onClick={() => setVista('resultados')}>Resultados e historial</button>
      <button className={`tab ${vista === 'tablero' ? 'active' : ''}`} onClick={() => setVista('tablero')}>Tablero</button>
    </div>
    {['seguimiento', 'resultados'].includes(vista) && <div className="card sgo-mejoras-filtros">
      <input className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar código, mejora, responsable…" />
      <select className="input" value={fuente} onChange={(e) => setFuente(e.target.value as FuenteMejoraSGO | '')}><option value="">Todas las fuentes</option>{FUENTES_MEJORA.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
      <select className="input" value={area} onChange={(e) => setArea(e.target.value as AreaSGOId | '')}><option value="">Todas las áreas</option>{AREAS_SGO.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
      <select className="input" value={estado} onChange={(e) => setEstado(e.target.value as EstadoGestionMejora | '')}><option value="">Todos los estados</option>{ESTADOS_GESTION_MEJORA.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select>
    </div>}
    {vista === 'retrabajos' ? <RetrabajosSGOView usuario={usuario} onOpenEvento={onOpenEvento} eventoInicialId={vistaInicial === 'retrabajos' ? registroInicialId : undefined} onEventoInicialConsumido={onRegistroInicialConsumido} />
      : vista === 'tablero' ? <Tablero registros={registros} acciones={acciones} hoy={hoy} />
      : vista === 'seguimiento' ? <Kanban registros={visibles} acciones={acciones} hoy={hoy} onOpen={setEditor} />
        : <Listado registros={visibles} acciones={acciones} hoy={hoy} onOpen={setEditor} vacio="Todavía no hay mejoras cerradas." />}
    {editor !== undefined && <EditorMejora registro={editor} acciones={editor ? accionesDe(editor.id) : []} usuario={usuario} umbralAutorizacion={umbralAutorizacion}
      onClose={() => setEditor(undefined)} onOpenEvento={(id) => { setEditor(undefined); onOpenEvento(id) }} />}
  </div>
}

function Kpi({ valor, label, tono }: { valor: string | number; label: string; tono: string }) {
  return <div className={`card sgo-mejora-kpi tono-${tono}`}><strong>{valor}</strong><span>{label}</span></div>
}

const COLUMNAS: { titulo: string; estados: EstadoGestionMejora[] }[] = [
  { titulo: 'Detectadas y en evaluación', estados: ['detectada', 'en_evaluacion', 'a_futuro'] },
  { titulo: 'Aprobadas y en ejecución', estados: ['aprobada', 'en_ejecucion', 'reincidencia'] },
  { titulo: 'Verificación y cierre', estados: ['pendiente_verificacion', 'lista_para_cerrar'] },
]

function Kanban({ registros, acciones, hoy, onOpen }: { registros: EventoSGO[]; acciones: AccionSGO[]; hoy: string; onOpen: (e: EventoSGO) => void }) {
  if (!registros.length) return <div className="empty">No hay mejoras activas con los filtros seleccionados.</div>
  return <div className="sgo-mejoras-kanban">{COLUMNAS.map((columna) => {
    const items = registros.filter((evento) => columna.estados.includes(estadoGestionMejora(evento, acciones.filter((a) => a.eventoId === evento.id))))
    return <section className="sgo-mejoras-columna" key={columna.titulo}><div className="sgo-mejoras-columna-titulo"><strong>{columna.titulo}</strong><span>{items.length}</span></div>
      <div className="sgo-mejoras-lista">{items.map((evento) => <MejoraCard key={evento.id} evento={evento} acciones={acciones.filter((a) => a.eventoId === evento.id)} hoy={hoy} onOpen={() => onOpen(evento)} />)}{!items.length && <div className="empty">Sin registros</div>}</div>
    </section>
  })}</div>
}

function Listado({ registros, acciones, hoy, onOpen, vacio }: { registros: EventoSGO[]; acciones: AccionSGO[]; hoy: string; onOpen: (e: EventoSGO) => void; vacio: string }) {
  if (!registros.length) return <div className="empty">{vacio}</div>
  return <div className="sgo-mejoras-lista">{registros.map((evento) => <MejoraCard key={evento.id} evento={evento} acciones={acciones.filter((a) => a.eventoId === evento.id)} hoy={hoy} onOpen={() => onOpen(evento)} />)}</div>
}

function MejoraCard({ evento, acciones, hoy, onOpen }: { evento: EventoSGO; acciones: AccionSGO[]; hoy: string; onOpen: () => void }) {
  const estado = estadoGestionMejora(evento, acciones)
  const vencidas = acciones.filter((accion) => accionMejoraVencida(accion, hoy)).length
  const progreso = acciones.length ? Math.round(acciones.filter((a) => a.estado === 'verificada').length / acciones.length * 100) : 0
  return <button className={`card sgo-mejora-card prioridad-${evento.mejora?.prioridad ?? 'media'}`} onClick={onOpen}>
    <div className="sgo-mejora-card-top"><span className={`estado-chip mejora-${estado}`}>{estadoLabel(estado)}</span><span className="meta">{evento.codigo}</span></div>
    <strong>{evento.titulo}</strong>
    <div className="meta">{claseLabel(evento.mejora?.clase)} · {fuenteLabel(evento.mejora?.fuente)} · {areaSGOLabel(evento.areaId)}</div>
    <div className="sgo-mejora-card-resumen"><span>Responsable: <strong>{evento.responsable || 'Sin asignar'}</strong></span><span>{acciones.length} acción(es){vencidas ? ` · ${vencidas} vencida(s)` : ''}</span></div>
    {acciones.length > 0 && <div className="sgo-mejora-progreso"><span style={{ width: `${progreso}%` }} /></div>}
    {evento.estado === 'cerrado' && <div className="sgo-mejora-resultado">{evento.mejora?.resultado || evento.mejora?.justificacionDecision || 'Cierre sin resultado documentado'}</div>}
  </button>
}

function Tablero({ registros, acciones, hoy }: { registros: EventoSGO[]; acciones: AccionSGO[]; hoy: string }) {
  const activas = registros.filter((e) => e.estado !== 'cerrado')
  const fuentes = contar(activas.map((e) => fuenteLabel(e.mejora?.fuente))).slice(0, 8)
  const areas = contar(activas.map((e) => areaSGOLabel(e.areaId))).slice(0, 8)
  const estados = contar(activas.map((e) => estadoLabel(estadoGestionMejora(e, acciones.filter((a) => a.eventoId === e.id)))))
  return <div className="sgo-mejoras-tablero">
    <Barras titulo="Activas por estado" datos={estados} />
    <Barras titulo="Activas por fuente" datos={fuentes} />
    <Barras titulo="Activas por área" datos={areas} />
    <div className="card"><div className="section-title">Alertas que requieren intervención</div>
      <div className="sgo-mejoras-alertas"><div><strong>{acciones.filter((a) => registros.some((e) => e.id === a.eventoId) && accionMejoraVencida(a, hoy)).length}</strong><span>acciones vencidas</span></div><div><strong>{registros.filter((e) => seguimientoVencido(e, hoy)).length}</strong><span>seguimientos vencidos</span></div><div><strong>{activas.filter((e) => !e.responsable).length}</strong><span>sin responsable</span></div></div>
    </div>
  </div>
}

function contar(valores: string[]) {
  const mapa = new Map<string, number>()
  valores.forEach((v) => mapa.set(v, (mapa.get(v) ?? 0) + 1))
  return [...mapa.entries()].sort((a, b) => b[1] - a[1])
}

function Barras({ titulo, datos }: { titulo: string; datos: [string, number][] }) {
  const max = Math.max(1, ...datos.map(([, valor]) => valor))
  return <div className="card"><div className="section-title">{titulo}</div><div className="sgo-mejoras-barras">{datos.map(([label, valor]) => <div key={label}><div><span>{label}</span><strong>{valor}</strong></div><i><span style={{ width: `${valor / max * 100}%` }} /></i></div>)}{!datos.length && <div className="empty">Sin datos todavía.</div>}</div></div>
}

function EditorMejora({ registro, acciones, usuario, umbralAutorizacion, onClose: cerrarEditor, onOpenEvento }: { registro: EventoSGO | null; acciones: AccionSGO[]; usuario: string; umbralAutorizacion: number; onClose: () => void; onOpenEvento: (id: string) => void }) {
  const lorenzo = usuarioEsLorenzo(usuario)
  const ahora = new Date().toISOString()
  const [evento, setEvento] = useState<EventoSGO>(() => registro ?? {
    id: crypto.randomUUID(), codigo: '', tipo: 'oportunidad_mejora', pilar: 'mejora', titulo: '', descripcion: '',
    severidad: 'media', estado: 'abierto', detectadoEn: ahora, detectadoPor: usuario, creadoEn: ahora, actualizadoEn: ahora,
  })
  const [mejora, setMejora] = useState<DatosMejoraSGO>(() => registro?.mejora ?? crearDatosMejora({ clase: 'oportunidad', fuente: 'manual' }))
  const [guardando, setGuardando] = useState(false)
  const original = JSON.stringify({ evento: registro, mejora: registro?.mejora })
  const actual = JSON.stringify({ evento, mejora })
  const conCambios = registro ? original !== actual : Boolean(evento.titulo.trim() || evento.descripcion.trim() || evento.areaId || mejora.colaborador?.trim() || mejora.fuente !== 'manual' || mejora.clase !== 'oportunidad')
  const estadoActual = registro ? estadoGestionMejora({ ...evento, mejora }, acciones) : 'detectada'
  const presupuesto = Math.max(0, Number(mejora.presupuestoEstimado) || 0)
  const presupuestoOriginal = Math.max(0, Number(registro?.mejora?.presupuestoEstimado) || 0)
  const decisionHistorica = presupuesto === presupuestoOriginal && registro?.mejora?.decision !== 'pendiente' && registro?.mejora?.autorizacionRequerida !== undefined
  const requiereAutorizacion = decisionHistorica
    ? Boolean(registro?.mejora?.autorizacionRequerida)
    : presupuesto > umbralAutorizacion
  const setEventoCampo = <K extends keyof EventoSGO>(key: K, value: EventoSGO[K]) => setEvento({ ...evento, [key]: value })
  const setMejoraCampo = <K extends keyof DatosMejoraSGO>(key: K, value: DatosMejoraSGO[K]) => setMejora({ ...mejora, [key]: value })

  function onClose() {
    if (conCambios && !window.confirm('¿Descartar los cambios de esta mejora?')) return
    cerrarEditor()
  }

  function validar(decision = mejora.decision): string[] {
    const errores: string[] = []
    if (!evento.titulo.trim()) errores.push('Completar el título.')
    if (!evento.descripcion.trim()) errores.push('Describir la detección.')
    if (!evento.areaId) errores.push('Seleccionar el área.')
    if (!mejora.pilaresBeneficiados.length) errores.push('Seleccionar al menos un pilar beneficiado.')
    if (decision === 'aprobada') {
      if (!evento.responsable?.trim()) errores.push('Asignar un responsable.')
      if (!mejora.fechaObjetivo) errores.push('Definir la fecha objetivo.')
      if (!mejora.beneficioEsperado?.trim()) errores.push('Documentar el beneficio esperado.')
    }
    if (decision === 'a_futuro' && !mejora.fechaRevision) errores.push('Definir cuándo se revisará nuevamente.')
    if (decision === 'no_viable' && !mejora.justificacionDecision?.trim()) errores.push('Justificar por qué no es viable.')
    return errores
  }

  function mejoraEvaluada(): DatosMejoraSGO {
    const decision = requiereAutorizacion && !lorenzo && !registro?.mejora?.autorizacionRequerida ? 'pendiente' : mejora.decision
    const estadoAutorizacion = !requiereAutorizacion ? 'no_requiere'
      : decision === 'pendiente' ? 'pendiente'
        : decision === 'aprobada' ? 'aprobada'
          : decision === 'a_futuro' ? 'postergada' : 'rechazada'
    return {
      ...mejora,
      decision,
      autorizacionRequerida: requiereAutorizacion,
      umbralAutorizacionAplicado: registro?.mejora?.umbralAutorizacionAplicado ?? umbralAutorizacion,
      autorizacionEstado: estadoAutorizacion,
      autorizacionDecididaEn: requiereAutorizacion && decision !== 'pendiente' ? (mejora.autorizacionDecididaEn ?? new Date().toISOString()) : undefined,
      autorizacionDecididaPor: requiereAutorizacion && decision !== 'pendiente' ? (mejora.autorizacionDecididaPor ?? usuario) : undefined,
    }
  }

  function eventoPreparado(estado?: EventoSGO['estado']): EventoSGO {
    const tipo = mejora.clase === 'no_conformidad' ? 'no_conformidad'
      : mejora.clase === 'observacion' && ['auditoria_iso_interna', 'auditoria_iso_externa'].includes(mejora.fuente) ? 'hallazgo_auditoria'
        : 'oportunidad_mejora'
    const pilar: PilarSGO = tipo === 'no_conformidad' ? 'calidad' : 'mejora'
    const ahoraIso = new Date().toISOString()
    return {
      ...evento, codigo: evento.codigo || codigoEventoSGO(new Date(), evento.id), tipo, pilar,
      titulo: evento.titulo.trim(), descripcion: evento.descripcion.trim(), responsable: evento.responsable?.trim() || undefined,
      areaOrigenId: tipo === 'no_conformidad' ? evento.areaId : evento.areaOrigenId, mejora: mejoraEvaluada(),
      estado: estado ?? (evento.estado === 'cerrado' ? 'cerrado' : mejora.decision === 'a_futuro' ? 'en_analisis' : mejora.decision === 'aprobada' ? (acciones.length ? 'con_acciones' : 'en_analisis') : evento.estado),
      actualizadoEn: ahoraIso,
    }
  }

  async function guardar() {
    if (requiereAutorizacion && mejora.decision !== (registro?.mejora?.decision ?? 'pendiente') && !lorenzo) { window.alert(`Esta mejora supera ${umbralAutorizacion.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}. Solo Lorenzo puede decidir su aprobación.`); return }
    const errores = validar()
    if (errores.length) { window.alert(errores.join('\n')); return }
    let actualizado = eventoPreparado(mejora.decision === 'no_viable' ? 'cerrado' : undefined)
    if (mejora.decision === 'no_viable') actualizado = { ...actualizado, cerradoEn: actualizado.cerradoEn ?? new Date().toISOString(), cerradoPor: usuario }
    const erroresCierre = validarCierreEvento(actualizado, acciones)
    if (erroresCierre.length) { window.alert(`No se puede cerrar:\n\n• ${erroresCierre.join('\n• ')}`); return }
    setGuardando(true)
    try { await guardarEventoSGO(actualizado); cerrarEditor() } finally { setGuardando(false) }
  }

  async function cerrarMejora() {
    if (!registro || (requiereAutorizacion && !lorenzo)) return
    const erroresFormulario = validar('aprobada')
    if (erroresFormulario.length) { window.alert(erroresFormulario.join('\n')); return }
    const candidato = { ...eventoPreparado('cerrado'), cerradoEn: evento.cerradoEn ?? new Date().toISOString(), cerradoPor: evento.cerradoPor ?? usuario }
    const errores = validarCierreEvento(candidato, acciones)
    if (errores.length) { window.alert(`No se puede cerrar la mejora:\n\n• ${errores.join('\n• ')}`); return }
    if (!window.confirm('La mejora quedará cerrada y pasará a Resultados e historial. ¿Continuar?')) return
    setGuardando(true)
    try { await guardarEventoSGO(candidato); cerrarEditor() } finally { setGuardando(false) }
  }

  async function registrarSeguimiento() {
    if (!registro || evento.estado !== 'cerrado') return
    if (!['sostenida', 'reincidencia'].includes(mejora.seguimientoResultado ?? '') || !mejora.seguimientoObservacion?.trim()) {
      window.alert('Indicá si la mejora se sostuvo o reincidió y documentá la comprobación.'); return
    }
    const ahoraIso = new Date().toISOString()
    const reincide = mejora.seguimientoResultado === 'reincidencia'
    const actualizado = eventoPreparado(reincide ? 'en_analisis' : 'cerrado')
    actualizado.mejora = { ...mejora, decision: reincide ? 'aprobada' : mejora.decision, seguimientoEn: ahoraIso, seguimientoPor: usuario }
    if (reincide) { actualizado.cerradoEn = undefined; actualizado.cerradoPor = undefined }
    setGuardando(true)
    try { await guardarEventoSGO(actualizado); cerrarEditor() } finally { setGuardando(false) }
  }

  async function eliminar() {
    if (!registro || !lorenzo || !window.confirm(`¿Eliminar definitivamente ${registro.codigo}? Esta acción no se puede deshacer.`)) return
    setGuardando(true)
    try { await eliminarEventoSGO(registro, usuario); cerrarEditor() } finally { setGuardando(false) }
  }

  return <Modal titulo={registro ? `${evento.codigo} · ${evento.titulo}` : 'Nueva detección de mejora'} onClose={onClose}>
    {registro && <div className="sgo-mejora-editor-resumen"><span className={`estado-chip mejora-${estadoActual}`}>{estadoLabel(estadoActual)}</span><span>Detectada {fechaHora(evento.detectadoEn)} por {evento.detectadoPor}</span></div>}
    <div className="section-title">1. Detección</div>
    <div className="sgo-mejora-form-grid">
      <Campo label="Clase"><select className="input" value={mejora.clase} onChange={(e) => setMejoraCampo('clase', e.target.value as ClaseMejoraSGO)}>{CLASES_MEJORA.map((c) => <option value={c.id} key={c.id}>{c.label}</option>)}</select></Campo>
      <Campo label="Fuente"><select className="input" value={mejora.fuente} onChange={(e) => setMejoraCampo('fuente', e.target.value as FuenteMejoraSGO)}>{FUENTES_MEJORA.map((f) => <option value={f.id} key={f.id}>{f.label}</option>)}</select></Campo>
      <Campo label="Área *"><select className="input" value={evento.areaId ?? ''} onChange={(e) => setEventoCampo('areaId', (e.target.value || undefined) as AreaSGOId | undefined)}><option value="">Seleccionar área</option>{AREAS_SGO.map((a) => <option value={a.id} key={a.id}>{a.label}</option>)}</select></Campo>
      <Campo label="Colaborador / detector"><input className="input" value={mejora.colaborador ?? ''} onChange={(e) => setMejoraCampo('colaborador', e.target.value || undefined)} placeholder="Nombre o equipo que aportó la idea" /></Campo>
    </div>
    <Campo label="Título *"><input className="input" value={evento.titulo} onChange={(e) => setEventoCampo('titulo', e.target.value)} /></Campo>
    <Campo label="Descripción de la situación actual *"><textarea className="input" rows={3} value={evento.descripcion} onChange={(e) => setEventoCampo('descripcion', e.target.value)} /></Campo>
    <div className="section-title">Pilares beneficiados</div><div className="sgo-mejora-pilares">{PILARES_SGO.map((p) => <label key={p.id}><input type="checkbox" checked={mejora.pilaresBeneficiados.includes(p.id)} onChange={(e) => setMejoraCampo('pilaresBeneficiados', e.target.checked ? [...mejora.pilaresBeneficiados, p.id] : mejora.pilaresBeneficiados.filter((id) => id !== p.id))} />{p.label}</label>)}</div>

    <div className="section-title">2. Evaluación y decisión</div>
    <Campo label="Beneficio esperado"><textarea className="input" rows={2} value={mejora.beneficioEsperado ?? ''} onChange={(e) => setMejoraCampo('beneficioEsperado', e.target.value || undefined)} placeholder="Qué condición debería mejorar y cómo se reconocerá el resultado" /></Campo>
    <div className="sgo-mejora-form-grid">
      <Campo label="Responsable"><input className="input" value={evento.responsable ?? ''} onChange={(e) => setEventoCampo('responsable', e.target.value || undefined)} /></Campo>
      <Campo label="Prioridad"><select className="input" value={mejora.prioridad} onChange={(e) => { const prioridad = e.target.value as PrioridadMejoraSGO; setMejoraCampo('prioridad', prioridad); setEventoCampo('severidad', prioridad as SeveridadSGO) }}>{PRIORIDADES_MEJORA.map((p) => <option value={p.id} key={p.id}>{p.label}</option>)}</select></Campo>
      <Campo label="Presupuesto estimado (ARS)"><input className="input" type="number" min="0" value={mejora.presupuestoEstimado ?? ''} onChange={(e) => setMejoraCampo('presupuestoEstimado', e.target.value ? Math.max(0, Number(e.target.value)) : undefined)} /></Campo>
      <Campo label="Fecha objetivo"><input className="input" type="date" value={mejora.fechaObjetivo ?? ''} onChange={(e) => setMejoraCampo('fechaObjetivo', e.target.value || undefined)} /></Campo>
    </div>
    <div className={`card sgo-mejora-autorizacion ${requiereAutorizacion ? 'requiere' : 'no-requiere'}`}><strong>{requiereAutorizacion ? 'Requiere autorización de Lorenzo' : 'No requiere autorización económica'}</strong><span>{requiereAutorizacion ? `El presupuesto supera el límite vigente de ${umbralAutorizacion.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}.` : `Puede avanzar dentro del circuito del responsable. Límite vigente: ${umbralAutorizacion.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}.`}</span></div>
    <div className="sgo-mejora-decision">
      <Campo label={requiereAutorizacion ? 'Decisión de Lorenzo' : 'Decisión operativa'}><select className="input" disabled={requiereAutorizacion && !lorenzo} value={mejora.decision} onChange={(e) => setMejoraCampo('decision', e.target.value as DecisionMejoraSGO)}>{DECISIONES_MEJORA.map((d) => <option value={d.id} key={d.id}>{d.label}</option>)}</select></Campo>
      {mejora.decision === 'a_futuro' && <Campo label="Revisar nuevamente el"><input className="input" type="date" value={mejora.fechaRevision ?? ''} onChange={(e) => setMejoraCampo('fechaRevision', e.target.value || undefined)} /></Campo>}
    </div>
    {['a_futuro', 'no_viable'].includes(mejora.decision) && <Campo label="Justificación de la decisión"><textarea className="input" rows={2} value={mejora.justificacionDecision ?? ''} onChange={(e) => setMejoraCampo('justificacionDecision', e.target.value || undefined)} /></Campo>}

    {(registro && (mejora.decision === 'aprobada' || evento.estado === 'cerrado')) && <>
      <div className="section-title">3. Resultado, cierre y sostenimiento</div>
      <Campo label="Resultado obtenido"><textarea className="input" rows={3} value={mejora.resultado ?? ''} onChange={(e) => setMejoraCampo('resultado', e.target.value || undefined)} /></Campo>
      <Campo label="Beneficio real"><textarea className="input" rows={2} value={mejora.beneficioReal ?? ''} onChange={(e) => setMejoraCampo('beneficioReal', e.target.value || undefined)} placeholder="Ahorro, reducción de riesgo, tiempo, calidad, orden o aprendizaje conseguido" /></Campo>
      <div className="sgo-mejora-form-grid">
        <Campo label="Medición antes"><input className="input" type="number" value={mejora.metricaAntes ?? ''} onChange={(e) => setMejoraCampo('metricaAntes', e.target.value ? Number(e.target.value) : undefined)} /></Campo>
        <Campo label="Medición después"><input className="input" type="number" value={mejora.metricaDespues ?? ''} onChange={(e) => setMejoraCampo('metricaDespues', e.target.value ? Number(e.target.value) : undefined)} /></Campo>
        <Campo label="Unidad"><input className="input" value={mejora.unidadMetrica ?? ''} onChange={(e) => setMejoraCampo('unidadMetrica', e.target.value || undefined)} placeholder="%, minutos, cantidad, $…" /></Campo>
        <Campo label="Verificar sostenimiento el"><input className="input" type="date" value={mejora.fechaSeguimiento ?? ''} onChange={(e) => setMejoraCampo('fechaSeguimiento', e.target.value || undefined)} /></Campo>
      </div>
      <Campo label="Estandarización realizada"><textarea className="input" rows={2} value={mejora.estandarizacion ?? ''} onChange={(e) => setMejoraCampo('estandarizacion', e.target.value || undefined)} placeholder="Procedimiento, instructivo, capacitación, gestión visual o KPI actualizado" /></Campo>
    </>}
    {registro && evento.estado === 'cerrado' && mejora.decision === 'aprobada' && <div className="card sgo-mejora-seguimiento">
      <div className="section-title">Comprobación posterior al cierre</div>
      <div className="sgo-mejora-form-grid"><Campo label="Resultado"><select className="input" value={mejora.seguimientoResultado ?? 'pendiente'} onChange={(e) => setMejoraCampo('seguimientoResultado', e.target.value as DatosMejoraSGO['seguimientoResultado'])}><option value="pendiente">Pendiente</option><option value="sostenida">La mejora se sostiene</option><option value="reincidencia">El problema reincidió</option></select></Campo><Campo label="Fecha programada"><input className="input" type="date" value={mejora.fechaSeguimiento ?? ''} onChange={(e) => setMejoraCampo('fechaSeguimiento', e.target.value || undefined)} /></Campo></div>
      <Campo label="Comprobación realizada"><textarea className="input" rows={2} value={mejora.seguimientoObservacion ?? ''} onChange={(e) => setMejoraCampo('seguimientoObservacion', e.target.value || undefined)} /></Campo>
      <button className="btn btn-primary" onClick={() => void registrarSeguimiento()} disabled={guardando}>Registrar seguimiento</button>
    </div>}

    {registro && <div className="card sgo-mejora-acciones-resumen"><div><strong>{acciones.length}</strong><span>acciones</span></div><div><strong>{acciones.filter((a) => a.estado === 'verificada').length}</strong><span>verificadas</span></div><div><strong>{acciones.filter((a) => accionMejoraVencida(a, fechaHoyISO())).length}</strong><span>vencidas</span></div><button className="btn" onClick={() => onOpenEvento(registro.id)}>Abrir expediente y acciones</button></div>}
    <div className="row-actions sgo-mejora-editor-acciones">
      {registro && lorenzo && <button className="btn btn-rojo" disabled={guardando} onClick={() => void eliminar()}>Eliminar</button>}
      <button className="btn" onClick={onClose} disabled={guardando}>Cancelar</button>
      <button className="btn btn-primary" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : registro ? 'Guardar cambios' : 'Registrar detección'}</button>
      {registro && (!requiereAutorizacion || lorenzo) && mejora.decision === 'aprobada' && evento.estado !== 'cerrado' && <button className="btn btn-verde" disabled={guardando} onClick={() => void cerrarMejora()}>Verificar y cerrar mejora</button>}
    </div>
  </Modal>
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <div className="field"><label>{label}</label>{children}</div> }
function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-overlay" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-label={titulo} style={{ width: '96%', maxWidth: 980, maxHeight: '94vh', overflow: 'auto' }}><div className="card-header"><div className="section-title">{titulo}</div><button className="btn" onClick={onClose}>×</button></div>{children}</div></div>
}
