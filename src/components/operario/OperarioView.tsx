import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import { useAuth } from '../../auth/AuthContext'
import { isoWeek } from '../../lib/time'
import { dentroVentanaAlmuerzo, ventanaAlmuerzoTexto } from '../../lib/calendario'
import type { EstadoTarea, Tarea, CausaParada } from '../../types'
import { sectorById, TIPO_ESTACION_LABEL, maquinaSirveSector, esSectorBobinado, causaLabel, areaDemora, compararFifo } from '../../types'
import { guardarTarea } from '../../sync/syncEngine'
import TareaCard from './TareaCard'
import AndonView from '../dashboard/AndonView'
import MensajesInbox, { useMensajesNoLeidos } from '../mensajes/MensajesInbox'
// v2.17: se fueron los imports de ModalParada, avisos de mantenimiento y NC de
// calidad. La pausa de estación ya no puede tener otra causa que almuerzo, así
// que no dispara avisos ni no conformidades. Todo eso sigue vivo en TareaCard,
// que es donde se cargan las demoras reales, una por una.

const ORDEN: Record<EstadoTarea, number> = { pausada: 0, en_proceso: 1, pendiente: 2, finalizada: 3 }
const FILTROS: { id: 'activas' | 'pendientes' | 'finalizadas'; label: string }[] = [
  { id: 'activas', label: 'En curso' },
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'finalizadas', label: 'Finalizadas' },
]

// Clave de persistencia de la estacion elegida (por usuario), para que sobreviva al reload.
function lsKey(uid: string) { return `inelpa_maquina_${uid}` }

export default function OperarioView() {
  const { usuario } = useAuth()
  const semana = isoWeek(new Date())

  // Estacion de trabajo elegida hoy (persistida en localStorage por usuario).
  const [maquinaId, setMaquinaId] = useState<string>(() =>
    usuario ? localStorage.getItem(lsKey(usuario.id)) ?? '' : '')

  function elegir(id: string) {
    setMaquinaId(id)
    if (usuario) localStorage.setItem(lsKey(usuario.id), id)
  }
  function cambiar() {
    setMaquinaId('')
    if (usuario) localStorage.removeItem(lsKey(usuario.id))
  }

  // v1.10: el operario alterna entre su trabajo y el tablero ANDON (premios).
  // OJO: el estado va aca, pero el "return" condicional debe ir DESPUES de todos
  // los hooks (Reglas de Hooks), si no React crashea (pantalla en blanco).
  const [pantalla, setPantalla] = useState<'trabajo' | 'andon' | 'mensajes'>('trabajo')
  const noLeidos = useMensajesNoLeidos()

  // Estaciones disponibles para el operario: las de sus sectores. Para bobinado,
  // el pool de 30 bobinadoras sirve a cualquiera de sus sectores de bobinado.
  const maquinas = useLiveQuery(
    () => db.maquinas.filter((m) => m.activo && (usuario?.sectores ?? []).some((s) => maquinaSirveSector(m, s))).toArray(),
    [usuario?.id],
  )

  // Cola de tareas de la estacion elegida (offline-first).
  // Las tareas SIN finalizar (pendiente / en_proceso / pausada) se ven SIEMPRE,
  // sin importar la semana (el trabajo arrastrado no desaparece el lunes).
  // v1.17: las FINALIZADAS se muestran las del MES en curso (por finReal), para que
  // el operario vea todos los semielaborados que terminó en el mes, no solo la semana.
  const tareas = useLiveQuery(() => {
    if (!maquinaId) return Promise.resolve([] as Tarea[])
    const hoy = new Date()
    const mesIni = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString()
    const mesFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString()
    return db.tareas.where('maquinaId').equals(maquinaId).and((t) => {
      // Cruce máquina + colaborador, CON EXCEPCIÓN para Montaje:
      //  - Montaje (PA/PO, trabajo en equipo): se ven TODAS las de la estación.
      //  - Resto (bobinadoras, etc.): solo las MÍAS o SIN asignar (nunca de otro).
      if (areaDemora(t.sectorId) !== 'montaje' && t.operarioId && t.operarioId !== usuario?.id) return false
      if (t.estado !== 'finalizada') return true
      const ref = t.finReal ?? t.inicioReal
      return !!ref && ref >= mesIni && ref < mesFin
    }).toArray()
  }, [maquinaId, usuario?.id])

  const [filtro, setFiltro] = useState<'activas' | 'pendientes' | 'finalizadas'>('activas')
  // v1.18: pausa/reanudación GLOBAL de la estación (montaje PA/PO: el equipo para
  // junto, ej. almuerzo). Soporta PARADAS CONCURRENTES: una tarea ya pausada por
  // otro motivo recibe TAMBIÉN la parada global (dos paradas abiertas a la vez);
  // al reanudar se cierra SOLO la parada global y se restaura el estado previo.
  // Causa de la pausa global activa en esta estación (persistida por si recargan).
  const pgKey = maquinaId ? `inelpa_pausaglob_${maquinaId}` : ''
  const [pausaGlobal, setPausaGlobal] = useState<CausaParada | null>(null)
  useEffect(() => { setPausaGlobal(pgKey ? (localStorage.getItem(pgKey) as CausaParada | null) : null) }, [pgKey])

  // ============================================================
  // v2.17 — LA PAUSA DE ESTACIÓN ES **SOLO ALMUERZO**.
  //
  // Antes el botón grande abría el ModalParada completo, así que desde ahí se
  // podía parar TODA la estación con cualquier causa: "ayuda en el sector",
  // "falta de material", una causa de mantenimiento... Eso está mal por dos
  // motivos:
  //
  //  - una falla o una falta de material le pasa a UNA tarea, no a las 13 a la
  //    vez; cargarla en bloque ensucia el Pareto de demoras y el OEE de toda la
  //    estación con una causa que no corresponde;
  //  - el almuerzo es lo único que de verdad para al equipo entero junto, que
  //    es para lo que se creó este botón en v1.18.
  //
  // Las demás causas se siguen cargando tarea por tarea desde su tarjeta, que es
  // donde el operario elige el motivo real. Por eso acá NO hay selector: el
  // botón hace una sola cosa.
  //
  // La causa queda como parámetro fijo y no configurable a propósito: si mañana
  // hace falta otra pausa de estación (un corte de luz, por ejemplo), que sea
  // otro botón con su propia regla y no un combo que vuelva a abrir la puerta.
  // ============================================================
  const CAUSA_ESTACION: CausaParada = 'almuerzo'

  // Suma una NUEVA parada de almuerzo a TODAS las tareas activas (en_proceso o
  // pausada). Si una ya estaba pausada por otro motivo, queda con DOS paradas
  // abiertas — esa es la clave para poder devolverla a su estado previo después.
  async function pausarEstacion() {
    if (!dentroVentanaAlmuerzo()) {
      window.alert(`El almuerzo se registra entre las ${ventanaAlmuerzoTexto()}. Son 30 minutos.`)
      return
    }
    const ahoraISO = new Date().toISOString()
    const activas = (tareas ?? []).filter((t) => t.estado === 'en_proceso' || t.estado === 'pausada')
    if (activas.length === 0) return
    if (!window.confirm(`Almuerzo: se pausan ${activas.length} tarea(s) de la estación.\n\nAl reanudar, cada una vuelve al estado que tenía ahora.`)) return

    for (const t of activas) {
      const p = { id: crypto.randomUUID(), tareaId: t.id, causa: CAUSA_ESTACION, inicio: ahoraISO }
      await guardarTarea({ ...t, estado: 'pausada', paradas: [...t.paradas, p] })
    }
    if (pgKey) localStorage.setItem(pgKey, CAUSA_ESTACION)
    setPausaGlobal(CAUSA_ESTACION)
  }
  // Reanuda: cierra SOLO las paradas de almuerzo, y resuelve el estado de cada
  // tarea según lo que le quede abierto.
  //
  // ACÁ ESTÁ LA RESTAURACIÓN, y no hace falta guardar el estado previo en ningún
  // lado: como el almuerzo se sumó COMO UNA PARADA MÁS sin pisar la que ya
  // estaba, al cerrarla el estado anterior se deduce solo.
  //   - le quedan otras paradas abiertas -> sigue 'pausada' con SU motivo original;
  //   - no le queda ninguna              -> vuelve a 'en_proceso'.
  // Las 'pendiente' nunca entraron a la pausa, así que quedan intactas.
  async function reanudarEstacion() {
    const causa = pausaGlobal
    if (!causa) return
    const ahoraISO = new Date().toISOString()
    const afectadas = (tareas ?? []).filter((t) => t.paradas.some((p) => !p.fin && p.causa === causa))
    for (const t of afectadas) {
      const paradas = t.paradas.map((p) => (!p.fin && p.causa === causa ? { ...p, fin: ahoraISO } : p))
      const siguenAbiertas = paradas.some((p) => !p.fin)
      await guardarTarea({ ...t, paradas, estado: siguenAbiertas ? 'pausada' : 'en_proceso' })
    }
    if (pgKey) localStorage.removeItem(pgKey)
    setPausaGlobal(null)
  }

  // Barra de pestañas Mi trabajo / Andon (ya pasaron todos los hooks).
  const tabsTop = (
    <div className="tabs tabs-nav">
      <button className={'tab' + (pantalla === 'trabajo' ? ' active' : '')} onClick={() => setPantalla('trabajo')}>
        <span className="nav-ico" aria-hidden="true">🔧</span>
        <span className="nav-txt-largo">Mi trabajo</span>
        <span className="nav-txt-corto">Mi trabajo</span>
      </button>
      <button className={'tab' + (pantalla === 'andon' ? ' active' : '')} onClick={() => setPantalla('andon')}>
        <span className="nav-ico" aria-hidden="true">🏆</span>
        <span className="nav-txt-largo">🏆 Andon</span>
        <span className="nav-txt-corto">Andon</span>
      </button>
      <button className={'tab' + (pantalla === 'mensajes' ? ' active' : '')} onClick={() => setPantalla('mensajes')}>
        <span className="nav-ico" aria-hidden="true">💬</span>
        <span className="nav-txt-largo">💬 Mensajes{noLeidos > 0 ? ` (${noLeidos})` : ''}</span>
        <span className="nav-txt-corto">Mensajes{noLeidos > 0 ? ` (${noLeidos})` : ''}</span>
      </button>
    </div>
  )
  if (pantalla === 'andon') return <div>{tabsTop}<AndonView /></div>
  if (pantalla === 'mensajes') return <div>{tabsTop}<MensajesInbox /></div>

  if (!maquinas) return <div className="meta">Cargando estaciones...</div>

  // --- Paso 1: elegir estacion de trabajo ---
  if (!maquinaId) {
    return (
      <div>
        {tabsTop}
        <div className="section-title">¿En qué estación vas a trabajar hoy?</div>
        {maquinas.length === 0
          ? <div className="empty">No tenés estaciones asignadas. Avisá a tu encargado.</div>
          : maquinas.map((m) => (
              <button key={m.id} className="btn btn-bloque" style={{ justifyContent: 'space-between', marginBottom: 10 }} onClick={() => elegir(m.id)}>
                <span>{m.nombre}</span>
                <span className="rol-badge">{esSectorBobinado(m.sectorId) ? 'Bobinado · cualquier formato' : sectorById(m.sectorId).nombre}</span>
              </button>
            ))}
      </div>
    )
  }

  const maquina = maquinas.find((m) => m.id === maquinaId)

  if (!tareas) return <div className="meta">Cargando tareas...</div>

  // v1.46: ORDEN FIFO. Dentro de cada estado, la cola respeta el orden EXACTO en
  // que el planificador fue asignando las tareas: la primera que le mandaron
  // queda arriba y las nuevas se apilan al final. Se ordena por la fecha de
  // asignación (`creada`), nunca por campos que cambien al editar, así corregir
  // una observación NO reordena la lista. `compararFifo` desempata por id para
  // que el orden sea estable entre renders.
  const orden = [...tareas].sort((a, b) => (ORDEN[a.estado] - ORDEN[b.estado]) || compararFifo(a, b))
  const visBase = orden.filter((t) =>
    filtro === 'activas' ? (t.estado === 'en_proceso' || t.estado === 'pausada')
      : filtro === 'pendientes' ? t.estado === 'pendiente'
      : t.estado === 'finalizada')
  // En "Finalizadas" conviene lo más reciente arriba (es un historial, no una cola).
  // En "Pendientes" y "En curso" mandan el orden FIFO de asignación.
  const vis = filtro === 'finalizadas'
    ? [...visBase].sort((a, b) => ((b.finReal ?? '') < (a.finReal ?? '') ? -1 : 1))
    : visBase

  const cuenta = {
    activas: tareas.filter((t) => t.estado === 'en_proceso' || t.estado === 'pausada').length,
    pendientes: tareas.filter((t) => t.estado === 'pendiente').length,
    finalizadas: tareas.filter((t) => t.estado === 'finalizada').length,
  }

  // v1.18: pausa/reanuda global solo en Montaje PA/PO (el equipo para/vuelve junto).
  const esMontaje = !!maquina && maquina.sectorId.startsWith('montaje')
  const nActivas = tareas.filter((t) => t.estado === 'en_proceso' || t.estado === 'pausada').length
  const nConPausaGlobal = pausaGlobal ? tareas.filter((t) => t.paradas.some((p) => !p.fin && p.causa === pausaGlobal)).length : 0

  return (
    <div>
      {tabsTop}
      <div className="card-header" style={{ marginBottom: 12 }}>
        <div>
          <div className="section-title" style={{ margin: 0 }}>
            {maquina ? maquina.nombre : 'Estación'} · semana {semana.split('-W')[1]}
          </div>
          {maquina && <div className="meta">{TIPO_ESTACION_LABEL[maquina.tipo]} · {esSectorBobinado(maquina.sectorId) ? 'Bobinado · cualquier formato' : sectorById(maquina.sectorId).nombre}</div>}
        </div>
        <button className="btn" onClick={cambiar}>Cambiar estación</button>
      </div>

      {/* v1.18: Montaje PA/PO -> pausar / reanudar TODA la estación de una vez.
          v2.17: SOLO almuerzo, sin selector de causa (ver pausarEstacion). El
          texto lo dice explícito para que nadie busque acá otra demora: las
          demás se cargan tarea por tarea, desde su tarjeta. */}
      {esMontaje && (
        <div style={{ marginBottom: 12 }}>
          {!pausaGlobal ? (
            <>
              <button className="btn btn-naranja btn-bloque" disabled={nActivas === 0} onClick={() => void pausarEstacion()}>
                🍽 Almuerzo — pausar la estación{nActivas > 0 ? ` (${nActivas} tarea/s)` : ''}
              </button>
              <div className="meta" style={{ marginTop: 4, textAlign: 'center' }}>
                Solo almuerzo ({ventanaAlmuerzoTexto()}). Cualquier otra demora se carga en la tarjeta de la tarea.
              </div>
            </>
          ) : (
            <button className="btn btn-verde btn-bloque" onClick={() => void reanudarEstacion()}>
              ▶ Volver del almuerzo — {causaLabel(pausaGlobal)}{nConPausaGlobal > 0 ? ` (${nConPausaGlobal})` : ''}
            </button>
          )}
        </div>
      )}

      <div className="tabs">
        {FILTROS.map((f) => (
          <button key={f.id} className={'tab' + (filtro === f.id ? ' active' : '')} onClick={() => setFiltro(f.id)}>
            {f.label} ({cuenta[f.id]})
          </button>
        ))}
      </div>

      {vis.length === 0
        ? <div className="empty">No hay tareas en esta vista.</div>
        : vis.map((t) => <TareaCard key={t.id} tarea={t} onIniciar={() => setFiltro('activas')} />)}

    </div>
  )
}
