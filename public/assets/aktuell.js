// Startseite „Aktuell“
import { $, num, signed, hm, dt, longDate, relative, compass, weatherIcon, dl, repeat, getJson } from './format.js';
import { setupCharts, renderSeries, renderLake, SERIES_IDS } from './charts.js';
import { API } from './api.js';
import { isStale, almanacItems, stormWarning } from './panels.js';
import { renderLayout } from './layout.js';
import { row, statRows } from './stats.js';

const at = (e) => (e ? hm(e.time) : '');
const v = (e, d = 1) => num(e?.value, d);
const dir = (deg) => (deg == null ? '' : ` <span class="t">${compass(deg)}</span>`);

function renderWeather(w) {
  const t = w.today ?? {};
  $('dataTime').textContent = dt(w.time);
  $('stale').hidden = !isStale(w.time);
  $('stale').textContent = `Keine aktuellen Messdaten – letzte Messung ${dt(w.time)}`;

  $('icon').innerHTML = weatherIcon(w);
  $('outTemp').textContent = num(w.outTemp);
  const feels = w.outTemp > 26 ? w.heatindex : w.windchill;
  $('feels').textContent = feels != null && Math.abs(feels - w.outTemp) >= 0.5 ? `gefühlt ${num(feels)} °C` : '';
  $('tMax').textContent = `${v(t.outTempMax)} °C`;
  $('tMaxT').textContent = at(t.outTempMax);
  $('tMin').textContent = `${v(t.outTempMin)} °C`;
  $('tMinT').textContent = at(t.outTempMin);

  $('hWind').textContent = w.windSpeed > 0.5 ? `${compass(w.windDir)} ${num(w.windSpeed)} km/h` : 'still';
  $('hHum').textContent = `${num(w.outHumidity, 0)} %`;
  $('hBaro').textContent = `${num(w.barometer, 0)} hPa`;
  $('hRain').textContent = `${num(t.rain)} mm`;

  const trend = w.barometerTrend;
  const arrow = trend == null ? '' : trend > 0.5 ? ' ↗' : trend < -0.5 ? ' ↘' : ' →';
  $('now').innerHTML = [
    row('Temperatur', `${num(w.outTemp)} °C`),
    row('Gefühlte Temperatur (Windchill)', `${num(w.windchill)} °C`),
    row('Taupunkt', `${num(w.dewpoint)} °C`),
    row('Luftfeuchtigkeit', `${num(w.outHumidity, 0)} %`),
    w.pressure != null ? row('Luftdruck gemessen (434 m)', `${num(w.pressure)} hPa`) : '',
    row('Luftdruck reduziert (Meereshöhe)', `${num(w.barometer)} hPa`),
    row('Luftdrucktrend (3 h)', `${signed(trend)} hPa${arrow}`),
    row('Wind (Mittel 10 min)', `${num(w.windSpeed)} km/h${w.windSpeed > 0.5 ? dir(w.windDir) : ''}`),
    row('Böe (10 min)', `${num(w.windGust)} km/h`),
    row('Niederschlagsrate', `${num(w.rainRate)} mm/h`),
    row('Niederschlag 1 h / 24 h', `${num(w.rain1h)} / ${num(w.rain24h)} mm`),
    row('Letzter Niederschlag', relative(w.lastRain)),
    row('UV-Index', num(w.UV)),
    row('Sonnenstrahlung', `${num(w.radiation, 0)} W/m²`),
    row('Letzter Sonnenschein', w.sunny ? 'jetzt' : relative(w.lastSunshine)),
  ].join('');

  $('today').innerHTML = statRows(t);
  $('lyDate').textContent = w.lastYear?.date ? longDate(w.lastYear.date) : '';
  $('lastYear').innerHTML = statRows(w.lastYear?.outTempMax ? w.lastYear : null);
}

function renderLakeNow(l) {
  if (!l) { $('lake').innerHTML = row('keine Daten', ''); return; }
  const paren = (x, d = 1) => (x == null ? '' : `(${signed(x, d)})`);
  $('lakeTime').textContent = dt(l.time);
  $('lake').innerHTML = [
    row('Wassertemperatur 0,5 m', `${num(l.temp05)} °C`, paren(l.temp05Diff)),
    row('Wassertemperatur 2,5 m', `${num(l.temp25)} °C`, paren(l.temp25Diff)),
    row('Wasserstand', `${num(l.stand, 0)} cm`, paren(l.standDiff, 0)),
    l.hist ? row('Hist. Minimum / Mittel / Maximum', `${num(l.hist.min, 0)} / ${num(l.hist.mean, 0)} / ${num(l.hist.max, 0)} cm`) : '',
    l.lastYear ? row('Vor einem Jahr', `${num(l.lastYear.temp05)} °C · ${num(l.lastYear.stand, 0)} cm`) : '',
  ].join('');
}

function renderAlmanac(almanac) {
  const items = almanacItems(almanac);
  dl($('sun'), items.sun);
  dl($('moon'), items.moon);
}

function renderStorm(storm) {
  const warning = stormWarning(storm);
  const el = $('storm');
  el.hidden = !warning;
  if (warning) {
    el.className = `banner level-${warning.level}`;
    el.textContent = warning.text;
  }
}

async function loadCurrent() {
  const data = await getJson(API.current);
  if (data.weather) renderWeather(data.weather);
  renderLakeNow(data.lake);
  renderAlmanac(data.almanac);
  renderStorm(data.storm);
}

async function loadCharts() {
  const [series, lake] = await Promise.all([getJson(API.series()), getJson(API.lake())]);
  renderSeries(SERIES_IDS, series);
  renderLake('cLake', lake);
}

renderLayout();
setupCharts(12);
repeat(loadCurrent, 60 * 1000);
repeat(loadCharts, 5 * 60 * 1000);
