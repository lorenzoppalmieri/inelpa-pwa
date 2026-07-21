import { useState, type KeyboardEvent } from 'react'

// ============================================================
// ENTRADA MÚLTIPLE tipo "chips/tags" (v1.30). El usuario escribe un valor,
// aprieta Enter o "Agregar", y queda en una lista visual. Repite para el resto.
// Se usa para cargar varios N° de serie en un mismo despacho/viaje.
// ============================================================
export default function ChipsInput({ valores, onChange, placeholder }: {
  valores: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [texto, setTexto] = useState('')

  function agregar() {
    // Permite pegar varios separados por coma/espacio/Enter.
    const nuevos = texto.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
    if (nuevos.length === 0) return
    const set = [...valores]
    for (const n of nuevos) if (!set.includes(n)) set.push(n)
    onChange(set)
    setTexto('')
  }
  function quitar(v: string) { onChange(valores.filter((x) => x !== v)) }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); agregar() }
    else if (e.key === 'Backspace' && !texto && valores.length) quitar(valores[valores.length - 1])
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={onKey}
          placeholder={placeholder ?? 'Escribí y Enter…'} style={{ flex: 1 }}
        />
        <button type="button" className="btn" onClick={agregar} disabled={!texto.trim()}>＋ Agregar</button>
      </div>
      {valores.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {valores.map((v) => (
            <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'var(--azul-claro)', color: '#fff', fontSize: '.85rem', fontWeight: 700 }}>
              {v}
              <button type="button" onClick={() => quitar(v)} title="Quitar"
                style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
