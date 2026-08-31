import type { MantGama } from './types'

// ============================================================
// INSTRUCTIVO DE UNA GAMA PREVENTIVA (v1.66)
// Muestra el "cómo se hace" que el operario necesita: propósito,
// componente, pasos de ejecución, herramienta y consumible. Va plegado
// en un <details> para no alargar la lista; se abre de un toque.
// Solo aparece si la gama tiene los campos cargados (las viejas no).
// ============================================================

function Campo({ icono, label, valor }: { icono: string; label: string; valor?: string | null }) {
  if (!valor || !valor.trim()) return null
  return (
    <div className="mant-instr-campo">
      <div className="mant-instr-lbl">{icono} {label}</div>
      <div className="mant-instr-val">{valor}</div>
    </div>
  )
}

export default function InstructivoGama({ gama }: { gama: MantGama }) {
  const tiene = gama.proposito || gama.ejecucion || gama.herramienta || gama.consumible || gama.componente
  if (!tiene) return null
  return (
    <details className="mant-instr">
      <summary>📋 Cómo se hace</summary>
      <div className="mant-instr-body">
        <Campo icono="🎯" label="Propósito" valor={gama.proposito} />
        <Campo icono="⚙️" label="Componente" valor={gama.componente} />
        <Campo icono="🪜" label="Ejecución (paso a paso)" valor={gama.ejecucion} />
        <Campo icono="🔧" label="Herramienta" valor={gama.herramienta} />
        <Campo icono="🧴" label="Consumible" valor={gama.consumible} />
      </div>
    </details>
  )
}
