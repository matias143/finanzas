import type { Movimiento } from './types'
import { normalizar } from './util'

const CLAVES: [RegExp, RegExp][] = [
  [/estado|cuenta rut|ahorro/, /estado|ahorro/],
  [/mercado ?pago|mercadopago/, /mercado/],
  [/santander/, /santander/],
]

/**
 * Cuenta a la que llega un traspaso. Usa el campo destino; en movimientos antiguos sin ese dato,
 * lo deduce de la descripción ("Traspaso a Mercado pago (Banco Estado)" → la cuenta que se nombra al final).
 */
export function destinoDe(m: Movimiento, cuentas: string[]): string {
  if (m.tipo !== 'traspaso') return ''
  if (m.destino) return m.destino
  const d = normalizar(m.descripcion)
  if (!/\b(a|hacia)\b/.test(d) || /\bdesde\b/.test(d)) return ''
  let mejor = ''
  let pos = -1
  for (const c of cuentas) {
    const nc = normalizar(c)
    let i = d.lastIndexOf(nc)
    if (i < 0) {
      const clave = CLAVES.find(([, deCuenta]) => deCuenta.test(nc))
      if (clave) {
        const m2 = [...d.matchAll(new RegExp(clave[0].source, 'g'))].pop()
        i = m2 ? m2.index ?? -1 : -1
      }
    }
    if (i > pos && c !== m.cuenta) {
      pos = i
      mejor = c
    }
  }
  return mejor
}

/** ¿El movimiento toca esta cuenta? (sale de ella, o es un traspaso que llega a ella) */
export const tocaCuenta = (m: Movimiento, cuenta: string, cuentas: string[]) => m.cuenta === cuenta || destinoDe(m, cuentas) === cuenta
