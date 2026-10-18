// Utilidades generales: formato de dinero, fechas y texto.
import type { Regla } from './types'

const fmt = new Intl.NumberFormat('es-CL')

export const fmtCLP = (n: number) => (n < 0 ? '-$' : '$') + fmt.format(Math.round(Math.abs(n || 0)))

export const fmtCorto = (n: number) => {
  const a = Math.abs(n || 0)
  const s = n < 0 ? '-' : ''
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + 'M'
  if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'k'
  return s + '$' + Math.round(a)
}

export const fmtPct = (x: number | null | undefined) => (x == null || !isFinite(x) ? '—' : Math.round(x * 100) + '%')

/** Fecha local en formato YYYY-MM-DD */
export const hoy = () => new Date().toLocaleDateString('sv-SE')
export const mesActual = () => hoy().slice(0, 7)

export const sumarMes = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const diasEnMes = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const nombreMes = (ym: string, corto = false) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  if (corto) return d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')
  return mayuscula(d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }))
}

export const fechaLarga = (f: string) => {
  const [y, m, d] = f.split('-').map(Number)
  return mayuscula(new Date(y, m - 1, d).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }))
}

export const fechaCorta = (f: string) => f.split('-').reverse().join('/')

export const uid = () => 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/** Minúsculas, sin tildes ni símbolos: "Líder Express #123" → "lider express 123" */
export const normalizar = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Normaliza un patrón de regla escrito por el usuario (minúsculas, sin tildes). */
export const normalizarPatron = (p: string) => p.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Categoría de la primera regla cuyo patrón calce con la descripción. */
export function categorizar(descripcion: string, reglas: Regla[]): string | null {
  const texto = normalizar(descripcion)
  for (const r of reglas || []) {
    if (!r.patron) continue
    try {
      if (new RegExp(r.patron, 'i').test(texto)) return r.categoria
    } catch {
      /* patrón inválido: se ignora */
    }
  }
  return null
}

export const sumar = (lista: { monto: number }[]) => lista.reduce((a, m) => a + (Number(m.monto) || 0), 0)

/** Solo dígitos → número ("$15.990" → 15990) */
export const soloDigitos = (s: string) => Number(String(s).replace(/\D/g, '')) || 0
