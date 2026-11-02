// Schaufenster-Anzeige: lädt die Daten selbst nach, kein Neuladen der Seite nötig
const TZ = 'Europe/Vienna';
const CURRENT_EVERY = 60 * 1000;
const CHARTS_EVERY = 5 * 60 * 1000;
const RELOAD_EVERY = 6 * 60 * 60 * 1000; // frischer Start gegen Speicherlecks im Dauerbetrieb
const STALE_AFTER = 15 * 60; // Sekunden

const COLORS = {
  temp: '#d9480f', dew: '#1971c2', rain: '#1c7ed6', wind: '#2b8a3e', gust: '#94d82d',
  dir: '#5f3dc4', baro: '#495057', hum: '#0c8599', rad: '#f59f00', sun: '#ffd43b',
  lake: '#1971c2', stand: '#0b5cad', standMean: '#adb5bd',
};

const $ = (id) => document.getElementById(id);

// --- Formatierung -------------------------------------------------------------
const nf = (digits) => new Intl.NumberFormat('de-AT', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const NF = [nf(0), nf(1), nf(2)];
const num = (v, d = 1) => (v == null ? '–' : NF[d].format(v));
const signed = (v, d = 1) => (v == null ? '' : `(${v > 0 ? '+' : ''}${num(v, d)})`);
const timeFmt = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('de-AT', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const hm = (unix) => (unix == null ? '–' : timeFmt.format(unix * 1000));
const dt = (unix) => (unix == null ? '–' : dateTimeFmt.format(unix * 1000));
const at = (e) => (e ? hm(e.time) : '');

const COMPASS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg) => (deg == null ? '' : COMPASS[Math.round(deg / 22.5) % 16]);

const ICONS = {
  sun: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="13" fill="#f59f00"/><g stroke="#f59f00" stroke-width="4" stroke-linecap="round">${
    [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="32" y1="6" x2="32" y2="13" transform="rotate(${a} 32 32)"/>`).join('')}</g></svg>`,
  cloud: '<svg viewBox="0 0 64 64"><path d="M18 48a11 11 0 0 1 1-22 15 15 0 0 1 29 4 9 9 0 0 1-1 18z" fill="#adb5bd"/></svg>',
  rain: `<svg viewBox="0 0 64 64"><path d="M18 38a11 11 0 0 1 1-22 15 15 0 0 1 29 4 9 9 0 0 1-1 18z" fill="#868e96"/><g stroke="#1c7ed6" stroke-width="4" stroke-linecap="round">
    <line x1="22" y1="44" x2="19" y2="54"/><line x1="33" y1="44" x2="30" y2="54"/><line x1="44" y1="44" x2="41" y2="54"/></g></svg>`,
};

// --- Aktuelle Werte -------------------------------------------------------------
function row(label, value, extra = '', cls = '') {
  return `<tr class="${cls}"><td>${label}</td><td>${value}</td><td>${extra}</td></tr>`;
}

function renderWeather(w) {
  const t = w.today;
  $('dataTime').textContent = dt(w.time);
  const age = Date.now() / 1000 - w.time;
  $('stale').hidden = age < STALE_AFTER;
  $('stale').textContent = 'Keine aktuellen Messdaten';

  $('icon').innerHTML = w.rainRate > 0 ? ICONS.rain : w.sunny ? ICONS.sun : ICONS.cloud;
  $('outTemp').textContent = num(w.outTemp);
  $('tMax').textContent = num(t.outTempMax?.value);
  $('tMaxT').textContent = at(t.outTempMax);
  $('tMin').textContent = num(t.outTempMin?.value);
  $('tMinT').textContent = at(t.outTempMin);

  const wind = w.windSpeed > 0.5 ? `${compass(w.windDir)} ${num(w.windSpeed)} km/h` : `${num(w.windSpeed)} km/h`;
  $('values').innerHTML = [
    row('Taupunkt', `${num(w.dewpoint)} °C`),
    row('Luftfeuchtigkeit', `${num(w.outHumidity, 0)} %`),
    row('max / min', `${num(t.outHumidityMax?.value, 0)} / ${num(t.outHumidityMin?.value, 0)} %`, '', 'sub'),
    row('Luftdruck (Meereshöhe)', `${num(w.barometer)} hPa`),
    row('max / min', `${num(t.barometerMax?.value)} / ${num(t.barometerMin?.value)}`, '', 'sub'),
    w.pressure != null ? row('Luftdruck (gemessen)', `${num(w.pressure)} hPa`) : '',
    row('Wind (10 min)', wind),
    row('Böe (10 min)', `${num(w.windGust)} km/h`),
    row('stärkste Böe heute', `${num(t.windGustMax?.value)} km/h`, at(t.windGustMax), 'sub'),
    row('Niederschlagsrate', `${num(w.rainRate)} mm/h`),
    row('max. Rate heute', `${num(t.rainRateMax?.value)} mm/h`, t.rainRateMax?.value > 0 ? at(t.rainRateMax) : '', 'sub'),
    row('Niederschlag 1 h / 24 h', `${num(w.rain1h)} / ${num(w.rain24h)} mm`),
    row('Niederschlag heute', `${num(t.rain)} mm`, '', 'sub'),
    row('Sonnenstrahlung', `${num(w.radiation, 0)} W/m²`),
    row('Sonnenscheindauer heute', `${num(t.sunshineMinutes / 60)} h`, '', 'sub'),
  ].join('');
}

function dl(el, items) {
  el.innerHTML = items.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

function renderLake(l) {
  if (!l) return dl($('lake'), [['', 'keine Daten']]);
  dl($('lake'), [
    ['Wasser', `${num(l.temp05)} °C`],
    ['', signed(l.temp05Diff)],
    ['Pegel', `${num(l.stand, 0)} cm`],
    ['', signed(l.standDiff, 0)],
  ]);
}

function renderAlmanac({ sun, moon }) {
  const seasons = [
    ['Tagundnachtgleiche', sun.equinox],
    ['Sonnenwende', sun.solstice],
  ].sort((a, b) => a[1] - b[1]);
  dl($('sun'), [
    ['Aufgang', hm(sun.rise)],
    ['Mittag', hm(sun.transit)],
    ['Untergang', hm(sun.set)],
    ...seasons.map(([k, v]) => [k, dayFmt.format(v * 1000)]),
  ]);

  const moonTimes = [['Aufgang', moon.rise], ['Untergang', moon.set]]
    .filter(([, v]) => v != null)
    .sort((a, b) => a[1] - b[1])
    .map(([k, v]) => [k, hm(v)]);
  const phases = [['Vollmond', moon.nextFull], ['Neumond', moon.nextNew]]
    .sort((a, b) => a[1] - b[1])
    .map(([k, v]) => [k, dayFmt.format(v * 1000)]);
  dl($('moon'), [
    ...moonTimes,
    ...phases,
    ['Phase', moon.phase],
    ['beleuchtet', `${moon.illumination} %`],
  ]);
}

function renderStorm(s) {
  const el = $('storm');
  const level = s?.ost ?? 0;
  el.hidden = level === 0;
  el.className = `storm level-${level}`;
  el.textContent = level === 90 ? 'STURMWARNUNG Bodensee' : 'Starkwindwarnung Bodensee';
}

async function loadCurrent() {
  const res = await fetch('/api/current');
  const data = await res.json();
  if (data.weather) renderWeather(data.weather);
  renderLake(data.lake);
  renderAlmanac(data.almanac);
  renderStorm(data.storm);
}

// --- Diagramme --------------------------------------------------------------
Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
Chart.defaults.font.size = Math.max(11, Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.8));
Chart.defaults.color = '#5d6b7a';
Chart.defaults.animation = false;
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.enabled = false;
Chart.defaults.elements.point.radius = 0;
Chart.defaults.elements.line.borderWidth = 2;

// Zeitachse: Striche zu vollen Ortsstunden (alle 3 h) ohne Datums-Adapter
function timeAxis(stepHours = 3, fmt = hm) {
  return {
    type: 'linear',
    grid: { color: '#eef1f4' },
    ticks: { callback: (v) => fmt(v / 1000), maxRotation: 0, autoSkip: false },
    afterBuildTicks(axis) {
      const ticks = [];
      const step = stepHours * 3600 * 1000;
      for (let t = Math.ceil(axis.min / 3600000) * 3600000; t <= axis.max; t += 3600000) {
        const h = Number(timeFmt.format(t).slice(0, 2));
        if (stepHours >= 24 ? h === 0 : h % stepHours === 0) ticks.push({ value: t });
      }
      axis.ticks = ticks.length ? ticks : axis.ticks;
      void step;
    },
  };
}

const charts = {};
function chart(id, config) {
  charts[id]?.destroy();
  charts[id] = new Chart($(id), config);
}

const xy = (records, key) => records.map((r) => ({ x: r.t * 1000, y: r[key] }));
const line = (data, color, extra = {}) => ({ data, borderColor: color, backgroundColor: color, spanGaps: 15 * 60 * 1000, ...extra });
const yAxis = (extra = {}) => ({ grid: { color: '#eef1f4' }, ...extra });

function renderSeries({ records, rainHourly }) {
  const x = timeAxis();
  x.min = records[0]?.t * 1000;
  x.max = records.at(-1)?.t * 1000;

  chart('cTemp', { type: 'line', data: { datasets: [
    line(xy(records, 'outTemp'), COLORS.temp), line(xy(records, 'dewpoint'), COLORS.dew),
  ] }, options: { scales: { x, y: yAxis() } } });

  chart('cRain', { type: 'bar', data: { datasets: [{
    data: rainHourly.map((r) => ({ x: (r.t + 1800) * 1000, y: r.rain })),
    backgroundColor: COLORS.rain, barPercentage: 1, categoryPercentage: 0.9, minBarLength: 1,
  }] }, options: { scales: { x: { ...x, min: rainHourly[0].t * 1000, max: (rainHourly.at(-1).t + 3600) * 1000, offset: false },
    y: yAxis({ min: 0, suggestedMax: 2 }) } } });

  chart('cWind', { type: 'line', data: { datasets: [
    line(xy(records, 'windGust'), COLORS.gust, { borderWidth: 1.5 }), line(xy(records, 'windSpeed'), COLORS.wind),
  ] }, options: { scales: { x, y: yAxis({ min: 0, suggestedMax: 10 }) } } });

  chart('cDir', { type: 'scatter', data: { datasets: [{
    data: xy(records, 'windDir').filter((p) => p.y != null), backgroundColor: COLORS.dir, pointRadius: 2,
  }] }, options: { scales: { x, y: yAxis({ min: 0, max: 360, ticks: { stepSize: 90, callback: (v) => ({ 0: 'N', 90: 'O', 180: 'S', 270: 'W', 360: 'N' })[v] } }) } } });

  chart('cBaro', { type: 'line', data: { datasets: [line(xy(records, 'barometer'), COLORS.baro)] },
    options: { scales: { x, y: yAxis({ ticks: { callback: (v) => num(v, 0) } }) } } });

  chart('cHum', { type: 'line', data: { datasets: [line(xy(records, 'outHumidity'), COLORS.hum)] },
    options: { scales: { x, y: yAxis({ suggestedMin: 40, max: 100 }) } } });

  chart('cRad', { type: 'line', data: { datasets: [
    line(xy(records, 'radiation'), COLORS.rad, { fill: { target: 'origin', above: 'rgb(245 159 0 / 0.15)' } }),
    line(records.map((r) => ({ x: r.t * 1000, y: r.sunshine > 0 ? 0 : null })), COLORS.sun, { borderWidth: 6, spanGaps: false }),
  ] }, options: { scales: { x, y: yAxis({ min: 0, suggestedMax: 300 }) } } });
}

function renderLakeSeries(days) {
  const t = (d) => Date.parse(`${d.date}T12:00:00Z`);
  const x = timeAxis(24 * 7, (u) => dayFmt.format(u * 1000));
  x.afterBuildTicks = (axis) => {
    const ticks = [];
    for (let v = axis.max; v >= axis.min; v -= 7 * 86400000) ticks.unshift({ value: v });
    axis.ticks = ticks;
  };
  chart('cLake', { type: 'line', data: { datasets: [
    line(days.map((d) => ({ x: t(d), y: d.temp05 })), COLORS.lake, { yAxisID: 'y' }),
    line(days.map((d) => ({ x: t(d), y: d.stand })), COLORS.stand, { yAxisID: 'y1', borderDash: [6, 3] }),
    line(days.map((d) => ({ x: t(d), y: d.stand_mit })), COLORS.standMean, { yAxisID: 'y1', borderWidth: 1 }),
  ] }, options: { scales: {
    x,
    y: yAxis({ position: 'left', ticks: { color: COLORS.lake } }),
    y1: yAxis({ position: 'right', grid: { display: false }, ticks: { color: COLORS.stand } }),
  } } });
}

async function loadCharts() {
  const [series, lake] = await Promise.all([
    fetch('/api/series?hours=24').then((r) => r.json()),
    fetch('/api/lake?days=28').then((r) => r.json()),
  ]);
  renderSeries(series);
  renderLakeSeries(lake);
}

// --- Ablauf -------------------------------------------------------------------
function tick() {
  $('clock').textContent = timeFmt.format(Date.now());
}

function repeat(fn, ms) {
  const run = () => fn().catch((e) => console.error(e));
  run();
  setInterval(run, ms);
}

tick();
setInterval(tick, 1000);
repeat(loadCurrent, CURRENT_EVERY);
repeat(loadCharts, CHARTS_EVERY);
setTimeout(() => location.reload(), RELOAD_EVERY);
