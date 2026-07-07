import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { Tarea, CausaParada, DatosBobinado } from '../../types'
import { sectorById, causaLabel, requiereDatosBobinado, esCausaLogistica, nombreSemielaborado } from '../../types'
import { guardarTarea } from '../../sync/syncEngine'
import { useAuth } from '../../auth/AuthContext'
import { hhmm, cronometro, fmtDur, minutosEntre, fechaCorta } from '../../lib/time'
import { calcularTiempoNetoProductivo } from '../../lib/calendario'
import { componentePorCodigo } from '../../data/catalogo'
import { minutosParada, tiempoRealMin } from '../../lib/kpi'
import ModalParada from './ModalParada'

const ESTADO_CHIP: Record<string, string> = {
  pendiente: 'e-pendiente', en_proceso: 'e-proceso', pausada: 'e-pausa', finalizada: 'e-finalizado',
}
const ESTADO_TXT: Record<string, string> = {
  pendiente: 'Pendiente', en_proceso: 'En proceso', pausada: 'Pausada', finalizada: 'Finalizada',
}

export default function TareaCard({ tarea, onIniciar }: { tarea: Tarea; onIniciar?: () => void }) {
  const { usuario } = useAuth()
  const [modal, setModal] = useState(false)
  const [ahora, setAhora] = useState(Date.now())
  const sector = sectorById(tarea.sectorId)
  // v1.18: puede haber VARIAS paradas abiertas a la vez (ej. material + almuerzo).
  // La "primaria" (la más reciente) es la que se muestra y la que cierra "Reanudar".
  const paradasAbiertas = [...tarea.paradas.filter((p) => !p.fin)].sort((a, b) => (a.inicio < b.inicio ? 1 : -1))
  const paradaAbierta = paradasAbiertas[0]
  const otrasAbiertas = paradasAbiertas.length - 1
  // v1.13: estado de la solicitud de material (si la parada abierta es de logistica).
  const solicitud = useLiveQuery(
    async () => (paradaAbierta ? await db.solicitudesLogistica.get(paradaAbierta.id) : undefined),
    [paradaAbierta?.id],
  )

  // Campos tecnicos de bobinado (solo sectores AT/BT). null = no aplica.
  const reqBob = requiereDatosBobinado(tarea.sectorId)
  const [diamInt, setDiamInt] = useState(tarea.datosBobinado?.diametroInternoMm?.toString() ?? '')
  const [diamExt, setDiamExt] = useState(tarea.datosBobinado?.diametroExternoMm?.toString() ?? '')
  const [codBob, setCodBob] = useState(tarea.datosBobinado?.codigoBobina ?? '')
  const [errBob, setErrBob] = useState('')

  // Tick para cronometros vivos.
  useEffect(() => {
    if (tarea.estado === 'en_proceso' || tarea.estado === 'pausada') {
      const id = setInterval(() => setAhora(Date.now()), 1000)
      return () => clearInterval(id)
    }
  }, [tarea.estado])

  async function iniciar() {
    // Se estampa el operario que ejecuta (trazabilidad y KPIs); la asignacion es por maquina.
    await guardarTarea({
      ...tarea, estado: 'en_proceso',
      inicioReal: tarea.inicioReal ?? new Date().toISOString(),
      operarioId: tarea.operarioId ?? usuario?.id,
    })
    // v1.16: al iniciar, la vista salta al filtro "En curso" para que el operario
    // vea la tarea que arranco y no inicie otra por error.
    onIniciar?.()
  }

  // HOTFIX: la hora de recuperacion es POR TAREA (vinculada a este tarea_id), no
  // un estado global del operario. Asi, con varias tareas abiertas a la vez, marcar
  // recuperacion en una NO afecta a las demas.
  async function toggleRecup() {
    await guardarTarea({ ...tarea, activaHoraRecuperacion: !tarea.activaHoraRecuperacion })
  }
  async function confirmarParada(causa: CausaParada, obs: string) {
    setModal(false)
    const p = { id: crypto.randomUUID(), tareaId: tarea.id, causa, inicio: new Date().toISOString(), observacion: obs || undefined }
    await guardarTarea({ ...tarea, estado: 'pausada', paradas: [...tarea.paradas, p] })
  }
  // v1.18: cierra SOLO la parada primaria (la más reciente). Si quedan otras
  // abiertas (ej. material), la tarea SIGUE pausada mostrando ese motivo; recién
  // vuelve a "en proceso" cuando no queda ninguna parada abierta.
  async function reanudar() {
    if (!paradaAbierta) return
    const ahoraISO = new Date().toISOString()
    const paradas = tarea.paradas.map((p) => (p.id === paradaAbierta.id ? { ...p, fin: ahoraISO } : p))
    const siguenAbiertas = paradas.some((p) => !p.fin)
    await guardarTarea({ ...tarea, paradas, estado: siguenAbiertas ? 'pausada' : 'en_proceso' })
  }
  // Valida y arma los datos de bobinado requeridos por el sector.
  function validarBobinado(): DatosBobinado | null | false {
    if (!reqBob) return null // el sector no requiere datos de bobinado
    const externo = Number(diamExt)
    if (reqBob.externo && (!diamExt.trim() || !(externo > 0))) {
      setErrBob('Ingresa el diametro externo (mm).'); return false
    }
    let interno: number | undefined
    if (reqBob.interno) {
      interno = Number(diamInt)
      if (!diamInt.trim() || !(interno > 0)) { setErrBob('Ingresa el diametro interno (mm).'); return false }
    }
    if (reqBob.codigo && !codBob.trim()) { setErrBob('Ingresa el codigo de bobina.'); return false }
    setErrBob('')
    return {
      diametroInternoMm: reqBob.interno ? interno : undefined,
      diametroExternoMm: reqBob.externo ? externo : undefined,
      codigoBobina: reqBob.codigo ? codBob.trim() : undefined,
    }
  }

  async function finalizar() {
    const datosBobinado = validarBobinado()
    if (datosBobinado === false) return // falta data obligatoria de bobinado
    const ok = window.confirm('Control de calidad: ¿la pieza esta OK? (Aceptar = OK, Cancelar = con defecto)')
    let defecto: string | undefined
    if (!ok) defecto = window.prompt('Describir el defecto / rechazo:') || 'Defecto no especificado'
    const finReal = new Date().toISOString()
    const paradas = tarea.paradas.map((p) => (p.fin ? p : { ...p, fin: finReal }))
    // La hora de recuperacion es la de ESTA tarea (toggle por tarjeta).
    const duracionEfectivaMin = tarea.inicioReal
      ? calcularTiempoNetoProductivo(new Date(tarea.inicioReal), new Date(finReal), {
          horaRecuperacion: tarea.activaHoraRecuperacion,
        })
      : 0
    await guardarTarea({
      ...tarea, estado: 'finalizada', finReal, calidadOk: ok, defecto, paradas,
      duracionEfectivaMin,
      datosBobinado: datosBobinado ?? tarea.datosBobinado,
    })
  }

  const totalParada = minutosParada(tarea)
  // v1.17: "Ejecutado en" = Tiempo Real LABORABLE (excluye horas de planta cerrada,
  // almuerzo y pausas no productivas), igual que el planificador. Antes usaba la
  // resta cruda de timestamps e inflaba el tiempo cuando la tarea cruzaba la noche.
  const ejecutado = tarea.estado === 'finalizada'
    ? tiempoRealMin(tarea)
    : (tarea.inicioReal ? minutosEntre(tarea.inicioReal, new Date().toISOString()) : 0)

  // Titulo principal = SEMIELABORADO completo (o "PROTOTIPO · nota" si es prueba).
  const comp = componentePorCodigo(tarea.componenteCodigo)
  const titulo = nombreSemielaborado(tarea, comp?.descripcion)

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>{titulo}{tarea.fase ? ` · ${tarea.fase}` : ''}</h3>
          <div className="meta">{sector.nombre}{comp ? ` · Modelo ${tarea.modelo}` : ''}</div>
        </div>
        <span className={'estado-chip ' + ESTADO_CHIP[tarea.estado]}>{ESTADO_TXT[tarea.estado]}</span>
      </div>

      <div className="meta">
        {tarea.nroTransformador && <>N° transformador: <strong>{tarea.nroTransformador}</strong> · </>}
        {/* v1.3: el "Tiempo estandar" NO se muestra al operario (evita que regule el ritmo
            para "cumplir" el tiempo exacto). Solo visible en dashboards de encargado/planificador. */}
        Prioridad <strong>{tarea.prioridad}</strong>
        {tarea.inicioReal && <> · Inicio <strong>{fechaCorta(tarea.inicioReal)} {hhmm(tarea.inicioReal)}</strong></>}
        {tarea.finReal && <> · Fin <strong>{fechaCorta(tarea.finReal)} {hhmm(tarea.finReal)}</strong></>}
        {totalParada > 0 && <> · Paradas <strong>{fmtDur(totalParada)}</strong></>}
      </div>

      {/* Banner de parada en curso (v1.18: puede haber varias abiertas a la vez). */}
      {paradaAbierta && (
        <div className="parada-activa">
          <div>
            <div className="t">PAUSADO · {causaLabel(paradaAbierta.causa)}{otrasAbiertas > 0 ? ` · +${otrasAbiertas} parada(s) más` : ''}</div>
            <div className="meta">Desde {hhmm(paradaAbierta.inicio)} · <span className="timer">{cronometro(paradaAbierta.inicio, ahora)}</span></div>
            {otrasAbiertas > 0 && (
              <div className="meta" style={{ marginTop: 2 }}>
                También abierta(s): {paradasAbiertas.slice(1).map((p) => causaLabel(p.causa)).join(', ')}
              </div>
            )}
            {/* v1.13: feedback de logistica si es una espera de material */}
            {esCausaLogistica(paradaAbierta.causa) && (
              solicitud?.estado === 'entregado'
                ? <div className="badge-mat entregado">✓ Material entregado</div>
                : solicitud?.estado === 'en_camino'
                  ? <div className="badge-mat camino">🚚 Material en preparación{solicitud.asignado ? ` · ${solicitud.asignado}` : ''}</div>
                  : <div className="badge-mat pedido">📦 Pedido de material registrado</div>
            )}
          </div>
          <button className="btn btn-verde" onClick={reanudar}>Reanudar</button>
        </div>
      )}

      {/* Cronometro de ejecucion en curso */}
      {tarea.estado === 'en_proceso' && tarea.inicioReal && (
        <div className="meta" style={{ marginBottom: 10 }}>
          Tiempo en curso: <span className="timer" style={{ fontSize: '1.3rem', color: 'var(--estado-proceso)' }}>{cronometro(tarea.inicioReal, ahora)}</span>
        </div>
      )}

      {/* Campos tecnicos de bobinado (capturados antes de finalizar) */}
      {reqBob && tarea.estado === 'en_proceso' && (
        <div className="bobinado-box">
          <div className="meta" style={{ marginBottom: 8 }}>Datos de bobinado (obligatorios para finalizar)</div>
          <div className="form-grid">
            {reqBob.interno && (
              <div className="field">
                <label>Diametro interno (mm)</label>
                <input className="input" type="number" inputMode="decimal" min={0} value={diamInt} onChange={(e) => setDiamInt(e.target.value)} placeholder="0" />
              </div>
            )}
            {reqBob.externo && (
              <div className="field">
                <label>Diametro externo (mm)</label>
                <input className="input" type="number" inputMode="decimal" min={0} value={diamExt} onChange={(e) => setDiamExt(e.target.value)} placeholder="0" />
              </div>
            )}
            {reqBob.codigo && (
              <div className="field">
                <label>Codigo de bobina</label>
                <input className="input" value={codBob} onChange={(e) => setCodBob(e.target.value)} placeholder="BAT-315-001" />
              </div>
            )}
          </div>
          {errBob && <div className="error-msg" style={{ textAlign: 'left' }}>{errBob}</div>}
        </div>
      )}

      {/* Datos de bobinado registrados (tarea finalizada) */}
      {reqBob && tarea.estado === 'finalizada' && tarea.datosBobinado && (
        <div className="meta" style={{ marginBottom: 10 }}>
          Bobinado:
          {tarea.datosBobinado.diametroInternoMm != null && <> Ø int <strong>{tarea.datosBobinado.diametroInternoMm}mm</strong> ·</>}
          {tarea.datosBobinado.diametroExternoMm != null && <> Ø ext <strong>{tarea.datosBobinado.diametroExternoMm}mm</strong> ·</>}
          {tarea.datosBobinado.codigoBobina && <> Cod. <strong>{tarea.datosBobinado.codigoBobina}</strong></>}
        </div>
      )}

      {/* HOTFIX: hora de recuperacion POR TAREA (no global). Solo mientras la tarea
          esta abierta. La franja depende del dia (Vie 15-16, resto 16-17). */}
      {(tarea.estado === 'en_proceso' || tarea.estado === 'pausada') && (() => {
        const esViernes = new Date().getDay() === 5
        const banda = esViernes ? '15:00–16:00' : '16:00–17:00'
        return (
          <button
            className={'btn btn-bloque' + (tarea.activaHoraRecuperacion ? ' btn-primary' : '')}
            style={{ justifyContent: 'space-between', marginBottom: 10 }}
            onClick={toggleRecup}
          >
            <span>⏱ Me quedo a recuperar en ESTA tarea ({banda})</span>
            <span className="rol-badge">{tarea.activaHoraRecuperacion ? 'SÍ' : 'NO'}</span>
          </button>
        )
      })()}

      {/* Acciones segun estado */}
      <div className="row-actions">
        {tarea.estado === 'pendiente' && (
          <button className="btn btn-primary btn-bloque" onClick={iniciar}>▶ Iniciar tarea</button>
        )}
        {tarea.estado === 'en_proceso' && (
          <>
            <button className="btn btn-naranja" style={{ flex: 1 }} onClick={() => setModal(true)}>⏸ Registrar parada</button>
            <button className="btn btn-verde" style={{ flex: 1 }} onClick={finalizar}>✓ Finalizar</button>
          </>
        )}
        {tarea.estado === 'pausada' && (
          <button className="btn btn-verde btn-bloque" onClick={reanudar}>▶ Reanudar para continuar</button>
        )}
        {tarea.estado === 'finalizada' && (
          <div className="meta">
            Ejecutado en <strong>{fmtDur(ejecutado)}</strong> ·{' '}
            {tarea.calidadOk === false
              ? <span style={{ color: 'var(--rojo)' }}>Calidad: defecto ({tarea.defecto})</span>
              : <span style={{ color: 'var(--estado-fin)' }}>Calidad OK</span>}
          </div>
        )}
      </div>

      {modal && <ModalParada sectorId={tarea.sectorId} onConfirm={confirmarParada} onCancel={() => setModal(false)} />}
    </div>
  )
}
