import { useState } from 'react'
import { retirarControlProgramadoSGO } from '../../sync/syncEngine'
import { usuarioEsLorenzo } from '../../sgo/permisos'
import type { ControlProgramadoSGO } from '../../sgo/controles'

export default function RetirarControlButton({ control, usuario, disabled, onRetirado }: {
  control: ControlProgramadoSGO; usuario: string; disabled?: boolean; onRetirado?: () => void
}) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  if (!usuarioEsLorenzo(usuario) || !control.activo) return null

  async function retirar() {
    if (guardando || disabled) return
    const alcance = control.semana5S ? 'Se retira únicamente esta semana. La próxima semana se generará normalmente.' : 'También se detendrá su programación futura.'
    if (!window.confirm(`¿Eliminar de la agenda el control "${control.titulo}"?\n\nSe retirará de pendientes, vencidos y la matriz. ${alcance} No se marcará como realizado.\n\nLos informes, fotos y hallazgos anteriores se conservarán. Podrás reactivarlo desde Programación → Inactivos. Esta decisión quedará registrada al sincronizar.\n\n¿Confirmás la baja de esta programación?`)) return
    setGuardando(true)
    setError('')
    try {
      await retirarControlProgramadoSGO(control, usuario)
      onRetirado?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo retirar el control de la agenda.')
    } finally { setGuardando(false) }
  }

  return <div>
    <button className="btn btn-rojo" disabled={disabled || guardando} onClick={() => void retirar()}>{guardando ? 'Retirando…' : 'Eliminar de agenda'}</button>
    {error && <p className="meta" role="alert">{error}</p>}
  </div>
}
