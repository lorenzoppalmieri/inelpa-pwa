import type { EscalaAguja, ZonaTolerancia } from '../../lib/ensayoPerdidas'
import { zonaDe } from '../../lib/ensayoPerdidas'

// ============================================================
// INDICADOR TIPO AGUJA (v1.82) — SVG puro, sin librerias.
//
// En este entorno `npm install` no corre, asi que nada de chart libs: el
// semicirculo, las zonas de color y la aguja se dibujan a mano con paths.
//
// La escala se expresa SIEMPRE en % del valor nominal (100 = nominal), asi el
// mismo componente sirve para perdidas, corriente de vacio y ucc%.
// ============================================================

const CX = 100, CY = 105, R = 82, GRUESO = 20

/** Punto del arco para un porcentaje dado dentro de la escala. */
function punto(pct: number, esc: EscalaAguja, radio: number) {
  const t = (pct - esc.min) / (esc.max - esc.min)          // 0..1
  const ang = Math.PI * (1 - Math.min(1, Math.max(0, t)))  // 180° -> 0°
  return { x: CX + radio * Math.cos(ang), y: CY - radio * Math.sin(ang) }
}

/** Sector del anillo entre dos porcentajes. */
function arco(desde: number, hasta: number, esc: EscalaAguja): string {
  const rExt = R, rInt = R - GRUESO
  const a1 = punto(desde, esc, rExt), a2 = punto(hasta, esc, rExt)
  const b2 = punto(hasta, esc, rInt), b1 = punto(desde, esc, rInt)
  return `M ${a1.x} ${a1.y} A ${rExt} ${rExt} 0 0 1 ${a2.x} ${a2.y}`
       + ` L ${b2.x} ${b2.y} A ${rInt} ${rInt} 0 0 0 ${b1.x} ${b1.y} Z`
}

const COLOR: Record<ZonaTolerancia, string> = {
  dentro: 'var(--estado-fin)', tolerancia: 'var(--naranja)',
  fuera: 'var(--rojo)', sin_dato: 'var(--texto-tenue)',
}

export default function Aguja({ titulo, valor, nominal, unidad, escala, decimales = 1 }: {
  titulo: string
  valor?: number          // valor calculado, en la unidad real
  nominal?: number        // valor garantizado, misma unidad
  unidad: string
  escala: EscalaAguja
  decimales?: number
}) {
  const pct = valor !== undefined && nominal ? (valor / nominal) * 100 : undefined
  const zona = zonaDe(pct, escala)
  const hayDato = pct !== undefined
  // La aguja se clampea a la escala para que nunca se dibuje fuera del arco,
  // pero el numero de abajo muestra el valor REAL (aunque se pase).
  const pctClamp = hayDato ? Math.min(escala.max, Math.max(escala.min, pct)) : escala.min
  const p = punto(pctClamp, escala, R - GRUESO - 6)

  // Zonas de color. La escala bilateral (ucc%) tiene el verde en el centro.
  const zonas = escala.bilateral
    ? [
        { d: arco(escala.min, 200 - escala.verdeHasta, escala), c: 'var(--rojo)' },
        { d: arco(200 - escala.verdeHasta, escala.verdeHasta, escala), c: 'var(--estado-fin)' },
        { d: arco(escala.verdeHasta, escala.max, escala), c: 'var(--rojo)' },
      ]
    : [
        { d: arco(escala.min, escala.verdeHasta, escala), c: 'var(--estado-fin)' },
        { d: arco(escala.verdeHasta, escala.amarilloHasta, escala), c: 'var(--naranja)' },
        { d: arco(escala.amarilloHasta, escala.max, escala), c: 'var(--rojo)' },
      ]

  return (
    <div className="aguja-box">
      <div className="aguja-tit">{titulo}</div>
      <svg viewBox="0 0 200 130" role="img" aria-label={`${titulo}: ${hayDato ? pct!.toFixed(0) + '% del nominal' : 'sin dato'}`}>
        {zonas.map((z, i) => <path key={i} d={z.d} fill={z.c} opacity={hayDato ? 0.85 : 0.25} />)}
        {/* Marca del 100% (valor garantizado) */}
        <line
          x1={punto(100, escala, R).x} y1={punto(100, escala, R).y}
          x2={punto(100, escala, R - GRUESO).x} y2={punto(100, escala, R - GRUESO).y}
          stroke="var(--texto)" strokeWidth={2}
        />
        {hayDato && (
          <>
            <line x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="var(--texto)" strokeWidth={3} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={5} fill="var(--texto)" />
          </>
        )}
        <text x={punto(escala.min, escala, R + 10).x} y={CY + 12} fontSize="10" fill="var(--texto-tenue)" textAnchor="start">{escala.min}%</text>
        <text x={punto(escala.max, escala, R + 10).x} y={CY + 12} fontSize="10" fill="var(--texto-tenue)" textAnchor="end">{escala.max}%</text>
      </svg>
      <div className="aguja-val" style={{ color: zona === 'fuera' ? 'var(--rojo)' : 'var(--texto)' }}>
        {valor === undefined ? '—' : `${valor.toFixed(decimales)} ${unidad}`}
      </div>
      <div className="aguja-pct" style={{ color: COLOR[zona], fontWeight: 800 }}>
        {hayDato ? `${pct!.toFixed(1)}% del garantizado` : 'sin valor garantizado'}
        {zona === 'fuera' && ' · FUERA DE NORMA'}
        {zona === 'tolerancia' && !escala.bilateral && ' · dentro de tolerancia'}
      </div>
      <div className="meta" style={{ fontSize: '.72rem' }}>
        Garantizado: {nominal === undefined ? '—' : `${nominal} ${unidad}`}
      </div>
    </div>
  )
}
