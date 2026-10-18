// Cálculo de KPIs y series para los gráficos. Funciones puras (fáciles de probar).
// Los movimientos tipo "traspaso" (entre tus propias cuentas) no cuentan como gasto ni ingreso.
import type { Categoria, Movimiento } from './types'
import { diasEnMes, normalizar, sumar, sumarMes } from './util'

/** Categorías de gastos fijos: se pagan una vez al mes y no se proyectan día a día. */
const FIJAS = /^(hogar|cuentas b[aá]sicas|suscripciones|educaci[oó]n)$/i

const delMes = (movs: Movimiento[], ym: string) => movs.filter((m) => m.fecha && m.fecha.startsWith(ym))
const gastos = (l: Movimiento[]) => l.filter((m) => m.tipo === 'gasto')
const ingresos = (l: Movimiento[]) => l.filter((m) => m.tipo === 'ingreso')

export interface PorCategoria {
  categoria: string
  monto: number
  pct: number
}

export function porCategoria(lista: Movimiento[]): PorCategoria[] {
  const mapa = new Map<string, number>()
  for (const m of lista) {
    const c = m.categoria || 'Sin categoría'
    mapa.set(c, (mapa.get(c) || 0) + (Number(m.monto) || 0))
  }
  const total = [...mapa.values()].reduce((a, b) => a + b, 0)
  return [...mapa.entries()]
    .map(([categoria, monto]) => ({ categoria, monto, pct: total ? monto / total : 0 }))
    .sort((a, b) => b.monto - a.monto)
}

export function resumenMes(movs: Movimiento[], ym: string, hoyStr: string) {
  const lista = delMes(movs, ym)
  const g = sumar(gastos(lista))
  const i = sumar(ingresos(lista))
  const dim = diasEnMes(ym)
  const actual = hoyStr.startsWith(ym)
  const futuro = ym > hoyStr.slice(0, 7)
  const diasTranscurridos = actual ? Number(hoyStr.slice(8, 10)) : futuro ? 0 : dim
  const promDiario = diasTranscurridos ? g / diasTranscurridos : 0

  // Proyección: lo ya gastado + el ritmo de gastos variables por los días que faltan.
  const variable = sumar(gastos(lista).filter((m) => !FIJAS.test(m.categoria || '')))
  const proyeccion = actual && diasTranscurridos ? g + (variable / diasTranscurridos) * (dim - diasTranscurridos) : g

  // Comparación justa: en el mes en curso se compara contra el mes anterior hasta el mismo día.
  const diaCorte = actual ? diasTranscurridos : 31
  const anterior = sumar(gastos(delMes(movs, sumarMes(ym, -1))).filter((m) => Number(m.fecha.slice(8, 10)) <= diaCorte))

  return {
    ingresos: i,
    gastos: g,
    balance: i - g,
    tasaAhorro: i > 0 ? (i - g) / i : null,
    promDiario,
    proyeccion,
    esMesActual: actual,
    gastosMesAnterior: anterior,
    variacion: anterior > 0 ? (g - anterior) / anterior : null,
    cantidad: lista.length,
    cantidadGastos: gastos(lista).length,
    porCategoria: porCategoria(gastos(lista)),
  }
}

/** Ingresos y gastos de los últimos n meses (terminando en ym). */
export function serieMeses(movs: Movimiento[], ym: string, n = 6) {
  const out: { ym: string; ingresos: number; gastos: number }[] = []
  for (let k = n - 1; k >= 0; k--) {
    const mes = sumarMes(ym, -k)
    const l = delMes(movs, mes)
    out.push({ ym: mes, ingresos: sumar(ingresos(l)), gastos: sumar(gastos(l)) })
  }
  return out
}

/** Gasto acumulado día a día. Si es el mes en curso, se corta en el día de hoy. */
export function acumuladoDiario(movs: Movimiento[], ym: string, hoyStr: string): (number | null)[] {
  const dim = diasEnMes(ym)
  const porDia = new Array<number>(dim).fill(0)
  for (const m of gastos(delMes(movs, ym))) {
    const d = Number(m.fecha.slice(8, 10))
    if (d >= 1 && d <= dim) porDia[d - 1] += Number(m.monto) || 0
  }
  const hasta = hoyStr.startsWith(ym) ? Number(hoyStr.slice(8, 10)) : ym > hoyStr.slice(0, 7) ? 0 : dim
  let acc = 0
  return porDia.map((v, d) => {
    acc += v
    return d < hasta ? acc : null
  })
}

/** Gastos hormiga: compras pequeñas (≤ umbral) que suman. */
export function hormiga(movs: Movimiento[], ym: string, umbral: number) {
  const l = gastos(delMes(movs, ym)).filter((m) => m.monto > 0 && m.monto <= umbral)
  return { cantidad: l.length, total: sumar(l) }
}

/** Gastos que se repiten en ≥3 de los últimos 6 meses con monto parecido (suscripciones, cuentas). */
export function recurrentes(movs: Movimiento[], ym: string) {
  const desde = sumarMes(ym, -5)
  const grupos = new Map<string, Movimiento[]>()
  for (const m of movs) {
    if (m.tipo !== 'gasto' || !m.fecha) continue
    const mes = m.fecha.slice(0, 7)
    if (mes < desde || mes > ym) continue
    const clave = normalizar(m.descripcion).split(' ').slice(0, 3).join(' ')
    if (!clave) continue
    if (!grupos.has(clave)) grupos.set(clave, [])
    grupos.get(clave)!.push(m)
  }
  const out: { descripcion: string; categoria: string; monto: number; meses: number }[] = []
  for (const [, lista] of grupos) {
    const meses = new Set(lista.map((m) => m.fecha.slice(0, 7)))
    if (meses.size < 3) continue
    const montos = lista.map((m) => m.monto).sort((a, b) => a - b)
    const mediana = montos[Math.floor(montos.length / 2)]
    const parecidos = lista.filter((m) => Math.abs(m.monto - mediana) <= mediana * 0.2)
    const mesesParecidos = new Set(parecidos.map((m) => m.fecha.slice(0, 7)))
    if (mesesParecidos.size < 3) continue
    // Algo recurrente aparece ~1 vez al mes; si aparece muchas veces (ej. supermercado), no lo es.
    if (lista.length > meses.size * 1.5) continue
    const ultimo = lista.reduce((a, b) => (a.fecha > b.fecha ? a : b))
    out.push({ descripcion: ultimo.descripcion, categoria: ultimo.categoria, monto: mediana, meses: mesesParecidos.size })
  }
  return out.sort((a, b) => b.monto - a.monto)
}

/**
 * Ahorro: traspasos hacia tu cuenta de ahorro (descripción calza con el patrón, ej. "Traspaso a Banco Estado").
 * Se restan los que salen de ella: descripción con "desde" o registrados con la cuenta de ahorro como origen.
 */
export function ahorro(movs: Movimiento[], ym: string, patron: string) {
  let re: RegExp
  try {
    re = new RegExp(patron || 'estado|ahorro', 'i')
  } catch {
    return { mes: 0, total: 0 }
  }
  const signo = (m: Movimiento) => {
    if (m.tipo !== 'traspaso') return 0
    const desc = normalizar(m.descripcion)
    if (re.test(desc)) return /\bdesde\b/.test(desc) ? -1 : 1
    if (re.test(normalizar(m.cuenta))) return -1
    return 0
  }
  let mes = 0
  let total = 0
  for (const m of movs) {
    const s = signo(m)
    if (!s || !m.fecha) continue
    if (m.fecha.slice(0, 7) <= ym) total += s * m.monto
    if (m.fecha.startsWith(ym)) mes += s * m.monto
  }
  return { mes, total }
}

/** Avance de cada presupuesto del mes. */
export function presupuestos(movs: Movimiento[], ym: string, categorias: Categoria[]) {
  const gastado = new Map(porCategoria(gastos(delMes(movs, ym))).map((c) => [c.categoria, c.monto]))
  return categorias
    .filter((c) => c.tipo === 'gasto')
    .map((c) => {
      const g = gastado.get(c.nombre) || 0
      const limite = Number(c.presupuesto) || 0
      return { categoria: c.nombre, color: c.color, gastado: g, limite, pct: limite ? g / limite : null }
    })
}
