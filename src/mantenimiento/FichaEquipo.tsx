import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { esSuperAdmin } from '../auth/roles'
import { fechaCorta } from '../lib/time'
import { SimboloActivo } from './simbolos'
import { comoLineas } from './types'
import type { Criticidad, LineaFicha, MantActivo, MantGama, MantOT, MantPlanta, MantRegistro, MantSector } from './types'

// ============================================================
// FICHA DE EQUIPO — MANTENIMIENTO (v1.62/v1.63)
// Vista completa de un activo: encabezado, datos de placa, componentes,
// puntos LOTO, dependencias, historial de intervenciones (mant_registros),
// ordenes de trabajo y gamas preventivas.
// Edicion (placa + notas + componentes + LOTO): solo rol 'mantenimiento'
// o super admin (mismo criterio que MapaEditor y que la RLS).
// Navegacion interna del modulo: llega con activoId; onVolver vuelve a la
// pantalla anterior (mapa o listado); onVerActivo salta a otra ficha
// (chips de dependencias).
// ============================================================

const PAGINA_HIST = 50

const CRIT_LABEL: Record<Criticidad, string> = { A: 'A · Crítica', B: 'B · Importante', C: 'C · Menor' }

const FRECUENCIA_LABEL: Record<MantGama['frecuencia'], string> = {
  diaria: 'Diaria', semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual',
  trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual',
}

const OT_ESTADO_LABEL: Record<MantOT['estado'], string> = {
  creada: 'Creada', planificada: 'Planificada', en_ejecucion: 'En ejecución',
  en_espera: 'En espera', cerrada: 'Cerrada', cancelada: 'Cancelada',
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

  const [activo, setActivo] = useState<MantActivo | null>(null)
  const [sectores, setSectores] = useState<MantSector[]>([])
  const [plantas, setPlantas] = useState<MantPlanta[]>([])
  const [dependencias, setDependencias] = useState<Pick<MantActivo, 'id' | 'nombre'>[]>([])
  const [registros, setRegistros] = useState<MantRegistro[]>([])
  const [histTotal, setHistTotal] = useState(0)
  const [histPrev, setHistPrev] = useState(0)
  const [histCorr, setHistCorr] = useState(0)
  const [limite, setLimite] = useState(PAGINA_HIST)
  const [gamas, setGamas] = useState<MantGama[]>([])
  const [ots, setOts] = useState<MantOT[]>([])
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

  // ------------------------------------------------------------
  // Carga de la ficha (activo + catalogos + relacionados).
  // ------------------------------------------------------------
  const cargar = useCallback(async () => {
    if (!supabase) { setCargando(false); return }
    setCargando(true)
    setError('')
    setEditando(false)
    const [{ data: a, error: e1 }, { data: ss }, { data: ps }, { data: gs }, { data: os }] = await Promise.all([
      supabase.from('mant_activos').select('*').eq('id', activoId).maybeSingle(),
      supabase.from('mant_sectores').select('*').order('orden'),
      supabase.from('mant_plantas').select('*').order('orden'),
      supabase.from('mant_gamas').select('*').eq('activo_id', activoId).eq('activa', true).order('orden'),
      supabase.from('mant_ordenes_trabajo').select('id, numero, tipo, estado, prioridad, activo_id, descripcion, responsable, fecha_objetivo, creado_en')
        .eq('activo_id', activoId).order('creado_en', { ascending: false }).limit(20),
    ])
    if (e1 || !a) { setError(e1 ? 'No se pudo cargar el activo. Revisá la conexión.' : `No existe el activo ${activoId}.`); setCargando(false); return }
    const act = a as MantActivo
    setActivo(act)
    setSectores((ss ?? []) as MantSector[])
    setPlantas((ps ?? []) as MantPlanta[])
    setGamas((gs ?? []) as MantGama[])
    setOts((os ?? []) as MantOT[])

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

  useEffect(() => { setLimite(PAGINA_HIST); void cargar() }, [cargar])

  // ------------------------------------------------------------
  // Historial de intervenciones: pagina de a 50 + conteos por tipo.
  // ------------------------------------------------------------
  useEffect(() => {
    if (!supabase) return
    let vivo = true
    ;(async () => {
      const [{ data: regs }, { count: tot }, { count: cp }, { count: cc }] = await Promise.all([
        supabase.from('mant_registros').select('*').eq('activo_id', activoId)
          .order('fecha', { ascending: false }).range(0, limite - 1),
        supabase.from('mant_registros').select('*', { count: 'exact', head: true }).eq('activo_id', activoId),
        supabase.from('mant_registros').select('*', { count: 'exact', head: true }).eq('activo_id', activoId).eq('tipo', 'preventivo'),
        supabase.from('mant_registros').select('*', { count: 'exact', head: true }).eq('activo_id', activoId).eq('tipo', 'correctivo'),
      ])
      if (!vivo) return
      setRegistros((regs ?? []) as MantRegistro[])
      setHistTotal(tot ?? 0)
      setHistPrev(cp ?? 0)
      setHistCorr(cc ?? 0)
    })()
    return () => { vivo = false }
  }, [activoId, limite])

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
  const ultimaIntervencion = registros[0]?.fecha ?? null

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
            {activo.tipo && <span className="mant-chip">{activo.tipo}</span>}
          </div>
          <div className="meta" style={{ marginTop: 6 }}>
            {activo.iit_ref && <>IIT: <strong>{activo.iit_ref}</strong> · </>}
            {activo.pwa_machine_key && <>Máquina PWA: <strong>{activo.pwa_machine_key}</strong> · </>}
            {activo.actualizado_por && <>Última edición: {activo.actualizado_por}</>}
          </div>
        </div>
      </div>

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

      {/* ---------- Historial de intervenciones ---------- */}
      <div className="card">
        <div className="section-title" style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>🧰 Historial de intervenciones</div>
        {histTotal > 0 && (
          <div className="meta" style={{ marginBottom: 12 }}>
            <strong>{histTotal}</strong> intervención(es): <strong>{histCorr}</strong> correctiva(s) · <strong>{histPrev}</strong> preventiva(s)
            {ultimaIntervencion && <> · última: <strong>{fechaCorta(ultimaIntervencion)}</strong></>}
          </div>
        )}
        {histTotal === 0 ? (
          <div className="meta">Sin intervenciones registradas para este equipo en las planillas migradas.</div>
        ) : (
          <>
            {registros.map((r) => (
              <div key={r.id} className="mant-hist-item">
                <div className="mant-hist-top">
                  <span className={`estado-chip ${r.tipo === 'correctivo' ? 'mant-hist-corr' : 'mant-hist-prev'}`}>
                    {r.tipo === 'correctivo' ? 'Correctivo' : 'Preventivo'}
                  </span>
                  <span className="meta">
                    <strong>{fechaCorta(r.fecha)}</strong>
                    {r.colaborador ? ` · ${r.colaborador}` : ''}
                    {r.horas != null ? ` · ${r.horas} h` : ''}
                  </span>
                </div>
                {r.trabajo && <div className="mant-hist-trabajo">{r.trabajo}</div>}
                {(r.insumo || r.emisor) && (
                  <div className="meta">
                    {r.insumo && <>Insumo: <strong>{r.insumo}</strong></>}
                    {r.insumo && r.emisor && ' · '}
                    {r.emisor && <>Emisor: {r.emisor}</>}
                  </div>
                )}
              </div>
            ))}
            {registros.length < histTotal && (
              <button className="btn btn-bloque" style={{ minHeight: 44, marginTop: 4 }} onClick={() => setLimite((l) => l + PAGINA_HIST)}>
                Mostrar más ({registros.length} de {histTotal})
              </button>
            )}
          </>
        )}
      </div>

      {/* ---------- Ordenes de trabajo ---------- */}
      <div className="card">
        <div className="section-title" style={{ margin: '0 0 10px', fontSize: '1.05rem' }}>📝 Órdenes de trabajo</div>
        {ots.length === 0 ? (
          <div className="meta">Sin OT todavía — se generan desde las gamas preventivas o desde avisos de falla.</div>
        ) : (
          ots.map((o) => (
            <div key={o.id} className="mant-hist-item">
              <div className="mant-hist-top">
                <span className="estado-chip e-proceso">OT {o.numero} · {OT_ESTADO_LABEL[o.estado]}</span>
                <span className="meta">
                  {o.tipo} · prioridad {o.prioridad}
                  {o.fecha_objetivo ? ` · objetivo ${fechaCorta(o.fecha_objetivo)}` : ''}
                  {o.responsable ? ` · ${o.responsable}` : ''}
                </span>
              </div>
              <div className="mant-hist-trabajo">{o.descripcion}</div>
            </div>
          ))
        )}
      </div>

      {/* ---------- Gamas preventivas ---------- */}
      <div className="card">
        <div className="section-title" style={{ margin: '0 0 10px', fontSize: '1.05rem' }}>🔁 Gamas preventivas</div>
        {gamas.length === 0 ? (
          <div className="meta">Sin gamas preventivas cargadas para este equipo.</div>
        ) : (
          gamas.map((g) => (
            <div key={g.id} className="mant-hist-item">
              <div className="mant-hist-top">
                <span className="estado-chip e-finalizado">{FRECUENCIA_LABEL[g.frecuencia]}</span>
                <span className="meta">
                  responsable: {g.responsable}
                  {g.duracion_est_min != null ? ` · ~${g.duracion_est_min} min` : ''}
                </span>
              </div>
              <div className="mant-hist-trabajo">{g.tarea}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
