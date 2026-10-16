// Gráficos con Chart.js (incluido en /vendor, funciona sin internet).
import { fmtCLP, fmtCorto, nombreMes } from './util.js';

const instancias = new Map();

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function crear(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;
  instancias.get(id)?.destroy();
  const Chart = window.Chart;
  Chart.defaults.font.family = css('--fuente') || 'system-ui';
  Chart.defaults.color = css('--texto-2');
  Chart.defaults.borderColor = css('--linea');
  instancias.set(id, new Chart(canvas, config));
}

const tooltipCLP = {
  callbacks: { label: (c) => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${fmtCLP(c.parsed.y ?? c.parsed)}` },
};

export function donaCategorias(id, datos, colorDe) {
  crear(id, {
    type: 'doughnut',
    data: {
      labels: datos.map((d) => d.categoria),
      datasets: [{
        data: datos.map((d) => d.monto),
        backgroundColor: datos.map((d) => colorDe(d.categoria)),
        borderColor: css('--superficie'),
        borderWidth: 2,
      }],
    },
    options: {
      cutout: '68%',
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtCLP(c.parsed)}` } } },
    },
  });
}

export function barrasMeses(id, serie) {
  crear(id, {
    type: 'bar',
    data: {
      labels: serie.map((s) => nombreMes(s.ym, true)),
      datasets: [
        { label: 'Ingresos', data: serie.map((s) => s.ingresos), backgroundColor: css('--ingreso'), borderRadius: 4, maxBarThickness: 22 },
        { label: 'Gastos', data: serie.map((s) => s.gastos), backgroundColor: css('--gasto'), borderRadius: 4, maxBarThickness: 22 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: tooltipCLP },
      scales: { y: { ticks: { callback: (v) => fmtCorto(v) }, grid: { color: css('--linea') } }, x: { grid: { display: false } } },
    },
  });
}

export function lineaAcumulado(id, actual, anterior) {
  const dias = Math.max(actual.length, anterior.length);
  crear(id, {
    type: 'line',
    data: {
      labels: Array.from({ length: dias }, (_, i) => i + 1),
      datasets: [
        { label: 'Este mes', data: actual, borderColor: css('--acento'), backgroundColor: css('--acento'), borderWidth: 2.5, pointRadius: 0, tension: 0.25, spanGaps: false },
        { label: 'Mes anterior', data: anterior, borderColor: css('--texto-3'), borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, tension: 0.25 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 2 } },
        tooltip: { ...tooltipCLP, callbacks: { ...tooltipCLP.callbacks, title: (c) => 'Día ' + c[0].label } },
      },
      scales: {
        y: { ticks: { callback: (v) => fmtCorto(v) }, grid: { color: css('--linea') } },
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
      },
    },
  });
}

export function destruirTodos() {
  instancias.forEach((c) => c.destroy());
  instancias.clear();
}
