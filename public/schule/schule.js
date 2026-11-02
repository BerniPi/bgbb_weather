// Schaufenster-Anzeige: lädt die Daten selbst nach, kein Neuladen der Seite nötig
import { $, num, signed, hm, dt, compass, weatherIcon, dl, repeat, getJson, timeFmt } from '/assets/format.js';
import { setupCharts, renderSeries, renderLake, SERIES_IDS } from '/assets/charts.js';
import { API } from '/assets/api.js';
import { isStale, almanacItems, stormWarning } from '/assets/panels.js';
import { subscribeLive, mergeLive } from '/assets/live.js';

const CURRENT_EVERY = 60 * 1000;
const CHARTS_EVERY = 5 * 60 * 1000;
const RELOAD_EVERY = 6 * 60 * 60 * 1000; // frischer Start gegen Speicherlecks im Dauerbetrieb

const at = (e) => (e ? hm(e.time) : '');
const paren = (v, d) => (v == null ? '' : `(${signed(v, d)})`);

function row(label, value, extra = '', cls = '') {
  return `<tr class="${cls}"><td>${label}</td><td>${value}</td><td>${extra}</td></tr>`;
}

function renderWeather(w) {
  const t = w.today ?? {};
  $('liveBadge').hidden = !w.live;
  $('dataTime').textContent = dt(w.time);
  $('stale').hidden = !isStale(w.time);
  $('stale').textContent = 'Keine aktuellen Messdaten';

  $('icon').innerHTML = weatherIcon(w);
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
    row(w.live ? 'Wind (aktuell)' : 'Wind (10 min)', wind),
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

function renderLakeNow(l) {
  if (!l) return dl($('lake'), [['', 'keine Daten']]);
  dl($('lake'), [
    ['Wasser', `${num(l.temp05)} °C`],
    ['', paren(l.temp05Diff)],
    ['Pegel', `${num(l.stand, 0)} cm`],
    ['', paren(l.standDiff, 0)],
  ]);
}

function renderAlmanac(almanac) {
  const items = almanacItems(almanac, { compact: true });
  dl($('sun'), items.sun);
  dl($('moon'), items.moon);
}

function renderStorm(storm) {
  const warning = stormWarning(storm);
  const el = $('storm');
  el.hidden = !warning;
  if (warning) {
    el.className = `storm level-${warning.level}`;
    el.textContent = warning.short;
  }
}

// Letzte Werte vom Server und letztes Live-Paket (null, solange nicht live)
let weather = null;
let packet = null;
const showWeather = () => weather && renderWeather(mergeLive(weather, packet));

async function loadCurrent() {
  const data = await getJson(API.current);
  weather = data.weather;
  showWeather();
  renderLakeNow(data.lake);
  renderAlmanac(data.almanac);
  renderStorm(data.storm);
}

async function loadCharts() {
  const [series, lake] = await Promise.all([getJson(API.series()), getJson(API.lake())]);
  renderSeries(SERIES_IDS, series, { tooltips: false });
  renderLake('cLake', lake, { tooltips: false });
}

setupCharts(Math.max(11, Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.8)));
const tick = () => { $('clock').textContent = timeFmt.format(Date.now()); };
tick();
setInterval(tick, 1000);
repeat(loadCurrent, CURRENT_EVERY);
repeat(loadCharts, CHARTS_EVERY);
subscribeLive((p) => { packet = p; showWeather(); }, (live) => { if (!live) { packet = null; showWeather(); } });
setTimeout(() => location.reload(), RELOAD_EVERY);
