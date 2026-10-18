import { useEffect, useState } from 'react'

export const RUTAS = ['inicio', 'movimientos', 'presupuesto', 'ajustes'] as const
export type Ruta = (typeof RUTAS)[number]

const leer = (): Ruta => {
  const h = location.hash.slice(1) as Ruta
  return RUTAS.includes(h) ? h : 'inicio'
}

/** Navegación simple por #hash (funciona en GitHub Pages sin configurar nada). */
export function useRuta() {
  const [ruta, setRuta] = useState<Ruta>(leer)
  useEffect(() => {
    const f = () => setRuta(leer())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return ruta
}

export const ir = (r: Ruta) => {
  location.hash = r
}
