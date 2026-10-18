import { store } from './store'

export const PALETA = [
  '#e05d8a', '#5b8def', '#d98a1b', '#3fb39d', '#9b6bd6', '#c9563c', '#6d9c2e', '#2b9fc2', '#e0a458', '#4f6bd8',
  '#c75fb5', '#58a65c', '#d1495b', '#00a6a6', '#8c6d46', '#a37fe0', '#ef8354', '#2e86ab', '#b8b42d', '#f25f8b',
]

/** Un color de la paleta que todavía no use ninguna categoría. */
export function colorLibre(enUso: string[]) {
  const usados = new Set(enUso.map((c) => (c || '').toLowerCase()))
  return PALETA.find((c) => !usados.has(c)) || PALETA[usados.size % PALETA.length]
}

/** Si dos categorías comparten color, a la segunda se le asigna uno libre. */
export async function repararColores() {
  const vistos = new Set<string>()
  let cambio = false
  const todas = store.state.config.categorias
  const cats = todas.map((c) => {
    const k = (c.color || '').toLowerCase()
    if (!vistos.has(k)) {
      vistos.add(k)
      return c
    }
    const color = colorLibre([...vistos, ...todas.map((x) => x.color)])
    vistos.add(color)
    cambio = true
    return { ...c, color }
  })
  if (cambio) await store.guardarConfig({ categorias: cats })
}

export const colorDe = (cat: string) => store.categoria(cat)?.color || '#9aa3ad'
