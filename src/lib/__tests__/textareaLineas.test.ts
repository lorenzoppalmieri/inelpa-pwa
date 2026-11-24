import { describe, expect, it } from 'vitest'
import { lineasLimpias, textoTrasCambioExterno } from '../../components/ui/TextareaLineas'

// ============================================================
// v2.66 — SGO › Retrabajos › Evidencias: no dejaba escribir espacios ni
// renglones (había que escribir en Word y pegar).
// ============================================================
describe('campo de una cosa por línea', () => {
  it('EL CASO: escribir "El " no borra el espacio que se acaba de tipear', () => {
    const escrito = 'El '
    const lista = lineasLimpias(escrito)          // lo que se guarda: ['El']
    expect(lista).toEqual(['El'])
    // La lista vuelve al campo: el texto en pantalla conserva el espacio.
    expect(textoTrasCambioExterno(escrito, lista.join('\n'))).toBe('El ')
  })

  it('un Enter al final se conserva mientras se escribe', () => {
    const escrito = 'Foto 1\n'
    expect(textoTrasCambioExterno(escrito, lineasLimpias(escrito).join('\n'))).toBe('Foto 1\n')
  })

  it('lo que se guarda va limpio: sin espacios sobrantes ni líneas vacías', () => {
    expect(lineasLimpias('  El encargado  \n\n Foto 2 \n')).toEqual(['El encargado', 'Foto 2'])
  })

  it('si otro equipo cambió la lista, se muestra la nueva', () => {
    expect(textoTrasCambioExterno('El ', 'Otra evidencia')).toBe('Otra evidencia')
  })
})
