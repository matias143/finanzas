/**
 * Backend de "Finanzas" en Google Apps Script (gratis, corre en tu cuenta de Google).
 *
 *  - Guarda los movimientos en una Google Sheet privada tuya.
 *  - Expone una API para que la app sincronice (doPost).
 *  - Lee automáticamente los correos de Santander y Mercado Pago cada 15 minutos.
 *  - Recibe notificaciones del celular (MacroDroid) para registrar compras con tarjeta.
 *
 * Instalación: ver README.md del repositorio. Resumen:
 *   1) Pega este archivo en script.google.com y ejecuta la función `configurar`.
 *   2) Implementar → Nueva implementación → Aplicación web (Ejecutar como: Yo, Acceso: Cualquier usuario).
 *   3) Copia la URL (/exec) y la clave que aparece en el registro, y pégalas en Ajustes de la app.
 */

// ============ Configuración editable ============
const CONFIG = {
  ZONA: 'America/Santiago',
  DIAS_ATRAS: 30,                    // cuántos días hacia atrás revisar correos
  ETIQUETA: 'finanzas-procesado',    // etiqueta de Gmail para marcar correos ya leídos
  MINUTOS_ENTRE_REVISIONES: 15,
  // Búsquedas de Gmail. Ajusta si tus correos no aparecen (prueba la búsqueda en Gmail primero).
  FUENTES: [
    {
      cuenta: 'Santander',
      query: 'from:santander.cl subject:(transferencia OR comprobante OR compra OR cargo OR pago)',
    },
    {
      cuenta: 'Mercado Pago',
      query: 'from:mercadopago.com subject:(transferencia OR transferiste OR recibiste OR enviaste OR pagaste OR "te enviaron" OR "dinero")',
    },
  ],
};

const COLUMNAS = ['id', 'fecha', 'monto', 'tipo', 'categoria', 'descripcion', 'cuenta', 'origen', 'notas', 'creado', 'actualizado', 'eliminado', 'sync'];
const HOJA_MOVS = 'Movimientos';
const HOJA_CONFIG = 'Config';
const HOJA_PENDIENTES = 'Sin leer';

// ============ Instalación ============

/** Ejecuta esta función una vez. Crea la planilla, la clave y el disparador de correos. */
function configurar() {
  const props = PropertiesService.getScriptProperties();
  let ss;
  if (props.getProperty('SHEET_ID')) {
    ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  } else {
    ss = SpreadsheetApp.create('Finanzas — datos');
    props.setProperty('SHEET_ID', ss.getId());
  }
  prepararHojas_(ss);

  if (!props.getProperty('TOKEN')) {
    props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8));
  }

  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'importarCorreos'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('importarCorreos').timeBased().everyMinutes(CONFIG.MINUTOS_ENTRE_REVISIONES).create();

  Logger.log('✅ Listo.');
  Logger.log('Planilla: ' + ss.getUrl());
  Logger.log('CLAVE (pégala en Ajustes de la app): ' + props.getProperty('TOKEN'));
  Logger.log('Ahora: Implementar → Nueva implementación → Aplicación web, y copia la URL que termina en /exec.');
}

/** Si alguna vez crees que alguien vio tu clave, ejecuta esto y pega la nueva en la app. */
function cambiarClave() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  Logger.log('Nueva clave: ' + props.getProperty('TOKEN'));
}

function prepararHojas_(ss) {
  let h = ss.getSheetByName(HOJA_MOVS);
  if (!h) {
    h = ss.getSheets()[0];
    h.setName(HOJA_MOVS);
  }
  if (h.getLastRow() === 0) {
    h.appendRow(COLUMNAS);
    h.setFrozenRows(1);
    h.getRange(1, 1, 1, COLUMNAS.length).setFontWeight('bold');
  }
  // Texto plano para que Sheets no convierta fechas ni ids.
  h.getRange('A:B').setNumberFormat('@');
  h.getRange('D:M').setNumberFormat('@');
  h.getRange('C:C').setNumberFormat('#,##0');

  if (!ss.getSheetByName(HOJA_CONFIG)) ss.insertSheet(HOJA_CONFIG).getRange('A1').setNumberFormat('@');
  if (!ss.getSheetByName(HOJA_PENDIENTES)) {
    const p = ss.insertSheet(HOJA_PENDIENTES);
    p.appendRow(['fecha', 'fuente', 'asunto', 'texto']);
    p.setFrozenRows(1);
  }
}

function libro_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Falta ejecutar la función configurar()');
  return SpreadsheetApp.openById(id);
}

// ============ API ============

function doGet() {
  return respuesta_({ ok: true, mensaje: 'API de Finanzas funcionando. La app usa POST.' });
}

function doPost(e) {
  try {
    const datos = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || datos.token !== token) return respuesta_({ error: 'Clave incorrecta' });

    switch (datos.accion) {
      case 'ping':
        return respuesta_({ ok: true, horaServidor: new Date().toISOString() });
      case 'sync':
        return respuesta_(sincronizar_(datos));
      case 'notif':
        return respuesta_(registrarNotificacion_(datos));
      default:
        return respuesta_({ error: 'Acción desconocida: ' + datos.accion });
    }
  } catch (err) {
    return respuesta_({ error: String(err && err.message || err) });
  }
}

function respuesta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sincronizar_(datos) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = libro_();
    const ahora = new Date().toISOString();
    if (Array.isArray(datos.movimientos) && datos.movimientos.length) guardarMovimientos_(ss, datos.movimientos, ahora);
    const config = datos.config ? guardarConfig_(ss, datos.config) : leerConfig_(ss);
    const desde = datos.desde || '';
    const movs = leerMovimientos_(ss).filter(function (m) { return !desde || (m.sync || '') > desde; });
    return { ok: true, horaServidor: ahora, movimientos: movs, config: config };
  } finally {
    lock.releaseLock();
  }
}

// ============ Planilla ============

function aTexto_(v) {
  if (v instanceof Date) return v.toISOString();
  return v === null || v === undefined ? '' : String(v);
}

function leerMovimientos_(ss) {
  const h = ss.getSheetByName(HOJA_MOVS);
  const n = h.getLastRow();
  if (n < 2) return [];
  const valores = h.getRange(2, 1, n - 1, COLUMNAS.length).getValues();
  return valores
    .filter(function (fila) { return fila[0]; })
    .map(function (fila) {
      const m = {};
      COLUMNAS.forEach(function (c, i) { m[c] = fila[i]; });
      if (m.fecha instanceof Date) m.fecha = Utilities.formatDate(m.fecha, CONFIG.ZONA, 'yyyy-MM-dd');
      ['id', 'fecha', 'tipo', 'categoria', 'descripcion', 'cuenta', 'origen', 'notas', 'creado', 'actualizado', 'sync'].forEach(function (c) { m[c] = aTexto_(m[c]); });
      m.monto = Number(m.monto) || 0;
      m.eliminado = m.eliminado === true || m.eliminado === 'true' || m.eliminado === 'TRUE';
      return m;
    });
}

function filaDe_(m, sync) {
  return COLUMNAS.map(function (c) {
    if (c === 'sync') return sync;
    if (c === 'monto') return Number(m.monto) || 0;
    if (c === 'eliminado') return m.eliminado ? 'true' : 'false';
    return m[c] === undefined || m[c] === null ? '' : String(m[c]);
  });
}

/** Inserta o actualiza (gana la versión con `actualizado` más reciente). Devuelve cuántos cambió. */
function guardarMovimientos_(ss, lista, ahora) {
  const h = ss.getSheetByName(HOJA_MOVS);
  const n = h.getLastRow();
  const ids = n > 1 ? h.getRange(2, 1, n - 1, 1).getValues().map(function (f) { return String(f[0]); }) : [];
  const actualizados = n > 1 ? h.getRange(2, COLUMNAS.indexOf('actualizado') + 1, n - 1, 1).getValues().map(function (f) { return aTexto_(f[0]); }) : [];
  const indice = {};
  ids.forEach(function (id, i) { indice[id] = i; });

  const nuevas = [];
  let cambios = 0;
  lista.forEach(function (m) {
    if (!m || !m.id) return;
    const i = indice[m.id];
    if (i === undefined) {
      if (nuevas.some(function (f) { return f[0] === m.id; })) return;
      nuevas.push(filaDe_(m, ahora));
      cambios++;
    } else if ((m.actualizado || '') > (actualizados[i] || '')) {
      h.getRange(i + 2, 1, 1, COLUMNAS.length).setValues([filaDe_(m, ahora)]);
      cambios++;
    }
  });
  if (nuevas.length) h.getRange(h.getLastRow() + 1, 1, nuevas.length, COLUMNAS.length).setValues(nuevas);
  return cambios;
}

function leerConfig_(ss) {
  const v = ss.getSheetByName(HOJA_CONFIG).getRange('A1').getValue();
  if (!v) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}

function guardarConfig_(ss, config) {
  const actual = leerConfig_(ss);
  if (actual && (actual.actualizado || '') > (config.actualizado || '')) return actual;
  ss.getSheetByName(HOJA_CONFIG).getRange('A1').setValue(JSON.stringify(config));
  return config;
}

function idExiste_(ss, id) {
  const h = ss.getSheetByName(HOJA_MOVS);
  if (h.getLastRow() < 2) return false;
  return h.getRange(2, 1, h.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext() !== null;
}

function anotarSinLeer_(ss, fuente, asunto, texto) {
  ss.getSheetByName(HOJA_PENDIENTES).appendRow([
    Utilities.formatDate(new Date(), CONFIG.ZONA, 'yyyy-MM-dd HH:mm'), fuente, asunto, String(texto).slice(0, 1500),
  ]);
}

// ============ Lectura de texto (correos y notificaciones) ============

/**
 * Interpreta un texto bancario. Devuelve {monto, tipo, descripcion, fecha?} o null si no es un movimiento.
 * tipo: 'gasto' | 'ingreso' | 'traspaso' (entre tus propias cuentas).
 */
function interpretarTexto(texto, asunto) {
  const crudo = String((asunto || '') + '\n' + (texto || '')).replace(/ /g, ' ');
  const t = crudo.replace(/[ \t]+/g, ' ');

  const monto = extraerMonto_(t);
  if (!monto) return null;

  // Formatos conocidos de Santander (comprobantes) primero.
  const lineas = crudo.split(/[\n\t\r]+/).map(function (l) { return l.trim(); }).filter(Boolean);
  const fecha = extraerFecha_(t);
  const santander = interpretarSantander_(t, lineas);
  if (santander) {
    santander.monto = monto;
    if (fecha) santander.fecha = fecha;
    return santander;
  }

  const esIngreso = /(recibiste|te (transfiri[oó]|envi[oó]|deposit[oó])|has recibido|transferencia recibida|ingreso de dinero|te lleg[oó]|dep[oó]sito recibido)/i.test(t);
  const esGasto = /(transferiste|enviaste|has (transferido|enviado|realizado)|transferencia (realizada|enviada|a terceros|exitosa|de fondos)|pagaste|compra|cargo|realizaste|pago (realizado|aprobado|exitoso)|giro)/i.test(t);
  if (!esIngreso && !esGasto) return null;
  const tipo = esIngreso && !/(transferiste|enviaste|pagaste)/i.test(t) ? 'ingreso' : 'gasto';

  const r = { monto: monto, tipo: tipo, descripcion: extraerContraparte_(t, tipo) || limpiar_(asunto) || 'Movimiento' };
  if (fecha) r.fecha = fecha;
  return r;
}

/** Comprobantes de Santander: "Transferencia de fondos" y "Pago de Cuentas". */
function interpretarSantander_(t, lineas) {
  const valorDe = function (desde, hasta, etiqueta) {
    for (let i = desde; i < hasta - 1; i++) if (etiqueta.test(lineas[i])) return lineas[i + 1];
    return '';
  };
  const indice = function (re, desde) {
    for (let i = desde || 0; i < lineas.length; i++) if (re.test(lineas[i])) return i;
    return -1;
  };

  // Transferencia: bloques "Datos de origen" y "Datos de destino".
  const iOrigen = indice(/^datos de origen/i);
  const iDestino = indice(/^datos de destino/i);
  if (/transferencia/i.test(t) && iOrigen >= 0 && iDestino > iOrigen) {
    const nombreOrigen = limpiar_(valorDe(iOrigen, iDestino, /^nombre$/i));
    const nombreDestino = limpiar_(valorDe(iDestino, lineas.length, /^nombre$/i));
    const yo = (t.match(/Estimad[oa]\s*\(?\s*a?\s*\)?\s*([^:,\n]+)/i) || [])[1] || '';
    const origenSoyYo = esMiNombre_(nombreOrigen, yo);
    const destinoSoyYo = esMiNombre_(nombreDestino, yo);
    if (origenSoyYo && destinoSoyYo) return { tipo: 'traspaso', descripcion: 'Traspaso a ' + (valorDe(iDestino, lineas.length, /^banco$/i) || 'cuenta propia') };
    if (destinoSoyYo) return { tipo: 'ingreso', descripcion: nombreOrigen || 'Transferencia recibida' };
    return { tipo: 'gasto', descripcion: nombreDestino || 'Transferencia' };
  }

  // Pago de cuentas: tabla "Compañía | N° Cliente | Fecha de venc. | Monto".
  if (/pago de cuentas|monto pagado/i.test(t)) {
    const iComp = indice(/^compa[ñn][ií]a$/i);
    let empresa = '';
    if (iComp >= 0) {
      const iMonto = indice(/^monto$/i, iComp);
      if (iMonto >= 0) empresa = lineas[iMonto + 1] || '';
    }
    return { tipo: 'gasto', descripcion: limpiar_(empresa) || 'Pago de cuentas' };
  }
  return null;
}

/** ¿El nombre corresponde a quien recibe el correo ("Estimado(a) ...")? */
function esMiNombre_(nombre, estimado) {
  const n = normalizar_(nombre).split(' ');
  const yo = normalizar_(estimado).split(' ').filter(function (p) { return p.length >= 3; });
  if (!yo.length || !n[0]) return false;
  const coinciden = yo.filter(function (p) { return n.indexOf(p) >= 0; }).length;
  return yo.length === 1 ? coinciden === 1 : coinciden >= 2;
}

/** Fecha escrita en el correo ("realizada el 13/10/2026", "con fecha 09-09-2026") → "2026-10-13". */
function extraerFecha_(t) {
  const m = t.match(/(?:realizad[ao] el|con fecha|fecha:?)\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/i);
  if (!m) return '';
  return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

function extraerMonto_(t) {
  // Prioriza montos junto a la palabra "monto"/"total"; si no, el primero con signo $.
  const etiquetado = t.match(/(?:monto|total|importe|valor)[^$\d]{0,30}\$\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)(?:,[0-9]{1,2})?/i);
  const simple = t.match(/\$\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)(?:,[0-9]{1,2})?/);
  const m = etiquetado || simple;
  if (!m) return 0;
  return Number(m[1].replace(/\./g, '')) || 0;
}

function extraerContraparte_(t, tipo) {
  const patrones = tipo === 'gasto'
    ? [
        /(?:nombre del destinatario|destinatario|nombre beneficiario|beneficiario|para)\s*:\s*([^\n\r]{2,60})/i,
        /(?:pagaste|compraste|compra|cargo|transferiste|enviaste)[^\n]*?\s(?:a|en)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ0-9][^\n\r.,$]{1,50}?)(?=\s+con\s|\s+el\s+d[ií]a|\s+por\s|[.,\n\r]|$)/i,
        /(?:comercio|establecimiento)\s*:?\s*([^\n\r]{2,60})/i,
      ]
    : [
        /(?:nombre del (?:origen|remitente|ordenante)|remitente|origen|de parte de)\s*:\s*([^\n\r]{2,60})/i,
        /([A-ZÁÉÍÓÚÑ][^\n\r.,$]{1,50}?)\s+te (?:transfiri[oó]|envi[oó]|deposit[oó])/i,
        /recibiste[^\n]*?\sde\s+([A-ZÁÉÍÓÚÑa-záéíóúñ][^\n\r.,$]{1,50})/i,
      ];
  for (let i = 0; i < patrones.length; i++) {
    const m = t.match(patrones[i]);
    if (m) {
      const d = limpiar_(m[1]);
      if (d && !/^\$|^\d+$/.test(d)) return d;
    }
  }
  return '';
}

function limpiar_(s) {
  return String(s || '').replace(/\s+/g, ' ').replace(/^[\s:,-]+|[\s:,.-]+$/g, '').slice(0, 60);
}

function normalizar_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function categorizar_(descripcion, tipo, config) {
  if (tipo === 'traspaso') return 'Traspaso';
  const reglas = (config && config.reglas) || [];
  const texto = normalizar_(descripcion);
  for (let i = 0; i < reglas.length; i++) {
    try {
      if (reglas[i].patron && new RegExp(reglas[i].patron, 'i').test(texto)) {
        const cat = (config.categorias || []).filter(function (c) { return c.nombre === reglas[i].categoria; })[0];
        if (!cat || cat.tipo === tipo) return reglas[i].categoria;
      }
    } catch (e) { /* patrón inválido */ }
  }
  return tipo === 'ingreso' ? 'Transferencias recibidas' : 'Transferencias';
}

function construirMovimiento_(id, datos, cuenta, origen, fecha, config) {
  const ahora = new Date().toISOString();
  return {
    id: id,
    fecha: datos.fecha || Utilities.formatDate(fecha, CONFIG.ZONA, 'yyyy-MM-dd'),
    monto: datos.monto,
    tipo: datos.tipo,
    categoria: categorizar_(datos.descripcion, datos.tipo, config),
    descripcion: datos.descripcion,
    cuenta: cuenta,
    origen: origen,
    notas: '',
    creado: ahora,
    actualizado: ahora,
    eliminado: false,
  };
}

// ============ Correos (se ejecuta solo cada 15 min) ============

function importarCorreos() {
  const ss = libro_();
  const config = leerConfig_(ss);
  const etiqueta = GmailApp.getUserLabelByName(CONFIG.ETIQUETA) || GmailApp.createLabel(CONFIG.ETIQUETA);
  const limite = new Date(Date.now() - CONFIG.DIAS_ATRAS * 864e5);
  const nuevos = [];

  CONFIG.FUENTES.forEach(function (f) {
    const hilos = GmailApp.search(f.query + ' newer_than:' + CONFIG.DIAS_ATRAS + 'd -label:' + CONFIG.ETIQUETA, 0, 50);
    hilos.forEach(function (hilo) {
      hilo.getMessages().forEach(function (msg) {
        if (msg.getDate() < limite) return;
        const id = 'gm_' + msg.getId();
        if (idExiste_(ss, id) || nuevos.some(function (n) { return n.id === id; })) return;
        const cuerpo = msg.getPlainBody();
        const datos = interpretarTexto(cuerpo, msg.getSubject());
        if (datos) nuevos.push(construirMovimiento_(id, datos, f.cuenta, 'gmail', msg.getDate(), config));
        else anotarSinLeer_(ss, f.cuenta + ' (correo)', msg.getSubject(), cuerpo);
      });
      hilo.addLabel(etiqueta);
    });
  });

  if (nuevos.length) {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { guardarMovimientos_(ss, nuevos, new Date().toISOString()); } finally { lock.releaseLock(); }
  }
  Logger.log(nuevos.length + ' movimientos nuevos desde correos.');
}

/** Para ajustar la lectura: muestra en el registro qué entiende de tus últimos correos, SIN guardar nada. */
function probarCorreos() {
  CONFIG.FUENTES.forEach(function (f) {
    const hilos = GmailApp.search(f.query + ' newer_than:' + CONFIG.DIAS_ATRAS + 'd', 0, 5);
    Logger.log('── ' + f.cuenta + ': ' + hilos.length + ' hilos encontrados');
    hilos.forEach(function (h) {
      const msg = h.getMessages()[h.getMessageCount() - 1];
      Logger.log('Asunto: ' + msg.getSubject());
      Logger.log('Resultado: ' + JSON.stringify(interpretarTexto(msg.getPlainBody(), msg.getSubject())));
    });
  });
}

/**
 * Vuelve a leer los correos de los últimos DIAS_ATRAS días y CORRIGE los movimientos que ya se habían
 * importado desde correos (útil después de mejorar el lector). No toca lo que agregaste a mano
 * ni lo que eliminaste en la app.
 */
function reprocesarCorreos() {
  const ss = libro_();
  const config = leerConfig_(ss);
  const existentes = {};
  leerMovimientos_(ss).forEach(function (m) { existentes[m.id] = m; });
  const ahora = new Date().toISOString();
  const cambios = [];
  let corregidos = 0, nuevos = 0, quitados = 0;

  CONFIG.FUENTES.forEach(function (f) {
    GmailApp.search(f.query + ' newer_than:' + CONFIG.DIAS_ATRAS + 'd', 0, 100).forEach(function (hilo) {
      hilo.getMessages().forEach(function (msg) {
        const id = 'gm_' + msg.getId();
        const previo = existentes[id];
        if (previo && previo.eliminado) return;
        const datos = interpretarTexto(msg.getPlainBody(), msg.getSubject());
        if (!datos) {
          if (previo) { previo.eliminado = true; previo.actualizado = ahora; cambios.push(previo); quitados++; }
          return;
        }
        const m = construirMovimiento_(id, datos, f.cuenta, 'gmail', msg.getDate(), config);
        if (previo) { m.creado = previo.creado || m.creado; m.notas = previo.notas || ''; corregidos++; } else { nuevos++; }
        cambios.push(m);
      });
    });
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { if (cambios.length) guardarMovimientos_(ss, cambios, ahora); } finally { lock.releaseLock(); }
  Logger.log('Corregidos: ' + corregidos + ' · Nuevos: ' + nuevos + ' · Quitados: ' + quitados);
}

// ============ Notificaciones del celular (MacroDroid) ============

function registrarNotificacion_(datos) {
  const ss = libro_();
  const texto = [datos.titulo, datos.texto].filter(Boolean).join('\n');
  const app = String(datos.app || 'Celular');
  const cuenta = /mercado/i.test(app) ? 'Mercado Pago' : /santander/i.test(app) ? 'Santander' : app;

  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, app + '|' + texto + '|' + Utilities.formatDate(new Date(), CONFIG.ZONA, 'yyyyMMddHHmm'));
  const id = 'nt_' + digest.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 16);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (idExiste_(ss, id)) return { ok: true, duplicado: true };
    const interpretado = interpretarTexto(datos.texto, datos.titulo);
    if (!interpretado) {
      anotarSinLeer_(ss, cuenta + ' (notificación)', datos.titulo || '', datos.texto || '');
      return { ok: true, guardado: false };
    }
    const m = construirMovimiento_(id, interpretado, cuenta, 'notif', new Date(), leerConfig_(ss));
    guardarMovimientos_(ss, [m], new Date().toISOString());
    return { ok: true, guardado: true, movimiento: m };
  } finally {
    lock.releaseLock();
  }
}
