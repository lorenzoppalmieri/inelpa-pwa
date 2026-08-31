import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { esSuperAdmin } from '../auth/roles'
import { SimboloActivo } from './simbolos'
import { comoLineas } from './types'
import TimelineActivo from './TimelineActivo'
import InstructivoGama from './InstructivoGama'
import ComponentesActivo from './ComponentesActivo'
import { fechaCorta, fechaLocalISO } from '../lib/time'
import { estadoDeActivo, ESTADOS } from './estado'
import { cargarAlertasTempranas, estadoDeGama, resumenPorGama, textoAlerta, type AlertaTemprana } from './alertas'
import type { Criticidad, LineaFicha, MantActivo, MantAviso, MantGama, MantOT, MantPlanta, MantSector } from './types'

// ============================================================
// FICHA DE EQUIPO — MANTENIMIENTO (v1.62/v1.63 + Sprint 3: P5/P6)
// Vista completa de un activo: encabezado, datos de placa, componentes,
// puntos LOTO, dependencias, gamas preventivas y LINEA DE TIEMPO
// UNIFICADA (P5: registros + OT + avisos + paradas productivas, ver
// TimelineActivo). P6: si el activo esta en alerta temprana (paradas
// correctivas repetidas), muestra badge amarillo con creacion de OT
// preventiva sugerida en 1 tap (siempre con confirmacion humana).
// Edicion (placa + notas + componentes + LOTO): solo rol 'mantenimiento'
// o super admin (mismo criterio que MapaEditor y que la RLS).
// Navegacion interna del modulo: llega con activoId; onVolver vuelve a la
// pantalla anterior (mapa o listado); onVerActivo salta a otra ficha
// (chips de dependencias).
// ============================================================

const CRIT_LABEL: Record<Criticidad, string> = { A: 'A · Crítica', B: 'B · Importante', C: 'C · Menor' }

const FRECUENCIA_LABEL: Record<MantGama['frecuencia'], string> = {
  diaria: 'Diaria', semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual',
  trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
}

interface PlacaForm {
  fabricante: string
  modelo: string
  nro_serie: string
  anio: string
  iit_ref: string
  notas: string
}

function DatoPlaca({ label, valor }: { label: string; valor?: string | number | null }) {
  const vacio = valor == null || String(valor).trim() === ''
  return (
    <div className="mant-kv">
      <div className="meta">{label}</div>
      <div><strong>{vacio ? '—' : String(valor)}</strong></div>
    </div>
  )
}

export default function FichaEquipo({ activoId, onVolver, onVerActivo }: {
  activoId: string
  onVolver: () => void
  onVerActivo: (id: string) => void
}) {
  const { usuario } = useAuth()
  const puedeEditar = !!usuario && (usuario.rol === 'mantenimiento' || esSuperAdmin(usuario))
  // P6: la OT preventiva sugerida tambien la puede tomar un tecnico.
  const puedeOperar = !!usuario && (usuario.rol === 'mantenimiento' || usuario.rol === 'mant_tecnico' || esSuperAdmin(usuario))

  const [activo, setActivo] = useState<MantActivo | null>(null)
  const [sectores, setSectores] = useState<MantSector[]>([])
  const [plantas, setPlantas] = useState<MantPlanta[]>([])
  const [dependencias, setDependencias] = useState<Pick<MantActivo, 'id' | 'nombre'>[]>([])
  const [gamas, setGamas] = useState<MantGama[]>([])
  // OT del activo (sirven para el estado de gamas Y para el semaforo).
  const [otsAct, setOtsAct] = useState<Pick<MantOT, 'gama_id' | 'estado' | 'tipo' | 'fecha_cierre'>[]>([])
  // Avisos nuevos del activo (semaforo: rojo si hay alguno).
  const [avisosNuevosAct, setAvisosNuevosAct] = useState<Pick<MantAviso, 'estado'>[]>([])
  const [alerta, setAlerta] = useState<AlertaTemprana | null>(null)
  const [otRefresh, setOtRefresh] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  // Edicion de placa / notas / componentes / LOTO.
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [placa, setPlaca] = useState<PlacaForm>({ fabricante: '', modelo: '', nro_serie: '', anio: '', iit_ref: '', notas: '' })
  const [componentes, setComponentes] = useState<LineaFicha[]>([])
  const [loto, setLoto] = useState<string[]>([])

  const sector = useMemo(() => sectores.find((s) => s.id === activo?.sector_id) ?? null, [sectores, activo])
  const planta = useMemo(() => plantas.find((p) => p.id === activo?.planta_id) ?? null, [plantas, activo])
  // Estado de cada gama (al dia / proxima / vencida) desde las OT del activo.
  const resumenGamas = useMemo(() => resumenPorGama(otsAct), [otsAct])
  // Semaforo canonico del activo (P9): misma regla y colores que el SCADA.
  const estadoActivo = useMemo(
    () => estadoDeActivo(avisosNuevosAct as unknown as MantAviso[], otsAct as unknown as MantOT[], !!alerta),
    [avisosNuevosAct, otsAct, alerta],
  )

  // ------------------------------------------------------------
  // Carga de la ficha (activo + catalogos + relacionados).
  // ------------------------------------------------------------
  const cargar = useCallback(async () => {
    if (!supabase) { setCargando(false); return }
    setCargando(true)
    setError('')
    setEditando(false)
    const [{ data: a, error: e1 }, { data: ss }, { data: ps }, { data: gs }, { data: og }, { data: avn }] = await Promise.all([
      supabase.from('mant_activos').select('*').eq('id', activoId).maybeSingle(),
      supabase.from('mant_sectores').select('*').order('orden'),
      supabase.from('mant_plantas').select('*').order('orden'),
      supabase.from('mant_gamas').select('*').eq('activo_id', activoId).eq('activa', true).order('orden'),
      supabase.from('mant_ordenes_trabajo').select('gama_id, estado, tipo, fecha_cierre').eq('activo_id', activoId),
      supabase.from('mant_avisos').select('estado').eq('activo_id', activoId).eq('estado', 'nuevo'),
    ])
    if (e1 || !a) { setError(e1 ? 'No se pudo cargar el activo. Revisá la conexión.' : `No existe el activo ${activoId}.`); setCargando(false); return }
    const act = a as MantActivo
    setActivo(act)
    setSectores((ss ?? []) as MantSector[])
    setPlantas((ps ?? []) as MantPlanta[])
    setGamas((gs ?? []) as MantGama[])
    setOtsAct((og ?? []) as Pick<MantOT, 'gama_id' | 'estado' | 'tipo' | 'fecha_cierre'>[])
    setAvisosNuevosAct((avn ?? []) as Pick<MantAviso, 'estado'>[])

    // Dependencias: codigos de activos de los que depende este equipo.
    const deps = Array.isArray(act.depende_de) ? act.depende_de.filter((d) => !!d) : []
    if (deps.length > 0) {
      const { data: ds } = await supabase.from('mant_activos').select('id, nombre').in('id', deps)
      setDependencias((ds ?? []) as Pick<MantActivo, 'id' | 'nombre'>[])
    } else {
      setDependencias([])
    }
    setCargando(false)
  }, [activoId])

  useEffect(() => { void cargar() }, [cargar])

  // P6: alerta temprana del activo (paradas correctivas repetidas).
  // La query es compartida/agrupada y nunca rompe si paradas no es accesible.
  useEffect(() => {
    let vivo = true
    void cargarAlertasTempranas().then((m) => { if (vivo) setAlerta(m.get(activoId) ?? null) })
    return () => { vivo = false }
  }, [activoId])

  // Aviso efimero de confirmacion.
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  // ------------------------------------------------------------
  // Edicion: arranca con los valores actuales del activo.
  // ------------------------------------------------------------
  function empezarEdicion() {
    if (!activo) return
    setPlaca({
      fabricante: activo.fabricante ?? '',
      modelo: activo.modelo ?? '',
      nro_serie: activo.nro_serie ?? '',
      anio: activo.anio != null ? String(activo.anio) : '',
      iit_ref: activo.iit_ref ?? '',
      notas: activo.notas ?? '',
    })
    setComponentes(comoLineas(activo.componentes))
    setLoto(comoLineas(activo.puntos_loto).map((l) => (l.detalle ? `${l.titulo} · ${l.detalle}` : l.titulo)))
    setEditando(true)
  }

  async function guardarEdicion() {
    if (!supabase || !activo) return
    const anioN = placa.anio.trim() ? Number(placa.anio.trim()) : null
    if (anioN != null && (!Number.isInteger(anioN) || anioN < 1950 || anioN > 2100)) {
      setError('El año de placa debe ser un número válido (ej. 2021).')
      return
    }
    setGuardando(true)
    setError('')
    const patch = {
      fabricante: placa.fabricante.trim() || null,
      modelo: placa.modelo.trim() || null,
      nro_serie: placa.nro_serie.trim() || null,
      anio: anioN,
      iit_ref: placa.iit_ref.trim() || null,
      notas: placa.notas.trim() || null,
      // Se guarda string simple cuando no hay detalle, objeto cuando lo hay.
      componentes: componentes.filter((c) => c.titulo.trim()).map((c) => (c.detalle.trim() ? { nombre: c.titulo.trim(), detalle: c.detalle.trim() } : c.titulo.trim())),
      puntos_loto: loto.map((l) => l.trim()).filter((l) => !!l),
      actualizado_en: new Date().toISOString(),
      actualizado_por: usuario?.usuario ?? null,
    }
    const { error: e } = await supabase.from('mant_activos').update(patch).eq('id', activo.id)
    setGuardando(false)
    if (e) { setError(`No se pudo guardar la ficha de ${activo.id}.`); return }
    setActivo({ ...activo, ...patch } as MantActivo)
    setEditando(false)
    setAviso(`Ficha de ${activo.id} guardada.`)
  }

  // P6: OT preventiva sugerida desde el badge de alerta temprana.
  // UN tap + confirmacion humana (nunca automatica). Si el motivo es una
  // gama vencida, la OT nace con esa gama pre-cargada y objetivo hoy.
  async function crearOtPreventivaSugerida() {
    if (!supabase || !activo || !alerta) return
    const gamaV = alerta.gamasVencidas[0] ?? null
    const motivo = textoAlerta(alerta)
    const desc = gamaV
      ? `${gamaV.tarea} — preventivo sugerido por alerta temprana (${motivo}).`
      : `Preventivo sugerido por alerta temprana: ${motivo}. Inspeccionar ${activo.id} (${activo.nombre}).`
    if (!window.confirm(`¿Crear OT preventiva para ${activo.id}?\n\n${desc}`)) return
    const { error: e } = await supabase.from('mant_ordenes_trabajo').insert({
      tipo: 'preventiva', estado: 'creada', prioridad: 'media',
      activo_id: activo.id, origen: 'manual',
      gama_id: gamaV?.gamaId ?? null,
      descripcion: desc, fecha_objetivo: fechaLocalISO(),
      creado_por: usuario?.usuario ?? null,
    })
    if (e) { setError(`No se pudo crear la OT preventiva: ${e.message}`); return }
    setAviso(`OT preventiva creada para ${activo.id}.`)
    setOtRefresh((k) => k + 1) // refresca la linea de tiempo
  }

  if (!supabase) return <div className="empty">Supabase no está configurado (faltan credenciales en .env).</div>
  if (cargando) return <div className="empty">Cargando ficha de {activoId}…</div>
  if (!activo) {
    return (
      <div>
        <button className="btn" style={{ minHeight: 44, marginBottom: 12 }} onClick={onVolver}>← Volver</button>
        <div className="empty">{error || 'Activo no encontrado.'}</div>
      </div>
    )
  }

  const lineasComponentes = comoLineas(activo.componentes)
  const lineasLoto = comoLineas(activo.puntos_loto)
  const datosTec = Object.entries(activo.datos_tecnicos ?? {}).filter(([, v]) => v != null && String(v) !== '')
  const sinPlaca = !activo.fabricante && !activo.modelo && !activo.nro_serie && activo.anio == null && datosTec.length === 0

  return (
    <div className="mant-ficha-page">
      {/* ---------- Barra de navegacion ---------- */}
      <div className="mant-ficha-nav no-print">
        <button className="btn" style={{ minHeight: 44, padding: '0 16px' }} onClick={onVolver}>← Volver</button>
        {puedeEditar && !editando && (
          <button className="btn btn-naranja" style={{ minHeight: 44, padding: '0 16px' }} onClick={empezarEdicion}>✏️ Editar ficha</button>
        )}
        {editando && (
          <>
            <button className="btn btn-verde" style={{ minHeight: 44, padding: '0 16px' }} disabled={guardando} onClick={() => void guardarEdicion()}>💾 Guardar</button>
            <button className="btn" style={{ minHeight: 44, padding: '0 16px' }} onClick={() => setEditando(false)}>Cancelar</button>
          </>
        )}
      </div>

      {error && <div className="error-msg" style={{ textAlign: 'left', margin: '0 0 8px' }}>{error}</div>}
      {aviso && <div className="mant-aviso no-print" style={{ marginBottom: 10 }}>{aviso}</div>}

      {/* ---------- Encabezado ---------- */}
      <div className="card mant-ficha-cab">
        <div className="mant-ficha-simbolo" style={{ color: sector?.color ?? '#94a3b8' }}>
          <SimboloActivo simbolo={activo.simbolo} size={34} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.35rem' }}>{activo.id}</h2>
          <div style={{ fontSize: '1.05rem' }}><strong>{activo.nombre}</strong></div>
          <div className="mant-ficha-chips">
            {sector && (
              <span className="mant-chip"><i style={{ background: sector.color }} />{sector.nombre}</span>
            )}
            <span className="mant-chip">{planta?.nombre ?? activo.planta_id}{activo.subarea ? ` · ${activo.subarea}` : ''}</span>
            <span className={`mant-chip-crit mant-crit-${activo.criticidad}`} title={`Criticidad ${CRIT_LABEL[activo.criticidad]}`}>
              {activo.criticidad}
            </span>
            <span className="mant-chip" title={`Estado del activo: ${ESTADOS[estadoActivo].label}`}>
              <i style={{ background: ESTADOS[estadoActivo].color }} />{ESTADOS[estadoActivo].label}
            </span>
            {activo.tipo && <span className="mant-chip">{activo.tipo}</span>}
          </div>
          <div className="meta" style={{ marginTop: 6 }}>
            {activo.iit_ref && <>IIT: <strong>{activo.iit_ref}</strong> · </>}
            {activo.pwa_machine_key && <>Máquina PWA: <strong>{activo.pwa_machine_key}</strong> · </>}
            {activo.actualizado_por && <>Última edición: {activo.actualizado_por}</>}
          </div>
        </div>
      </div>

      {/* ---------- Alerta temprana (P6) ---------- */}
      {alerta && (
        <div className="mant-alerta-badge no-print">
          <span style={{ fontSize: '1.4rem' }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="t">Alerta temprana — {textoAlerta(alerta)}</div>
            <div className="meta">La máquina acumula paradas correctivas: conviene anticipar con un preventivo antes de que rompa.</div>
          </div>
          {puedeOperar && (
            <button className="btn btn-naranja" style={{ minHeight: 48, padding: '0 16px' }} onClick={() => void crearOtPreventivaSugerida()}>
              🛠️ Crear OT preventiva
            </button>
          )}
        </div>
      )}

      {/* ---------- Datos de placa ---------- */}
      <div className="card">
        <div className="section-title" style={{ margin: '0 0 10px', fontSize: '1.05rem' }}>📋 Datos de placa</div>
        {editando ? (
          <div className="form-grid">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Fabricante</label>
              <input className="input" value={placa.fabricante} onChange={(e) => setPlaca({ ...placa, fabricante: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Modelo</label>
              <input className="input" value={placa.modelo} onChange={(e) => setPlaca({ ...placa, modelo: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>N° de serie</label>
              <input className="input" value={placa.nro_serie} onChange={(e) => setPlaca({ ...placa, nro_serie: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Año</label>
              <input className="input" inputMode="numeric" value={placa.anio} onChange={(e) => setPlaca({ ...placa, anio: e.target.value })} placeholder="2021" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Referencia IIT</label>
              <input className="input" value={placa.iit_ref} onChange={(e) => setPlaca({ ...placa, iit_ref: e.target.value })} placeholder="IIT 7.1.3 NN" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Notas</label>
              <input className="input" value={placa.notas} onChange={(e) => setPlaca({ ...placa, notas: e.target.value })} />
            </div>
          </div>
        ) : sinPlaca ? (
          <div className="meta">Sin datos de placa cargados{puedeEditar ? ' — se fichan con el tiempo desde “Editar ficha”.' : '.'}</div>
        ) : (
          <div className="mant-kv-grid">
            <DatoPlaca label="Fabricante" valor={activo.fabricante} />
            <DatoPlaca label="Modelo" valor={activo.modelo} />
            <DatoPlaca label="N° de serie" valor={activo.nro_serie} />
            <DatoPlaca label="Año" valor={activo.anio} />
            {datosTec.map(([k, v]) => (
              <DatoPlaca key={k} label={k} valor={typeof v === 'object' ? JSON.stringify(v) : String(v)} />
            ))}
          </div>
        )}
        {!editando && activo.notas && (
          <div className="meta" style={{ marginTop: 10 }}><em>{activo.notas}</em></div>
        )}
      </div>

      <div className="mant-ficha-cols">
        {/* ---------- Componentes ---------- */}
        <div className="card">
          <div className="section-title" style={{ margin: '0 0 10px', fontSize: '1.05rem' }}>⚙ Componentes (motores / variadores)</div>
          {editando ? (
            <>
              {componentes.map((c, i) => (
                <div key={i} className="mant-edit-linea">
                  <input className="input" style={{ minHeight: 44 }} value={c.titulo} placeholder="Motor principal 13 kW"
                    onChange={(e) => setComponentes(componentes.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} />
                  <input className="input" style={{ minHeight: 44 }} value={c.detalle} placeholder="Detalle (marca, placa…)"
                    onChange={(e) => setComponentes(componentes.map((x, j) => (j === i ? { ...x, detalle: e.target.value } : x)))} />
                  <button className="btn" style={{ minHeight: 44, padding: '0 12px' }} aria-label="Quitar componente"
                    onClick={() => setComponentes(componentes.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button className="btn" style={{ minHeight: 44 }} onClick={() => setComponentes([...componentes, { titulo: '', detalle: '' }])}>＋ Agregar componente</button>
            </>
          ) : lineasComponentes.length === 0 ? (
            <div className="meta">Sin componentes fichados. Se fichan con el tiempo (motores, variadores, reductores…).</div>
          ) : (
            <ul className="mant-lista">
              {lineasComponentes.map((c, i) => (
                <li key={i}><strong>{c.titulo}</strong>{c.detalle && <span className="meta"> · {c.detalle}</span>}</li>
              ))}
            </ul>
          )}
        </div>

        {/* ---------- Puntos LOTO ---------- */}
        <div className="card">
          <div className="section-title" style={{ margin: '0 0 10px', fontSize: '1.05rem' }}>🔒 Puntos de bloqueo (LOTO)</div>
          {editando ? (
            <>
              {loto.map((l, i) => (
                <div key={i} className="mant-edit-linea">
                  <input className="input" style={{ minHeight: 44 }} value={l} placeholder="Tablero general — interruptor Q1"
                    onChange={(e) => setLoto(loto.map((x, j) => (j === i ? e.target.value : x)))} />
                  <button className="btn" style={{ minHeight: 44, padding: '0 12px' }} aria-label="Quitar punto LOTO"
                    onClick={() => setLoto(loto.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              <button className="btn" style={{ minHeight: 44 }} onClick={() => setLoto([...loto, ''])}>＋ Agregar punto LOTO</button>
            </>
          ) : lineasLoto.length === 0 ? (
            <div className="meta">Sin puntos LOTO cargados. Se definen al fichar el equipo.</div>
          ) : (
            <ul className="mant-lista mant-lista-loto">
              {lineasLoto.map((l, i) => (
                <li key={i}><span className="mant-loto-check">☐</span><strong>{l.titulo}</strong>{l.detalle && <span className="meta"> · {l.detalle}</span>}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---------- Dependencias ---------- */}
      {(dependencias.length > 0 || (Array.isArray(activo.depende_de) && activo.depende_de.length > 0)) && (
        <div className="card">
          <div className="section-title" style={{ margin: '0 0 10px', fontSize: '1.05rem' }}>🔗 Depende de</div>
          <div className="mant-leyenda">
            {dependencias.map((d) => (
              <button key={d.id} className="mant-chip mant-chip-link" onClick={() => onVerActivo(d.id)} title={`Ver ficha de ${d.id}`}>
                {d.id} · {d.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---------- Linea de tiempo unificada (P5) ---------- */}
      <div className="card">
        <div className="section-title" style={{ margin: '0 0 10px', fontSize: '1.05rem' }}>🕓 Línea de tiempo del equipo</div>
        <TimelineActivo activo={activo} refreshKey={otRefresh} />
      </div>

      {/* ---------- Repuestos / partes con foto (catálogo de la máquina) ---------- */}
      <ComponentesActivo activoId={activo.id} />

      {/* ---------- Gamas preventivas (con estado: al dia / proxima / vencida) ---------- */}
      <div className="card">
        <div className="section-title" style={{ margin: '0 0 10px', fontSize: '1.05rem' }}>🔁 Gamas preventivas</div>
        {gamas.length === 0 ? (
          <div className="meta">Sin gamas preventivas cargadas para este equipo.</div>
        ) : (
          gamas.map((g) => {
            const r = resumenGamas.get(g.id)
            const est = estadoDeGama(g, r?.ultima ?? null, r?.abierta ?? false)
            return (
              <div key={g.id} className="mant-hist-item">
                <div className="mant-hist-top">
                  <span className="estado-chip e-finalizado">{FRECUENCIA_LABEL[g.frecuencia]}</span>
                  {est.tieneOtAbierta ? (
                    <span className="mant-gama-chip g-abierta">🛠️ OT abierta</span>
                  ) : est.vencida ? (
                    <span className="mant-gama-chip g-vencida">⚠️ vencida hace {Math.abs(est.diasParaVencer ?? 0)} d</span>
                  ) : est.proximaAVencer ? (
                    <span className="mant-gama-chip g-proxima">vence en {est.diasParaVencer} d</span>
                  ) : est.ultimaEjecucion ? (
                    <span className="mant-gama-chip g-aldia">al día</span>
                  ) : (
                    <span className="meta">sin ejecuciones aún</span>
                  )}
                  <span className="meta">
                    responsable: {g.responsable}
                    {g.duracion_est_min != null ? ` · ~${g.duracion_est_min} min` : ''}
                    {est.ultimaEjecucion ? ` · última: ${fechaCorta(est.ultimaEjecucion)}` : ''}
                    {est.proxima ? ` · próxima: ${fechaCorta(est.proxima)}` : ''}
                  </span>
                </div>
                <div className="mant-hist-trabajo">{g.tarea}</div>
                <InstructivoGama gama={g} />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
