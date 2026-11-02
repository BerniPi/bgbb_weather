// Diagramme (Chart.js, global `Chart`) für Startseite, Verlauf und Schaufenster
import { hm, num, dayFmt, timeFmt, dt } from './format.js';

const weekdayFmt = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', weekday: 'short', day: '2-digit', month: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('de-AT', { timeZone: 'UTC', month: 'short' });

/** Standard-IDs der 24-h-Diagramme (Startseite, Verlauf Tag/Woche, Schaufenster) */
export const SERIES_IDS = { temp: 'cTemp', rain: 'cRain', wind: 'cWind', dir: 'cDir', baro: 'cBaro', hum: 'cHum', rad: 'cRad' };

export const COLORS = {
  temp: '#e8590c', dew: '#1c7ed6', rain: '#1c7ed6', wind: '#2f9e44', gust: '#94d82d',
  dir: '#7048e8', baro: '#868e96', hum: '#0c8599', rad: '#f59f00', sun: '#ffd43b',
  lake: '#1c7ed6', stand: '#1864ab', standMean: '#adb5bd',
};

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Grundeinstellungen; fontSize in px */
export function setupCharts(fontSize) {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = fontSize;
  Chart.defaults.color = css('--muted') || '#5d6b7a';
  Chart.defaults.animation = false;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.elements.point.radius = 0;
  Chart.defaults.elements.point.hitRadius = 6;
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.interaction = { mode: 'index', intersect: false };
}

const gridColor = () => css('--chart-grid') || '#eef1f4';

/** Zeitachse mit Strichen zu vollen Ortsstunden (alle stepHours) ohne Datums-Adapter;
 *  ab 24 h Schrittweite mit Wochentag beschriftet */
export function timeAxis(min, max, stepHours = 3) {
  const label = stepHours >= 24 ? (v) => weekdayFmt.format(v) : (v) => hm(v / 1000);
  return {
    type: 'linear',
    min,
    max,
    grid: { color: gridColor() },
    ticks: { callback: label, maxRotation: 0, autoSkip: false },
    afterBuildTicks(axis) {
      const ticks = [];
      for (let t = Math.ceil(axis.min / 3600000) * 3600000; t <= axis.max; t += 3600000) {
        const h = Number(timeFmt.format(t).slice(0, 2));
        if (h % stepHours === 0) ticks.push({ value: t });
      }
      if (ticks.length) axis.ticks = ticks;
    },
  };
}

/** Tagesachse (Datenpunkte je Tag um 12 Uhr UTC), Striche im Abstand von stepDays */
export function dayAxis(min, max, stepDays = 7) {
  return {
    type: 'linear',
    min,
    max,
    grid: { color: gridColor() },
    ticks: { callback: (v) => dayFmt.format(v), maxRotation: 0, autoSkip: false },
    afterBuildTicks(axis) {
      const ticks = [];
      for (let v = axis.max; v >= axis.min; v -= stepDays * 86400000) ticks.unshift({ value: v });
      axis.ticks = ticks;
    },
  };
}

/** Monatsachse: Striche jeweils am Monatsersten (Datenpunkte um 12 Uhr UTC) */
export function monthAxis(min, max) {
  return {
    type: 'linear',
    min,
    max,
    grid: { color: gridColor() },
    ticks: { callback: (v) => monthFmt.format(v), maxRotation: 0, autoSkip: false },
    afterBuildTicks(axis) {
      const ticks = [];
      const d = new Date(axis.min);
      for (let m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12); m <= axis.max;) {
        if (m >= axis.min) ticks.push({ value: m });
        const n = new Date(m);
        m = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1, 12);
      }
      axis.ticks = ticks;
    },
  };
}

const band = (color) => `${color}33`;
const yAxis = (extra = {}) => ({ grid: { color: gridColor() }, ...extra });
const xy = (records, key) => records.map((r) => ({ x: r.t * 1000, y: r[key] }));
const line = (data, color, extra = {}) => ({
  data, borderColor: color, backgroundColor: color, spanGaps: 15 * 60 * 1000, ...extra,
});

function tooltip(unit, digits = 1, withDate = false) {
  return {
    callbacks: {
      title: (items) => (withDate ? dt : hm)(items[0].parsed.x / 1000),
      label: (item) => `${item.dataset.label ?? ''}: ${num(item.parsed.y, digits)} ${unit}`,
    },
  };
}

const charts = new Map();
function draw(id, config) {
  charts.get(id)?.destroy();
  const el = document.getElementById(id);
  if (el) charts.set(id, new Chart(el, config));
}

/**
 * Verlaufsdiagramme aus /api/site/series. ids: { temp, rain, wind, dir, baro, hum, rad }
 * tooltips: Tooltips anzeigen (Homepage ja, Schaufenster nein)
 * stepHours: Achsenstriche (3 = Tag, 24 = Woche)
 */
export function renderSeries(ids, { records, rainHourly }, { tooltips = true, stepHours = 3 } = {}) {
  if (!records.length) return;
  const x = timeAxis(records[0].t * 1000, records.at(-1).t * 1000, stepHours);
  const withDate = stepHours >= 24;
  const tip = (unit, d) => (tooltips ? tooltip(unit, d, withDate) : { enabled: false });

  draw(ids.temp, { type: 'line', data: { datasets: [
    line(xy(records, 'outTemp'), COLORS.temp, { label: 'Temperatur' }),
    line(xy(records, 'dewpoint'), COLORS.dew, { label: 'Taupunkt' }),
  ] }, options: { scales: { x, y: yAxis() }, plugins: { tooltip: tip('°C') } } });

  draw(ids.rain, { type: 'bar', data: { datasets: [{
    label: 'Niederschlag',
    data: rainHourly.map((r) => ({ x: (r.t + 1800) * 1000, y: r.rain })),
    backgroundColor: COLORS.rain, barPercentage: 1, categoryPercentage: 0.9, minBarLength: 1,
  }] }, options: {
    scales: { x: { ...x, min: rainHourly[0].t * 1000, max: (rainHourly.at(-1).t + 3600) * 1000 }, y: yAxis({ min: 0, suggestedMax: 2 }) },
    plugins: { tooltip: tooltips ? { callbacks: {
      title: (items) => `ab ${(withDate ? dt : hm)(items[0].parsed.x / 1000 - 1800)}`,
      label: (item) => `${num(item.parsed.y)} mm`,
    } } : { enabled: false } },
  } });

  draw(ids.wind, { type: 'line', data: { datasets: [
    line(xy(records, 'windGust'), COLORS.gust, { label: 'Böe', borderWidth: 1.5 }),
    line(xy(records, 'windSpeed'), COLORS.wind, { label: 'Wind' }),
  ] }, options: { scales: { x, y: yAxis({ min: 0, suggestedMax: 10 }) }, plugins: { tooltip: tip('km/h') } } });

  draw(ids.dir, { type: 'scatter', data: { datasets: [{
    label: 'Richtung',
    data: xy(records, 'windDir').filter((p) => p.y != null), backgroundColor: COLORS.dir, pointRadius: 2,
  }] }, options: {
    scales: { x, y: yAxis({ min: 0, max: 360, ticks: { stepSize: 90, callback: (v) => ({ 0: 'N', 90: 'O', 180: 'S', 270: 'W', 360: 'N' })[v] } }) },
    plugins: { tooltip: tip('°', 0) },
  } });

  draw(ids.baro, { type: 'line', data: { datasets: [line(xy(records, 'barometer'), COLORS.baro, { label: 'Luftdruck' })] },
    options: { scales: { x, y: yAxis({ ticks: { callback: (v) => num(v, 0) } }) }, plugins: { tooltip: tip('hPa') } } });

  draw(ids.hum, { type: 'line', data: { datasets: [line(xy(records, 'outHumidity'), COLORS.hum, { label: 'Feuchte' })] },
    options: { scales: { x, y: yAxis({ suggestedMin: 40, max: 100 }) }, plugins: { tooltip: tip('%', 0) } } });

  draw(ids.rad, { type: 'line', data: { datasets: [
    line(xy(records, 'radiation'), COLORS.rad, { label: 'Strahlung', fill: { target: 'origin', above: 'rgb(245 159 0 / 0.15)' } }),
    line(records.map((r) => ({ x: r.t * 1000, y: r.sunshine > 0 ? 0 : null })), COLORS.sun,
      { label: 'Sonnenschein', borderWidth: 6, spanGaps: false }),
  ] }, options: { scales: { x, y: yAxis({ min: 0, suggestedMax: 300 }) }, plugins: { tooltip: tip('W/m²', 0) } } });
}

// --- Bodensee ---------------------------------------------------------------

// Hochwasser-Kennwerte, die der Pegel erreicht oder denen er bis 50 cm nahekommt,
// dazu jeweils die nächsthöhere Stufe
const FLOOD_NEAR = 50;
const FLOOD_COLORS = ['#f08c00', '#e8590c', '#e03131', '#c92a2a', '#a61e4d', '#862e9c'];

export function floodLines(flood, maxStand) {
  const levels = Object.entries(flood ?? {}).sort((a, b) => a[1] - b[1]);
  const near = levels.findLastIndex(([, v]) => v - FLOOD_NEAR <= maxStand);
  if (near < 0) return [];
  return levels.slice(0, Math.min(near + 2, levels.length))
    .map(([name, value], i) => ({ name, value, color: FLOOD_COLORS[i] }));
}

// Beschriftet die Hochwasserlinien (Datensätze mit flood: true) am rechten Rand
const floodLabels = {
  id: 'floodLabels',
  afterDatasetsDraw(c) {
    const { ctx, chartArea } = c;
    ctx.save();
    ctx.font = `600 ${Chart.defaults.font.size}px ${Chart.defaults.font.family}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    for (const ds of c.data.datasets) {
      if (!ds.flood) continue;
      ctx.fillStyle = ds.borderColor;
      ctx.fillText(ds.label, chartArea.right - 4, c.scales[ds.yAxisID ?? 'y'].getPixelForValue(ds.data[0].y) - 2);
    }
    ctx.restore();
  },
};

/** Waagrechte Hochwasserlinien über die ganze x-Achse */
function floodDatasets(lines, x, yAxisID) {
  return lines.map((l) => line([{ x: x.min, y: l.value }, { x: x.max, y: l.value }], l.color,
    { label: l.name, flood: true, yAxisID, borderWidth: 1.5, borderDash: [2, 3] }));
}

/** Bodensee aus /api/site/lake: Wassertemperatur, Pegel, langjähriges Mittel, Hochwasserlinien */
export function renderLake(id, { days, flood }, { tooltips = true } = {}) {
  if (!days.length) return;
  const t = (d) => Date.parse(`${d.date}T12:00:00Z`);
  const x = dayAxis(t(days[0]), t(days.at(-1)));
  const lines = floodLines(flood, Math.max(...days.map((d) => d.stand ?? 0)));
  const daily = { spanGaps: 2 * 86400 * 1000 };

  draw(id, { type: 'line', data: { datasets: [
    line(days.map((d) => ({ x: t(d), y: d.temp05 })), COLORS.lake, { ...daily, label: 'Wassertemperatur', yAxisID: 'y' }),
    line(days.map((d) => ({ x: t(d), y: d.stand })), COLORS.stand, { ...daily, label: 'Pegel', yAxisID: 'y1', borderDash: [6, 3] }),
    line(days.map((d) => ({ x: t(d), y: d.stand_mit })), COLORS.standMean, { ...daily, label: 'Pegel langj. Mittel', yAxisID: 'y1', borderWidth: 1 }),
    ...floodDatasets(lines, x, 'y1'),
  ] }, plugins: [floodLabels], options: {
    scales: {
      x,
      y: yAxis({ position: 'left', ticks: { color: COLORS.lake } }),
      y1: yAxis({ position: 'right', grid: { display: false }, ticks: { color: COLORS.stand } }),
    },
    plugins: { tooltip: tooltips ? {
      filter: (item) => !item.dataset.flood,
      callbacks: {
        title: (items) => dayFmt.format(items[0].parsed.x),
        label: (item) => `${item.dataset.label}: ${num(item.parsed.y, item.dataset.yAxisID === 'y' ? 1 : 0)} ${item.dataset.yAxisID === 'y' ? '°C' : 'cm'}`,
      },
    } : { enabled: false } },
  } });
}

/**
 * Bodensee-Jahresvergleich aus /api/site/lake-year.
 * Pegel: gewähltes Jahr, Vorjahr, historischer Bereich (Min–Max) und Mittel 1864–2024, Hochwasserlinien.
 * Wassertemperatur: gewähltes Jahr und Vorjahr.
 */
export function renderLakeYear(ids, { year, days, previous, hist, flood }) {
  // Alle Reihen auf die Tage des gewählten Jahres legen (29.2. fehlt im Vorjahr/Mittel ggf.)
  const at = (mmdd) => Date.parse(`${year}-${mmdd}T12:00:00Z`);
  const x = monthAxis(Date.UTC(year, 0, 1, 12), Date.UTC(year, 11, 31, 12));
  const pts = (rows, key, dayKey = 'date') => rows
    .map((r) => ({ x: at(dayKey === 'date' ? r.date.slice(5) : r.day), y: r[key] }))
    .filter((p) => !Number.isNaN(p.x));
  const daily = { spanGaps: 2 * 86400 * 1000 };
  const lines = floodLines(flood, Math.max(...days.map((d) => d.stand ?? 0), ...previous.map((d) => d.stand ?? 0)));
  const tip = (unit, digits) => ({
    filter: (item) => !item.dataset.flood && !item.dataset.band,
    callbacks: {
      title: (items) => dayFmt.format(items[0].parsed.x),
      label: (item) => `${item.dataset.label}: ${num(item.parsed.y, digits)} ${unit}`,
    },
  });

  draw(ids.stand, { type: 'line', data: { datasets: [
    line(pts(days, 'stand'), COLORS.stand, { ...daily, label: String(year), borderWidth: 2.5 }),
    line(pts(previous, 'stand'), COLORS.lake, { ...daily, label: String(year - 1), borderWidth: 1.2, borderDash: [5, 3] }),
    line(pts(hist, 'mean', 'day'), COLORS.standMean, { ...daily, label: 'Mittel 1864–2024', borderWidth: 1.2 }),
    line(pts(hist, 'max', 'day'), band(COLORS.standMean), { ...daily, label: 'hist. Max', band: true, borderWidth: 0, pointRadius: 0, fill: '+1', backgroundColor: band(COLORS.standMean) }),
    line(pts(hist, 'min', 'day'), band(COLORS.standMean), { ...daily, label: 'hist. Min', band: true, borderWidth: 0, pointRadius: 0 }),
    ...floodDatasets(lines, x, 'y'),
  ] }, plugins: [floodLabels], options: { scales: { x, y: yAxis() }, plugins: { tooltip: tip('cm', 0) } } });

  draw(ids.temp, { type: 'line', data: { datasets: [
    line(pts(days, 'temp05'), COLORS.temp, { ...daily, label: String(year), borderWidth: 2.5 }),
    line(pts(previous, 'temp05'), COLORS.dew, { ...daily, label: String(year - 1), borderWidth: 1.2, borderDash: [5, 3] }),
  ] }, options: { scales: { x, y: yAxis() }, plugins: { tooltip: tip('°C', 1) } } });
}

// --- Tageswerte (Monat, Jahr) ---------------------------------------------------

const dayX = (d) => (d.unix + 43200) * 1000;
const dxy = (days, key) => days.map((d) => ({ x: dayX(d), y: d[key] }));

function dailyTooltip(unit, digits = 1) {
  return {
    callbacks: {
      title: (items) => dayFmt.format(items[0].parsed.x),
      label: (item) => `${item.dataset.label}: ${num(item.parsed.y, digits)} ${unit}`,
    },
  };
}

/**
 * Diagramme aus Tageswerten (aggregateRows 'day', Spalten wie outTemp_max). ids: { temp, rain, wind, baro, hum, sun }
 * Min/Max als Band, Mittel als Linie.
 */
export function renderDaily(ids, days) {
  if (!days.length) return;
  const min = dayX(days[0]);
  const max = dayX(days.at(-1));
  const x = days.length > 62 ? monthAxis(min, max) : dayAxis(min, max, 7);
  const daily = { spanGaps: 2 * 86400 * 1000, pointRadius: days.length > 62 ? 0 : 2 };
  const bandPair = (keyMin, keyMax, color, label) => [
    line(dxy(days, keyMax), band(color), { ...daily, label: `${label} max`, borderWidth: 0, pointRadius: 0, fill: '+1', backgroundColor: band(color) }),
    line(dxy(days, keyMin), band(color), { ...daily, label: `${label} min`, borderWidth: 0, pointRadius: 0 }),
  ];

  draw(ids.temp, { type: 'line', data: { datasets: [
    line(dxy(days, 'outTemp_max'), COLORS.temp, { ...daily, label: 'Max', borderWidth: 1.5 }),
    line(dxy(days, 'outTemp_avg'), COLORS.baro, { ...daily, label: 'Mittel', borderWidth: 1.5 }),
    line(dxy(days, 'outTemp_min'), COLORS.dew, { ...daily, label: 'Min', borderWidth: 1.5 }),
  ] }, options: { scales: { x, y: yAxis() }, plugins: { tooltip: dailyTooltip('°C') } } });

  let total = 0;
  const cumulative = days.map((d) => ({ x: dayX(d), y: (total += d.rain_sum ?? 0) }));
  draw(ids.rain, { data: { datasets: [
    { type: 'bar', label: 'Tagessumme', data: dxy(days, 'rain_sum'), backgroundColor: COLORS.rain, barPercentage: 1, categoryPercentage: 0.85, yAxisID: 'y' },
    { type: 'line', label: 'Summe', data: cumulative, borderColor: COLORS.baro, borderWidth: 1.5, pointRadius: 0, yAxisID: 'y1' },
  ] }, options: { scales: {
    x: { ...x, offset: false },
    y: yAxis({ min: 0, suggestedMax: 5, title: { display: true, text: 'je Tag' } }),
    y1: yAxis({ min: 0, position: 'right', grid: { display: false }, title: { display: true, text: 'Summe' } }),
  }, plugins: { tooltip: dailyTooltip('mm') } } });

  draw(ids.wind, { type: 'line', data: { datasets: [
    line(dxy(days, 'windGust_max'), COLORS.gust, { ...daily, label: 'Stärkste Böe', borderWidth: 1.5 }),
    line(dxy(days, 'windSpeed_avg'), COLORS.wind, { ...daily, label: 'Mittel' }),
  ] }, options: { scales: { x, y: yAxis({ min: 0 }) }, plugins: { tooltip: dailyTooltip('km/h') } } });

  draw(ids.baro, { type: 'line', data: { datasets: [
    ...bandPair('barometer_min', 'barometer_max', COLORS.baro, 'Luftdruck'),
    line(dxy(days, 'barometer_avg'), COLORS.baro, { ...daily, label: 'Mittel' }),
  ] }, options: { scales: { x, y: yAxis({ ticks: { callback: (v) => num(v, 0) } }) }, plugins: { tooltip: dailyTooltip('hPa') } } });

  draw(ids.hum, { type: 'line', data: { datasets: [
    ...bandPair('outHumidity_min', 'outHumidity_max', COLORS.hum, 'Feuchte'),
    line(dxy(days, 'outHumidity_avg'), COLORS.hum, { ...daily, label: 'Mittel' }),
  ] }, options: { scales: { x, y: yAxis({ max: 100 }) }, plugins: { tooltip: dailyTooltip('%', 0) } } });

  draw(ids.sun, { data: { datasets: [
    { type: 'bar', label: 'Sonnenschein', data: days.map((d) => ({ x: dayX(d), y: d.sunshine_sum == null ? null : d.sunshine_sum / 60 })), backgroundColor: COLORS.sun, barPercentage: 1, categoryPercentage: 0.85, yAxisID: 'y' },
    { type: 'line', label: 'Max. Strahlung', data: dxy(days, 'radiation_max'), borderColor: COLORS.rad, borderWidth: 1.5, pointRadius: 0, yAxisID: 'y1' },
  ] }, options: { scales: {
    x: { ...x, offset: false },
    y: yAxis({ min: 0, title: { display: true, text: 'h' } }),
    y1: yAxis({ min: 0, position: 'right', grid: { display: false }, title: { display: true, text: 'W/m²' } }),
  }, plugins: { tooltip: dailyTooltip('', 1) } } });
}

/** Diagramm entfernen (z. B. beim Wechsel zwischen Tages- und Monatsansicht) */
export function clearChart(id) {
  charts.get(id)?.destroy();
  charts.delete(id);
}
