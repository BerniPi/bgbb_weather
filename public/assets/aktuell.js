// Startseite „Aktuell“
import { $, num, signed, hm, dt, day, longDate, relative, compass, weatherIcon, dl, repeat, getJson } from './format.js';
import { setupCharts, renderSeries, renderLake } from './charts.js';
import { renderLayout } from './layout.js';
import { row, statRows } from './stats.js';

const at = (e) => (e ? hm(e.time) : '');
const v = (e, d = 1) => num(e?.value, d);
const dir = (deg) => (deg == null ? '' : ` <span class="t">${compass(deg)}</span>`);
const STALE_AFTER = 15 * 60;

function renderWeather(w) {
  const t = w.today ?? {};
  $('dataTime').textContent = dt(w.time);
  const stale = Date.now() / 1000 - w.time > STALE_AFTER;
  $('stale').hidden = !stale;
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

function renderAlmanac({ sun, moon }) {
  const seasons = [['Tagundnachtgleiche', sun.equinox], ['Sonnenwende', sun.solstice]].sort((a, b) => a[1] - b[1]);
  dl($('sun'), [
    ['Aufgang', hm(sun.rise)],
    ['Höchststand', hm(sun.transit)],
    ['Untergang', hm(sun.set)],
    ['Tageslänge', sun.rise && sun.set ? `${Math.floor((sun.set - sun.rise) / 3600)} h ${Math.round(((sun.set - sun.rise) % 3600) / 60)} min` : '–'],
    ...seasons.map(([k, t]) => [`nächste ${k}`, `${day(t)} ${hm(t)}`]),
  ]);
  const times = [['Aufgang', moon.rise], ['Höchststand', moon.transit], ['Untergang', moon.set]]
    .filter(([, t]) => t != null).sort((a, b) => a[1] - b[1]).map(([k, t]) => [k, hm(t)]);
  const phases = [['nächster Vollmond', moon.nextFull], ['nächster Neumond', moon.nextNew]]
    .sort((a, b) => a[1] - b[1]).map(([k, t]) => [k, day(t)]);
  dl($('moon'), [...times, ['Phase', `${moon.phase} (${moon.illumination} %)`], ...phases]);
}

function renderStorm(s) {
  const level = s?.ost ?? 0;
  const el = $('storm');
  el.hidden = level === 0;
  el.className = `banner level-${level}`;
  el.textContent = level === 90
    ? 'Sturmwarnung Bodensee Ost – Sturmböen über 60 km/h erwartet'
    : 'Starkwindwarnung Bodensee Ost – Windböen über 45 km/h erwartet';
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
  renderSeries(SERIES_IDS, series);
  renderLake('cLake', lake);
}

renderLayout();
setupCharts(12);
repeat(loadCurrent, 60 * 1000);
repeat(loadCharts, 5 * 60 * 1000);
