import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fechaCorta, fmtDur, hhmm, minutosEntre } from '../lib/time'
import { causaLabel } from '../types'
import type { CausaParada } from '../types'
import type { MantActivo, MantAviso, MantOT, MantRegistro } from './types'

// ============================================================
// LINEA DE TIEMPO UNIFICADA POR ACTIVO (P5) — FichaEquipo.
// Una sola historia del equipo (mas reciente arriba) que mergea:
//   📖 mant_registros   planillas migradas (correctivo/preventivo)
//   🛠️ mant_ordenes_trabajo  OT del modulo (estado, duracion real)
//   📢 mant_avisos      avisos de falla (quien aviso, sintoma)
//   ⛔ paradas (Prod.)  con causa mant_*, via tareas.maquina_id =
//                       mant_activos.pwa_machine_key
// Queries: una por fuente, filtradas por activo, con limite + contador
// ("mostrar mas" suma de a 50). Si la tabla `paradas` no es accesible
// (RLS / SQL pendiente), el timeline sigue con las demas fuentes.
// ============================================================

const PAGINA = 50

const OT_ESTADO_LABEL: Record<MantOT['estado'], string> = {
  creada: 'Creada', planificada: 'Planificada', en_ejecucion: 'En ejecución',
  en_espera: 'En espera', cerrada: 'Cerrada', cancelada: 'Cancelada',
}

type TipoEvento = 'aviso' | 'parada' | 'ot' | 'registro'

interface Evento {
  id: string
  fecha: string             // ISO para ordenar
  tipo: TipoEvento
  icono: string
  tono: string              // color del borde/icono
  titulo: string
  detalle: string           // dato clave segun tipo
  texto: string             // cuerpo (trabajo / sintoma / observacion)
  soloFecha?: boolean       // registros de planilla: sin hora
}

interface ParadaProd {
  id: string
  causa: string
  inicio: string
  fin: string | null
  observacion: string | null
  tareas: { maquina_id: string } | null
}

export default function TimelineActivo({ activo, refreshKey = 0 }: { activo: MantActivo; refreshKey?: number }) {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [total, setTotal] = useState(0)
  const [limite, setLimite] = useState(PAGINA)
  const [cargando, setCargando] = useState(true)
  const [paradasOk, setParadasOk] = useState(true)

  useEffect(() => { setLimite(PAGINA) }, [activo.id])

  const cargar = useCallback(async () => {
    if (!supabase) { setCargando(false); return }
    setCargando(true)

    // Fuentes 1-3: tablas del modulo, filtradas por activo_id.
    const [regs, ots, avs, cReg, cOt, cAv] = await Promise.all([
      supabase.from('mant_registros').select('*').eq('activo_id', activo.id)
        .order('fecha', { ascending: false }).range(0, limite - 1),
      supabase.from('mant_ordenes_trabajo').select('*').eq('activo_id', activo.id)
        .order('creado_en', { ascending: false }).limit(limite),
      supabase.from('mant_avisos').select('*').eq('activo_id', activo.id)
        .order('creado_en', { ascending: false }).limit(limite),
      supabase.from('mant_registros').select('*', { count: 'exact', head: true }).eq('activo_id', activo.id),
      supabase.from('mant_ordenes_trabajo').select('*', { count: 'exact', head: true }).eq('activo_id', activo.id),
      supabase.from('mant_avisos').select('*', { count: 'exact', head: true }).eq('activo_id', activo.id),
    ])

    // Fuente 4: paradas productivas con causa mant_*. La maquina vive en la
    // tarea padre (paradas -> tareas.maquina_id = pwa_machine_key).
    // Degradacion con gracia: si falla (RLS / tabla), se omite esta fuente.
    let pars: ParadaProd[] = []
    let cPar = 0
    let okPar = true
    if (activo.pwa_machine_key) {
      try {
        const [{ data, error }, { count, error: eCount }] = await Promise.all([
          supabase.from('paradas')
            .select('id, causa, inicio, fin, observacion, tareas!inner(maquina_id)')
            .eq('tareas.maquina_id', activo.pwa_machine_key)
            .in('causa', ['mant_correctivo', 'mant_preventivo'])
            .order('inicio', { ascending: false }).limit(limite),
          supabase.from('paradas')
            .select('id, tareas!inner(maquina_id)', { count: 'exact', head: true })
            .eq('tareas.maquina_id', activo.pwa_machine_key)
            .in('causa', ['mant_correctivo', 'mant_preventivo']),
        ])
        if (error) throw new Error(error.message)
        if (eCount) throw new Error(eCount.message)
        pars = (data ?? []) as unknown as ParadaProd[]
        cPar = count ?? pars.length
      } catch (e) {
        okPar = false
        console.warn('[timeline] paradas de produccion no accesibles:', e)
      }
    }
    setParadasOk(okPar)

    const ev: Evento[] = []
    for (const r of ((regs.data ?? []) as MantRegistro[])) {
      ev.push({
        id: `reg-${r.id}`, fecha: r.fecha, tipo: 'registro', icono: '📖',
        tono: r.tipo === 'correctivo' ? '#ef4444' : '#22c55e',
        titulo: r.tipo === 'correctivo' ? 'Correctivo (planilla)' : 'Preventivo (planilla)',
        detalle: [r.colaborador, r.horas != null ? `${r.horas} h` : '', r.insumo ? `insumo: ${r.insumo}` : ''].filter(Boolean).join(' · '),
        texto: r.trabajo ?? '', soloFecha: true,
      })
    }
    for (const o of ((ots.data ?? []) as MantOT[])) {
      ev.push({
        id: `ot-${o.id}`, fecha: o.fecha_cierre ?? o.fecha_inicio ?? o.creado_en, tipo: 'ot', icono: '🛠️',
        tono: '#1e6fb8',
        titulo: `OT ${o.numero} · ${o.tipo}`,
        detalle: [
          OT_ESTADO_LABEL[o.estado],
          o.responsable ? `👤 ${o.responsable}` : '',
          o.fecha_inicio && o.fecha_cierre ? `duró ${fmtDur(minutosEntre(o.fecha_inicio, o.fecha_cierre))}` : '',
        ].filter(Boolean).join(' · '),
        texto: o.cierre_trabajo ?? o.descripcion,
      })
    }
    for (const a of ((avs.data ?? []) as MantAviso[])) {
      ev.push({
        id: `av-${a.id}`, fecha: a.creado_en, tipo: 'aviso', icono: '📢',
        tono: '#ef4444',
        titulo: 'Aviso de falla',
        detalle: `${a.emisor} · ${a.estado}`,
        texto: a.sintoma,
      })
    }
    for (const p of pars) {
      ev.push({
        id: `pa-${p.id}`, fecha: p.inicio, tipo: 'parada', icono: '⛔',
        tono: '#f59e0b',
        titulo: `Parada productiva · ${causaLabel(p.causa as CausaParada)}`,
        detalle: p.fin ? `duró ${fmtDur(minutosEntre(p.inicio, p.fin))}` : '⏱ en curso',
        texto: p.observacion ?? '',
      })
    }

    ev.sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha))
    setEventos(ev.slice(0, limite))
    setTotal((cReg.count ?? 0) + (cOt.count ?? 0) + (cAv.count ?? 0) + cPar)
    setCargando(false)
  }, [activo.id, activo.pwa_machine_key, limite])

  useEffect(() => { void cargar() }, [cargar, refreshKey])

  if (cargando && eventos.length === 0) return <div className="empty">Cargando línea de tiempo…</div>

  return (
    <div>
      {total > 0 && (
        <div className="meta" style={{ marginBottom: 12 }}>
          <strong>{total}</strong> evento(s): 📖 registros · 🛠️ OT · 📢 avisos · ⛔ paradas
          {!paradasOk && <> · <em>(paradas de producción no accesibles — ¿RLS?)</em></>}
          {!activo.pwa_machine_key && <> · <em>(sin máquina PWA vinculada: no hay paradas productivas)</em></>}
        </div>
      )}
      {eventos.length === 0 ? (
        <div className="meta">Sin historia todavía — aparecen avisos, OT, paradas y registros migrados.</div>
      ) : (
        <>
          {eventos.map((e) => (
            <div key={e.id} className="mant-tl-item" style={{ borderLeftColor: e.tono }}>
              <div className="mant-tl-ico" style={{ color: e.tono }}>{e.icono}</div>
              <div className="mant-tl-body">
                <div className="mant-tl-top">
                  <strong>{e.titulo}</strong>
                  <span className="meta">
                    {fechaCorta(e.fecha)}{!e.soloFecha && ` ${hhmm(e.fecha)}`}
                    {e.detalle && ` · ${e.detalle}`}
                  </span>
                </div>
                {e.texto && <div className="mant-hist-trabajo">{e.texto}</div>}
              </div>
            </div>
          ))}
          {eventos.length < total && (
            <button className="btn btn-bloque" style={{ minHeight: 44, marginTop: 4 }} onClick={() => setLimite((l) => l + PAGINA)}>
              Mostrar más ({eventos.length} de {total})
            </button>
          )}
        </>
      )}
    </div>
  )
}
