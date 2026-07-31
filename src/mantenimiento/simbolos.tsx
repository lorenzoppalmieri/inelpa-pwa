import type { ReactNode } from 'react'

// ============================================================
// SIMBOLOS DEL EDITOR DE MAPA (v1.62) — iconos geometricos inline.
// Sin emojis ni librerias externas: cada simbolo es un dibujo SVG
// simple sobre viewBox 24x24, coloreado con currentColor (el pin le
// aplica el color del sector). El valor `id` se guarda en
// mant_activos.simbolo.
// ============================================================

export interface SimboloDef {
  id: string
  label: string
  dibujo: ReactNode           // contenido interno del <svg>
}

// Trazos comunes: sin relleno, linea redondeada; cada dibujo decide.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const SIMBOLOS: SimboloDef[] = [
  {
    id: 'robot', label: 'Robot',
    dibujo: (<g {...S}>
      <rect x="7" y="8" width="10" height="9" rx="2" />
      <line x1="12" y1="8" x2="12" y2="4.5" /><circle cx="12" cy="3.6" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="11.5" r=".9" fill="currentColor" stroke="none" /><circle cx="14" cy="11.5" r=".9" fill="currentColor" stroke="none" />
      <line x1="7" y1="11" x2="4" y2="9" /><line x1="17" y1="11" x2="20" y2="9" />
      <line x1="9.5" y1="20.5" x2="14.5" y2="20.5" /><line x1="10" y1="17" x2="9.5" y2="20.5" /><line x1="14" y1="17" x2="14.5" y2="20.5" />
    </g>),
  },
  {
    id: 'soldadora', label: 'Soldadora',
    dibujo: (<g {...S}>
      <rect x="3.5" y="9" width="10" height="8" rx="1.5" />
      <line x1="5.5" y1="12" x2="9" y2="12" /><line x1="5.5" y1="14.5" x2="9" y2="14.5" />
      <polyline points="13.5,11 17,8 20.5,6.5" />
      <line x1="17.8" y1="10.2" x2="19.2" y2="12.4" /><line x1="20" y1="9.4" x2="21.6" y2="10.6" />
      <line x1="7" y1="17" x2="7" y2="20" /><line x1="11" y1="17" x2="11" y2="20" />
    </g>),
  },
  {
    id: 'extractor', label: 'Extractor / ventilador',
    dibujo: (<g {...S}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12 L12 4.5 A7.5 7.5 0 0 1 17.5 7 Z" fill="currentColor" stroke="none" opacity=".85" />
      <path d="M12 12 L18.6 15.7 A7.5 7.5 0 0 1 12 19.4 Z" fill="currentColor" stroke="none" opacity=".85" transform="rotate(20 12 12)" />
      <path d="M12 12 L5.4 15.7 A7.5 7.5 0 0 1 6.5 7 Z" fill="currentColor" stroke="none" opacity=".85" transform="rotate(-15 12 12)" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </g>),
  },
  {
    id: 'bomba', label: 'Bomba',
    dibujo: (<g {...S}>
      <circle cx="11" cy="13" r="6.5" />
      <path d="M11 13 L15.5 10 M11 13 L11 18.2 M11 13 L6.8 11" />
      <line x1="14" y1="8.2" x2="17.5" y2="4.8" /><line x1="15" y1="4.8" x2="20" y2="4.8" /><line x1="20" y1="4.8" x2="20" y2="9" />
      <line x1="7.5" y1="19.2" x2="7.5" y2="21" /><line x1="14.5" y1="19.2" x2="14.5" y2="21" />
    </g>),
  },
  {
    id: 'calentador', label: 'Calentador',
    dibujo: (<g {...S}>
      <polyline points="4,17 6.5,10 9,17 11.5,10 14,17 16.5,10 19,17" />
      <line x1="4" y1="20.5" x2="20" y2="20.5" />
      <path d="M8 6.5 c0 -1.4 1.6 -1.4 1.6 -2.8 M12.5 6.5 c0 -1.4 1.6 -1.4 1.6 -2.8 M17 6.5 c0 -1.4 1.6 -1.4 1.6 -2.8" />
    </g>),
  },
  {
    id: 'aspersor', label: 'Aspersor',
    dibujo: (<g {...S}>
      <line x1="12" y1="4" x2="12" y2="9" /><line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="9" x2="5" y2="12" /><line x1="17" y1="9" x2="19" y2="12" /><line x1="12" y1="9" x2="12" y2="12.5" />
      <circle cx="5" cy="15" r=".9" fill="currentColor" stroke="none" /><circle cx="19" cy="15" r=".9" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="17.5" r=".9" fill="currentColor" stroke="none" /><circle cx="15.5" cy="17.5" r=".9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19.5" r=".9" fill="currentColor" stroke="none" />
    </g>),
  },
  {
    id: 'neumatico', label: 'Cilindro neumatico',
    dibujo: (<g {...S}>
      <rect x="3.5" y="9" width="11" height="6.5" rx="1.5" />
      <line x1="9" y1="9" x2="9" y2="15.5" />
      <line x1="14.5" y1="12.2" x2="20.5" y2="12.2" /><circle cx="20.5" cy="12.2" r="1" fill="currentColor" stroke="none" />
      <line x1="5.5" y1="9" x2="5.5" y2="5.5" /><line x1="5.5" y1="5.5" x2="8" y2="5.5" />
      <line x1="12.5" y1="15.5" x2="12.5" y2="18.5" />
    </g>),
  },
  {
    id: 'motor', label: 'Motor',
    dibujo: (<g {...S}>
      <rect x="4" y="8" width="12" height="9" rx="2" />
      <line x1="16" y1="12.5" x2="20.5" y2="12.5" />
      <line x1="6.5" y1="8" x2="6.5" y2="5.5" /><line x1="13.5" y1="8" x2="13.5" y2="5.5" />
      <text x="10" y="15" fontSize="7" fontWeight="800" fill="currentColor" stroke="none" textAnchor="middle">M</text>
      <line x1="6" y1="20" x2="14" y2="20" />
    </g>),
  },
  {
    id: 'aparejo', label: 'Aparejo / polipasto',
    dibujo: (<g {...S}>
      <line x1="3" y1="4.5" x2="21" y2="4.5" />
      <rect x="9.5" y="4.5" width="5" height="4" rx="1" />
      <line x1="12" y1="8.5" x2="12" y2="12" />
      <path d="M12 12 a3.2 3.2 0 1 1 -3.2 3.2 a2.2 2.2 0 0 1 2.2 -2.2" />
    </g>),
  },
  {
    id: 'mesa', label: 'Mesa basculante',
    dibujo: (<g {...S}>
      <line x1="4" y1="9" x2="18" y2="6.5" strokeWidth="2.6" />
      <line x1="8" y1="8.4" x2="8" y2="18" /><line x1="14" y1="7.4" x2="14" y2="18" />
      <line x1="5" y1="18" x2="17" y2="18" />
      <path d="M19.5 12 a5 5 0 0 0 -1 -4" /><polyline points="18.5,8.2 19.6,8 19.8,9.1" />
    </g>),
  },
  {
    id: 'prensa', label: 'Prensa',
    dibujo: (<g {...S}>
      <line x1="5" y1="4" x2="5" y2="20" /><line x1="19" y1="4" x2="19" y2="20" />
      <line x1="5" y1="4.5" x2="19" y2="4.5" /><line x1="5" y1="19.5" x2="19" y2="19.5" />
      <line x1="12" y1="4.5" x2="12" y2="9.5" /><rect x="8.5" y="9.5" width="7" height="3" rx=".6" fill="currentColor" stroke="none" />
      <line x1="7.5" y1="15.5" x2="16.5" y2="15.5" />
      <polyline points="10.2,13.2 12,14.6 13.8,13.2" />
    </g>),
  },
  {
    id: 'corte', label: 'Corte',
    dibujo: (<g {...S}>
      <circle cx="7" cy="7" r="2.6" /><circle cx="7" cy="17" r="2.6" />
      <line x1="9.3" y1="8.3" x2="20" y2="16.5" /><line x1="9.3" y1="15.7" x2="20" y2="7.5" />
    </g>),
  },
  {
    id: 'automatica', label: 'Maquina automatica',
    dibujo: (<g {...S}>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 3.8 v2.6 M12 17.6 v2.6 M3.8 12 h2.6 M17.6 12 h2.6 M6.2 6.2 l1.8 1.8 M16 16 l1.8 1.8 M17.8 6.2 L16 8 M8 16 l-1.8 1.8" strokeWidth="2.4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </g>),
  },
  {
    id: 'roladora', label: 'Roladora',
    dibujo: (<g {...S}>
      <circle cx="7.5" cy="15.5" r="3" /><circle cx="16.5" cy="15.5" r="3" /><circle cx="12" cy="8" r="3" />
      <path d="M5 12.5 C7 10 9 9.4 10 9.9 M19 12.5 C17 10 15 9.4 14 9.9" opacity=".7" />
    </g>),
  },
  {
    id: 'plegadora', label: 'Plegadora',
    dibujo: (<g {...S}>
      <polyline points="4,18 10,18 15,8" strokeWidth="2.4" />
      <line x1="13" y1="4" x2="20" y2="4" /><polyline points="17.5,6.5 20,4 17.5,1.8" transform="translate(0 2)" />
      <line x1="4" y1="21" x2="20" y2="21" opacity=".7" />
    </g>),
  },
  {
    id: 'guillotina', label: 'Guillotina',
    dibujo: (<g {...S}>
      <line x1="4" y1="18.5" x2="20" y2="18.5" strokeWidth="2.2" />
      <line x1="5" y1="6" x2="19" y2="12.5" strokeWidth="2.6" />
      <line x1="5" y1="6" x2="5" y2="18.5" opacity=".7" />
      <line x1="8" y1="18.5" x2="8" y2="21" /><line x1="16" y1="18.5" x2="16" y2="21" />
    </g>),
  },
  {
    id: 'sierra', label: 'Sierra circular',
    dibujo: (<g {...S}>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 4.6 v-2 M12 21.4 v-2 M4.6 12 h-2 M21.4 12 h-2 M6.8 6.8 l-1.5 -1.5 M18.7 18.7 l-1.5 -1.5 M17.2 6.8 l1.5 -1.5 M5.3 18.7 l1.5 -1.5" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </g>),
  },
  {
    id: 'rack', label: 'Rack / estanteria',
    dibujo: (<g {...S}>
      <rect x="4.5" y="4" width="15" height="16" rx="1" />
      <line x1="4.5" y1="9.3" x2="19.5" y2="9.3" /><line x1="4.5" y1="14.6" x2="19.5" y2="14.6" />
      <line x1="12" y1="4" x2="12" y2="9.3" /><line x1="8.2" y1="9.3" x2="8.2" y2="14.6" /><line x1="15.8" y1="9.3" x2="15.8" y2="14.6" /><line x1="12" y1="14.6" x2="12" y2="20" />
    </g>),
  },
  {
    id: 'laser', label: 'Corte laser',
    dibujo: (<g {...S}>
      <path d="M5 4 h6 l3 4 h-6 z" />
      <line x1="10" y1="8" x2="10" y2="13" strokeWidth="2.4" />
      <path d="M7.5 16 l1.6 2 M12.5 16 l-1.6 2 M10 16.5 v2.4" opacity=".85" />
      <line x1="4" y1="21" x2="20" y2="21" />
    </g>),
  },
  {
    id: 'grua', label: 'Puente grua',
    dibujo: (<g {...S}>
      <line x1="3" y1="5" x2="21" y2="5" strokeWidth="2.2" />
      <line x1="4.5" y1="5" x2="4.5" y2="20" opacity=".7" /><line x1="19.5" y1="5" x2="19.5" y2="20" opacity=".7" />
      <rect x="10" y="5" width="4.5" height="3.4" rx=".8" />
      <line x1="12.2" y1="8.4" x2="12.2" y2="12.5" />
      <path d="M12.2 12.5 a2.8 2.8 0 1 1 -2.8 2.8 a1.9 1.9 0 0 1 1.9 -1.9" />
    </g>),
  },
  {
    id: 'flejadora', label: 'Flejadora',
    dibujo: (<g {...S}>
      <rect x="6" y="8" width="12" height="10" rx="1" />
      <path d="M12 8 v10 M6 13 h12" strokeDasharray="2.4 2" />
      <path d="M6 8 C6 4.5 18 4.5 18 8" /><polyline points="18,8 16.6,6.4 19.4,6.4" fill="currentColor" stroke="none" />
    </g>),
  },
  {
    id: 'filtro', label: 'Filtro',
    dibujo: (<g {...S}>
      <path d="M4.5 5.5 h15 L13.8 12 v6 l-3.6 2 v-8 z" />
      <line x1="7" y1="8.2" x2="17" y2="8.2" opacity=".7" />
    </g>),
  },
  {
    id: 'maquina', label: 'Maquina (generico)',
    dibujo: (<g {...S}>
      <rect x="4" y="7" width="13" height="10" rx="1.5" />
      <circle cx="17.5" cy="17.5" r="2.6" /><path d="M17.5 13.9 v1.2 M17.5 19.9 v1.2 M13.9 17.5 h1.2 M19.9 17.5 h1.2" strokeWidth="1.6" />
      <line x1="7" y1="10.5" x2="14" y2="10.5" /><line x1="7" y1="13.5" x2="11" y2="13.5" />
    </g>),
  },
]

const IDS = new Set(SIMBOLOS.map((s) => s.id))

// Valor de mant_activos.simbolo sin catalogar -> generico (robustez ante seeds nuevos).
export function simboloValido(id: string | null | undefined): string {
  return id && IDS.has(id) ? id : 'maquina'
}

export function simboloLabel(id: string | null | undefined): string {
  return SIMBOLOS.find((s) => s.id === simboloValido(id))?.label ?? 'Maquina'
}

// Icono SVG listo para pin / bandeja / leyenda. El color lo hereda de currentColor.
export function SimboloActivo({ simbolo, size = 22 }: { simbolo: string | null | undefined; size?: number }) {
  const def = SIMBOLOS.find((s) => s.id === simboloValido(simbolo)) ?? SIMBOLOS[SIMBOLOS.length - 1]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      {def.dibujo}
    </svg>
  )
}
