// Interfaz de la app: vistas, editor de movimientos y ajustes.
import { store, CONFIG_DEFAULT } from './store.js';
import { resumenMes, serieMeses, acumuladoDiario, hormiga, recurrentes, presupuestos, ahorro } from './stats.js';
import { donaCategorias, barrasMeses, lineaAcumulado, destruirTodos } from './charts.js';
import { leerArchivo, interpretar, comparar, sugerirCategoria, sugerirCuenta, construir } from './importar.js';
import {
  fmtCLP, fmtPct, hoy, mesActual, sumarMes, nombreMes, fechaLarga, esc, categorizar, sumar, normalizar,
} from './util.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const ui = { mes: mesActual(), filtroTipo: 'todos', busqueda: '' };

const colorDe = (cat) => store.categoria(cat)?.color || '#9aa3ad';
const inicial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();

function aviso(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.classList.add('ver');
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => el.classList.remove('ver'), 2600);
}

// ================= Vistas =================

function vistaInicio() {
  const movs = store.movimientos();
  if (!movs.length) {
    return {
      html: `<div class="tarjeta vacio">
        <b>Bienvenido a tus finanzas</b>
        Agrega tu primer movimiento con el botón <b style="display:inline">+</b>,
        o conecta tu Google Sheet en <a href="#ajustes">Ajustes</a> para sincronizar y leer tus correos.
      </div>`,
    };
  }
  const h = hoy();
  const r = resumenMes(movs, ui.mes, h);
  const hor = hormiga(movs, ui.mes, store.state.config.umbralHormiga);
  const rec = recurrentes(movs, ui.mes);
  const ppto = presupuestos(movs, ui.mes, store.state.config.categorias).filter((p) => p.limite && p.pct >= 0.8);
  const aho = ahorro(movs, ui.mes, store.state.config.patronAhorro);
  const variacionTxt = r.variacion == null ? 'sin datos del mes anterior'
    : `${r.variacion > 0 ? '▲' : '▼'} ${fmtPct(Math.abs(r.variacion))} vs ${nombreMes(sumarMes(ui.mes, -1), true)}${r.esMesActual ? ' a esta fecha' : ''}`;

  const html = `
    <section class="tarjeta hero">
      <div class="etiqueta">Balance del mes</div>
      <div class="grande num ${r.balance >= 0 ? 'positivo' : 'negativo'}">${fmtCLP(r.balance)}</div>
      <div class="fila">
        <div><span class="etiqueta">Ingresos</span><b class="num positivo">${fmtCLP(r.ingresos)}</b></div>
        <div><span class="etiqueta">Gastos</span><b class="num negativo">${fmtCLP(r.gastos)}</b></div>
      </div>
    </section>

    <section class="kpis">
      <div class="kpi"><div class="t">Tasa de ahorro</div><div class="v num">${fmtPct(r.tasaAhorro)}</div><div class="s">del ingreso del mes</div></div>
      <div class="kpi"><div class="t">Gasto diario</div><div class="v num">${fmtCLP(r.promDiario)}</div><div class="s">promedio</div></div>
      <div class="kpi"><div class="t">${r.esMesActual ? 'Proyección a fin de mes' : 'Gasto total'}</div><div class="v num">${fmtCLP(r.proyeccion)}</div><div class="s">${esc(variacionTxt)}</div></div>
      <div class="kpi"><div class="t">Gastos hormiga</div><div class="v num">${fmtCLP(hor.total)}</div><div class="s">${hor.cantidad} compras ≤ ${fmtCLP(store.state.config.umbralHormiga)}</div></div>
    </section>

    ${aho.total || aho.mes ? `<section class="tarjeta ahorro">
      <div><div class="t">Ahorro este mes</div><div class="v num positivo">${fmtCLP(aho.mes)}</div>
        <div class="s">${r.ingresos ? fmtPct(aho.mes / r.ingresos) + ' de tus ingresos' : 'traspasos a tu cuenta de ahorro'}</div></div>
      <div><div class="t">Ahorro acumulado</div><div class="v num">${fmtCLP(aho.total)}</div><div class="s">total traspasado</div></div>
    </section>` : ''}

    ${ppto.length ? `<section class="tarjeta"><h2>Presupuestos en alerta</h2>
      ${ppto.map((p) => barraPpto(p)).join('')}</section>` : ''}

    <section class="tarjeta">
      <h2>Gasto por categoría</h2>
      ${r.porCategoria.length ? `
        <div class="dona-wrap"><div class="grafico dona"><canvas id="g-dona"></canvas></div>
          <div class="dona-centro"><b class="num">${fmtCLP(r.gastos)}</b><span>${r.cantidad} movimientos</span></div></div>
        <ul class="leyenda">${r.porCategoria.map((c) => `
          <li><span class="punto" style="background:${colorDe(c.categoria)}"></span>
          <span class="nombre">${esc(c.categoria)}</span><span class="num">${fmtCLP(c.monto)}</span>
          <span class="pct num">${fmtPct(c.pct)}</span></li>`).join('')}</ul>`
        : '<p class="ayuda">Sin gastos este mes.</p>'}
    </section>

    <section class="tarjeta">
      <h2>Ritmo de gasto <small>· acumulado del mes</small></h2>
      <div class="grafico"><canvas id="g-linea"></canvas></div>
    </section>

    <section class="tarjeta">
      <h2>Últimos 6 meses</h2>
      <div class="grafico"><canvas id="g-barras"></canvas></div>
    </section>

    ${rec.length ? `<section class="tarjeta"><h2>Gastos recurrentes <small>· posibles suscripciones</small></h2>
      <ul class="lista-simple">${rec.map((x) => `<li><span>${esc(x.descripcion)}<br><span class="sub">${esc(x.categoria || '')} · ${x.meses} de 6 meses</span></span>
      <span class="num">${fmtCLP(x.monto)}/mes</span></li>`).join('')}</ul>
      <p class="ayuda" style="margin:10px 0 0">Total aprox.: <b>${fmtCLP(sumar(rec))}</b> al mes.</p></section>` : ''}
  `;

  return {
    html,
    despues() {
      if (r.porCategoria.length) {
        const centro = $('.dona-centro');
        const original = centro.innerHTML;
        donaCategorias('g-dona', r.porCategoria, colorDe, (c) => {
          centro.innerHTML = c ? `<b class="num">${fmtCLP(c.monto)}</b><span>${esc(c.categoria)} · ${fmtPct(c.pct)}</span>` : original;
        });
        $('.dona-wrap canvas').addEventListener('mouseleave', () => { centro.innerHTML = original; });
      }
      lineaAcumulado('g-linea', acumuladoDiario(movs, ui.mes, h), acumuladoDiario(movs, sumarMes(ui.mes, -1), h));
      barrasMeses('g-barras', serieMeses(movs, ui.mes, 6));
    },
  };
}

function barraPpto(p, editable = false) {
  const pct = p.pct ?? 0;
  const color = pct >= 1 ? 'var(--gasto)' : pct >= 0.8 ? 'var(--alerta)' : p.color;
  return `<div class="ppto">
    <div class="ppto-top"><span class="punto" style="background:${p.color}"></span><span class="nombre">${esc(p.categoria)}</span>
      ${editable ? `<input class="num" inputmode="numeric" data-ppto="${esc(p.categoria)}" value="${p.limite ? fmtCLP(p.limite) : ''}" placeholder="Sin límite">`
        : `<span class="num">${fmtPct(p.pct)}</span>`}</div>
    ${p.limite ? `<div class="progreso"><i style="width:${Math.min(100, pct * 100)}%;background:${color}"></i></div>` : ''}
    <div class="det"><span class="num">Gastado ${fmtCLP(p.gastado)}</span>
      <span class="num">${p.limite ? (p.limite - p.gastado >= 0 ? `Quedan ${fmtCLP(p.limite - p.gastado)}` : `Excedido ${fmtCLP(p.gastado - p.limite)}`) : ''}</span></div>
  </div>`;
}

function vistaMovimientos() {
  const q = normalizar(ui.busqueda);
  let lista = store.movimientos().filter((m) => m.fecha?.startsWith(ui.mes));
  if (ui.filtroTipo !== 'todos') lista = lista.filter((m) => m.tipo === ui.filtroTipo);
  if (q) lista = lista.filter((m) => normalizar(`${m.descripcion} ${m.categoria} ${m.cuenta} ${m.notas}`).includes(q));
  lista.sort((a, b) => (b.fecha + (b.creado || '')).localeCompare(a.fecha + (a.creado || '')));

  const porDia = new Map();
  for (const m of lista) {
    if (!porDia.has(m.fecha)) porDia.set(m.fecha, []);
    porDia.get(m.fecha).push(m);
  }
  const chips = [['todos', 'Todos'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['traspaso', 'Traspasos']];
  const neto = sumar(lista.filter((m) => m.tipo === 'ingreso')) - sumar(lista.filter((m) => m.tipo === 'gasto'));

  const html = `
    <div class="buscador"><input id="buscar" type="search" placeholder="Buscar…" value="${esc(ui.busqueda)}"></div>
    <div class="chips">${chips.map(([k, t]) => `<button class="chip ${ui.filtroTipo === k ? 'activo' : ''}" data-filtro="${k}">${t}</button>`).join('')}</div>
    ${lista.length ? `<div class="dia"><span>${lista.length} movimientos</span><span class="num">Neto ${fmtCLP(neto)}</span></div>` : ''}
    ${lista.length ? [...porDia].map(([f, ms]) => `
      <div class="dia"><span>${fechaLarga(f)}</span></div>
      <div class="grupo">${ms.map(filaMov).join('')}</div>`).join('')
      : `<div class="vacio"><b>Nada por aquí</b>No hay movimientos ${q || ui.filtroTipo !== 'todos' ? 'con ese filtro ' : ''}en ${nombreMes(ui.mes)}.</div>`}
  `;
  return {
    html,
    despues() {
      const b = $('#buscar');
      b.addEventListener('input', () => {
        ui.busqueda = b.value;
        const pos = b.selectionStart;
        render();
        const n = $('#buscar'); n.focus(); n.setSelectionRange(pos, pos);
      });
      $$('[data-filtro]').forEach((c) => c.addEventListener('click', () => { ui.filtroTipo = c.dataset.filtro; render(); }));
      $$('[data-mov]').forEach((el) => el.addEventListener('click', () => abrirEditor(store.state.movs[el.dataset.mov])));
    },
  };
}

function filaMov(m) {
  const signo = m.tipo === 'ingreso' ? '+' : m.tipo === 'gasto' ? '-' : '';
  const origen = m.origen && m.origen !== 'manual' ? `<span class="etq">${esc({ gmail: 'correo', notif: 'notificación', csv: 'cartola', importado: 'importado' }[m.origen] || m.origen)}</span>` : '';
  return `<button class="mov" data-mov="${esc(m.id)}">
    <span class="ic" style="background:${m.tipo === 'traspaso' ? 'var(--texto-3)' : colorDe(m.categoria)}">${esc(inicial(m.descripcion || m.categoria))}</span>
    <span class="cuerpo"><div class="desc">${esc(m.descripcion || m.categoria || 'Sin descripción')}${origen}</div>
      <div class="sub">${esc(m.tipo === 'traspaso' ? 'Traspaso' : m.categoria || 'Sin categoría')} · ${esc(m.cuenta || '')}</div></span>
    <span class="monto num ${m.tipo}">${signo}${fmtCLP(m.monto)}</span>
  </button>`;
}

function vistaPresupuesto() {
  const movs = store.movimientos();
  const ps = presupuestos(movs, ui.mes, store.state.config.categorias);
  const conLimite = ps.filter((p) => p.limite);
  const totalLim = conLimite.reduce((a, p) => a + p.limite, 0);
  const totalGas = conLimite.reduce((a, p) => a + p.gastado, 0);
  const html = `
    ${conLimite.length ? `<section class="tarjeta hero">
      <div class="etiqueta">Presupuesto del mes</div>
      <div class="grande num">${fmtCLP(totalGas)} <span style="font-size:16px;color:var(--texto-2);font-weight:500">de ${fmtCLP(totalLim)}</span></div>
      <div class="progreso"><i style="width:${Math.min(100, (totalGas / totalLim) * 100)}%;background:${totalGas > totalLim ? 'var(--gasto)' : 'var(--acento)'}"></i></div>
    </section>` : ''}
    <section class="tarjeta">
      <h2>Límite mensual por categoría</h2>
      <p class="ayuda">Escribe un monto para fijar un límite. Déjalo vacío si no quieres límite en esa categoría.</p>
      ${ps.map((p) => barraPpto(p, true)).join('')}
    </section>`;
  return {
    html,
    despues() {
      $$('[data-ppto]').forEach((inp) => {
        inp.addEventListener('focus', () => { inp.value = inp.value.replace(/\D/g, ''); });
        inp.addEventListener('change', async () => {
          const valor = Number(inp.value.replace(/\D/g, '')) || 0;
          const cats = store.state.config.categorias.map((c) => (c.nombre === inp.dataset.ppto ? { ...c, presupuesto: valor } : c));
          await store.guardarConfig({ categorias: cats });
          aviso('Presupuesto guardado');
        });
      });
    },
  };
}

function vistaAjustes() {
  const s = store.state;
  const c = s.config;
  const opcionesCat = (sel) => c.categorias.map((k) => `<option ${k.nombre === sel ? 'selected' : ''}>${esc(k.nombre)}</option>`).join('');
  const html = `
    <section class="tarjeta">
      <h2>Conexión con Google</h2>
      <p class="ayuda">Tus datos se guardan en una Google Sheet privada tuya. Pega aquí la URL del despliegue de Apps Script y tu clave (las muestra la función <code>configurar</code>; ver README del repositorio).</p>
      <label class="campo"><span>URL de la API</span><input id="api-url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(s.api.url)}"></label>
      <label class="campo"><span>Clave</span><input id="api-token" type="password" autocomplete="off" value="${esc(s.api.token)}"></label>
      <div class="acciones"><button class="btn primario" id="api-guardar">Guardar y sincronizar</button></div>
      <p class="ayuda" style="margin:10px 0 0">${s.ultimaSync ? `Última sincronización: ${new Date(s.ultimaSync).toLocaleString('es-CL')}` : 'Aún sin sincronizar.'}
        ${Object.keys(s.pendientes).length ? ` · ${Object.keys(s.pendientes).length} cambios por enviar` : ''}
        ${s.estado === 'error' ? `<br><span class="negativo">Error: ${esc(s.error)}</span>` : ''}</p>
    </section>

    <section class="tarjeta">
      <h2>Categorías</h2>
      <div id="lista-cats">${c.categorias.map(filaCat).join('')}</div>
      <div class="acciones"><button class="btn chico" id="cat-nueva">+ Categoría</button><button class="btn chico primario" id="cat-guardar">Guardar categorías</button></div>
    </section>

    <section class="tarjeta">
      <h2>Reglas automáticas</h2>
      <p class="ayuda">Si la descripción contiene el patrón, se asigna la categoría. Separa variantes con <code>|</code>, en minúsculas y sin tildes. Ej: <code>lider|jumbo</code>.</p>
      <div id="lista-reglas">${c.reglas.map((r) => filaRegla(r, opcionesCat)).join('')}</div>
      <div class="acciones"><button class="btn chico" id="regla-nueva">+ Regla</button><button class="btn chico primario" id="regla-guardar">Guardar reglas</button></div>
      <div class="acciones"><button class="btn chico" id="regla-aplicar">Aplicar reglas a movimientos sin categoría</button></div>
    </section>

    <section class="tarjeta">
      <h2>Preferencias</h2>
      <label class="campo"><span>Cuentas (separadas por coma)</span><input id="pref-cuentas" value="${esc(c.cuentas.join(', '))}"></label>
      <label class="campo"><span>Umbral de gasto hormiga</span><input id="pref-hormiga" inputmode="numeric" value="${c.umbralHormiga}"></label>
      <label class="campo"><span>Cuenta de ahorro (los traspasos que la mencionen cuentan como ahorro)</span><input id="pref-ahorro" value="${esc(c.patronAhorro || '')}" placeholder="estado|ahorro"></label>
      <button class="btn chico primario" id="pref-guardar">Guardar preferencias</button>
    </section>

    <section class="tarjeta">
      <h2>Importar movimientos</h2>
      <p class="ayuda">Desde un Excel o CSV: exportación de Wallet u otra app, o cartola del banco. Verás una vista previa antes de guardar y no se duplica lo que ya tienes.</p>
      <label class="btn primario ancho">Elegir archivo Excel / CSV<input id="importar-xls" type="file" accept=".xls,.xlsx,.csv,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden></label>
    </section>

    <section class="tarjeta">
      <h2>Respaldo</h2>
      <p class="ayuda">Descarga todos tus datos en un archivo, o recupéralos desde uno.</p>
      <div class="acciones"><button class="btn" id="exportar">Exportar</button>
        <label class="btn">Restaurar<input id="importar" type="file" accept="application/json" hidden></label></div>
    </section>
    <p class="ayuda" style="text-align:center">Finanzas · versión 1.0</p>`;

  return {
    html,
    despues() {
      $('#api-guardar').addEventListener('click', async () => {
        const url = $('#api-url').value, token = $('#api-token').value;
        if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url.trim())) return aviso('La URL debe ser la de Apps Script y terminar en /exec');
        if (!token.trim()) return aviso('Falta la clave');
        aviso('Conectando…');
        await store.guardarApi(url, token);
        aviso(store.state.estado === 'ok' ? 'Conectado y sincronizado ✓' : 'No se pudo conectar: ' + store.state.error);
        render();
      });

      $('#cat-nueva').addEventListener('click', () => {
        $('#lista-cats').insertAdjacentHTML('beforeend', filaCat({ nombre: '', tipo: 'gasto', color: '#7a8796', presupuesto: 0 }));
        $('#lista-cats').lastElementChild.querySelector('[data-k="nombre"]').focus();
      });
      $('#lista-cats').addEventListener('click', (e) => { if (e.target.matches('.quitar')) e.target.closest('.fila-edit').remove(); });
      $('#cat-guardar').addEventListener('click', guardarCategorias);

      $('#regla-nueva').addEventListener('click', () => {
        $('#lista-reglas').insertAdjacentHTML('beforeend', filaRegla({ patron: '', categoria: 'Otros' }, opcionesCat));
        $('#lista-reglas').lastElementChild.querySelector('input').focus();
      });
      $('#lista-reglas').addEventListener('click', (e) => { if (e.target.matches('.quitar')) e.target.closest('.fila-edit').remove(); });
      $('#regla-guardar').addEventListener('click', async () => {
        const reglas = $$('#lista-reglas .fila-edit').map((f) => ({ patron: normalizarPatron($('input', f).value), categoria: $('select', f).value })).filter((r) => r.patron);
        const malas = reglas.filter((r) => { try { new RegExp(r.patron); return false; } catch { return true; } });
        if (malas.length) return aviso('Patrón inválido: ' + malas[0].patron);
        await store.guardarConfig({ reglas });
        aviso('Reglas guardadas');
      });
      $('#regla-aplicar').addEventListener('click', async () => {
        const cambios = store.movimientos()
          .filter((m) => m.tipo !== 'traspaso' && (!m.categoria || m.categoria === 'Otros' || m.categoria === 'Sin categoría' || m.categoria === 'Transferencias'))
          .map((m) => ({ m, cat: categorizar(m.descripcion, store.state.config.reglas) }))
          .filter(({ m, cat }) => cat && cat !== m.categoria && store.categoria(cat)?.tipo === m.tipo)
          .map(({ m, cat }) => ({ id: m.id, categoria: cat }));
        if (cambios.length) await store.guardarMovsEnLote(cambios);
        aviso(`${cambios.length} movimientos recategorizados`);
      });

      $('#pref-guardar').addEventListener('click', async () => {
        const cuentas = $('#pref-cuentas').value.split(',').map((x) => x.trim()).filter(Boolean);
        await store.guardarConfig({ cuentas: cuentas.length ? cuentas : CONFIG_DEFAULT.cuentas, umbralHormiga: Number($('#pref-hormiga').value.replace(/\D/g, '')) || 5000, patronAhorro: normalizarPatron($('#pref-ahorro').value) || 'estado|ahorro' });
        aviso('Preferencias guardadas');
      });

      $('#exportar').addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([store.exportar()], { type: 'application/json' }));
        a.download = `finanzas-respaldo-${hoy()}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
      $('#importar').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try { aviso(`${await store.importar(await f.text())} movimientos importados`); } catch (err) { aviso('Error: ' + err.message); }
      });
      $('#importar-xls').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        aviso('Leyendo archivo…');
        try { abrirImportador(f.name, interpretar(await leerArchivo(f))); } catch (err) { aviso('Error: ' + err.message); }
      });
    },
  };
}

const normalizarPatron = (p) => p.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function filaCat(c) {
  return `<div class="fila-edit" data-original="${esc(c.nombre)}">
    <input type="color" data-k="color" value="${esc(c.color)}">
    <input data-k="nombre" value="${esc(c.nombre)}" placeholder="Nombre">
    <select data-k="tipo" style="width:110px"><option value="gasto" ${c.tipo === 'gasto' ? 'selected' : ''}>Gasto</option><option value="ingreso" ${c.tipo === 'ingreso' ? 'selected' : ''}>Ingreso</option></select>
    <button class="quitar" aria-label="Quitar">×</button></div>`;
}

function filaRegla(r, opcionesCat) {
  return `<div class="fila-edit"><input value="${esc(r.patron)}" placeholder="patrón"><select style="width:45%">${opcionesCat(r.categoria)}</select>
    <button class="quitar" aria-label="Quitar">×</button></div>`;
}

async function guardarCategorias() {
  const previas = new Map(store.state.config.categorias.map((c) => [c.nombre, c]));
  const filas = $$('#lista-cats .fila-edit');
  const cats = [];
  const renombres = new Map();
  for (const f of filas) {
    const nombre = $('[data-k="nombre"]', f).value.trim();
    if (!nombre) continue;
    if (cats.some((c) => c.nombre === nombre)) return aviso(`Categoría repetida: ${nombre}`);
    const original = f.dataset.original;
    if (original && original !== nombre) renombres.set(original, nombre);
    cats.push({ nombre, tipo: $('[data-k="tipo"]', f).value, color: $('[data-k="color"]', f).value, presupuesto: previas.get(original)?.presupuesto || 0 });
  }
  if (!cats.length) return aviso('Debe haber al menos una categoría');
  const reglas = store.state.config.reglas.map((r) => ({ ...r, categoria: renombres.get(r.categoria) || r.categoria }));
  await store.guardarConfig({ categorias: cats, reglas });
  if (renombres.size) {
    const cambios = store.movimientos().filter((m) => renombres.has(m.categoria)).map((m) => ({ id: m.id, categoria: renombres.get(m.categoria) }));
    if (cambios.length) await store.guardarMovsEnLote(cambios);
  }
  aviso('Categorías guardadas');
}

// ================= Editor de movimiento =================

function abrirEditor(mov) {
  const dlg = $('#editor');
  const cfg = store.state.config;
  const m = mov ? { ...mov } : { tipo: 'gasto', fecha: ui.mes === mesActual() ? hoy() : `${ui.mes}-01`, cuenta: cfg.cuentas[0], monto: '', descripcion: '', categoria: '', notas: '' };
  let categoriaManual = Boolean(mov);

  const opciones = () => {
    if (m.tipo === 'traspaso') return '<option>Traspaso</option>';
    const cats = cfg.categorias.filter((c) => c.tipo === m.tipo);
    if (!cats.some((c) => c.nombre === m.categoria)) m.categoria = categorizar(m.descripcion, cfg.reglas) || cats.find((c) => /^otros/i.test(c.nombre))?.nombre || cats[0]?.nombre || '';
    const extra = m.categoria && !cats.some((c) => c.nombre === m.categoria) ? `<option selected>${esc(m.categoria)}</option>` : '';
    return extra + cats.map((c) => `<option ${c.nombre === m.categoria ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
  };
  const cuentas = [...new Set([...cfg.cuentas, m.cuenta].filter(Boolean))];

  dlg.innerHTML = `<form class="hoja-cuerpo" method="dialog">
    <div class="hoja-top"><h3>${mov ? 'Editar movimiento' : 'Nuevo movimiento'}</h3><button type="button" class="cerrar" aria-label="Cerrar">✕</button></div>
    <div class="segmento">${['gasto', 'ingreso', 'traspaso'].map((t) => `<button type="button" data-tipo="${t}" class="${m.tipo === t ? 'activo' : ''}">${{ gasto: 'Gasto', ingreso: 'Ingreso', traspaso: 'Traspaso' }[t]}</button>`).join('')}</div>
    <input id="e-monto" class="monto-grande num" inputmode="numeric" placeholder="$0" value="${m.monto ? fmtCLP(m.monto) : ''}" aria-label="Monto">
    <label class="campo"><span>Descripción</span><input id="e-desc" value="${esc(m.descripcion)}" placeholder="Ej: Lider, Uber, arriendo…" autocomplete="off"></label>
    <div class="dos">
      <label class="campo"><span>Categoría</span><select id="e-cat">${opciones()}</select></label>
      <label class="campo"><span>Cuenta</span><select id="e-cuenta">${cuentas.map((c) => `<option ${c === m.cuenta ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    </div>
    <label class="campo"><span>Fecha</span><input id="e-fecha" type="date" value="${esc(m.fecha)}"></label>
    <label class="campo"><span>Notas</span><input id="e-notas" value="${esc(m.notas)}" placeholder="Opcional"></label>
    <div class="acciones">
      ${mov ? '<button type="button" class="btn peligro" id="e-borrar">Eliminar</button>' : ''}
      <button type="submit" class="btn primario">Guardar</button>
    </div>
  </form>`;

  const montoEl = $('#e-monto', dlg);
  montoEl.addEventListener('input', () => {
    const d = montoEl.value.replace(/\D/g, '');
    montoEl.value = d ? fmtCLP(Number(d)) : '';
  });
  $$('.segmento button', dlg).forEach((b) => b.addEventListener('click', () => {
    m.tipo = b.dataset.tipo;
    if (!categoriaManual || m.tipo === 'traspaso') m.categoria = '';
    $$('.segmento button', dlg).forEach((x) => x.classList.toggle('activo', x === b));
    $('#e-cat', dlg).innerHTML = opciones();
  }));
  $('#e-desc', dlg).addEventListener('input', (e) => {
    m.descripcion = e.target.value;
    if (categoriaManual || m.tipo === 'traspaso') return;
    const cat = categorizar(m.descripcion, cfg.reglas);
    if (cat && store.categoria(cat)?.tipo === m.tipo) { m.categoria = cat; $('#e-cat', dlg).value = cat; }
  });
  $('#e-cat', dlg).addEventListener('change', (e) => { m.categoria = e.target.value; categoriaManual = true; });
  $('.cerrar', dlg).addEventListener('click', () => dlg.close());
  $('#e-borrar', dlg)?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este movimiento?')) return;
    await store.eliminarMov(mov.id);
    dlg.close();
    aviso('Movimiento eliminado');
  });
  $('form', dlg).addEventListener('submit', async (e) => {
    e.preventDefault();
    const monto = Number(montoEl.value.replace(/\D/g, ''));
    if (!monto) { montoEl.focus(); return aviso('Ingresa un monto'); }
    const fecha = $('#e-fecha', dlg).value || hoy();
    await store.guardarMov({
      ...(mov ? { id: mov.id } : {}),
      tipo: m.tipo, monto, fecha,
      descripcion: $('#e-desc', dlg).value.trim(),
      categoria: m.tipo === 'traspaso' ? 'Traspaso' : $('#e-cat', dlg).value,
      cuenta: $('#e-cuenta', dlg).value,
      notas: $('#e-notas', dlg).value.trim(),
    });
    dlg.close();
    if (fecha.slice(0, 7) !== ui.mes) { ui.mes = fecha.slice(0, 7); render(); }
    aviso(mov ? 'Cambios guardados' : 'Movimiento agregado');
  });

  dlg.showModal();
  if (!mov) setTimeout(() => montoEl.focus(), 50);
}

// ================= Importador (vista previa) =================

const PALETA = ['#e05d8a', '#5b8def', '#d98a1b', '#3fb39d', '#9b6bd6', '#c9563c', '#6d9c2e', '#2b9fc2', '#e0a458', '#4f6bd8',
  '#c75fb5', '#58a65c', '#d1495b', '#00a6a6', '#8c6d46', '#a37fe0', '#ef8354', '#2e86ab', '#b8b42d', '#f25f8b'];

/** Un color de la paleta que todavía no use ninguna categoría (o el menos usado). */
function colorLibre(enUso) {
  const usados = new Set([...enUso].map((c) => c.toLowerCase()));
  return PALETA.find((c) => !usados.has(c)) || PALETA[usados.size % PALETA.length];
}

/** Si dos categorías comparten color, a la segunda se le asigna uno libre. */
async function repararColores() {
  const vistos = new Set();
  let cambio = false;
  const cats = store.state.config.categorias.map((c) => {
    const k = (c.color || '').toLowerCase();
    if (!vistos.has(k)) { vistos.add(k); return c; }
    const color = colorLibre([...vistos, ...store.state.config.categorias.map((x) => x.color)]);
    vistos.add(color);
    cambio = true;
    return { ...c, color };
  });
  if (cambio) await store.guardarConfig({ categorias: cats });
}

function abrirImportador(nombreArchivo, datos) {
  const cfg = store.state.config;
  const todosLosIds = new Set(Object.keys(store.state.movs));
  const filas = comparar(datos.filas, Object.values(store.state.movs), todosLosIds).sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!filas.length) return aviso('El archivo no tiene movimientos válidos');

  const cuenta = (e) => filas.filter((r) => r.estado === e).length;
  const fechas = filas.map((r) => r.fecha).sort();

  // Categorías de origen → sugerencia
  const grupos = new Map();
  for (const r of filas) {
    if (r.tipo === 'traspaso' || !r.catOrigen) continue;
    const k = r.tipo + '|' + r.catOrigen;
    const g = grupos.get(k) || { tipo: r.tipo, nombre: r.catOrigen, n: 0, total: 0 };
    g.n++; g.total += r.monto;
    grupos.set(k, g);
  }
  const cuentasOrigen = [...new Set(filas.flatMap((r) => [r.cuentaOrigen, r.cuentaDestino, r.cuentaPropia]).filter(Boolean))];

  const opcionesCat = (g) => {
    const sug = sugerirCategoria(g.nombre, g.tipo, cfg);
    const propias = cfg.categorias.filter((c) => c.tipo === g.tipo);
    const nueva = 'nueva:' + g.nombre;
    return `<option value="${esc(nueva)}" ${sug === nueva ? 'selected' : ''}>➕ Crear «${esc(g.nombre)}»</option>`
      + propias.map((c) => `<option ${c.nombre === sug ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
  };
  const opcionesCuenta = (nombre) => {
    const sug = sugerirCuenta(nombre, cfg.cuentas);
    const lista = [...new Set([...cfg.cuentas, nombre])];
    return lista.map((c) => `<option value="${esc(c)}" ${c === sug ? 'selected' : ''}>${c === nombre && !cfg.cuentas.includes(nombre) ? '➕ ' : ''}${esc(c)}</option>`).join('');
  };
  const chip = { nuevo: ['Nuevo', 'var(--acento)'], completa: ['Completa categoría', 'var(--alerta)'], duplicado: ['Ya existe', 'var(--texto-3)'], importado: ['Ya importado', 'var(--texto-3)'] };
  const marcado = (r) => r.estado === 'nuevo' || r.estado === 'completa';

  const dlg = $('#editor');
  dlg.innerHTML = `<form class="hoja-cuerpo" method="dialog">
    <div class="hoja-top"><h3>Importar ${esc(datos.formato)}</h3><button type="button" class="cerrar" aria-label="Cerrar">✕</button></div>
    <p class="ayuda">${esc(nombreArchivo)} · ${filas.length} movimientos del ${fechaLarga(fechas[0]).toLowerCase()} al ${fechaLarga(fechas.at(-1)).toLowerCase()}${datos.omitidas ? ` · ${datos.omitidas} filas sin fecha o monto omitidas` : ''}</p>
    <div class="kpis">
      <div class="kpi"><div class="t">Nuevos</div><div class="v num">${cuenta('nuevo')}</div></div>
      <div class="kpi"><div class="t">Ya en la app</div><div class="v num">${cuenta('duplicado') + cuenta('completa') + cuenta('importado')}</div>
        <div class="s">${cuenta('completa') ? `${cuenta('completa')} les falta categoría: se completa` : 'se omiten'}</div></div>
    </div>
    ${grupos.size ? `<h2 class="sub-h">Categorías</h2><p class="ayuda">Cómo pasar las categorías del archivo a las tuyas.</p>
      ${[...grupos.entries()].map(([k, g]) => `<div class="mapa"><div><b>${esc(g.nombre)}</b><span class="sub">${g.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} · ${g.n} · ${fmtCLP(g.total)}</span></div>
        <select data-mapa-cat="${esc(k)}">${opcionesCat(g)}</select></div>`).join('')}` : ''}
    ${cuentasOrigen.length ? `<h2 class="sub-h">Cuentas</h2>
      ${cuentasOrigen.map((c) => `<div class="mapa"><div><b>${esc(c)}</b></div><select data-mapa-cuenta="${esc(c)}">${opcionesCuenta(c)}</select></div>`).join('')}` : ''}
    <details class="detalle-imp"><summary>Ver movimientos (${filas.length})</summary>
      ${filas.map((r) => `<label class="fila-imp"><input type="checkbox" data-imp="${esc(r.id)}" ${marcado(r) ? 'checked' : ''} ${r.estado === 'importado' ? 'disabled' : ''}>
        <span class="cuerpo"><span class="desc">${esc(r.tipo === 'traspaso' ? `Traspaso ${r.cuentaOrigen || ''} → ${r.cuentaDestino || '?'}` : r.descripcion || r.catOrigen || 'Sin descripción')}</span>
        <span class="sub">${esc(r.fecha.split('-').reverse().join('/'))} · <span style="color:${chip[r.estado][1]}">${chip[r.estado][0]}</span>${r.existente ? ` · ${esc(r.existente.descripcion)}` : ''}</span></span>
        <span class="monto num ${r.tipo}">${r.tipo === 'gasto' ? '-' : r.tipo === 'ingreso' ? '+' : ''}${fmtCLP(r.monto)}</span></label>`).join('')}
    </details>
    <div class="acciones"><button type="submit" class="btn primario" id="imp-ok"></button></div>
  </form>`;

  const elegidas = () => new Set($$('[data-imp]', dlg).filter((c) => c.checked).map((c) => c.dataset.imp));
  const pintarBoton = () => { const n = elegidas().size; $('#imp-ok', dlg).textContent = n ? `Importar ${n} movimiento${n === 1 ? '' : 's'}` : 'Nada que importar'; $('#imp-ok', dlg).disabled = !n; };
  pintarBoton();
  dlg.addEventListener('change', (e) => { if (e.target.matches('[data-imp]')) pintarBoton(); });
  $('.cerrar', dlg).addEventListener('click', () => dlg.close());

  $('form', dlg).addEventListener('submit', async (e) => {
    e.preventDefault();
    const mapaCat = {}, mapaCuenta = {};
    const nuevasCats = [];
    for (const s of $$('[data-mapa-cat]', dlg)) {
      const [tipo] = s.dataset.mapaCat.split('|');
      let cat = s.value;
      if (cat.startsWith('nueva:')) {
        cat = cat.slice(6);
        if (!cfg.categorias.some((c) => c.nombre === cat) && !nuevasCats.some((c) => c.nombre === cat)) {
          nuevasCats.push({ nombre: cat, tipo, color: colorLibre([...cfg.categorias, ...nuevasCats].map((c) => c.color)), presupuesto: 0 });
        }
      }
      mapaCat[s.dataset.mapaCat] = cat;
    }
    for (const s of $$('[data-mapa-cuenta]', dlg)) mapaCuenta[s.dataset.mapaCuenta] = s.value;
    const nuevasCuentas = [...new Set(Object.values(mapaCuenta))].filter((c) => !cfg.cuentas.includes(c));

    if (nuevasCats.length || nuevasCuentas.length) {
      await store.guardarConfig({ categorias: [...cfg.categorias, ...nuevasCats], cuentas: [...cfg.cuentas, ...nuevasCuentas] });
    }
    const { nuevos, cambios } = construir(filas, mapaCat, mapaCuenta, elegidas(), store.state.config.reglas);
    await store.guardarMovsEnLote([...nuevos, ...cambios]);
    dlg.close();
    aviso(`${nuevos.length} importados${cambios.length ? ` · ${cambios.length} categorías completadas` : ''}`);
    location.hash = 'movimientos';
  });

  dlg.showModal();
}

// ================= Router y render =================

const vistas = { inicio: vistaInicio, movimientos: vistaMovimientos, presupuesto: vistaPresupuesto, ajustes: vistaAjustes };
const ruta = () => (location.hash.slice(1) in vistas ? location.hash.slice(1) : 'inicio');

function render() {
  const r = ruta();
  destruirTodos();
  const v = vistas[r]();
  $('#vista').innerHTML = v.html;
  v.despues?.();
  $$('.nav a').forEach((a) => a.classList.toggle('activo', a.dataset.ruta === r));
  $('#mes-titulo').textContent = nombreMes(ui.mes);
  const sinMes = r === 'ajustes';
  $('#mes-prev').style.visibility = $('#mes-sig').style.visibility = sinMes ? 'hidden' : 'visible';
  if (sinMes) $('#mes-titulo').textContent = 'Ajustes';
  pintarEstado();
}

function pintarEstado() {
  const s = store.state;
  const el = $('#estado-sync');
  const pend = Object.keys(s.pendientes).length;
  el.className = 'estado-sync ' + s.estado;
  el.textContent = {
    local: 'Solo en este dispositivo',
    sincronizando: 'Sincronizando…',
    ok: pend ? `${pend} por enviar` : 'Sincronizado',
    error: 'Sin conexión · tocar para reintentar',
  }[s.estado];
}

async function iniciar() {
  await store.cargar();

  // Re-render cuando cambian los datos, sin perder lo que se escribe en Ajustes.
  let ultimaFirma = '';
  store.on(() => {
    pintarEstado();
    const firma = JSON.stringify([Object.keys(store.state.movs).length, store.state.ultimaSync, store.state.config.actualizado, Object.values(store.state.movs).reduce((a, m) => (m.actualizado > a ? m.actualizado : a), '')]);
    if (firma !== ultimaFirma && ruta() !== 'ajustes') render();
    ultimaFirma = firma;
  });

  window.addEventListener('hashchange', render);
  $('#mes-prev').addEventListener('click', () => { ui.mes = sumarMes(ui.mes, -1); render(); });
  $('#mes-sig').addEventListener('click', () => { ui.mes = sumarMes(ui.mes, 1); render(); });
  $('#btn-nuevo').addEventListener('click', () => abrirEditor());
  $('#estado-sync').addEventListener('click', async () => {
    if (!store.conectado()) { location.hash = 'ajustes'; return; }
    await store.sync();
    aviso(store.state.estado === 'ok' ? 'Sincronizado ✓' : 'Error: ' + store.state.error);
  });
  // Sincronizar al volver a la app y cada 5 minutos mientras está abierta.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) store.sync(); });
  setInterval(() => { if (!document.hidden) store.sync(); }, 5 * 60 * 1000);

  render();
  await store.sync();
  repararColores();

  // Atajo del ícono (mantener presionado → "Nuevo gasto")
  if (location.hash === '#nuevo') { history.replaceState(null, '', '#inicio'); abrirEditor(); }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

iniciar();
