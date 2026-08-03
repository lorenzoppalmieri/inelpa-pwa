import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/dexie'
import type { Tarea, CausaParada, DatosBobinado } from '../../types'
import { sectorById, causaLabel, requiereDatosBobinado, esCausaLogistica, nombreSemielaborado, minutosRecupTarea } from '../../types'
import { guardarTarea, guardarLaboratorio } from '../../sync/syncEngine'
import type { TareaLaboratorio } from '../../types'
import { useAuth } from '../../auth/AuthContext'
import { hhmm, cronometro, fmtDur, fechaCorta } from '../../lib/time'
import { calcularTiempoNetoProductivo, calcularTiempoProductivo } from '../../lib/calendario'
import { componentePorCodigo } from '../../data/catalogo'
import { tiempoNetoMin } from '../../lib/kpi'
import ModalParada from './ModalParada'
import { generarAvisoDesdeParada, esCausaMantenimiento } from '../../mantenimiento/avisos'

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

  // v1.40: la recuperacion es POR TAREA y FRACCIONAL (30 o 60 min). El operario
  // elige cuanto se queda; se guarda la cantidad exacta en minutosRecuperacion.
  // (Mantenemos activaHoraRecuperacion sincronizado por compatibilidad con datos
  // viejos / consultas que aun lean el booleano.)
  const [modalRecup, setModalRecup] = useState(false)
  async function setRecup(min: number) {
    setModalRecup(false)
    await guardarTarea({ ...tarea, minutosRecuperacion: min, activaHoraRecuperacion: min > 0 })
  }
  async function confirmarParada(causa: CausaParada, obs: string) {
    setModal(false)
    const p = { id: crypto.randomUUID(), tareaId: tarea.id, causa, inicio: new Date().toISOString(), observacion: obs || undefined }
    await guardarTarea({ ...tarea, estado: 'pausada', paradas: [...tarea.paradas, p] })
    // v1.66: puente Produccion -> Mantenimiento. La parada con causa mant_*
    // genera SOLA el aviso de falla (cola offline; nunca bloquea el registro).
    if (esCausaMantenimiento(causa)) {
      void generarAvisoDesdeParada(tarea, p, usuario?.usuario ?? '')
    }
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
          recupMin: minutosRecupTarea(tarea),
        })
      : 0
    await guardarTarea({
      ...tarea, estado: 'finalizada', finReal, calidadOk: ok, defecto, paradas,
      duracionEfectivaMin,
      datosBobinado: datosBobinado ?? tarea.datosBobinado,
    })

    // v1.37: PUENTE A LABORATORIO. Al finalizar una tarea de Montaje PO, el trafo
    // está terminado -> se crea automáticamente una tarea de ensayo (una sola vez).
    const esMontajePO = tarea.sectorId === 'montaje_po_dist' || tarea.sectorId === 'montaje_po_rural'
    if (esMontajePO) {
      const yaExiste = await db.laboratorio.where('tareaOrigenId').equals(tarea.id).count()
      if (yaExiste === 0) {
        const orden = tarea.ordenId ? await db.ordenes.get(tarea.ordenId) : undefined
        const lab: TareaLaboratorio = {
          id: crypto.randomUUID(),
          modelo: tarea.modelo,
          cliente: tarea.cliente || undefined,
          nroSerie: tarea.nroTransformador || undefined,
          ot: orden?.nroOrden,
          linea: tarea.sectorId.includes('rural') ? 'rural' : 'distribucion',
          ordenId: tarea.ordenId,
          tareaOrigenId: tarea.id,
          estado: 'pendiente',
          creada: finReal,
          creadaPor: usuario?.usuario,
        }
        await guardarLaboratorio(lab)
      }
    }
  }

  // "Paradas" en la tarjeta = SUMA de TODAS las paradas registradas (productivas y
  // no productivas), midiendo cada una en minutos LABORABLES y ACOTADA a su día de
  // inicio. El acote evita que una parada dejada abierta que cruza la noche (su fin
  // queda en la mañana siguiente) acumule las horas de dos días e infle el total
  // (ej. una parada real de ~1h figuraba como 5h). Solo afecta lo que ve el operario;
  // los KPI de eficiencia siguen usando minutosParada canónico.
  const totalParada = tarea.paradas.reduce((acc, p) => {
    if (!p.fin) return acc
    const ini = new Date(p.inicio)
    const finDiaInicio = new Date(ini); finDiaInicio.setHours(24, 0, 0, 0) // 00:00 del día siguiente
    const fin = new Date(p.fin)
    const finAcotado = fin < finDiaInicio ? fin : finDiaInicio
    return acc + calcularTiempoNetoProductivo(ini, finAcotado, { recupMin: minutosRecupTarea(tarea), sinAlmuerzo: true })
  }, 0)
  // "Ejecutado en" = Tiempo NETO de trabajo del operario = Tiempo Real laborable
  // (ya sin horas de planta cerrada ni almuerzo) MENOS las paradas operativas
  // (demoras justificadas: corte de luz, replanificación, espera de material, etc.).
  // Usa la función canónica del backend (tiempoNetoMin); no se toca nada global.
  // v1.45: mientras la tarea está en curso también se mide en HORAS HÁBILES (antes
  // restaba crudo: una tarea abierta de un día para el otro mostraba la noche entera).
  const ejecutado = tarea.estado === 'finalizada'
    ? tiempoNetoMin(tarea)
    : (tarea.inicioReal ? calcularTiempoProductivo(tarea.inicioReal, new Date().toISOString(), minutosRecupTarea(tarea)) : 0)

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

      {/* v1.40: recuperacion POR TAREA y FRACCIONAL (30/60 min). El boton abre un
          modal tactil; una vez elegido, muestra feedback (borde verde) y un ✕ para
          cancelar. Solo mientras la tarea esta abierta. */}
      {(tarea.estado === 'en_proceso' || tarea.estado === 'pausada') && (() => {
        const recup = minutosRecupTarea(tarea)
        const txtRecup = recup === 60 ? 'Recuperando 1h' : recup === 30 ? 'Recuperando 30m' : recup > 0 ? `Recuperando ${recup}m` : ''
        return (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button
              className="btn btn-bloque"
              style={{
                flex: 1, justifyContent: 'space-between',
                border: recup > 0 ? '2px solid var(--estado-fin)' : undefined,
                color: recup > 0 ? 'var(--estado-fin)' : undefined,
                fontWeight: recup > 0 ? 700 : undefined,
              }}
              onClick={() => setModalRecup(true)}
            >
              <span>⏱ {recup > 0 ? txtRecup : 'Habilitar hora recup.'}</span>
              <span className="rol-badge">{recup > 0 ? '✓' : '＋'}</span>
            </button>
            {recup > 0 && (
              <button className="btn btn-rojo" title="Cancelar recuperación" onClick={() => void setRecup(0)}>✕</button>
            )}
          </div>
        )
      })()}

      {/* Modal: cuánto tiempo se queda a recuperar (táctil) */}
      {modalRecup && (
        <div className="modal-overlay" onClick={() => setModalRecup(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-title" style={{ marginTop: 0 }}>¿Cuánto tiempo te quedás a recuperar?</div>
            <div className="meta" style={{ marginBottom: 16 }}>Se suma a tu salida base ({new Date().getDay() === 5 ? '15:00' : '16:00'} hs) solo en ESTA tarea.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button className="btn btn-primary btn-bloque" style={{ padding: '18px', fontSize: '1.15rem' }} onClick={() => void setRecup(30)}>＋ 30 minutos</button>
              <button className="btn btn-primary btn-bloque" style={{ padding: '18px', fontSize: '1.15rem' }} onClick={() => void setRecup(60)}>＋ 1 hora</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn" onClick={() => setModalRecup(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

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
