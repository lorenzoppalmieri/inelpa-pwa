import { useEffect, useState, type TextareaHTMLAttributes } from 'react'

// ============================================================
// TEXTAREA DE "UNA COSA POR LÍNEA" (v2.66)
//
// Bug (25/11/2026, SGO › Retrabajos › Evidencias): no se podía escribir un
// espacio ni pasar de línea; había que escribir en Word y pegar. El campo
// guardaba una LISTA y en cada tecla volvía a armar el texto desde la lista ya
// limpia (sin espacios al final y sin líneas vacías): el espacio que se acababa
// de tipear desaparecía al instante.
//
// Acá el texto que se escribe se guarda tal cual mientras se edita; hacia
// afuera se entrega la lista limpia. Si la lista cambia desde afuera (otro
// equipo guardó), el texto se actualiza.
// ============================================================

/** Texto -> lista: una entrada por línea, sin espacios sobrantes ni líneas vacías. */
export function lineasLimpias(texto: string): string[] {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
}

/**
 * Qué texto mostrar cuando la lista de afuera cambia. Si es lo mismo que lo
 * escrito (una vez limpio), se deja lo escrito con sus espacios y renglones;
 * si no, la cambió otro y manda la de afuera.
 */
export function textoTrasCambioExterno(actual: string, externo: string): string {
  return lineasLimpias(actual).join('\n') === externo ? actual : externo
}

export default function TextareaLineas({ valor, onCambio, ...resto }: {
  valor: string[]
  onCambio: (lineas: string[]) => void
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const [texto, setTexto] = useState(() => valor.join('\n'))
  const externo = valor.join('\n')
  useEffect(() => {
    // Solo se pisa lo escrito si la lista de afuera dice OTRA cosa que el texto
    // actual una vez limpio (o sea, la cambió otro). Si es lo mismo, se respetan
    // los espacios y renglones que la persona está escribiendo.
    setTexto((actual) => textoTrasCambioExterno(actual, externo))
  }, [externo])
  return (
    <textarea
      {...resto}
      value={texto}
      onChange={(e) => { setTexto(e.target.value); onCambio(lineasLimpias(e.target.value)) }}
    />
  )
}
