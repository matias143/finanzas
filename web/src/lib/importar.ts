// Importar movimientos desde Excel (.xls/.xlsx) o CSV: exportaciones de Wallet (BudgetBakers)
// y cartolas de banco (columnas fecha / descripción / monto, o cargo / abono).
// Todo es puro salvo leerArchivo, que carga el lector de Excel solo cuando se necesita.
import type { Config, Movimiento, Regla, Tipo } from './types'
import { categorizar, normalizar } from './util'

type Celda = string | number | boolean | Date | null | undefined
type Fila = Celda[]

// ---------- Lectura del archivo ----------

/** Devuelve las filas de la hoja principal como arreglos de celdas. */
export async function leerArchivo(file: File): Promise<Fila[]> {
  const buf = await file.arrayBuffer()
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const { leerPdf } = await import('./pdf')
    return leerPdf(buf)
  }
  const XLSX = await import('xlsx')
  let wb
  if (/\.(csv|txt|tsv)$/i.test(file.name) || /csv|text\/plain/.test(file.type)) {
    // CSV: se lee como texto sin convertir nada, para que "05-11-2026" y "10.990" se lean al estilo chileno.
    let texto = new TextDecoder('utf-8').decode(buf)
    if (texto.includes('\uFFFD')) texto = new TextDecoder('windows-1252').decode(buf) // archivos con tildes en formato antiguo
    wb = XLSX.read(texto, { type: 'string', raw: true })
  } else {
    wb = XLSX.read(buf, { type: 'array', cellDates: true })
  }
  const nombre = wb.SheetNames.find((n) => /registros|records|movimientos|transacciones/i.test(n)) || wb.SheetNames[0]
  return XLSX.utils.sheet_to_json<Fila>(wb.Sheets[nombre], { header: 1, raw: true, defval: '' })
}

// ---------- Interpretación ----------

// Primero se buscan nombres exactos; si no hay, nombres que contengan la palabra.
const COLUMNAS = {
  fecha: /^(fecha|date|dia|fecha (de )?(operacion|transaccion|contable|movimiento|compra|pago|liberacion|origen)|release date|transaction date)$/,
  monto: /^(monto|amount|importe|valor|monto \$|monto clp|monto total|total|transaction amount|transaction net amount|net amount|monto neto|monto bruto)$/,
  cargo: /^(cargos?|debitos?|egresos?|retiros?|giros?|cargos \$|monto cargo|cargos clp)$/,
  abono: /^(abonos?|creditos?|ingresos?|depositos?|abonos \$|monto abono|abonos clp)$/,
  descripcion: /^(descripcion|detalle|glosa|note|nota|notas|concepto|movimiento|comercio|descripcion movimiento|detalle movimiento|transaction type|tipo de operacion|descripcion operacion)$/,
  payee: /^(payee|beneficiario|destinatario|nombre del comercio|comercio|contraparte)$/,
  concepto: /^(tipo de transaccion|tipo de operacion|transaction type|concepto|tipo de movimiento detallado)$/,
  categoria: /^(category|categoria)$/,
  cuenta: /^(account|cuenta)$/,
  tipo: /^(type|tipo)$/,
  transfer: /^(transfer|traspaso)$/,
}
const PARECIDAS: Partial<Record<keyof typeof COLUMNAS, RegExp>> = {
  fecha: /fecha|date/,
  monto: /monto|amount|importe|valor/,
  cargo: /cargo|debito|egreso|retiro/,
  abono: /abono|credito|deposito/,
  descripcion: /descrip|detalle|glosa|concepto|comercio|operacion|referencia/,
}
// Columnas que nunca son la fecha o el monto del movimiento.
const NUNCA = /saldo|balance|venc|cuota|disponible|tasa|interes|n de|numero|documento|sucursal|id$|otros conceptos|comision|retencion|moneda|id de/

type Columna = keyof typeof COLUMNAS

function detectarEncabezado(filas: Fila[]) {
  for (let i = 0; i < Math.min(filas.length, 60); i++) {
    const cols: Partial<Record<Columna, number>> = {}
    const celdas = (filas[i] || []).map((c) => normalizar(c))
    celdas.forEach((n, j) => {
      for (const [k, re] of Object.entries(COLUMNAS) as [Columna, RegExp][]) if (cols[k] === undefined && re.test(n)) cols[k] = j
    })
    celdas.forEach((n, j) => {
      if (!n || NUNCA.test(n) || Object.values(cols).includes(j)) return
      for (const [k, re] of Object.entries(PARECIDAS) as [Columna, RegExp][]) if (cols[k] === undefined && re.test(n)) cols[k] = j
    })
    if (cols.fecha !== undefined && (cols.monto !== undefined || cols.cargo !== undefined || cols.abono !== undefined)) {
      return { fila: i, cols }
    }
  }
  return null
}

/** RUT sin puntos ni guion: "21.124.853-K" o "021124853K" → "21124853K" */
function soloRut(s: string) {
  const m = String(s).toUpperCase().replace(/[.\s-]/g, '').match(/^0*(\d{7,8}[\dK])$/)
  return m ? m[1] : ''
}

const PROCESADORES = /^(tuu|merpago|mercadopago|mp|sumup|payu|flow|getnet|klap|transbank|webpay|dlocal|paypal|pago facil)\s*\*\s*/i

/**
 * Limpia la descripción de una cartola:
 *  "0183487949 Transf a Marco Gonzalez"          → "Marco Gonzalez" (transferencia)
 *  "021124853K Transf a Mercado pago"            → "Mercado pago" + rut 21124853K
 *  "Compra Nacional VD TUU* Donde Chechito"       → "Donde Chechito"
 *  "Compra Nacional VD UNIMARC LOS NOTROS"        → "Unimarc Los Notros"
 */
export function limpiarGlosa(glosa: string) {
  let x = glosa.replace(/\s+/g, ' ').trim()
  let rut = ''
  const num = x.match(/^(\d{6,}[\dkK]?)\s+(.*)$/)
  if (num) {
    rut = soloRut(num[1])
    x = num[2]
  }
  let transferencia = false
  const tr = x.match(/^transf(?:erencia)?\.?\s*(?:a|de|desde|hacia|para)?\s+(.+)$/i)
  if (tr) {
    transferencia = true
    // "Transferencia recibida" (sin nombre) se deja tal cual
    if (!/^(recibida|enviada|realizada|exitosa)$/i.test(tr[1].trim())) x = tr[1]
  }
  x = x.replace(/^(compras?|pagos?|cargos?)(\s+recurrentes?)?(\s+(nacional|internacional|nac|int))?(\s+(vd|vc|cd|tc|td|debito|credito))?\s+/i, '')
  x = x.replace(PROCESADORES, '')
  if (x === x.toUpperCase() && /[A-Z]/.test(x)) x = x.toLowerCase().replace(/(^|[\s*\-./])([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase())
  return { descripcion: x.trim() || glosa, rut, transferencia }
}

/** Primeras filas con contenido, para mostrar en el error y saber qué trae el archivo. */
function muestra(filas: Fila[]) {
  return filas
    .filter((f) => f && f.some((c) => c !== '' && c != null))
    .slice(0, 3)
    .map((f) => f.filter((c) => c !== '' && c != null).map((c) => String(c).slice(0, 25)).join(' | '))
    .join(' ⏎ ')
}

const dos = (n: number | string) => String(n).padStart(2, '0')
const fechaLocal = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`

export function leerFecha(v: Celda, referencia?: Date): { fecha: string; ms: number } | null {
  if (v instanceof Date && !isNaN(v.getTime())) return { fecha: fechaLocal(v), ms: v.getTime() }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Número de serie de Excel (días desde 1899-12-30)
    const d = new Date(Math.round((v - 25569) * 864e5))
    const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())
    return { fecha: fechaLocal(local), ms: local.getTime() }
  }
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return { fecha: `${m[1]}-${dos(m[2])}-${dos(m[3])}`, ms: Date.UTC(+m[1], +m[2] - 1, +m[3]) }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3]
    return { fecha: `${y}-${dos(m[2])}-${dos(m[1])}`, ms: Date.UTC(+y, +m[2] - 1, +m[1]) }
  }
  // "15 nov 2026", "15-nov-26", "15 de noviembre de 2026"
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const n = normalizar(s)
  m = n.match(/^(\d{1,2}) (?:de )?([a-z]{3})[a-z]* (?:de )?(\d{2,4})/)
  if (m && MESES.includes(m[2] === 'set' ? 'sep' : m[2])) {
    const mes = MESES.indexOf(m[2] === 'set' ? 'sep' : m[2]) + 1
    const y = m[3].length === 2 ? '20' + m[3] : m[3]
    return { fecha: `${y}-${dos(mes)}-${dos(m[1])}`, ms: Date.UTC(+y, mes - 1, +m[1]) }
  }
  // "15/11" sin año: se usa el año del período de la cartola ("Hasta 30/10/2026") o el actual,
  // y el anterior si la fecha quedaría después de ese límite (cartolas que cruzan de diciembre a enero).
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})$/)
  if (m) {
    const ref = referencia || new Date()
    let y = ref.getFullYear()
    if (Date.UTC(y, +m[2] - 1, +m[1]) > ref.getTime() + 864e5) y--
    return { fecha: `${y}-${dos(m[2])}-${dos(m[1])}`, ms: Date.UTC(y, +m[2] - 1, +m[1]) }
  }
  return null
}

/** "$ -1.234,50" → -1234.5 ; 1234 → 1234 */
export function leerMonto(v: Celda): number {
  if (typeof v === 'number') return v
  let s = String(v ?? '').replace(/[$\s]|CLP/gi, '')
  if (!s) return 0
  const negativo = /^-|^\(.*\)$|-$/.test(s)
  s = s.replace(/[()-]/g, '')
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/[.,](?=\d{3}(\D|$))/g, '')
  const n = Number(s) || 0
  return negativo ? -n : n
}

export interface FilaImportada {
  fecha: string
  ms: number
  montoConSigno: number
  monto: number
  tipo: Tipo
  descripcion: string
  catOrigen: string
  cuentaOrigen: string
  cuentaDestino?: string
  cuentaPropia?: string
  esTransfer: boolean
  /** Categoría sugerida cuando el archivo no trae categorías (ej. "Transferencias"). */
  catSugerida?: string
}

export interface ArchivoInterpretado {
  formato: 'Wallet' | 'Cartola'
  filas: FilaImportada[]
  omitidas: number
}

/** Convierte las filas del archivo en movimientos "crudos". */
export function interpretar(filas: Fila[]): ArchivoInterpretado {
  const enc = detectarEncabezado(filas)
  if (!enc) throw new Error(`No encontré columnas de fecha y monto. El archivo empieza con: ${muestra(filas) || '(vacío)'}`)
  const { cols } = enc
  const celda = (f: Fila, k: Columna): Celda => (cols[k] === undefined ? '' : f[cols[k]!])
  const esWallet = (['cuenta', 'categoria', 'tipo', 'transfer'] as Columna[]).every((k) => cols[k] !== undefined)

  // Datos de la cabecera de una cartola: RUT del titular y fecha "Hasta" del período.
  const cabecera = filas.slice(0, enc.fila)
  let rutTitular = ''
  let referencia: Date | undefined
  for (const f of cabecera) {
    (f || []).forEach((c, j) => {
      const n = normalizar(c)
      if (/^rut\b/.test(n) && !rutTitular) rutTitular = soloRut(String(f[j + 1] ?? '')) || soloRut(String(c).replace(/rut/i, ''))
      const fe = leerFecha(c)
      if (fe && /\d{4}/.test(String(c)) && (!referencia || fe.ms > referencia.getTime())) referencia = new Date(fe.ms)
    })
  }

  // Banco de la cartola (para la cuenta de cada movimiento si el archivo no trae columna de cuenta).
  const textoCabecera = normalizar(cabecera.flat().join(' '))
  const banco = /santander/.test(textoCabecera)
    ? 'Santander'
    : /mercado ?pago/.test(textoCabecera)
      ? 'Mercado Pago'
      : /bancoestado|banco estado|cuenta rut/.test(textoCabecera)
        ? 'BancoEstado'
        : ''

  // Palabras del nombre del titular (vienen en la cabecera: "Sr(a) MANCILLA CARDENAS MATIAS EDUARDO").
  const palabrasCabecera = new Set(textoCabecera.split(' ').filter((w) => w.length >= 4))
  const mismoTitular = (nombre: string) => {
    const p = normalizar(nombre).split(' ').filter((w) => w.length >= 4)
    return p.length >= 2 && p.filter((w) => palabrasCabecera.has(w)).length >= 2
  }

  const crudos: FilaImportada[] = []
  let omitidas = 0
  for (const f of filas.slice(enc.fila + 1)) {
    if (!f || f.every((c) => c === '' || c == null)) continue
    const fe = leerFecha(celda(f, 'fecha'), referencia)
    let monto = cols.monto !== undefined ? leerMonto(celda(f, 'monto')) : 0
    if (cols.monto === undefined) {
      const cargo = Math.abs(leerMonto(celda(f, 'cargo')))
      const abono = Math.abs(leerMonto(celda(f, 'abono')))
      monto = abono ? abono : -cargo
    }
    if (!fe || !monto) {
      if (fe || monto) omitidas++ // las filas de pie de página (mensajes, resúmenes) no cuentan
      continue
    }

    const tipoTexto = normalizar(celda(f, 'tipo'))
    let tipo: Tipo = monto < 0 ? 'gasto' : 'ingreso'
    if (/gasto|expense|egreso|cargo/.test(tipoTexto)) tipo = 'gasto'
    else if (/ingreso|income|abono/.test(tipoTexto)) tipo = 'ingreso'

    const transfer = celda(f, 'transfer')
    const esTransfer =
      transfer === true || transfer === 1 || /^(1|true|si|verdadero)$/i.test(String(transfer)) || /^transfer$/i.test(String(celda(f, 'categoria')))
    const glosa = String(celda(f, 'descripcion') || celda(f, 'payee') || celda(f, 'concepto') || '').trim()
    const concepto = normalizar(celda(f, 'concepto'))
    const { descripcion: desc, rut, transferencia } = esWallet ? { descripcion: glosa, rut: '', transferencia: false } : limpiarGlosa(glosa)
    let catSugerida: string | undefined
    let esPropia = false
    const esTransf = transferencia || /transferencia/.test(concepto)
    if (esTransf) {
      // "021124853K Transf a Mercado pago": si el número es tu RUT, la plata va a una cuenta tuya.
      // En Mercado Pago no hay RUT: si el nombre de la contraparte es el del titular, también es tuya.
      esPropia = Boolean(rutTitular && rut && rut === rutTitular) || mismoTitular(desc)
      catSugerida = tipo === 'ingreso' ? 'Transferencias recibidas' : 'Transferencias'
    } else if (/rentabilidad|intereses|rendimiento/.test(concepto + ' ' + normalizar(glosa))) {
      catSugerida = 'Otros ingresos'
    }
    if (esPropia) tipo = 'traspaso'

    crudos.push({
      fecha: fe.fecha,
      ms: fe.ms,
      montoConSigno: monto,
      monto: Math.abs(monto),
      tipo,
      descripcion: esPropia ? (mismoTitular(desc) ? `Traspaso ${monto < 0 ? 'a' : 'desde'} cuenta propia` : `Traspaso ${monto < 0 ? 'a' : 'desde'} ${desc}`) : desc,
      catSugerida,
      catOrigen: String(celda(f, 'categoria') || '').trim(),
      cuentaOrigen: String(celda(f, 'cuenta') || '').trim() || banco,
      esTransfer,
    })
  }

  // Rentabilidad de Mercado Pago: llegan varios abonos chicos al día; se juntan en uno por día.
  const porDia = new Map<string, FilaImportada>()
  for (let i = crudos.length - 1; i >= 0; i--) {
    const r = crudos[i]
    if (r.tipo !== 'ingreso' || !/rentabilidad|rendimiento|intereses/i.test(r.descripcion)) continue
    const k = r.fecha + '|' + r.cuentaOrigen
    const previa = porDia.get(k)
    if (previa) {
      previa.monto += r.monto
      previa.montoConSigno += r.montoConSigno
      crudos.splice(i, 1)
    } else {
      r.descripcion = 'Rentabilidad' + (r.cuentaOrigen ? ' ' + r.cuentaOrigen : '')
      porDia.set(k, r)
    }
  }

  // Traspasos de Wallet: vienen en pares (sale de una cuenta y entra a otra). Se dejan en uno solo.
  const salida: FilaImportada[] = []
  const usados = new Set<number>()
  crudos.forEach((r, i) => {
    if (!r.esTransfer) {
      salida.push(r)
      return
    }
    if (usados.has(i)) return
    usados.add(i)
    const j = crudos.findIndex(
      (o, k) =>
        !usados.has(k) && o.esTransfer && o.monto === r.monto && Math.sign(o.montoConSigno) !== Math.sign(r.montoConSigno) && Math.abs(o.ms - r.ms) < 15 * 60e3,
    )
    let desde: FilaImportada | null = r
    let hacia: FilaImportada | null = null
    if (j >= 0) {
      usados.add(j)
      const o = crudos[j]
      ;[desde, hacia] = r.montoConSigno < 0 ? [r, o] : [o, r]
    } else if (r.montoConSigno > 0) {
      desde = null
      hacia = r
    }
    const base = (desde || hacia)!
    salida.push({
      ...base,
      tipo: 'traspaso',
      catOrigen: '',
      cuentaOrigen: desde ? desde.cuentaOrigen : '',
      cuentaDestino: hacia ? hacia.cuentaOrigen : '',
      cuentaPropia: base.cuentaOrigen,
    })
  })

  if (!salida.length) {
    // Se encontraron los títulos, pero ninguna fila se pudo leer: mostrar qué hay para poder ajustarlo.
    const nombres = (Object.entries(cols) as [Columna, number][]).map(([k, j]) => `${k}="${String(filas[enc.fila][j]).trim()}"`).join(', ')
    const ejemplo = filas.slice(enc.fila + 1).find((f) => f && f.some((c) => c !== '' && c != null))
    const ej = ejemplo ? ejemplo.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? '').slice(0, 20))).join(' | ') : '(sin filas)'
    throw new Error(`Leí los títulos (${nombres}) pero ninguna fila. Primera fila: ${ej}`)
  }
  return { formato: esWallet ? 'Wallet' : 'Cartola', filas: salida, omitidas }
}

// ---------- Sugerencias de categorías y cuentas ----------

const MAPA_GASTOS: [RegExp, string][] = [
  [/suscripcion|libros audio|software|apps|streaming/, 'Suscripciones'],
  [/comestible|supermercado|groceries|almacen/, 'Supermercado'],
  [/restaurante|comida rapida|bar cafe|alimentos y bebidas|comida|delivery/, 'Comida y delivery'],
  [/taxi|transporte|combustible|gasolina|estacionamiento|vehiculo|peaje|vuelo|viaje de negocios|alquiler de vehiculo/, 'Transporte'],
  [/energia|servicios publicos|telefono|celular|internet|tv|cuentas basicas/, 'Cuentas básicas'],
  [/hogar|jardin|alquiler|arriendo|hipoteca|mantenimiento|muebles|vivienda/, 'Hogar'],
  [/salud|doctor|farmacia|drogueria|medic/, 'Salud'],
  [/ropa|calzado/, 'Ropa'],
  [/educacion|desarrollo|cursos/, 'Educación'],
  [/cultura|eventos deportivos|entretencion|entretenimiento|hobbies|vacaciones|alcohol|tabaco|cine/, 'Entretención'],
  [/compras|electronica|accesorios|tienda/, 'Compras'],
  [/^transfer$|transferencia/, 'Transferencias'],
  [/faltante|otros|desconocido|sin categoria/, 'Otros'],
]
const MAPA_INGRESOS: [RegExp, string][] = [
  [/salario|sueldo|remuneracion|facturas|honorarios/, 'Sueldo'],
  [/transfer/, 'Transferencias recibidas'],
]

export const NUEVA = 'nueva:'

/** Sugerencia para una categoría de origen: una existente, o 'nueva:<nombre>' para crearla. */
export function sugerirCategoria(catOrigen: string, tipo: 'gasto' | 'ingreso', config: Config): string {
  const existentes = config.categorias.filter((c) => c.tipo === tipo).map((c) => c.nombre)
  const exacta = existentes.find((n) => normalizar(n) === normalizar(catOrigen))
  if (exacta) return exacta
  const n = normalizar(catOrigen)
  for (const [re, cat] of tipo === 'ingreso' ? MAPA_INGRESOS : MAPA_GASTOS) {
    if (re.test(n) && existentes.includes(cat)) return cat
  }
  if (tipo === 'ingreso') return existentes.find((x) => /otros/i.test(x)) || existentes[0]
  return catOrigen ? NUEVA + catOrigen : existentes.find((x) => /^otros$/i.test(x)) || existentes[0]
}

export function sugerirCuenta(nombre: string, cuentas: string[]): string {
  const n = normalizar(nombre)
  const buscar = (re: RegExp) => cuentas.find((c) => re.test(normalizar(c)))
  if (/santander/.test(n)) return buscar(/santander/) || nombre
  if (/mercado/.test(n)) return buscar(/mercado/) || nombre
  if (/vivienda|estado|ahorro|rut/.test(n)) return buscar(/estado|ahorro/) || nombre
  if (/efectivo|cash/.test(n)) return buscar(/efectivo/) || nombre
  return cuentas.find((c) => normalizar(c) === n) || nombre
}

// ---------- Comparación con lo que ya existe ----------

const GENERICAS = /^(transferencias|transferencias recibidas|otros|otros ingresos|sin categoria|)$/

function hash(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export type EstadoImport = 'nuevo' | 'completa' | 'duplicado' | 'importado'
export interface FilaComparada extends FilaImportada {
  id: string
  estado: EstadoImport
  existente?: Movimiento
}

/**
 * Asigna un id estable a cada fila y la compara con los movimientos existentes.
 * nuevo · completa (existe uno igual con categoría genérica → se le pone la del archivo) · duplicado · importado
 */
export function comparar(filas: FilaImportada[], existentes: Movimiento[], todosLosIds: Set<string>): FilaComparada[] {
  const vistos = new Map<string, number>()
  const libres = existentes.filter((m) => !m.eliminado)
  const diasEntre = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5

  const conId = filas.map((r) => {
    const clave = [r.fecha, r.monto, r.tipo, r.descripcion, r.catOrigen, r.cuentaOrigen, r.cuentaDestino || ''].join('|')
    const n = (vistos.get(clave) || 0) + 1
    vistos.set(clave, n)
    return { ...r, id: 'imp_' + hash(clave + '|' + n) }
  })

  // Emparejar con lo existente: mismo monto exacto, hasta 7 días de diferencia (los bancos a veces
  // registran la compra días después). Primero las parejas más cercanas en fecha.
  const parejas: { i: number; m: Movimiento; d: number }[] = []
  conId.forEach((r, i) => {
    if (todosLosIds.has(r.id)) return
    for (const m of libres) {
      if (m.monto !== r.monto) continue
      if (!(m.tipo === r.tipo || m.tipo === 'traspaso' || r.tipo === 'traspaso')) continue
      const d = diasEntre(m.fecha, r.fecha)
      if (d <= 7) parejas.push({ i, m, d: d + (m.tipo === r.tipo ? 0 : 0.5) })
    }
  })
  parejas.sort((a, b) => a.d - b.d)
  const pareja = new Map<number, Movimiento>()
  const tomados = new Set<string>()
  for (const p of parejas) {
    if (pareja.has(p.i) || tomados.has(p.m.id)) continue
    pareja.set(p.i, p.m)
    tomados.add(p.m.id)
  }

  return conId.map((r, i) => {
    if (todosLosIds.has(r.id)) return { ...r, estado: 'importado' as const }
    const igual = pareja.get(i)
    if (!igual) return { ...r, estado: 'nuevo' as const }
    const completa = r.tipo === igual.tipo && r.tipo !== 'traspaso' && Boolean(r.catOrigen) && GENERICAS.test(normalizar(igual.categoria))
    return { ...r, estado: completa ? ('completa' as const) : ('duplicado' as const), existente: igual }
  })
}

/** Arma los movimientos finales a guardar según las elecciones del usuario. */
export function construir(
  filas: FilaComparada[],
  mapaCat: Record<string, string>,
  mapaCuenta: Record<string, string>,
  elegidas: Set<string>,
  reglas: Regla[],
) {
  const nuevos: Partial<Movimiento>[] = []
  const cambios: Partial<Movimiento>[] = []
  const cuentaDe = (c?: string) => (c ? mapaCuenta[c] || c : '')
  for (const r of filas) {
    if (!elegidas.has(r.id)) continue
    let categoria: string
    if (r.tipo === 'traspaso') categoria = 'Traspaso'
    else if (r.catOrigen) categoria = mapaCat[r.tipo + '|' + r.catOrigen]
    else categoria = categorizar(r.descripcion, reglas) || r.catSugerida || (r.tipo === 'ingreso' ? 'Otros ingresos' : 'Otros')

    if (r.estado === 'completa' && r.existente) {
      cambios.push({ id: r.existente.id, categoria })
      continue
    }
    let descripcion = r.descripcion
    let cuenta = cuentaDe(r.cuentaPropia || r.cuentaOrigen)
    if (r.tipo === 'traspaso' && r.esTransfer) {
      const destino = cuentaDe(r.cuentaDestino)
      descripcion = destino ? `Traspaso a ${destino}` : r.cuentaOrigen ? 'Traspaso' : 'Traspaso desde otra cuenta'
      if (r.cuentaOrigen) cuenta = cuentaDe(r.cuentaOrigen)
    }
    nuevos.push({
      id: r.id,
      fecha: r.fecha,
      monto: r.monto,
      tipo: r.tipo,
      categoria,
      descripcion: descripcion || categoria,
      cuenta,
      origen: 'importado',
      notas: '',
    })
  }
  return { nuevos, cambios }
}
