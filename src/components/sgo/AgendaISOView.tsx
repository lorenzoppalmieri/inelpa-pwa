import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { fechaLocalISO, sumarDiasLocalISO } from '../../lib/time'
import { eliminarActividadAgendaISO, guardarActividadAgendaISO } from '../../sync/syncEngine'
import { usuarioEsLorenzo } from '../../sgo/permisos'
import {
  CATEGORIAS_AGENDA_ISO, ESTADOS_AGENDA_ISO, NORMAS_AGENDA_ISO, agendaISOEsCerrada,
  agendaISOEstaVencida, agendaISOProxima, puedeGestionarAgendaISO,
  ciclarSemana, proximasAgendaISO, aniosDeAgenda, diasDeAviso,
  type ActividadAgendaISO, type CategoriaAgendaISO, type CriticidadAgendaISO,
  type EstadoAgendaISO, type FrecuenciaAgendaISO, type NormaAgendaISO,
} from '../../sgo/agendaISO'
import MatrizAgendaISO from './MatrizAgendaISO'

const fechaAR = (f?: string) => f ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(`${f}T12:00:00`)) : 'Sin fecha'
const estadoLabel = (id: EstadoAgendaISO) => ESTADOS_AGENDA_ISO.find((e) => e.id === id)?.label ?? id
const categoriaLabel = (id: CategoriaAgendaISO) => CATEGORIAS_AGENDA_ISO.find((e) => e.id === id)?.label ?? id

export default function AgendaISOView({ usuario, actividadInicialId, onActividadInicialConsumida }: {
  usuario: string
  actividadInicialId?: string
  onActividadInicialConsumida?: () => void
}) {
  const actividades = useLiveQuery(() => db.agendaISO.toArray(), []) ?? []
  const [editor, setEditor] = useState<ActividadAgendaISO | null | undefined>()
  const [buscar, setBuscar] = useState('')
  const [norma, setNorma] = useState<NormaAgendaISO | ''>('')
  const [estado, setEstado] = useState<EstadoAgendaISO | 'abiertas' | ''>('abiertas')
  // v1.84: la MATRIZ es la vista por defecto — es la planilla que el equipo
  // reconoce del papel (R.I.T 6.2/05). Lista y calendario quedan como apoyo.
  const [vista, setVista] = useState<'matriz' | 'lista' | 'calendario'>('matriz')
  const [anio, setAnio] = useState<number>(new Date().getFullYear())
  useEffect(() => {
    if (!actividadInicialId) return
    const actividad = actividades.find((item) => item.id === actividadInicialId)
    if (!actividad) return
    setEditor(actividad)
    onActividadInicialConsumida?.()
  }, [actividadInicialId, actividades, onActividadInicialConsumida])
  const hoy = fechaLocalISO(), hasta30 = sumarDiasLocalISO(30)
  const puedeGestionar = puedeGestionarAgendaISO(usuario)
  const resumen = useMemo(() => {
    const aplicables = actividades.filter((a) => a.estado !== 'no_aplica')
    const verificadas = aplicables.filter((a) => a.estado === 'verificada').length
    return { cumplimiento: aplicables.length ? Math.round(verificadas / aplicables.length * 100) : 0,
      vencidas: actividades.filter((a) => agendaISOEstaVencida(a, hoy)).length,
      proximas: actividades.filter((a) => agendaISOProxima(a, hoy, hasta30)).length,
      evidencia: actividades.filter((a) => a.estado === 'esperando_evidencia').length }
  }, [actividades, hoy, hasta30])
  const q = buscar.trim().toLocaleLowerCase('es')
  const visibles = actividades.filter((a) => (!norma || a.normas.includes(norma)) &&
    (!estado || (estado === 'abiertas' ? !agendaISOEsCerrada(a) : a.estado === estado)) &&
    (!q || `${a.titulo} ${a.area ?? ''} ${a.responsable} ${a.requisito ?? ''}`.toLocaleLowerCase('es').includes(q)))
    .sort((a, b) => (a.fechaObjetivo ?? '9999').localeCompare(b.fechaObjetivo ?? '9999'))

  // Un click en el casillero: programar -> hecha -> quitar. Es el gesto que más
  // se usa (Azul reprograma seguido), así que no abre ningún modal.
  async function ciclar(a: ActividadAgendaISO, mes: number, semana: number) {
    if (!puedeGestionar) return
    const semanas = ciclarSemana(a.semanas, anio, mes, semana)
    await guardarActividadAgendaISO({ ...a, semanas, actualizadoEn: new Date().toISOString(), actualizadoPor: usuario }, usuario)
  }

  function exportarCSV() {
    const filas = visibles.map((a) => [a.titulo, categoriaLabel(a.categoria), a.normas.join(', '), a.area ?? '', a.responsable, a.frecuencia,
      a.fechaObjetivo ?? '', estadoLabel(a.estado), a.criticidad, a.evidenciaEsperada ?? '', a.evidencia ?? '', a.resultado ?? '', a.verificacion ?? ''])
    const csv = [['Actividad','Categoría','Normas','Área','Responsable','Frecuencia','Fecha objetivo','Estado','Criticidad','Evidencia esperada','Evidencia','Resultado','Verificación'], ...filas]
      .map((f) => f.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `Agenda_ISO_${hoy}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <div className="sgo-agenda-iso">
    <div className="card sgo-iso-cabecera"><div><div className="section-title">Agenda ISO</div><div className="meta">ISO 9001, ISO 45001 e ISO 14001 · responsable operativo: Azul · supervisión: Lorenzo</div></div>
      <div className="row-actions"><button className="btn" onClick={exportarCSV}>Exportar</button>{puedeGestionar && <button className="btn btn-primary" onClick={() => setEditor(null)}>+ Nueva actividad</button>}</div></div>
    <div className="sgo-iso-kpis"><Kpi valor={`${resumen.cumplimiento}%`} label="Cumplimiento verificado" tono="verde"/><Kpi valor={resumen.vencidas} label="Vencidas" tono="rojo"/><Kpi valor={resumen.proximas} label="Próximas 30 días" tono="amarillo"/><Kpi valor={resumen.evidencia} label="Esperando evidencia" tono="azul"/></div>
    <div className="card sgo-iso-filtros"><input className="input" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar actividad, área o requisito…"/><select className="input" value={norma} onChange={(e) => setNorma(e.target.value as NormaAgendaISO | '')}><option value="">Todas las normas</option>{NORMAS_AGENDA_ISO.map((n) => <option value={n.id} key={n.id}>{n.label}</option>)}</select><select className="input" value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}><option value="abiertas">Pendientes y en curso</option><option value="">Todos los estados</option>{ESTADOS_AGENDA_ISO.map((e) => <option value={e.id} key={e.id}>{e.label}</option>)}</select><div className="row-actions"><select className="input" style={{maxWidth:110}} value={anio} onChange={(e) => setAnio(Number(e.target.value))}>{aniosDeAgenda(actividades, new Date().getFullYear()).map((y) => <option key={y} value={y}>{y}</option>)}</select><button className={`btn ${vista === 'matriz' ? 'btn-primary' : ''}`} onClick={() => setVista('matriz')}>Planilla</button><button className={`btn ${vista === 'lista' ? 'btn-primary' : ''}`} onClick={() => setVista('lista')}>Lista</button><button className={`btn ${vista === 'calendario' ? 'btn-primary' : ''}`} onClick={() => setVista('calendario')}>Calendario</button></div></div>
    {vista === 'matriz' ? <><ProximasISO actividades={visibles} hoy={hoy} onAbrir={setEditor}/><MatrizAgendaISO actividades={visibles} anio={anio} hoy={hoy} puedeEditar={puedeGestionar} onCiclar={(a,m,s2)=>void ciclar(a,m,s2)} onAbrir={setEditor}/></> :
     vista === 'calendario' ? <Calendario actividades={visibles} onOpen={setEditor}/> : <div className="sgo-iso-lista">{visibles.map((a) => <button className={`card sgo-iso-card iso-${a.estado} ${agendaISOEstaVencida(a,hoy) ? 'iso-vencida' : ''}`} key={a.id} onClick={() => setEditor(a)}><div className="sgo-iso-fecha"><strong>{a.fechaObjetivo?.slice(8,10) ?? '—'}</strong><span>{a.fechaObjetivo ? new Intl.DateTimeFormat('es-AR',{month:'short'}).format(new Date(`${a.fechaObjetivo}T12:00:00`)) : 'sin fecha'}</span></div><div><div className="sgo-iso-titulo"><strong>{a.titulo}</strong><span className={`estado-chip agenda-${a.estado}`}>{agendaISOEstaVencida(a,hoy) ? 'Vencida' : estadoLabel(a.estado)}</span></div><div className="meta">{categoriaLabel(a.categoria)} · Responsable: <strong>{a.responsable}</strong>{a.area ? ` · ${a.area}` : ''}</div><div className="sgo-iso-normas">{a.normas.map((n) => <span key={n}>{NORMAS_AGENDA_ISO.find((x) => x.id === n)?.label ?? n}</span>)}</div>{a.resultado && <p>{a.resultado}</p>}</div></button>)}{!visibles.length && <div className="empty">No hay actividades que coincidan con los filtros.</div>}</div>}
    {editor !== undefined && <EditorAgenda registro={editor} usuario={usuario} onClose={() => setEditor(undefined)}/>}  
  </div>
}

/**
 * v1.84 — LO QUE SE VIENE. Sustituye al listado de "vencidas" en rojo: el tono
 * acordado con Lorenzo es de seguimiento, no de reclamo ("una agenda para todos,
 * que no se sientan presionados"). Por eso dice "quedó atrás" y no "VENCIDA", y
 * no nombra responsables en la alerta.
 */
function ProximasISO({actividades,hoy,onAbrir}:{actividades:ActividadAgendaISO[];hoy:string;onAbrir:(a:ActividadAgendaISO)=>void}) {
  const items = proximasAgendaISO(actividades, hoy).slice(0, 8)
  if (!items.length) return <div className="card agenda-proximas"><div className="meta">Nada a la vista en las próximas semanas. 👌</div></div>
  return <div className="card agenda-proximas">
    <div className="section-title" style={{margin:'0 0 6px'}}>Lo que se viene</div>
    <div className="meta" style={{marginBottom:8}}>Se avisa según la criticidad de cada actividad. Marcá la semana como hecha en la planilla y deja de aparecer.</div>
    {items.map((p) => <button key={`${p.actividad.id}-${p.fecha}`} className="agenda-prox-item" onClick={() => onAbrir(p.actividad)}>
      <span className={'agenda-prox-chip crit-' + p.actividad.criticidad}>{p.dias < 0 ? `hace ${Math.abs(p.dias)} d` : p.dias === 0 ? 'esta semana' : `en ${p.dias} d`}</span>
      <span className="agenda-prox-tit">{p.actividad.titulo}</span>
      <span className="meta">{p.fecha.slice(8,10)}/{p.fecha.slice(5,7)} · aviso {diasDeAviso(p.actividad)} d</span>
    </button>)}
  </div>
}

function Kpi({valor,label,tono}:{valor:string|number;label:string;tono:string}) { return <div className={`card sgo-iso-kpi tono-${tono}`}><strong>{valor}</strong><span>{label}</span></div> }

function Calendario({actividades,onOpen}:{actividades:ActividadAgendaISO[];onOpen:(a:ActividadAgendaISO)=>void}) {
  const meses = Array.from({length:12},(_,i)=>i)
  return <div className="sgo-iso-calendario">{meses.map((m) => { const items=actividades.filter((a)=>a.fechaObjetivo && Number(a.fechaObjetivo.slice(5,7))===m+1); return <div className="card" key={m}><strong>{new Intl.DateTimeFormat('es-AR',{month:'long'}).format(new Date(2026,m,1))}</strong>{items.map((a)=><button key={a.id} onClick={()=>onOpen(a)}><span>{a.fechaObjetivo?.slice(8,10)}</span>{a.titulo}</button>)}{!items.length&&<div className="meta">Sin actividades</div>}</div>})}</div>
}

function EditorAgenda({registro,usuario,onClose}:{registro:ActividadAgendaISO|null;usuario:string;onClose:()=>void}) {
  const now=new Date().toISOString(); const puede=puedeGestionarAgendaISO(usuario); const lorenzo=usuarioEsLorenzo(usuario)
  const [d,setD]=useState<ActividadAgendaISO>(registro ?? {id:crypto.randomUUID(),titulo:'',categoria:'auditoria_interna',normas:['sgi'],responsable:'Azul',frecuencia:'anual',avisoDias:30,estado:'sin_programar',criticidad:'alta',creadoEn:now,creadoPor:usuario,actualizadoEn:now,actualizadoPor:usuario})
  const set=<K extends keyof ActividadAgendaISO>(k:K,v:ActividadAgendaISO[K])=>setD({...d,[k]:v})
  async function guardar(){ if(!puede||!d.titulo.trim()||!d.responsable.trim()){window.alert('Completá actividad y responsable.');return} if(!lorenzo&&d.estado==='verificada'){window.alert('Solo Lorenzo puede verificar una actividad.');return} const n=new Date().toISOString(); const completando=d.estado==='completada'&&!d.completadaEn; const verificando=d.estado==='verificada'&&!d.verificadaEn; await guardarActividadAgendaISO({...d,titulo:d.titulo.trim(),responsable:d.responsable.trim(),completadaEn:completando?n:d.completadaEn,completadaPor:completando?usuario:d.completadaPor,verificadaEn:verificando?n:d.verificadaEn,verificadaPor:verificando?usuario:d.verificadaPor,actualizadoEn:n,actualizadoPor:usuario},usuario); onClose() }
  async function eliminar(){if(!registro||!lorenzo||!window.confirm(`¿Eliminar ${registro.titulo}?`))return;await eliminarActividadAgendaISO(registro,usuario);onClose()}
  return <Modal titulo={registro?'Actividad ISO':'Nueva actividad ISO'} onClose={onClose}><fieldset disabled={!puede}><div className="field"><label>Actividad *</label><input className="input" value={d.titulo} onChange={(e)=>set('titulo',e.target.value)}/></div><div className="sgo-iso-form"><Campo label="Categoría"><select className="input" value={d.categoria} onChange={(e)=>set('categoria',e.target.value as CategoriaAgendaISO)}>{CATEGORIAS_AGENDA_ISO.map((x)=><option key={x.id} value={x.id}>{x.label}</option>)}</select></Campo><Campo label="Estado"><select className="input" value={d.estado} onChange={(e)=>set('estado',e.target.value as EstadoAgendaISO)}>{ESTADOS_AGENDA_ISO.map((x)=><option key={x.id} value={x.id}>{x.label}</option>)}</select></Campo><Campo label="Responsable"><input className="input" value={d.responsable} onChange={(e)=>set('responsable',e.target.value)}/></Campo><Campo label="Área / proceso"><input className="input" value={d.area??''} onChange={(e)=>set('area',e.target.value||undefined)}/></Campo><Campo label="Fecha objetivo"><input className="input" type="date" value={d.fechaObjetivo??''} onChange={(e)=>set('fechaObjetivo',e.target.value||undefined)}/></Campo><Campo label="Frecuencia"><select className="input" value={d.frecuencia} onChange={(e)=>set('frecuencia',e.target.value as FrecuenciaAgendaISO)}><option value="unica">Única</option><option value="mensual">Mensual</option><option value="trimestral">Trimestral</option><option value="semestral">Semestral</option><option value="anual">Anual</option></select></Campo><Campo label="Criticidad"><select className="input" value={d.criticidad} onChange={(e)=>set('criticidad',e.target.value as CriticidadAgendaISO)}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></Campo><Campo label="Avisar con (días)"><input className="input" type="number" min="0" value={d.avisoDias} onChange={(e)=>set('avisoDias',Math.max(0,Number(e.target.value)||0))}/></Campo></div><div className="field"><label>Normas aplicables</label><div className="sgo-iso-checks">{NORMAS_AGENDA_ISO.map((n)=><label key={n.id}><input type="checkbox" checked={d.normas.includes(n.id)} onChange={(e)=>set('normas',e.target.checked?[...d.normas,n.id]:d.normas.filter((x)=>x!==n.id))}/>{n.label}</label>)}</div></div><Campo label="Cláusula / requisito"><input className="input" value={d.requisito??''} onChange={(e)=>set('requisito',e.target.value||undefined)}/></Campo><Campo label="Evidencia esperada"><textarea className="input" rows={2} value={d.evidenciaEsperada??''} onChange={(e)=>set('evidenciaEsperada',e.target.value||undefined)}/></Campo><Campo label="Evidencia / enlace"><textarea className="input" rows={2} value={d.evidencia??''} onChange={(e)=>set('evidencia',e.target.value||undefined)}/></Campo><Campo label="Resultado"><textarea className="input" rows={3} value={d.resultado??''} onChange={(e)=>set('resultado',e.target.value||undefined)}/></Campo>{lorenzo&&<Campo label="Verificación de Lorenzo"><textarea className="input" rows={2} value={d.verificacion??''} onChange={(e)=>set('verificacion',e.target.value||undefined)}/></Campo>}</fieldset><div className="row-actions" style={{justifyContent:'space-between'}}>{registro&&lorenzo&&<button className="btn btn-rojo" onClick={()=>void eliminar()}>Eliminar</button>}<div className="row-actions" style={{marginLeft:'auto'}}><button className="btn" onClick={onClose}>Cerrar</button>{puede&&<button className="btn btn-primary" onClick={()=>void guardar()}>Guardar</button>}</div></div></Modal>
}
function Campo({label,children}:{label:string;children:React.ReactNode}){return <div className="field"><label>{label}</label>{children}</div>}
function Modal({titulo,onClose,children}:{titulo:string;onClose:()=>void;children:React.ReactNode}){return <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={(e)=>e.stopPropagation()} style={{width:'96%',maxWidth:920,maxHeight:'94vh',overflow:'auto'}}><div className="card-header"><div className="section-title">{titulo}</div><button className="btn" onClick={onClose}>×</button></div>{children}</div></div>}
