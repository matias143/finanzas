// Estado compartido de la interfaz: mes visible y apertura del editor de movimientos.
import { createContext, useContext } from 'react'
import type { Movimiento } from './types'

export interface UI {
  mes: string
  setMes: (ym: string) => void
  abrirEditor: (m?: Movimiento) => void
}

export const UIContext = createContext<UI | null>(null)

export function useUI() {
  const ui = useContext(UIContext)
  if (!ui) throw new Error('useUI fuera de UIContext')
  return ui
}
