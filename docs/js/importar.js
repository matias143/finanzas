// Importar movimientos desde Excel (.xls/.xlsx) o CSV: exportaciones de Wallet (BudgetBakers)
// y cartolas de banco (columnas fecha / descripción / monto, o cargo / abono).
// Funciones puras salvo leerArchivo (que usa SheetJS, cargado solo cuando se necesita).
import { normalizar, categorizar } from './util.js';

// ---------- Lectura del archivo ----------

let cargaXLSX;
function cargarXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  cargaXLSX ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/xlsx.full.min.js';
    s.onload = () => res(window.XLSX);
    s.onerror = () => { cargaXLSX = null; rej(new Error('No se pudo cargar el lector de Excel (¿sin internet?)')); };
    document.head.appendChild(s);
  });
  return cargaXLSX;
}

/** Devuelve las filas de la hoja principal como arreglos de celdas. */
export async function leerArchivo(file) {
  const XLSX = await cargarXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const nombre = wb.SheetNames.find((n) => /registros|records|movimientos|transacciones/i.test(n)) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: '' });
}

// ---------- Interpretación ----------

const COLUMNAS = {
  fecha: /^(fecha|date|fecha (de )?(operacion|transaccion|contable|movimiento))$/,
  monto: /^(monto|amount|importe|valor|monto \$|monto clp)$/,
  cargo: /^(cargos?|debitos?|egresos?|retiros?|giros?|cargos \$|monto cargo)$/,
  abono: /^(abonos?|creditos?|ingresos?|depositos?|abonos \$|monto abono)$/,
  descripcion: /^(descripcion|detalle|glosa|note|nota|notas|concepto|movimiento|comercio|descripcion movimiento|detalle movimiento)$/,
  payee: /^(payee|beneficiario|destinatario)$/,
  categoria: /^(category|categoria)$/,
  cuenta: /^(account|cuenta)$/,
  tipo: /^(type|tipo)$/,
  transfer: /^(transfer|traspaso)$/,
};

function detectarEncabezado(filas) {
  for (let i = 0; i < Math.min(filas.length, 25); i++) {
    const cols = {};
    filas[i].forEach((c, j) => {
      const n = normalizar(c);
      for (const [k, re] of Object.entries(COLUMNAS)) if (cols[k] === undefined && re.test(n)) cols[k] = j;
    });
    if (cols.fecha !== undefined && (cols.monto !== undefined || cols.cargo !== undefined || cols.abono !== undefined)) {
      return { fila: i, cols };
    }
  }
  return null;
}

const dosDigitos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;

export function leerFecha(v) {
  if (v instanceof Date && !isNaN(v)) return { fecha: fechaLocal(v), ms: v.getTime() };
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Número de serie de Excel (días desde 1899-12-30)
    const d = new Date(Math.round((v - 25569) * 864e5));
    const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
    return { fecha: fechaLocal(local), ms: local.getTime() };
  }
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return { fecha: `${m[1]}-${dosDigitos(m[2])}-${dosDigitos(m[3])}`, ms: Date.UTC(m[1], m[2] - 1, m[3]) };
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return { fecha: `${y}-${dosDigitos(m[2])}-${dosDigitos(m[1])}`, ms: Date.UTC(y, m[2] - 1, m[1]) };
  }
  return null;
}

/** "$ -1.234,50" → -1234.5 ; 1234 → 1234 */
export function leerMonto(v) {
  if (typeof v === 'number') return v;
  let s = String(v || '').replace(/[$\s]|CLP/gi, '');
  if (!s) return 0;
  const negativo = /^-|^\(.*\)$|-$/.test(s);
  s = s.replace(/[()\-]/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/[.,](?=\d{3}(\D|$))/g, '');
  const n = Number(s) || 0;
  return negativo ? -n : n;
}

/**
 * Convierte las filas del archivo en movimientos "crudos".
 * Devuelve { formato, filas: [{fecha, ms, monto, tipo, descripcion, catOrigen, cuentaOrigen, cuentaDestino}], omitidas }
 */
export function interpretar(filas) {
  const enc = detectarEncabezado(filas);
  if (!enc) throw new Error('No encontré columnas de fecha y monto en el archivo.');
  const { cols } = enc;
  const celda = (f, k) => (cols[k] === undefined ? '' : f[cols[k]]);
  const esWallet = ['cuenta', 'categoria', 'tipo', 'transfer'].every((k) => cols[k] !== undefined);

  const crudos = [];
  let omitidas = 0;
  for (const f of filas.slice(enc.fila + 1)) {
    if (!f || f.every((c) => c === '' || c == null)) continue;
    const fe = leerFecha(celda(f, 'fecha'));
    let monto = cols.monto !== undefined ? leerMonto(celda(f, 'monto')) : 0;
    if (cols.monto === undefined) {
      const cargo = Math.abs(leerMonto(celda(f, 'cargo')));
      const abono = Math.abs(leerMonto(celda(f, 'abono')));
      monto = abono ? abono : -cargo;
    }
    if (!fe || !monto) { omitidas++; continue; }

    const tipoTexto = normalizar(celda(f, 'tipo'));
    let tipo = monto < 0 ? 'gasto' : 'ingreso';
    if (/gasto|expense|egreso|cargo/.test(tipoTexto)) tipo = 'gasto';
    else if (/ingreso|income|abono/.test(tipoTexto)) tipo = 'ingreso';

    const transfer = celda(f, 'transfer');
    const esTransfer = transfer === true || transfer === 1 || /^(1|true|si|verdadero)$/i.test(String(transfer)) || /^transfer$/i.test(String(celda(f, 'categoria')));
    const desc = String(celda(f, 'descripcion') || celda(f, 'payee') || '').trim();

    crudos.push({
      fecha: fe.fecha, ms: fe.ms, montoConSigno: monto, monto: Math.abs(monto), tipo,
      descripcion: desc, catOrigen: String(celda(f, 'categoria') || '').trim(),
      cuentaOrigen: String(celda(f, 'cuenta') || '').trim(), esTransfer,
    });
  }

  // Traspasos de Wallet: vienen en pares (sale de una cuenta y entra a otra). Se dejan en uno solo.
  const salida = [];
  const usados = new Set();
  crudos.forEach((r, i) => {
    if (!r.esTransfer) { salida.push(r); return; }
    if (usados.has(i)) return;
    usados.add(i);
    const j = crudos.findIndex((o, k) => !usados.has(k) && o.esTransfer && o.monto === r.monto
      && Math.sign(o.montoConSigno) !== Math.sign(r.montoConSigno) && Math.abs(o.ms - r.ms) < 15 * 60e3);
    let desde = r, hacia = null;
    if (j >= 0) {
      usados.add(j);
      const o = crudos[j];
      [desde, hacia] = r.montoConSigno < 0 ? [r, o] : [o, r];
    } else if (r.montoConSigno > 0) {
      desde = null; hacia = r;
    }
    salida.push({
      ...(desde || hacia), tipo: 'traspaso', catOrigen: '',
      cuentaOrigen: desde ? desde.cuentaOrigen : '', cuentaDestino: hacia ? hacia.cuentaOrigen : '',
      cuentaPropia: (desde || hacia).cuentaOrigen,
    });
  });

  return { formato: esWallet ? 'Wallet' : 'Cartola', tieneCategorias: cols.categoria !== undefined, tieneCuentas: cols.cuenta !== undefined, filas: salida, omitidas };
}

// ---------- Sugerencias de categorías y cuentas ----------

const MAPA_GASTOS = [
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
];
const MAPA_INGRESOS = [
  [/salario|sueldo|remuneracion|facturas|honorarios/, 'Sueldo'],
  [/transfer/, 'Transferencias recibidas'],
];

/** Sugerencia para una categoría de origen. Devuelve el nombre de una categoría existente o 'nueva:<nombre>'. */
export function sugerirCategoria(catOrigen, tipo, config) {
  const existentes = config.categorias.filter((c) => c.tipo === tipo).map((c) => c.nombre);
  const exacta = existentes.find((n) => normalizar(n) === normalizar(catOrigen));
  if (exacta) return exacta;
  const n = normalizar(catOrigen);
  for (const [re, cat] of tipo === 'ingreso' ? MAPA_INGRESOS : MAPA_GASTOS) {
    if (re.test(n) && existentes.includes(cat)) return cat;
  }
  if (tipo === 'ingreso') return existentes.find((x) => /otros/i.test(x)) || existentes[0];
  return catOrigen ? 'nueva:' + catOrigen : existentes.find((x) => /^otros$/i.test(x)) || existentes[0];
}

export function sugerirCuenta(nombre, cuentas) {
  const n = normalizar(nombre);
  const buscar = (re) => cuentas.find((c) => re.test(normalizar(c)));
  if (/santander/.test(n)) return buscar(/santander/) || nombre;
  if (/mercado/.test(n)) return buscar(/mercado/) || nombre;
  if (/vivienda|estado|ahorro|rut/.test(n)) return buscar(/estado|ahorro/) || nombre;
  if (/efectivo|cash/.test(n)) return buscar(/efectivo/) || nombre;
  return cuentas.find((c) => normalizar(c) === n) || nombre;
}

// ---------- Comparación con lo que ya existe ----------

const GENERICAS = /^(transferencias|transferencias recibidas|otros|otros ingresos|sin categoria|)$/;

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Asigna id estable a cada fila y la compara con los movimientos existentes.
 * estado: 'nuevo' | 'completa' (existe uno igual con categoría genérica → se le pone la categoría) | 'duplicado' | 'importado'
 */
export function comparar(filas, existentes, todosLosIds) {
  const vistos = new Map();
  const libres = existentes.filter((m) => !m.eliminado);
  const tomados = new Set();
  const diasEntre = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

  const conId = filas.map((r) => {
    const clave = [r.fecha, r.monto, r.tipo, r.descripcion, r.catOrigen, r.cuentaOrigen, r.cuentaDestino || ''].join('|');
    const n = (vistos.get(clave) || 0) + 1;
    vistos.set(clave, n);
    return { ...r, id: 'imp_' + hash(clave + '|' + n) };
  });

  // Emparejar con lo existente: mismo monto, ±2 días. Primero las parejas más cercanas en fecha.
  const parejas = [];
  conId.forEach((r, i) => {
    if (todosLosIds.has(r.id)) return;
    for (const m of libres) {
      if (m.monto !== r.monto) continue;
      if (!(m.tipo === r.tipo || m.tipo === 'traspaso' || r.tipo === 'traspaso')) continue;
      const d = diasEntre(m.fecha, r.fecha);
      if (d <= 2) parejas.push({ i, m, d: d + (m.tipo === r.tipo ? 0 : 0.5) });
    }
  });
  parejas.sort((a, b) => a.d - b.d);
  const pareja = new Map();
  for (const p of parejas) {
    if (pareja.has(p.i) || tomados.has(p.m.id)) continue;
    pareja.set(p.i, p.m);
    tomados.add(p.m.id);
  }

  return conId.map((r, i) => {
    const id = r.id;
    if (todosLosIds.has(id)) return { ...r, estado: 'importado' };
    const igual = pareja.get(i);
    if (!igual) return { ...r, id, estado: 'nuevo' };
    const completa = r.tipo === igual.tipo && r.tipo !== 'traspaso' && r.catOrigen && GENERICAS.test(normalizar(igual.categoria));
    return { ...r, id, estado: completa ? 'completa' : 'duplicado', existente: igual };
  });
}

/** Arma los movimientos finales a guardar según las elecciones del usuario. */
export function construir(filas, mapaCat, mapaCuenta, elegidas, reglas) {
  const nuevos = [];
  const cambios = [];
  for (const r of filas) {
    if (!elegidas.has(r.id)) continue;
    const cuenta = mapaCuenta[r.cuentaPropia || r.cuentaOrigen] || r.cuentaPropia || r.cuentaOrigen || '';
    let categoria;
    if (r.tipo === 'traspaso') categoria = 'Traspaso';
    else if (r.catOrigen) categoria = mapaCat[r.tipo + '|' + r.catOrigen];
    else categoria = categorizar(r.descripcion, reglas) || (r.tipo === 'ingreso' ? 'Otros ingresos' : 'Otros');

    if (r.estado === 'completa') {
      cambios.push({ id: r.existente.id, categoria });
      continue;
    }
    let descripcion = r.descripcion;
    if (r.tipo === 'traspaso') {
      const destino = r.cuentaDestino ? mapaCuenta[r.cuentaDestino] || r.cuentaDestino : '';
      descripcion = destino ? `Traspaso a ${destino}` : r.cuentaOrigen ? 'Traspaso' : `Traspaso desde otra cuenta`;
    }
    nuevos.push({
      id: r.id, fecha: r.fecha, monto: r.monto, tipo: r.tipo, categoria,
      descripcion: descripcion || categoria, cuenta: r.tipo === 'traspaso' && r.cuentaOrigen ? mapaCuenta[r.cuentaOrigen] || r.cuentaOrigen : cuenta,
      origen: 'importado', notas: '',
    });
  }
  return { nuevos, cambios };
}
