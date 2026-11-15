// Saldo de cada cuenta: el saldo que indicaste en un momento + todo lo que pasó después.
import type { Config, Movimiento, SaldoBase } from './types'
import { destinoDe } from './cuentas'

/** Cuánto cambia el saldo de una cuenta con un movimiento. */
export function efecto(m: Movimiento, cuenta: string, cuentas: string[]): number {
  if (m.tipo === 'ingreso') return m.cuenta === cuenta ? m.monto : 0
  if (m.tipo === 'gasto') return m.cuenta === cuenta ? -m.monto : 0
  let e = 0
  if (m.cuenta === cuenta) e -= m.monto
  if (destinoDe(m, cuentas) === cuenta) e += m.monto
  return e
}

const despuesDe = (m: Movimiento, base: SaldoBase) => m.fecha > base.fecha || (m.fecha === base.fecha && (m.creado || '') > base.momento)

/** Saldo actual de una cuenta. Sin saldo indicado, es solo la suma de movimientos (conocido = false). */
export function saldoCuenta(movs: Movimiento[], cuenta: string, cfg: Config) {
  const base = cfg.saldos?.[cuenta]
  let saldo = base ? base.monto : 0
  for (const m of movs) {
    if (m.eliminado) continue
    if (base && !despuesDe(m, base)) continue
    saldo += efecto(m, cuenta, cfg.cuentas)
  }
  return { saldo, conocido: Boolean(base), desde: base?.fecha }
}

export function saldos(movs: Movimiento[], cfg: Config) {
  const cuentas = [...new Set([...cfg.cuentas, ...Object.keys(cfg.saldos || {})])]
  const lista = cuentas.map((cuenta) => ({ cuenta, ...saldoCuenta(movs, cuenta, cfg) }))
  return { lista, total: lista.filter((c) => c.conocido).reduce((a, c) => a + c.saldo, 0) }
}

/** Nueva base para que el saldo de la cuenta quede en `monto` ahora. */
export function baseParaAhora(monto: number): SaldoBase {
  const ahora = new Date()
  return { monto, fecha: ahora.toLocaleDateString('sv-SE'), momento: ahora.toISOString() }
}
