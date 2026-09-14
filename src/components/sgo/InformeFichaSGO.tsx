import { renderToStaticMarkup } from 'react-dom/server'
import type { AccionSGO, EventoSGO } from '../../sgo/types'
import { estadoIndicador, periodoKPILabel, type IndicadorSGO } from '../../sgo/indicadores'
import { detalleKPIAutomatico, type DatosKPIAutomaticos } from '../../sgo/kpiAutomaticos'
import { comparacionIndicador, diasAtraso, evidenciaIndicador, evolucionIndicador } from '../../sgo/fichaGestion'
import { estadoProgramacionControl, type ControlProgramadoSGO } from '../../sgo/controles'

export interface InformeFichaDatos {
  area: string; pilar: string; periodo: string; emitido: string
  kpis: IndicadorSGO[]; acciones: AccionSGO[]; eventos: EventoSGO[]
  controles: ControlProgramadoSGO[]; datos: DatosKPIAutomaticos
}
export const valorFicha = (n: number | undefined, unidad = '') => n === undefined ? 'Sin datos' : `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${unidad}`.trim()
const etiquetas = { verde: 'Conforme', amarillo: 'En alerta', rojo: 'Fuera de meta', sin_dato: 'Sin datos' }

// Documento autónomo: no copia el DOM, imágenes ni estilos globales de la PWA.
export function crearInformeFicha(d: InformeFichaDatos, completo: boolean): string {
  const acciones = completo ? d.acciones : d.acciones.slice(0, 8)
  const kpis = completo ? d.kpis : d.kpis.slice(0, 6)
  const controles = completo ? d.controles : d.controles.slice(0, 6)
  const ids = new Set(d.eventos.map(e => e.id))
  const accionesCerradas = d.datos.acciones.filter(a => ids.has(a.eventoId) && ['verificada', 'cancelada'].includes(a.estado))
  const cuerpo = renderToStaticMarkup(<main>
    <header><b>INELPA TRANSFORMADORES · SGO</b><p>{completo ? 'Informe detallado' : 'Resumen para reunión'} · Ficha de gestión</p></header>
    <h1>{d.area} · {d.pilar}</h1>
    <p>Indicadores: {d.periodo} · Pendientes actuales acumulados al {d.emitido}.</p>
    <section className="alerta"><b>{d.acciones.filter(a => diasAtraso(a.fechaCompromiso) > 0).length} acciones vencidas · {d.eventos.filter(e => e.estado !== 'cerrado').length} eventos abiertos · {d.controles.filter(c => estadoProgramacionControl(c) === 'vencido').length} controles vencidos</b><p>El cumplimiento del KPI no implica que los pendientes estén resueltos.</p></section>
    <h2>Resultados y tendencia</h2>
    {kpis.length ? <table><thead><tr><th>Indicador / período</th><th>Resultado / meta</th><th>Estado / variación</th></tr></thead><tbody>{kpis.map(i => {
      const c = comparacionIndicador(i, d.datos)
      return <tr key={i.id}><td>{i.nombre}<small>{periodoKPILabel(i.periodo, i.frecuencia)} · {i.origen === 'automatico' && i.claveCalculo ? 'Automático' : 'Manual'}</small></td><td>{valorFicha(i.valorActual, i.unidad)} / {valorFicha(i.meta, i.unidad)}</td><td>{etiquetas[estadoIndicador(i)]}<small>{c.diferencia === undefined ? 'Sin dato del período anterior' : `${c.diferencia > 0 ? '+' : ''}${valorFicha(c.diferencia, i.unidad === '%' ? 'pp' : i.unidad)} vs período anterior`}</small></td></tr>
    })}</tbody></table> : <p>Sin indicadores configurados.</p>}
    {kpis.length < d.kpis.length && <p>Se muestran {kpis.length} de {d.kpis.length} KPI. Consultar el informe detallado para ver todos.</p>}
    <h2>Qué requiere atención</h2>
    {acciones.length ? <table><thead><tr><th>Acción / expediente</th><th>Responsable</th><th>Compromiso / atraso</th></tr></thead><tbody>{acciones.map(a => <tr key={a.id}><td>{a.descripcion}<small>{d.eventos.find(e => e.id === a.eventoId)?.codigo} · {a.estado}</small></td><td>{a.responsable || 'Sin asignar'}</td><td>{a.fechaCompromiso}<small>{diasAtraso(a.fechaCompromiso) ? `${diasAtraso(a.fechaCompromiso)} días de atraso` : 'En plazo'}</small></td></tr>)}</tbody></table> : <p>No hay acciones pendientes.</p>}
    {acciones.length < d.acciones.length && <p>Se muestran las primeras {acciones.length} de {d.acciones.length} acciones, priorizadas por riesgo y fecha. Ver informe detallado.</p>}
    <h2>Controles programados</h2>
    {controles.length ? <table><thead><tr><th>Control</th><th>Responsable</th><th>Próximo / estado</th></tr></thead><tbody>{controles.map(c => <tr key={c.id}><td>{c.titulo}</td><td>{c.responsable}</td><td>{c.proximaFecha} · {estadoProgramacionControl(c)}</td></tr>)}</tbody></table> : <p>Sin controles activos para esta área y pilar.</p>}
    {controles.length < d.controles.length && <p>Se muestran {controles.length} de {d.controles.length} controles. Ver informe detallado.</p>}
    {completo && <>
      <h2>Expedientes e historial</h2>{d.eventos.length ? d.eventos.map(e => <section key={e.id}><h3>{e.codigo} · {e.titulo}</h3><p>{e.estado} · {e.severidad} · {e.responsable || 'Sin asignar'} · Detectado: {e.detectadoEn.slice(0, 10)}</p><p>{e.descripcion}</p></section>) : <p>Sin expedientes.</p>}
      {accionesCerradas.length > 0 && <><h2>Acciones verificadas o canceladas</h2><table><thead><tr><th>Acción / estado</th><th>Responsable / verificación</th><th>Evidencia / observación</th></tr></thead><tbody>{accionesCerradas.map(a => <tr key={a.id}><td>{a.descripcion}<small>{a.estado}</small></td><td>{a.responsable}<small>{a.verificadaPor} · {a.verificadaEn?.slice(0, 10)}</small></td><td>{a.evidencia || 'Sin evidencia vinculada'}<small>{a.comentarioVerificacion}</small></td></tr>)}</tbody></table></>}
      <h2>Fuentes y evidencias</h2>{d.kpis.map(i => {
        const detalle = detalleKPIAutomatico(i, d.datos)
        return <section key={i.id}><h3>{i.nombre}</h3><p>{detalle.formula}</p><p>{evidenciaIndicador(i, d.datos)}</p>
          <table><thead><tr><th>Período</th><th>Valor histórico</th></tr></thead><tbody>{evolucionIndicador(i, d.datos).map(v => <tr key={v.periodo}><td>{v.etiqueta}</td><td>{valorFicha(v.valor, i.unidad)}</td></tr>)}</tbody></table>
          {detalle.registros.length > 0 && <table><thead><tr><th>Fecha / referencia</th><th>Detalle</th><th>Resultado</th></tr></thead><tbody>{detalle.registros.map((r, n) => <tr key={n}><td>{r.fecha?.slice(0, 10)} · {r.referencia}</td><td>{r.detalle}</td><td>{r.resultado}</td></tr>)}</tbody></table>}
        </section>
      })}
    </>}
    <footer>Emitido: {d.emitido} · SGO Integral · Datos disponibles en esta sesión. Las evidencias se incluyen como referencias, no como archivos originales.</footer>
  </main>)
  return '<!doctype html><html lang="es"><head><meta charset="utf-8">' + renderToStaticMarkup(<title>{`Ficha_SGO_${d.area}_${d.pilar}_${completo ? 'Detallado' : 'Resumen'}`}</title>) + '<style>' +
    '@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;background:white;color:#172033;font:11px Arial,sans-serif;line-height:1.4}main{max-width:900px;margin:auto;padding:20px}header{border-bottom:3px solid #1769a4;color:#16476b}h1{font-size:22px}h2{font-size:15px;margin-top:20px;border-bottom:1px solid #cbd5e1}h3{font-size:12px}h1,h2,h3{break-after:avoid}p,td{overflow-wrap:anywhere;white-space:pre-wrap}table{width:100%;border-collapse:collapse;margin:8px 0;table-layout:fixed}thead{display:table-header-group}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}th{background:#eaf1f7}tr{break-inside:avoid}small{display:block;color:#475569}footer{margin-top:20px;border-top:1px solid #aaa;padding-top:8px;font-size:9px}.alerta{padding:10px;background:#fff7ed;border-left:4px solid #c45c10}.herramientas{padding:12px;text-align:center;background:#eaf1f7}.herramientas button{padding:12px;cursor:pointer} @media print{main{padding:0;max-width:none}.herramientas{display:none}}' +
    '</style></head><body><div class="herramientas"><button onclick="window.print()">Imprimir / Guardar como PDF</button><p>Elegí Guardar como PDF en el destino de impresión.</p></div>' + cuerpo + '</body></html>'
}

export function abrirInformeFicha(d: InformeFichaDatos, completo: boolean): boolean {
  const url = URL.createObjectURL(new Blob([crearInformeFicha(d, completo)], { type: 'text/html;charset=utf-8' }))
  const ventana = window.open(url, '_blank')
  if (ventana) ventana.opener = null
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  return Boolean(ventana)
}
