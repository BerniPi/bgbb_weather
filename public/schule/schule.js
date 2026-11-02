// Schaufenster-Anzeige: lädt die Daten selbst nach, kein Neuladen der Seite nötig
import { $, num, signed, hm, dt, day, compass, weatherIcon, dl, repeat, getJson, timeFmt } from '/assets/format.js';
import { setupCharts, renderSeries, renderLake } from '/assets/charts.js';

const CURRENT_EVERY = 60 * 1000;
const CHARTS_EVERY = 5 * 60 * 1000;
const RELOAD_EVERY = 6 * 60 * 60 * 1000; // frischer Start gegen Speicherlecks im Dauerbetrieb
const STALE_AFTER = 15 * 60; // Sekunden

const at = (e) => (e ? hm(e.time) : '');
const paren = (v, d) => (v == null ? '' : `(${signed(v, d)})`);

function row(label, value, extra = '', cls = '') {
  return `<tr class="${cls}"><td>${label}</td><td>${value}</td><td>${extra}</td></tr>`;
}

function renderWeather(w) {
  const t = w.today ?? {};
  $('dataTime').textContent = dt(w.time);
  $('stale').hidden = Date.now() / 1000 - w.time < STALE_AFTER;
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

function renderLakeNow(l) {
  if (!l) return dl($('lake'), [['', 'keine Daten']]);
  dl($('lake'), [
    ['Wasser', `${num(l.temp05)} °C`],
    ['', paren(l.temp05Diff)],
    ['Pegel', `${num(l.stand, 0)} cm`],
    ['', paren(l.standDiff, 0)],
  ]);
}

function renderAlmanac({ sun, moon }) {
  const seasons = [['Tagundnachtgleiche', sun.equinox], ['Sonnenwende', sun.solstice]]
    .sort((a, b) => a[1] - b[1]);
  dl($('sun'), [
    ['Aufgang', hm(sun.rise)],
    ['Mittag', hm(sun.transit)],
    ['Untergang', hm(sun.set)],
    ...seasons.map(([k, v]) => [k, day(v)]),
  ]);
  const moonTimes = [['Aufgang', moon.rise], ['Untergang', moon.set]]
    .filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]).map(([k, v]) => [k, hm(v)]);
  const phases = [['Vollmond', moon.nextFull], ['Neumond', moon.nextNew]]
    .sort((a, b) => a[1] - b[1]).map(([k, v]) => [k, day(v)]);
  dl($('moon'), [...moonTimes, ...phases, ['Phase', moon.phase], ['beleuchtet', `${moon.illumination} %`]]);
}

function renderStorm(s) {
  const el = $('storm');
  const level = s?.ost ?? 0;
  el.hidden = level === 0;
  el.className = `storm level-${level}`;
  el.textContent = level === 90 ? 'STURMWARNUNG Bodensee' : 'Starkwindwarnung Bodensee';
}

async function loadCurrent() {
  const data = await getJson('/api/current');
  if (data.weather) renderWeather(data.weather);
  renderLakeNow(data.lake);
  renderAlmanac(data.almanac);
  renderStorm(data.storm);
}

const SERIES_IDS = { temp: 'cTemp', rain: 'cRain', wind: 'cWind', dir: 'cDir', baro: 'cBaro', hum: 'cHum', rad: 'cRad' };

async function loadCharts() {
  const [series, lake] = await Promise.all([getJson('/api/series?hours=24'), getJson('/api/lake?days=28')]);
  renderSeries(SERIES_IDS, series, { tooltips: false });
  renderLake('cLake', lake, { tooltips: false });
}

setupCharts(Math.max(11, Math.round(parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.8)));
const tick = () => { $('clock').textContent = timeFmt.format(Date.now()); };
tick();
setInterval(tick, 1000);
repeat(loadCurrent, CURRENT_EVERY);
repeat(loadCharts, CHARTS_EVERY);
setTimeout(() => location.reload(), RELOAD_EVERY);
